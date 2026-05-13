"use client";

import { useAuth } from "@clerk/nextjs";
import { Button, Field, Input, Label, Select } from "@headlessui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { BotListItem, BotListResponse } from "@/app/api/bots/route";
import type { MapListResponse } from "@/app/api/maps/route";
import BoardView from "@/components/BoardView";
import BotIssuePanel from "@/components/BotIssuePanel";
import {
  type Action,
  type GameState,
  getCurrentTurnNumber,
  type PlayerId,
} from "@/core/engine";
import { isReplayVisible } from "@/core/match/replayVisibility";
import type { RoomMode } from "@/core/match/room";
import type {
  ActionMeta,
  JoinIntent,
  ParticipantRole,
  ParticipantSlot,
  ParticipantSnapshot,
  RoomCloseReason,
  ServerMessage,
} from "@/core/match/wsTypes";
import { getUnsupportedBotRuntimeReason } from "@/lib/bot/language";
import { MatchBotRuntime } from "@/lib/bot/MatchBotRuntime";
import type { BotRuntimeLanguage } from "@/lib/bot/runtime/BotRuntime";
import { createBotRuntime } from "@/lib/bot/runtime/createBotRuntime";
import { buildWsMatchUrl, WsMatchClient } from "@/lib/client/wsMatchClient";
import {
  type BotIssue,
  issueFromActionMeta,
  issueFromGameEndEvent,
} from "@/lib/editor/botIssue";
import { getDisplayTurnDelayMs } from "@/lib/ui/displayTurn";
import { formatActionJa } from "@/lib/ui/formatAction";
import { getPlaybackWindow } from "@/lib/ui/playbackWindow";

type MessageSource = "viewer" | "coolBot" | "hotBot";

type BotData = {
  id: number;
  name: string;
  language: BotRuntimeLanguage;
  code: string;
  blocklyXml: string;
};

type ActionLogRow = {
  id: number;
  turn: number;
  actionCool: Action | null;
  actionHot: Action | null;
  metaCool?: ActionMeta;
  metaHot?: ActionMeta;
};

type LogEntry = {
  id: number;
  kind: "info" | "event" | "error";
  label: string;
  payload?: unknown;
};

const RETAINED_PAST_TURNS = 80;
const RETAINED_FUTURE_TURNS = 240;
const VISIBLE_ACTION_LOG_LIMIT = 80;
const MAX_DEV_LOG_ENTRIES = 200;

interface RoomPageClientProps {
  roomId: string;
  initialUserId: string | null;
  initialRoomMode: RoomMode;
  initialViewerIntent: Exclude<JoinIntent, undefined>;
  initialBackLink: { href: string; label: string };
  initialRoomInitError: string | null;
}

function createRoomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function isTournamentRoomId(roomId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    roomId,
  );
}

function trimTurnMap<T>(
  map: Map<number, T>,
  minTurnToKeep: number,
  maxTurnToKeep: number,
): Map<number, T> {
  for (const key of map.keys()) {
    if (key >= minTurnToKeep && key <= maxTurnToKeep) continue;
    map.delete(key);
  }
  return map;
}

export default function RoomPageClient({
  roomId: initialRoomId,
  initialUserId,
  initialRoomMode,
  initialViewerIntent,
  initialBackLink,
  initialRoomInitError,
}: RoomPageClientProps) {
  const { userId } = useAuth();
  const router = useRouter();
  const userIdRef = useRef<string | null>(null);
  const [wsSelfUserId, setWsSelfUserId] = useState<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId ?? initialUserId ?? wsSelfUserId ?? null;
  }, [initialUserId, userId, wsSelfUserId]);
  const [roomId] = useState(initialRoomId);
  const [slotBotSelections, setSlotBotSelections] = useState<
    Record<PlayerId, string>
  >({ Cool: "", Hot: "" });
  const [coolBotLabel, setCoolBotLabel] = useState<string | null>(null);
  const [hotBotLabel, setHotBotLabel] = useState<string | null>(null);
  const [botList, setBotList] = useState<BotListItem[]>([]);
  const [botListError, setBotListError] = useState<string | null>(null);
  const [botsLoading, setBotsLoading] = useState(false);
  const [mapList, setMapList] = useState<MapListResponse["maps"]>([]);
  const [mapListError, setMapListError] = useState<string | null>(null);
  const [roomMapId, setRoomMapId] = useState<string | null>(null);
  const [pendingMapId, setPendingMapId] = useState<string | null>(null);

  const [viewerConnected, setViewerConnected] = useState(false);
  const [participants, setParticipants] = useState<ParticipantSnapshot[]>([]);
  const [selfParticipant, setSelfParticipant] =
    useState<ParticipantSnapshot | null>(null);
  const [roomStarted, setRoomStarted] = useState(false);
  const [roomClosedReason, setRoomClosedReason] =
    useState<RoomCloseReason | null>(null);
  const [displayTurn, setDisplayTurn] = useState(0);
  const [receivedRevision, setReceivedRevision] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [gameEndIssue, setGameEndIssue] = useState<BotIssue | null>(null);
  const [roomInitError] = useState<string | null>(initialRoomInitError);
  const [coolBotRunning, setCoolBotRunning] = useState(false);
  const [hotBotRunning, setHotBotRunning] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [devlogOpen, setDevlogOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const clientRef = useRef<WsMatchClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const coolBotRef = useRef<MatchBotRuntime | null>(null);
  const hotBotRef = useRef<MatchBotRuntime | null>(null);
  const botRuntimeBotIdsRef = useRef<Record<PlayerId, number | null>>({
    Cool: null,
    Hot: null,
  });
  const botStartingRef = useRef<Record<PlayerId, boolean>>({
    Cool: false,
    Hot: false,
  });
  const viewerConnectedRef = useRef(false);
  const roomClosedRef = useRef<RoomCloseReason | null>(null);
  const logCounter = useRef(0);
  const actionLogRef = useRef<HTMLDivElement | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const receivedStatesRef = useRef<Map<number, GameState>>(new Map());
  const receivedActionsRef = useRef<Map<number, ActionLogRow>>(new Map());
  const receivedGameEndRef = useRef<{
    winner: "Cool" | "Hot" | "draw" | null;
    replayId: string | null;
    replayAvailableAt: string | null;
    issue: BotIssue | null;
  } | null>(null);

  useEffect(() => {
    roomClosedRef.current = roomClosedReason;
  }, [roomClosedReason]);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackScheduledFromTurnRef = useRef<number | null>(null);
  const latestReceivedTurnRef = useRef(0);
  const displayTurnRef = useRef(0);
  const playbackInitializedRef = useRef(false);
  // Hydration mismatch 回避: URL 依存の初期値は page.tsx (SSR) 側で解決し、props で受け取る。
  const [viewerIntent, setViewerIntent] = useState<JoinIntent>(
    () => initialViewerIntent,
  );
  const viewerIntentRef = useRef<JoinIntent>(initialViewerIntent);
  const [roomMode, setRoomMode] = useState<RoomMode>(() => initialRoomMode);
  const [backLink] = useState<{ href: string; label: string }>(
    () => initialBackLink,
  );

  const effectiveUserId = useMemo(() => {
    return userId ?? initialUserId ?? wsSelfUserId;
  }, [initialUserId, userId, wsSelfUserId]);
  const roomClosed = roomClosedReason !== null;

  useEffect(() => {
    viewerIntentRef.current = viewerIntent;
  }, [viewerIntent]);

  useEffect(() => {
    displayTurnRef.current = displayTurn;
  }, [displayTurn]);

  const wsUrl = useMemo(() => {
    // dev/test の接続安定化のため、非 production のみ userId を付与する。
    const userIdParam =
      process.env.NODE_ENV !== "production" &&
      typeof effectiveUserId === "string" &&
      effectiveUserId
        ? effectiveUserId
        : undefined;
    return buildWsMatchUrl({
      roomId,
      mode: roomMode,
      userId: userIdParam,
    });
  }, [roomId, roomMode, effectiveUserId]);

  const appendLog = useCallback((entry: Omit<LogEntry, "id">) => {
    logCounter.current += 1;
    setLogs((prev) =>
      [...prev, { ...entry, id: logCounter.current }].slice(
        -MAX_DEV_LOG_ENTRIES,
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapListError(null);
    fetch("/api/maps", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as MapListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setMapList(data.maps ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapListError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (roomStarted) {
      setPendingMapId(null);
    }
  }, [roomStarted]);

  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
    }
    playbackTimerRef.current = null;
    playbackScheduledFromTurnRef.current = null;
  }, []);

  const resetStateForReconnect = useCallback(() => {
    clearPlaybackTimer();
    receivedStatesRef.current = new Map();
    receivedActionsRef.current = new Map();
    receivedGameEndRef.current = null;
    playbackInitializedRef.current = false;
    latestReceivedTurnRef.current = 0;
    setDisplayTurn(0);
    setReceivedRevision((prev) => prev + 1);
    setParticipants([]);
    setSelfParticipant(null);
    setRoomStarted(false);
  }, [clearPlaybackTimer]);

  const isOwner = useMemo(
    () => Boolean(ownerId && effectiveUserId && ownerId === effectiveUserId),
    [ownerId, effectiveUserId],
  );
  const yourSlot: ParticipantSlot = selfParticipant?.slot ?? null;
  const isPlayer = Boolean(yourSlot);
  const selfRole: ParticipantRole | "guest" =
    selfParticipant?.role ?? (effectiveUserId ? "spectator" : "guest");
  const roleLabel =
    isOwner && isPlayer
      ? `オーナー (${yourSlot})`
      : isOwner
        ? "オーナー"
        : isPlayer && yourSlot
          ? `プレイヤー (${yourSlot})`
          : selfRole === "player"
            ? "プレイヤー"
            : userId
              ? "観戦"
              : "ゲスト";

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when action log grows
  useEffect(() => {
    if (actionLogRef.current) {
      actionLogRef.current.scrollTop = actionLogRef.current.scrollHeight;
    }
  }, [displayTurn]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when logs grow
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs.length]);

  useEffect(() => {
    return () => {
      clearPlaybackTimer();
      unsubscribeRef.current?.();
      clientRef.current?.disconnect();
      clientRef.current = null;
      coolBotRef.current?.stop();
      hotBotRef.current?.stop();
      coolBotRef.current = null;
      hotBotRef.current = null;
    };
  }, [clearPlaybackTimer]);

  const scheduleNextDisplayTurn = useCallback(
    (fromTurn: number) => {
      clearPlaybackTimer();
      playbackScheduledFromTurnRef.current = fromTurn;
      const delayMs = getDisplayTurnDelayMs({
        state: receivedStatesRef.current.get(fromTurn),
        action: (() => {
          const row = receivedActionsRef.current.get(fromTurn);
          return row?.actionCool ?? row?.actionHot ?? null;
        })(),
      });
      playbackTimerRef.current = setTimeout(() => {
        playbackTimerRef.current = null;
        playbackScheduledFromTurnRef.current = null;
        setDisplayTurn((prev) => {
          const latest = latestReceivedTurnRef.current;
          if (prev >= latest) return prev;
          const next = prev + 1;
          if (!receivedStatesRef.current.get(next)) return prev;
          return next;
        });
      }, delayMs);
    },
    [clearPlaybackTimer],
  );

  useEffect(() => {
    void receivedRevision;
    if (!playbackInitializedRef.current) return;

    const latest = latestReceivedTurnRef.current;
    if (displayTurn >= latest) return;

    const nextTurn = displayTurn + 1;
    if (!receivedStatesRef.current.get(nextTurn)) return;

    if (
      playbackTimerRef.current &&
      playbackScheduledFromTurnRef.current === displayTurn
    ) {
      return;
    }

    scheduleNextDisplayTurn(displayTurn);
  }, [displayTurn, receivedRevision, scheduleNextDisplayTurn]);

  const fetchBotList = useCallback(async () => {
    if (!userId) {
      setBotList([]);
      setBotListError("ログインするとボットを選択できます");
      return;
    }
    setBotsLoading(true);
    setBotListError(null);
    try {
      const res = await fetch("/api/bots");
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("ログインするとボットを選択できます");
        }
        throw new Error(await res.text());
      }
      const data = (await res.json()) as BotListResponse;
      setBotList(data.bots);
      setSlotBotSelections((prev) => ({
        Cool: prev.Cool || (data.bots[0] ? String(data.bots[0].id) : ""),
        Hot:
          prev.Hot ||
          (data.bots[1]
            ? String(data.bots[1].id)
            : data.bots[0]
              ? String(data.bots[0].id)
              : ""),
      }));
    } catch (error) {
      setBotList([]);
      setSlotBotSelections({ Cool: "", Hot: "" });
      setBotListError((error as Error).message || "ボットの取得に失敗しました");
    } finally {
      setBotsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchBotList();
  }, [fetchBotList]);

  useEffect(() => {
    if (!selfParticipant?.slot) return;
    setSlotBotSelections((prev) => ({
      ...prev,
      [selfParticipant.slot as PlayerId]:
        selfParticipant.botId !== null
          ? String(selfParticipant.botId)
          : (prev[selfParticipant.slot as PlayerId] ?? ""),
    }));
  }, [selfParticipant]);

  const fetchBot = async (id: string): Promise<BotData> => {
    // Clerk の userId が Hydration 中で null のタイミングでも、Cookie が揃っていれば API は成功しうる。
    // 先に userId を見て弾くと「ボットを設定→自動起動」の直後に起動できないフレークが起きるため、
    // まずは API を叩いて 401/403 を根拠にエラーメッセージを出す。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(`/api/bots/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        return (await res.json()) as BotData;
      }

      const message = await res.text().catch(() => "");
      if (res.status === 401) {
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 200 * (attempt + 1)),
          );
          continue;
        }
        throw new Error("ログインするとボットを開始できます");
      }
      if (res.status === 403) {
        throw new Error("このボットを操作する権限がありません");
      }
      throw new Error(message || `ボットの取得に失敗しました (${id})`);
    }
    throw new Error(`ボットの取得に失敗しました (${id})`);
  };

  const disposeBotRuntime = useCallback((slot: PlayerId) => {
    if (slot === "Cool" && coolBotRef.current) {
      coolBotRef.current.stop();
      coolBotRef.current = null;
      setCoolBotRunning(false);
      setCoolBotLabel(null);
      botRuntimeBotIdsRef.current.Cool = null;
    }
    if (slot === "Hot" && hotBotRef.current) {
      hotBotRef.current.stop();
      hotBotRef.current = null;
      setHotBotRunning(false);
      setHotBotLabel(null);
      botRuntimeBotIdsRef.current.Hot = null;
    }
  }, []);

  const startBot = async (slot: PlayerId, options?: { force?: boolean }) => {
    if (roomClosed) {
      appendLog({ kind: "error", label: "ルームは閉じられています" });
      return;
    }
    const canOperateSlot =
      options?.force ||
      yourSlot === slot ||
      // ボット設定直後は participants がまだ反映されず yourSlot が空のことがあるため、
      // intent=player の viewer は席未確定でも起動できるようにする。
      (selfRole === "player" && !yourSlot) ||
      (roomMode === "practice" && isOwner);
    if (!canOperateSlot) {
      appendLog({
        kind: "error",
        label: `自分の席だけ開始できます（現在: ${yourSlot ?? "なし"}）`,
      });
      return;
    }
    if (roomStarted) {
      // Room は不可逆: 対戦開始後にボットを止めたり切り替えたりできない。
      appendLog({
        kind: "error",
        label:
          "対戦中はボットの変更/再起動ができません（新しい試合を開始してください）",
      });
      return;
    }
    const targetId = slotBotSelections[slot]?.trim();
    if (!targetId) {
      appendLog({ kind: "error", label: `ボットIDが必要です: ${slot}` });
      return;
    }

    const botId = Number(targetId);
    if (!Number.isFinite(botId)) {
      appendLog({
        kind: "error",
        label: `ボットIDが正しくありません (${slot}: ${targetId})`,
      });
      return;
    }

    const runtimeExists =
      slot === "Cool"
        ? Boolean(coolBotRef.current)
        : Boolean(hotBotRef.current);
    const alreadyRunningSameBot =
      runtimeExists && botRuntimeBotIdsRef.current[slot] === botId;
    if (alreadyRunningSameBot) {
      appendLog({
        kind: "info",
        label: `${slot} のボットはすでに動作中です (ID=${botId})`,
      });
      return;
    }
    if (botStartingRef.current[slot]) {
      appendLog({
        kind: "info",
        label: `${slot} のボットを起動中です`,
      });
      return;
    }

    disposeBotRuntime(slot);
    botStartingRef.current[slot] = true;
    try {
      const bot = await fetchBot(targetId);
      const unsupportedReason = getUnsupportedBotRuntimeReason(
        bot.language,
        "onlineMatch",
      );
      if (unsupportedReason) {
        appendLog({
          kind: "error",
          label: unsupportedReason,
        });
        return;
      }

      clientRef.current?.updateSlot(slot, botId);
      const runtime = new MatchBotRuntime({
        roomId,
        slot,
        mode: roomMode,
        botId: bot.id,
        wsUrl,
        runtime: createBotRuntime({ language: bot.language }),
        runtimeInit: {
          code: bot.code,
          timeoutMs: 500,
        },
        onMessage: (msg) =>
          handleServerMessage(msg, slot === "Cool" ? "coolBot" : "hotBot"),
      });
      runtime.start();

      if (slot === "Cool") {
        coolBotRef.current = runtime;
        setCoolBotRunning(true);
        setCoolBotLabel(`${bot.name} (#${bot.id})`);
        botRuntimeBotIdsRef.current.Cool = bot.id;
      } else {
        hotBotRef.current = runtime;
        setHotBotRunning(true);
        setHotBotLabel(`${bot.name} (#${bot.id})`);
        botRuntimeBotIdsRef.current.Hot = bot.id;
      }
      appendLog({
        kind: "info",
        label: `started ${slot} bot with "${bot.name}" (#${bot.id})`,
      });
    } catch (error) {
      appendLog({
        kind: "error",
        label: `failed to start ${slot} bot: ${(error as Error).message}`,
      });
    } finally {
      botStartingRef.current[slot] = false;
    }
  };

  const handleJoinSlot = (slot: PlayerId) => {
    // ボット設定と同時に BotRuntime (player socket) を起動して開始条件を満たす。
    void startBot(slot, { force: true });
  };

  const handleLeaveSlot = () => {
    if (!yourSlot) return;
    // 対戦開始後は離席させない（中断や途中再開をさせない）。
    if (roomStarted) return;
    disposeBotRuntime(yourSlot);
    clientRef.current?.leaveSlot();
  };

  const handleServerMessage = useCallback(
    (msg: ServerMessage, source: MessageSource = "viewer") => {
      const isBotSource = source !== "viewer";
      const suppressLog = isBotSource && viewerConnectedRef.current;

      const prefix =
        source === "viewer"
          ? ""
          : source === "coolBot"
            ? "[Cool ボット] "
            : "[Hot ボット] ";

      switch (msg.type) {
        case "joined": {
          setRoomMode(msg.mode);
          setOwnerId(msg.ownerId);
          setRoomMapId(msg.mapId);
          setPendingMapId(null);
          setRoomStarted(msg.started);
          setRoomClosedReason(null);
          setParticipants(msg.participants ?? []);
          if (source === "viewer") {
            setSelfParticipant(msg.you);
            setWsSelfUserId(msg.you.userId ?? null);
          }
          if (!suppressLog) {
            appendLog({
              kind: "event",
              label: `${prefix}joined room ${msg.roomId} as ${msg.you.role}${msg.you.slot ? ` (${msg.you.slot})` : ""}`,
            });
          }
          break;
        }
        case "mapChanged": {
          setRoomMapId(msg.mapId);
          setPendingMapId(null);
          if (!suppressLog) {
            appendLog({
              kind: "event",
              label: `${prefix}mapChanged mapId=${msg.mapId}`,
            });
          }
          break;
        }
        case "participants": {
          setParticipants(msg.participants ?? []);
          const currentUserId = userIdRef.current;
          if (currentUserId) {
            const seats = msg.participants.filter(
              (p) => p.userId === currentUserId && p.slot,
            );
            if (seats.length === 1) {
              setSelfParticipant(seats[0]);
            } else {
              const base = msg.participants.find(
                (p) => p.userId === currentUserId && p.slot === null,
              );
              if (base) setSelfParticipant(base);
            }
          }
          break;
        }
        case "roomStatus":
          setRoomStarted(msg.started);
          break;
        case "roomClosed": {
          setRoomClosedReason(msg.reason);
          setPendingMapId(null);
          setRoomStarted(false);
          viewerConnectedRef.current = false;
          setViewerConnected(false);
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          clientRef.current?.disconnect();
          clientRef.current = null;
          disposeBotRuntime("Cool");
          disposeBotRuntime("Hot");
          appendLog({
            kind: "event",
            label: `${prefix}roomClosed reason=${msg.reason}`,
          });
          break;
        }
        case "stateUpdate": {
          receivedStatesRef.current.set(msg.state.turn, msg.state);
          latestReceivedTurnRef.current = Math.max(
            latestReceivedTurnRef.current,
            msg.state.turn,
          );
          const statePlaybackWindow = getPlaybackWindow({
            displayTurn: displayTurnRef.current,
            latestTurn: latestReceivedTurnRef.current,
            retainedPastTurns: RETAINED_PAST_TURNS,
            retainedFutureTurns: RETAINED_FUTURE_TURNS,
          });
          if (statePlaybackWindow.nextDisplayTurn !== displayTurnRef.current) {
            displayTurnRef.current = statePlaybackWindow.nextDisplayTurn;
            setDisplayTurn(statePlaybackWindow.nextDisplayTurn);
          }
          trimTurnMap(
            receivedStatesRef.current,
            statePlaybackWindow.minTurnToKeep,
            statePlaybackWindow.maxTurnToKeep,
          );
          // displayTurn は受信済み turn を人間向け速度で再生する。
          // 初回だけ現状 turn に追従し、それ以降は action 種別に応じて 1 ずつ進める。
          if (!playbackInitializedRef.current) {
            playbackInitializedRef.current = true;
            setDisplayTurn(msg.state.turn);
          }
          setReceivedRevision((prev) => prev + 1);
          if (!suppressLog) {
            logCounter.current += 1;
            setLogs((prev) => [
              ...prev
                .filter((log) => !`${log.label}`.includes("stateUpdate turn="))
                .slice(-(MAX_DEV_LOG_ENTRIES - 1)),
              {
                id: logCounter.current,
                kind: "event",
                label: `${prefix}stateUpdate turn=${msg.state.turn}`,
              },
            ]);
          }
          break;
        }
        case "actionLog": {
          receivedActionsRef.current.set(msg.turn, {
            id: msg.turn,
            turn: msg.turn,
            actionCool: msg.actionCool,
            actionHot: msg.actionHot,
            metaCool:
              msg.metaCool ??
              receivedActionsRef.current.get(msg.turn)?.metaCool,
            metaHot:
              msg.metaHot ?? receivedActionsRef.current.get(msg.turn)?.metaHot,
          });
          const actionPlaybackWindow = getPlaybackWindow({
            displayTurn: displayTurnRef.current,
            latestTurn: latestReceivedTurnRef.current,
            retainedPastTurns: RETAINED_PAST_TURNS,
            retainedFutureTurns: RETAINED_FUTURE_TURNS,
          });
          trimTurnMap(
            receivedActionsRef.current,
            actionPlaybackWindow.minTurnToKeep,
            actionPlaybackWindow.maxTurnToKeep,
          );
          setReceivedRevision((prev) => prev + 1);

          if (!suppressLog) {
            appendLog({
              kind: "event",
              label: `${prefix}actionLog turn=${msg.turn}`,
              payload: {
                cool: msg.actionCool,
                hot: msg.actionHot,
                metaCool: msg.metaCool,
                metaHot: msg.metaHot,
              },
            });
          }
          break;
        }
        case "turnStart":
          if (!suppressLog) {
            appendLog({
              kind: "event",
              label: `${prefix}turnStart for ${msg.playerId}`,
            });
          }
          break;
        case "gameEnd": {
          disposeBotRuntime("Cool");
          disposeBotRuntime("Hot");
          if (!suppressLog) {
            appendLog({
              kind: "event",
              label: `${prefix}gameEnd: ${msg.status} winner=${msg.winner}`,
              payload: msg,
            });
          }
          const issue =
            msg.endReason && typeof msg.endTurnIndex === "number"
              ? issueFromGameEndEvent({
                  type: "gameEnd",
                  id: "gameEnd",
                  winner:
                    msg.winner === "Cool"
                      ? "cool"
                      : msg.winner === "Hot"
                        ? "hot"
                        : msg.winner === "draw"
                          ? "draw"
                          : "none",
                  reason: msg.endReason,
                  turnIndex: msg.endTurnIndex,
                  point: msg.endPoint ?? null,
                })
              : null;
          receivedGameEndRef.current = {
            winner: msg.winner,
            replayId: msg.replayId ?? null,
            replayAvailableAt: msg.replayAvailableAt ?? null,
            issue,
          };
          setGameEndIssue(issue);
          setReceivedRevision((prev) => prev + 1);
          break;
        }
        case "error":
          appendLog({
            kind: "error",
            label: `${prefix}server error: ${msg.message}`,
          });
          setPendingMapId(null);
          break;
        default:
          appendLog({
            kind: "info",
            label: `${prefix}unknown message`,
            payload: msg,
          });
      }
    },
    [appendLog, disposeBotRuntime],
  );

  const connectViewer = useCallback(
    (intentOverride?: JoinIntent) => {
      if (roomClosedRef.current) {
        appendLog({ kind: "info", label: "ルームはすでに閉じられています" });
        return;
      }
      const currentIntent = viewerIntentRef.current;
      const nextIntent = intentOverride ?? currentIntent;
      viewerIntentRef.current = nextIntent;
      if (intentOverride && intentOverride !== currentIntent) {
        setViewerIntent(intentOverride);
      }
      unsubscribeRef.current?.();
      clientRef.current?.disconnect();
      clientRef.current = null;
      resetStateForReconnect();
      viewerConnectedRef.current = false;
      setViewerConnected(false);
      logCounter.current = 0;
      setLogs([]);

      const client = new WsMatchClient({
        roomId,
        mode: roomMode,
        intent: nextIntent,
        url: wsUrl,
      });
      clientRef.current = client;

      unsubscribeRef.current = client.onMessage((msg) =>
        handleServerMessage(msg, "viewer"),
      );

      appendLog({
        kind: "info",
        label: `connecting as ${nextIntent === "player" ? "player" : "spectator"}`,
      });
      viewerConnectedRef.current = true;
      setViewerConnected(true);
      client.connect();
    },
    [
      handleServerMessage,
      resetStateForReconnect,
      roomId,
      wsUrl,
      appendLog,
      roomMode,
    ],
  );

  useLayoutEffect(() => {
    connectViewer();
  }, [connectViewer]);

  const disconnectViewer = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    viewerConnectedRef.current = false;
    setViewerConnected(false);
    resetStateForReconnect();
    appendLog({ kind: "info", label: "disconnected" });
  }, [appendLog, resetStateForReconnect]);

  const displayState = useMemo(() => {
    void receivedRevision;
    return receivedStatesRef.current.get(displayTurn) ?? null;
  }, [displayTurn, receivedRevision]);

  const gameShell = "mx-auto w-full px-4 sm:px-6 lg:px-8";

  const displayActionLog = useMemo(() => {
    void receivedRevision;
    return receivedActionsRef.current.get(displayTurn) ?? null;
  }, [displayTurn, receivedRevision]);

  const turnText = displayState
    ? `${getCurrentTurnNumber(displayState.turn)} / ${displayState.maxTurns}`
    : "- / -";
  const coolItems = displayState ? displayState.players.Cool.items : null;
  const hotItems = displayState ? displayState.players.Hot.items : null;
  const turnProgress = displayState?.maxTurns
    ? Math.min(1, displayState.turn / (displayState.maxTurns * 2))
    : 0;

  const resolvedWinner = useMemo<
    "Cool" | "Hot" | "draw" | "invalid" | null
  >(() => {
    void receivedRevision;
    if (displayState && displayState.status !== "running") {
      if (displayState.status === "winCool") return "Cool";
      if (displayState.status === "winHot") return "Hot";
      if (displayState.status === "draw") return "draw";
      if (displayState.status === "invalid") return "invalid";
    }

    const fromGameEnd = receivedGameEndRef.current?.winner ?? null;
    if (fromGameEnd === "Cool") return "Cool";
    if (fromGameEnd === "Hot") return "Hot";
    if (fromGameEnd === "draw") return "draw";
    if (fromGameEnd === null && receivedGameEndRef.current) return "invalid";
    return null;
  }, [displayState, receivedRevision]);

  const displayReplayId = useMemo(() => {
    void receivedRevision;
    if (!resolvedWinner) return null;
    return receivedGameEndRef.current?.replayId ?? null;
  }, [resolvedWinner, receivedRevision]);

  const displayReplayAvailableAt = useMemo(() => {
    void receivedRevision;
    if (!resolvedWinner) return null;
    return receivedGameEndRef.current?.replayAvailableAt ?? null;
  }, [resolvedWinner, receivedRevision]);

  useEffect(() => {
    if (!displayReplayAvailableAt) {
      setNowMs(Date.now());
      return;
    }
    const availableAtMs = new Date(displayReplayAvailableAt).getTime();
    if (!Number.isFinite(availableAtMs) || availableAtMs <= Date.now()) {
      setNowMs(Date.now());
      return;
    }
    const timeoutId = setTimeout(
      () => {
        setNowMs(Date.now());
      },
      Math.max(0, availableAtMs - Date.now()),
    );
    return () => clearTimeout(timeoutId);
  }, [displayReplayAvailableAt]);

  useEffect(() => {
    void receivedRevision;
    setGameEndIssue(receivedGameEndRef.current?.issue ?? null);
  }, [receivedRevision]);

  const replayVisible = useMemo(() => {
    if (!displayReplayId) return false;
    if (!displayReplayAvailableAt) return true;
    void nowMs;
    return isReplayVisible(displayReplayAvailableAt);
  }, [displayReplayAvailableAt, displayReplayId, nowMs]);

  const replayPendingLabel = useMemo(() => {
    if (!displayReplayId || !displayReplayAvailableAt || replayVisible) {
      return null;
    }
    const availableAt = new Date(displayReplayAvailableAt);
    if (Number.isNaN(availableAt.getTime())) {
      return "リプレイは数分後に公開されます。";
    }
    return `リプレイは ${availableAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ごろ公開されます。`;
  }, [displayReplayAvailableAt, displayReplayId, replayVisible]);

  const showWinnerOverlay = Boolean(
    resolvedWinner && displayState?.status && displayState.status !== "running",
  );

  const visibleActionLogs = useMemo(() => {
    void receivedRevision;
    const rows: ActionLogRow[] = [];
    const startTurn = Math.max(0, displayTurn - VISIBLE_ACTION_LOG_LIMIT + 1);
    for (let t = startTurn; t <= displayTurn; t += 1) {
      const row = receivedActionsRef.current.get(t);
      if (row) rows.push(row);
    }
    return rows;
  }, [displayTurn, receivedRevision]);

  const latestBoardAction = useMemo<{
    playerId: PlayerId;
    action: Action;
    turn?: number;
  } | null>(() => {
    if (!displayActionLog) return null;
    if (displayActionLog.actionCool) {
      return {
        playerId: "Cool",
        action: displayActionLog.actionCool,
        turn: displayActionLog.turn,
      };
    }
    if (displayActionLog.actionHot) {
      return {
        playerId: "Hot",
        action: displayActionLog.actionHot,
        turn: displayActionLog.turn,
      };
    }
    return null;
  }, [displayActionLog]);

  const slotParticipants = useMemo(
    () => ({
      Cool: participants.find((p) => p.slot === "Cool") ?? null,
      Hot: participants.find((p) => p.slot === "Hot") ?? null,
    }),
    [participants],
  );

  const coolReady = Boolean(slotParticipants.Cool?.botId);
  const hotReady = Boolean(slotParticipants.Hot?.botId);

  const coolDisplayName = useMemo(() => {
    const participant = slotParticipants.Cool;
    const botId = participant?.botId ?? null;
    if (botId) {
      const found = botList.find((bot) => String(bot.id) === String(botId));
      if (found) return found.name;
      const selected =
        participant?.userId === effectiveUserId
          ? botList.find(
              (bot) => String(bot.id) === (slotBotSelections.Cool || ""),
            )
          : null;
      if (selected) return selected.name;
      return coolBotLabel ?? `ボット #${botId}`;
    }
    return coolBotLabel ?? "Cool";
  }, [
    slotParticipants,
    botList,
    slotBotSelections.Cool,
    coolBotLabel,
    effectiveUserId,
  ]);

  const hotDisplayName = useMemo(() => {
    const participant = slotParticipants.Hot;
    const botId = participant?.botId ?? null;
    if (botId) {
      const found = botList.find((bot) => String(bot.id) === String(botId));
      if (found) return found.name;
      const selected =
        participant?.userId === effectiveUserId
          ? botList.find(
              (bot) => String(bot.id) === (slotBotSelections.Hot || ""),
            )
          : null;
      if (selected) return selected.name;
      return hotBotLabel ?? `ボット #${botId}`;
    }
    return hotBotLabel ?? "Hot";
  }, [
    slotParticipants,
    botList,
    slotBotSelections.Hot,
    hotBotLabel,
    effectiveUserId,
  ]);

  const statusText = roomClosed
    ? "クローズ"
    : roomStarted
      ? displayState && displayState.status !== "running"
        ? "終了"
        : "対戦中"
      : "待機中";

  const activeMapId = pendingMapId ?? roomMapId ?? "";
  const activeMapName =
    mapList.find((m) => m.id === activeMapId)?.name ?? activeMapId;

  const canSelectMap =
    isOwner && !roomStarted && !roomClosed && !isTournamentRoomId(roomId);
  const canCloseRoom =
    isOwner && !roomStarted && !roomClosed && !isTournamentRoomId(roomId);
  const roomClosedLabel =
    roomClosedReason === "timeout"
      ? "一定時間スタートされなかったため、自動で閉じられました。"
      : roomClosedReason === "owner"
        ? "オーナーがルームを閉じました。"
        : null;

  const handleChangeMapId = useCallback(
    (nextMapId: string) => {
      if (!canSelectMap) return;
      const trimmed = nextMapId.trim();
      if (!trimmed) return;
      if (trimmed === roomMapId) return;
      setPendingMapId(trimmed);
      clientRef.current?.setMapId(trimmed);
      appendLog({ kind: "info", label: `map change requested: ${trimmed}` });
    },
    [appendLog, canSelectMap, roomMapId],
  );

  const handleCloseRoom = useCallback(() => {
    if (!canCloseRoom) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm("このルームを閉じますか？");
      if (!ok) return;
    }
    clientRef.current?.closeRoom();
  }, [canCloseRoom]);

  const handleStartMatch = async () => {
    if (roomClosed) {
      appendLog({ kind: "error", label: "ルームは閉じられています" });
      return;
    }
    if (!isOwner) {
      console.warn("[room] startMatch ignored: not owner");
      return;
    }
    if (!coolReady || !hotReady) {
      appendLog({
        kind: "error",
        label: "両席にボットが参加してから開始してください",
      });
      return;
    }
    clientRef.current?.startMatch();
  };

  const startNewMatch = useCallback(() => {
    if (isTournamentRoomId(roomId)) return;
    const nextRoomId = createRoomId();
    const url =
      roomMode === "practice"
        ? `/rooms/${nextRoomId}?mode=practice`
        : `/rooms/${nextRoomId}`;
    router.push(url);
  }, [router, roomId, roomMode]);

  const yourBotLabel = useMemo(() => {
    if (!userId) return "ゲスト";
    if (!yourSlot) return "観戦";
    const botId = selfParticipant?.botId ?? null;
    const owned = botId
      ? botList.find((bot) => String(bot.id) === String(botId))
      : null;
    if (owned) return owned.name;
    if (botId) return `ボット #${botId}`;
    return "ボット未選択";
  }, [userId, yourSlot, selfParticipant, botList]);

  const displayBotAlerts = useMemo(() => {
    void receivedRevision;
    const format = (meta?: ActionMeta): string | undefined => {
      if (!meta?.fallbackReason) return undefined;
      const note = meta.note?.trim();
      return `フォールバック (${meta.fallbackReason})${note ? `: ${note}` : ""}`;
    };

    const findLatest = (playerId: PlayerId): string | undefined => {
      const minTurn = Math.max(0, displayTurn - RETAINED_PAST_TURNS);
      for (let t = displayTurn; t >= minTurn; t -= 1) {
        const row = receivedActionsRef.current.get(t);
        if (!row) continue;
        const meta = playerId === "Cool" ? row.metaCool : row.metaHot;
        const message = format(meta);
        if (message) return message;
      }
      return undefined;
    };

    return {
      Cool: findLatest("Cool"),
      Hot: findLatest("Hot"),
    } satisfies Partial<Record<PlayerId, string>>;
  }, [displayTurn, receivedRevision]);

  return (
    <div className="room-theme min-h-screen py-6">
      <div className={gameShell}>
        <div className="room-hud room-fade">
          <div className="relative z-10 grid gap-4 lg:grid-cols-[1.1fr_minmax(360px,1.6fr)_1.1fr]">
            <div className="flex flex-col gap-3">
              <Link
                href={backLink.href}
                className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-x-[1px] hover:bg-white/20"
                data-testid="room-back-link"
              >
                <span aria-hidden>←</span>
                <span>{backLink.label}</span>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    Room
                  </div>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      viewerConnected ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                    aria-hidden
                  />
                </div>
                <div className="text-lg font-semibold text-white break-all">
                  {roomId}
                </div>
              </div>
            </div>

            <div className="room-scoreboard">
              <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                <div className="room-scorecard room-scorecard--cool">
                  <div className="room-scorecard__label room-heading">Cool</div>
                  <div className="room-scorecard__name">{coolDisplayName}</div>
                  <div className="room-scorecard__meta">
                    <span className="room-scorecard__pill room-scorecard__pill--cool">
                      Items {coolItems ?? "—"}
                    </span>
                    <span
                      className="room-scorecard__pill room-scorecard__pill--cool"
                      data-testid="ready-cool"
                      data-ready={coolReady ? "true" : "false"}
                    >
                      {coolReady ? "準備OK" : "待機"}
                    </span>
                  </div>
                </div>

                <div className="room-vs">
                  <div className="room-vs__badge">VS</div>
                  <div className="room-turn">
                    <div className="room-heading text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      Turn
                    </div>
                    <div className="room-turn__value">{turnText}</div>
                    <div className="room-turn__bar">
                      <span style={{ width: `${turnProgress * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="room-scorecard room-scorecard--hot">
                  <div className="room-scorecard__label room-heading">Hot</div>
                  <div className="room-scorecard__name">{hotDisplayName}</div>
                  <div className="room-scorecard__meta">
                    <span className="room-scorecard__pill room-scorecard__pill--hot">
                      Items {hotItems ?? "—"}
                    </span>
                    <span
                      className="room-scorecard__pill room-scorecard__pill--hot"
                      data-testid="ready-hot"
                      data-ready={hotReady ? "true" : "false"}
                    >
                      {hotReady ? "準備OK" : "待機"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span
                className="room-hud-chip"
                style={{
                  backgroundColor: roomClosed
                    ? "rgba(244, 63, 94, 0.25)"
                    : statusText === "対戦中"
                      ? "rgba(16, 185, 129, 0.2)"
                      : displayState
                        ? "rgba(148, 163, 184, 0.3)"
                        : "rgba(251, 146, 60, 0.25)",
                  color: roomClosed
                    ? "#fecdd3"
                    : statusText === "対戦中"
                      ? "#a7f3d0"
                      : displayState
                        ? "#e2e8f0"
                        : "#fde68a",
                  borderColor: roomClosed
                    ? "rgba(244, 63, 94, 0.4)"
                    : statusText === "対戦中"
                      ? "rgba(16, 185, 129, 0.35)"
                      : displayState
                        ? "rgba(148, 163, 184, 0.35)"
                        : "rgba(251, 146, 60, 0.35)",
                }}
                data-testid="room-status"
              >
                {statusText}
              </span>
              <span className="room-hud-chip" data-testid="assigned-role">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {roomInitError ? (
        <div className="mt-4 flex items-center justify-between gap-3 px-4 py-3 text-sm shadow-sm room-alert room-fade room-fade--delay-1">
          <div>
            <div className="font-semibold">ルーム初期化に失敗しました</div>
            <div className="text-xs">{roomInitError}</div>
          </div>
          <Button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm"
          >
            再読み込み
          </Button>
        </div>
      ) : null}

      {roomClosed ? (
        <div className={gameShell}>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm shadow-sm room-alert room-fade room-fade--delay-1">
            <div>
              <div className="font-semibold">ルームが閉じられました</div>
              <div className="text-xs">
                {roomClosedLabel ?? "このルームは現在利用できません。"}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => router.push("/rooms")}
              className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              ルーム一覧へ戻る
            </Button>
          </div>
        </div>
      ) : null}

      {roomMode === "practice" ? (
        <div className={gameShell}>
          <div className="mt-4 px-4 py-3 shadow-sm room-banner room-fade room-fade--delay-1">
            <div className="text-sm font-semibold">練習モード</div>
            <div className="text-sm">この対戦は記録に残りません</div>
          </div>
        </div>
      ) : null}

      <div className={gameShell}>
        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(520px,1fr)_260px] room-fade room-fade--delay-2">
          <PlayerStatusPane
            playerId="Cool"
            displayName={coolDisplayName}
            displayState={displayState}
            latestAction={displayActionLog?.actionCool ?? null}
            latestMeta={displayActionLog?.metaCool}
            latestTurn={displayActionLog?.turn}
          />

          <BoardPanel
            displayState={displayState}
            latestAction={latestBoardAction}
            resolvedWinner={resolvedWinner}
            showWinnerOverlay={Boolean(showWinnerOverlay)}
            replayId={displayReplayId}
            replayVisible={replayVisible}
            replayPendingLabel={replayPendingLabel}
            gameEndIssue={gameEndIssue}
            onStartNewMatch={startNewMatch}
            roomId={roomId}
            roomStarted={roomStarted}
            mapId={activeMapId}
            mapName={activeMapName}
            maps={mapList}
            mapListError={mapListError}
            showMapSelector={canSelectMap}
            mapSelectDisabled={Boolean(pendingMapId)}
            onChangeMapId={handleChangeMapId}
          />

          <PlayerStatusPane
            playerId="Hot"
            displayName={hotDisplayName}
            displayState={displayState}
            latestAction={displayActionLog?.actionHot ?? null}
            latestMeta={displayActionLog?.metaHot}
            latestTurn={displayActionLog?.turn}
          />
        </div>
      </div>

      <div className={gameShell}>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 room-fade room-fade--delay-3">
          <ControlPanel
            isOwner={isOwner}
            isPlayer={isPlayer}
            selfRole={selfRole}
            roomMode={roomMode}
            connectViewer={connectViewer}
            disconnectViewer={disconnectViewer}
            bots={botList}
            botsLoading={botsLoading}
            botListError={botListError}
            slotBotSelections={slotBotSelections}
            onChangeBotSelection={(slot, value) =>
              setSlotBotSelections((prev) => ({ ...prev, [slot]: value }))
            }
            slotParticipants={slotParticipants}
            yourSlot={yourSlot}
            onJoinSlot={handleJoinSlot}
            onLeaveSlot={handleLeaveSlot}
            coolDisplayName={coolDisplayName}
            hotDisplayName={hotDisplayName}
            coolBotRunning={coolBotRunning}
            hotBotRunning={hotBotRunning}
            onStartMatch={handleStartMatch}
            botAlerts={displayBotAlerts}
            yourBotLabel={yourBotLabel}
            roomStarted={roomStarted}
            readyFlags={{ Cool: coolReady, Hot: hotReady }}
            roleLabel={roleLabel}
            currentUserId={effectiveUserId}
            roomClosed={roomClosed}
            canCloseRoom={canCloseRoom}
            onCloseRoom={handleCloseRoom}
          />

          <ActionLogPanel
            actionLogRef={actionLogRef}
            actionLogs={visibleActionLogs}
          />
        </div>
      </div>

      <div className={gameShell}>
        <div
          className={`mt-8 room-devlog rounded-2xl border border-slate-900/15 bg-slate-900/5 shadow-lg ${devlogOpen ? "room-devlog--open" : ""}`}
          data-testid="event-log"
        >
          <button
            type="button"
            className="room-devlog__summary room-heading px-4 py-3 text-xs font-semibold text-slate-800"
            onClick={() => setDevlogOpen((prev) => !prev)}
            aria-expanded={devlogOpen}
            aria-controls="room-devlog-panel"
          >
            <span>開発者ログ</span>
            <span
              className={`room-devlog__chevron ${devlogOpen ? "room-devlog__chevron--open" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {devlogOpen ? (
            <div
              id="room-devlog-panel"
              ref={logsRef}
              className="room-devlog__panel max-h-64 overflow-auto bg-[#0b1020] px-4 pb-4 font-mono text-xs text-slate-100"
            >
              {logs.map((log, idx) => (
                <div key={`${log.id}-${idx}`} className="flex flex-col">
                  <span
                    className={
                      log.kind === "error"
                        ? "text-rose-300"
                        : log.kind === "event"
                          ? "text-sky-300"
                          : "text-slate-100"
                    }
                  >
                    {log.label}
                  </span>
                  {log.payload ? (
                    <pre className="whitespace-pre-wrap break-words text-[11px] text-slate-300">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ControlPanelProps {
  isOwner: boolean;
  isPlayer: boolean;
  selfRole: ParticipantRole | "guest";
  roomMode: RoomMode;
  connectViewer: (intent?: JoinIntent) => void;
  disconnectViewer: () => void;
  bots: BotListItem[];
  botsLoading: boolean;
  botListError: string | null;
  slotBotSelections: Record<PlayerId, string>;
  onChangeBotSelection: (slot: PlayerId, value: string) => void;
  slotParticipants: Record<PlayerId, ParticipantSnapshot | null>;
  yourSlot: ParticipantSlot;
  onJoinSlot: (slot: PlayerId) => void;
  onLeaveSlot: () => void;
  coolDisplayName: string;
  hotDisplayName: string;
  coolBotRunning: boolean;
  hotBotRunning: boolean;
  onStartMatch: () => void;
  botAlerts: Partial<Record<PlayerId, string>>;
  yourBotLabel: string;
  roomStarted: boolean;
  readyFlags: Record<PlayerId, boolean>;
  roleLabel: string;
  currentUserId?: string | null;
  roomClosed: boolean;
  canCloseRoom: boolean;
  onCloseRoom: () => void;
}

function ControlPanel({
  isOwner,
  isPlayer,
  selfRole,
  roomMode,
  connectViewer,
  disconnectViewer,
  bots,
  botsLoading,
  botListError,
  slotBotSelections,
  onChangeBotSelection,
  slotParticipants,
  yourSlot,
  onJoinSlot,
  onLeaveSlot,
  coolDisplayName,
  hotDisplayName,
  coolBotRunning,
  hotBotRunning,
  onStartMatch,
  botAlerts,
  yourBotLabel,
  roomStarted,
  readyFlags,
  roleLabel,
  currentUserId,
  roomClosed,
  canCloseRoom,
  onCloseRoom,
}: ControlPanelProps) {
  const spectatorOnly = !isOwner && !isPlayer && selfRole !== "player";
  const canJoinAsPlayer = Boolean(currentUserId);
  if (spectatorOnly) {
    return (
      <SpectatorPanel
        connectViewer={connectViewer}
        disconnectViewer={disconnectViewer}
        onJoinAsPlayer={() => connectViewer("player")}
        canJoinAsPlayer={canJoinAsPlayer}
      />
    );
  }

  const practiceOwner = roomMode === "practice" && isOwner;
  const canChooseSlot = isOwner || selfRole === "player";
  const matchLocked = roomStarted || roomClosed;
  const canStartMatch =
    isOwner && readyFlags.Cool && readyFlags.Hot && !matchLocked;
  const yourSlotParticipant =
    yourSlot && slotParticipants[yourSlot as PlayerId]
      ? slotParticipants[yourSlot as PlayerId]
      : null;
  const readySummary = `Cool: ${readyFlags.Cool ? "準備OK" : "待機"} / Hot: ${readyFlags.Hot ? "準備OK" : "待機"}`;
  const showSlotJoinUi = canChooseSlot && (!yourSlot || practiceOwner);

  return (
    <div className="space-y-4 p-4 room-panel room-panel--console">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="room-heading text-[11px] uppercase tracking-[0.14em] text-slate-500">
            ルーム操作
          </div>
          <div className="text-sm font-semibold text-slate-900">
            役割: {roleLabel}
          </div>
          <div className="text-xs text-slate-600">
            {practiceOwner
              ? "準備が整ったら開始"
              : isOwner
                ? "準備が揃ったら開始"
                : isPlayer
                  ? "自席のボットを選択"
                  : "席を選択"}
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 shadow-inner">
          あなたのボット: {yourBotLabel}
        </span>
      </div>

      {isOwner ? (
        <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 text-sm text-slate-800 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-900">オーナー操作</div>
            <div className="text-[12px] text-slate-600">{readySummary}</div>
          </div>
          {roomStarted ? (
            <div className="rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-inner">
              対戦中
            </div>
          ) : roomClosed ? (
            <div className="rounded-xl bg-white px-3 py-2 text-slate-700 shadow-inner">
              クローズ
            </div>
          ) : canStartMatch ? (
            <Button
              onClick={onStartMatch}
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:translate-y-[1px] hover:shadow-lg"
              data-testid="start-match"
            >
              <span aria-hidden>▶</span>
              対戦スタート
            </Button>
          ) : (
            <div className="rounded-xl bg-white px-3 py-2 text-slate-700 shadow-inner">
              準備待ち
            </div>
          )}
          {canCloseRoom ? (
            <Button
              type="button"
              onClick={onCloseRoom}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-100"
              data-testid="close-room"
            >
              ルームを閉じる
            </Button>
          ) : null}
        </div>
      ) : null}

      {showSlotJoinUi ? (
        <div className="space-y-3" data-testid="slot-join-panel">
          {(["Cool", "Hot"] as PlayerId[]).map((slot) => (
            <SlotJoinRow
              key={slot}
              mode="join"
              slot={slot}
              participant={slotParticipants[slot]}
              selection={slotBotSelections[slot]}
              onChangeSelection={(value) => onChangeBotSelection(slot, value)}
              bots={bots}
              loading={botsLoading}
              yourSlot={yourSlot}
              onJoin={() => onJoinSlot(slot)}
              onLeave={onLeaveSlot}
              roomStarted={matchLocked}
              currentUserId={currentUserId}
            />
          ))}
          {botListError ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {botListError}
            </div>
          ) : null}
        </div>
      ) : null}

      {yourSlot && !practiceOwner ? (
        <SlotJoinRow
          mode="manage"
          slot={yourSlot as PlayerId}
          participant={yourSlotParticipant}
          selection={slotBotSelections[yourSlot as PlayerId]}
          onChangeSelection={(value) =>
            onChangeBotSelection(yourSlot as PlayerId, value)
          }
          bots={bots}
          loading={botsLoading}
          yourSlot={yourSlot}
          onJoin={() => onJoinSlot(yourSlot as PlayerId)}
          onLeave={onLeaveSlot}
          roomStarted={matchLocked}
          currentUserId={currentUserId}
        />
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-xs text-slate-700 shadow-sm">
        <div className="mb-2 font-semibold text-slate-900">接続</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => connectViewer()}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800"
            data-testid="join-spectator"
          >
            再接続
          </Button>
          <Button
            type="button"
            onClick={disconnectViewer}
            className="rounded border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700"
            data-testid="disconnect"
          >
            切断
          </Button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-slate-800">
        <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-3 py-2">
          <div className="font-semibold text-blue-800">Cool</div>
          <div className="text-right">
            <div className="text-[12px] text-blue-900">{coolDisplayName}</div>
            <div className="text-[11px] text-blue-700">
              {coolBotRunning ? "動作中" : "待機"}
            </div>
          </div>
        </div>
        {botAlerts.Cool ? (
          <div
            className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800"
            data-testid="bot-alert-cool"
          >
            ボット警告:{" "}
            <span data-testid="cool-fallback">{botAlerts.Cool}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between rounded-2xl bg-rose-50 px-3 py-2">
          <div className="font-semibold text-rose-800">Hot</div>
          <div className="text-right">
            <div className="text-[12px] text-rose-900">{hotDisplayName}</div>
            <div className="text-[11px] text-rose-700">
              {hotBotRunning ? "動作中" : "待機"}
            </div>
          </div>
        </div>
        {botAlerts.Hot ? (
          <div
            className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800"
            data-testid="bot-alert-hot"
          >
            ボット警告: {botAlerts.Hot}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SpectatorPanel({
  connectViewer,
  disconnectViewer,
  onJoinAsPlayer,
  canJoinAsPlayer,
}: Pick<ControlPanelProps, "connectViewer" | "disconnectViewer"> & {
  onJoinAsPlayer: () => void;
  canJoinAsPlayer: boolean;
}) {
  return (
    <div
      className="space-y-4 p-4 room-panel room-panel--console"
      data-testid="spectator-panel"
    >
      <div className="space-y-1">
        <div className="room-heading text-[11px] uppercase tracking-[0.14em] text-slate-500">
          観戦
        </div>
        <div className="text-base font-semibold text-slate-900">観戦中</div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-xs text-slate-700 shadow-sm">
        <div className="mb-2 font-semibold text-slate-900">接続</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => connectViewer()}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800"
            data-testid="join-spectator"
          >
            再接続
          </Button>
          <Button
            type="button"
            onClick={onJoinAsPlayer}
            disabled={!canJoinAsPlayer}
            className="rounded border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="join-player"
          >
            参加する
          </Button>
          <Button
            type="button"
            onClick={disconnectViewer}
            className="rounded border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700"
            data-testid="disconnect"
          >
            切断
          </Button>
        </div>
        {!canJoinAsPlayer ? (
          <div className="mt-2 text-[11px] text-slate-500">
            ログインすると参加できます
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SlotJoinRowProps {
  mode: "join" | "manage";
  slot: PlayerId;
  participant: ParticipantSnapshot | null;
  selection: string;
  onChangeSelection: (value: string) => void;
  bots: BotListItem[];
  loading: boolean;
  yourSlot: ParticipantSlot;
  onJoin: () => void;
  onLeave: () => void;
  roomStarted: boolean;
  currentUserId?: string | null;
}

function SlotJoinRow({
  mode,
  slot,
  participant,
  selection,
  onChangeSelection,
  bots,
  loading,
  yourSlot,
  onJoin,
  onLeave,
  roomStarted,
  currentUserId,
}: SlotJoinRowProps) {
  const isSelf = participant?.userId && participant.userId === currentUserId;
  const isOpen = !participant;
  const matchLocked = roomStarted;
  const showInput = !matchLocked && (mode === "manage" || isSelf || isOpen);
  const showJoinAction = mode === "join" && isOpen && !matchLocked;
  const slotLabel =
    mode === "manage" && isSelf ? `${slot} に参加中` : `${slot} 席`;

  return (
    <div
      className={`rounded-2xl border px-3 py-3 shadow-sm ${slot === "Cool" ? "border-blue-200 bg-blue-50/80 text-blue-900" : "border-rose-200 bg-rose-50/80 text-rose-900"}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{slotLabel}</div>
        <div className="text-[11px] text-slate-600">
          {loading ? "読み込み中..." : `${bots.length} 件`}
        </div>
      </div>
      <div className="mt-1 text-[12px] text-slate-600">
        {participant
          ? isSelf
            ? "あなたが参加中です"
            : `参加中: ${participant.userId}${participant.botId ? ` / ボット #${participant.botId}` : ""}`
          : "だれも入っていません"}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-inner"
          data-testid={`slot-ready-${slot.toLowerCase()}`}
          data-ready={participant?.botId ? "true" : "false"}
          data-user-id={participant?.userId ?? ""}
          data-bot-id={participant?.botId ?? ""}
        >
          {participant?.botId
            ? "準備完了"
            : participant
              ? "ボット未選択"
              : "空席"}
        </span>
      </div>
      {matchLocked ? (
        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner">
          対戦中はロック中
        </div>
      ) : null}
      {showInput ? (
        <Field className="mt-2">
          <Label className="sr-only" htmlFor={`bot-selection-${slot}`}>
            {slotLabel} ボットID
          </Label>
          <Input
            id={`bot-selection-${slot}`}
            list={`bot-options-${slot}`}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-inner"
            value={selection}
            onChange={(e) => onChangeSelection(e.target.value)}
            data-testid={`${slot.toLowerCase()}-bot-id`}
            placeholder="ボットIDを入力または選択"
            // ボットは ID 直指定で起動できるため、一覧ロード中でも入力は有効のままにする（E2E フレーク回避にもなる）。
            disabled={matchLocked}
          />
          <datalist id={`bot-options-${slot}`}>
            {bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name} (#{bot.id})
              </option>
            ))}
          </datalist>
        </Field>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {isSelf || mode === "manage" ? (
          <>
            <Button
              type="button"
              onClick={onJoin}
              className={`rounded-lg border border-indigo-200 px-3 py-1 font-semibold ${
                matchLocked
                  ? "cursor-not-allowed bg-slate-100 text-slate-500"
                  : "bg-indigo-50 text-indigo-800"
              }`}
              data-testid={`join-slot-${slot.toLowerCase()}`}
              disabled={matchLocked}
            >
              ボットを設定
            </Button>
            <Button
              type="button"
              onClick={onLeave}
              className={`rounded-lg border border-slate-200 px-3 py-1 font-semibold ${
                matchLocked
                  ? "cursor-not-allowed bg-slate-100 text-slate-500"
                  : "bg-white text-slate-700"
              }`}
              disabled={matchLocked}
            >
              席を外す
            </Button>
          </>
        ) : null}
        {showJoinAction ? (
          <Button
            type="button"
            onClick={onJoin}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800"
            data-testid={`join-slot-${slot.toLowerCase()}`}
          >
            この席に入る
          </Button>
        ) : null}
        {!showJoinAction && participant && !isSelf ? (
          <span className="rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-inner">
            別の人がプレイ中です
          </span>
        ) : null}
        {mode === "join" && yourSlot && yourSlot !== slot ? (
          <span className="rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-inner">
            {yourSlot} で参加しています
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface BoardPanelProps {
  displayState: GameState | null;
  latestAction: { playerId: PlayerId; action: Action; turn?: number } | null;
  resolvedWinner: "Cool" | "Hot" | "draw" | "invalid" | null;
  showWinnerOverlay: boolean;
  replayId: string | null;
  replayVisible: boolean;
  replayPendingLabel: string | null;
  gameEndIssue: BotIssue | null;
  roomId: string;
  onStartNewMatch: () => void;
  roomStarted: boolean;
  mapId: string;
  mapName: string;
  maps: MapListResponse["maps"];
  mapListError: string | null;
  showMapSelector: boolean;
  mapSelectDisabled: boolean;
  onChangeMapId: (mapId: string) => void;
}

function BoardPanel({
  displayState,
  latestAction,
  resolvedWinner,
  showWinnerOverlay,
  replayId,
  replayVisible,
  replayPendingLabel,
  gameEndIssue,
  roomId,
  onStartNewMatch,
  roomStarted,
  mapId,
  mapName,
  maps,
  mapListError,
  showMapSelector,
  mapSelectDisabled,
  onChangeMapId,
}: BoardPanelProps) {
  const isTournament = isTournamentRoomId(roomId);
  const tileSize = (() => {
    if (!displayState) return 54;
    const maxDim = Math.max(displayState.width, displayState.height);
    if (maxDim <= 7) return 54;
    if (maxDim <= 15) return 40;
    return 32;
  })();
  const boardMessage = roomStarted
    ? "盤面を読み込み中..."
    : "対戦開始まで盤面は非表示です";
  const displayWinner = showWinnerOverlay ? resolvedWinner : null;
  return (
    <div className="relative overflow-hidden p-4 room-panel room-panel--strong">
      <div className="flex items-center justify-between">
        <div className="room-heading text-sm font-semibold text-slate-900">
          Arena
        </div>
        {displayWinner ? (
          <span
            className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 shadow-sm"
            data-testid="winner-badge"
          >
            {displayWinner === "invalid"
              ? "Result: 無効試合"
              : `Winner: ${displayWinner}`}
          </span>
        ) : null}
      </div>
      {showMapSelector ? (
        <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="room-heading text-xs font-semibold text-slate-700">
              マップ選択
            </div>
            <div className="text-xs text-slate-600">
              現在:{" "}
              <span
                className="font-semibold text-slate-800"
                data-testid="map-current-name"
              >
                {mapName || "-"}
              </span>
            </div>
          </div>
          {mapListError ? (
            <div className="mt-2 text-xs text-red-600">
              マップ一覧の取得に失敗しました: {mapListError}
            </div>
          ) : null}
          <Field className="mt-2 flex flex-wrap items-center gap-2">
            <Label className="sr-only" htmlFor="room-map-select">
              マップ
            </Label>
            <Select
              id="room-map-select"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
              value={mapId}
              onChange={(e) => onChangeMapId(e.target.value)}
              disabled={mapSelectDisabled || maps.length === 0}
              data-testid="map-select"
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.width}x{m.height}, {m.maxTurns}T)
                </option>
              ))}
            </Select>
            {mapSelectDisabled ? (
              <span className="text-xs font-semibold text-slate-600">
                変更中...
              </span>
            ) : null}
          </Field>
          <div className="mt-2 text-xs text-slate-500">
            対戦開始後は変更できません
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="flex max-w-full justify-center overflow-auto p-4 room-arena">
          {roomStarted && displayState ? (
            <BoardView
              state={displayState}
              tileSize={tileSize}
              latestAction={latestAction}
            />
          ) : (
            <div className="text-sm text-slate-600">{boardMessage}</div>
          )}
        </div>
        {displayWinner && replayId && replayVisible ? (
          <Link
            href={`/replays/${encodeURIComponent(replayId)}`}
            className="mt-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
            data-testid="replay-link"
          >
            リプレイを見る
          </Link>
        ) : null}
        {displayWinner && replayPendingLabel ? (
          <div
            className="mt-1 text-xs text-slate-500"
            data-testid="replay-pending"
          >
            {replayPendingLabel}
          </div>
        ) : null}
        {displayWinner && !isTournament ? (
          <Button
            type="button"
            onClick={onStartNewMatch}
            className="mt-1 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            data-testid="start-new-match"
          >
            新しい対戦を開始
          </Button>
        ) : null}
      </div>
      {displayWinner ? (
        <WinnerOverlay
          winner={displayWinner}
          gameState={displayState}
          issue={gameEndIssue}
        />
      ) : null}
    </div>
  );
}

interface WinnerOverlayProps {
  winner: "Cool" | "Hot" | "draw" | "invalid" | null;
  gameState: GameState | null;
  issue: BotIssue | null;
}

function WinnerOverlay({ winner, gameState, issue }: WinnerOverlayProps) {
  if (!winner) return null;
  const message =
    winner === "invalid"
      ? "無効試合"
      : winner === "draw"
        ? "ひきわけ"
        : winner === "Cool"
          ? "Cool の勝ち!"
          : "Hot の勝ち!";

  const turns = gameState ? getCurrentTurnNumber(gameState.turn) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/20">
      <div className="px-6 py-4 text-center room-panel room-panel--strong shadow-2xl">
        <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Game Over
        </div>
        <div className="room-heading text-2xl font-extrabold text-slate-900">
          {message}
        </div>
        <div className="text-sm text-slate-600">{turns} ターンで終了</div>
        {issue ? (
          <div className="pointer-events-auto mt-3 text-left">
            <BotIssuePanel issue={issue} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ActionLogPanelProps {
  actionLogRef: MutableRefObject<HTMLDivElement | null>;
  actionLogs: ActionLogRow[];
}

function ActionLogPanel({ actionLogRef, actionLogs }: ActionLogPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-4 room-panel room-panel--strong">
      <div className="flex items-center justify-between">
        <div className="room-heading text-sm font-semibold text-slate-900">
          Action Log
        </div>
      </div>
      <div
        ref={actionLogRef}
        className="max-h-[620px] space-y-2 overflow-auto pr-1"
        data-testid="action-log-container"
      >
        {actionLogs.length === 0 ? (
          <div className="text-sm text-slate-500">
            まだログがありません。対戦開始を待っています。
          </div>
        ) : null}
        {actionLogs.map((row, _idx) => {
          return (
            <Button
              key={row.id}
              type="button"
              title="このターンにジャンプ（準備中）"
              className="w-full rounded-2xl border border-slate-200 bg-white/70 p-3 text-left shadow-inner transition hover:border-slate-300 hover:bg-white"
              data-testid="action-log-row"
            >
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold" data-testid="action-log-turn">
                  手番 {row.turn}
                </span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] uppercase">
                  Actions
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ActionCell
                  label="Cool"
                  action={row.actionCool}
                  meta={row.metaCool}
                  tone="cool"
                />
                <ActionCell
                  label="Hot"
                  action={row.actionHot}
                  meta={row.metaHot}
                  tone="hot"
                />
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

interface ActionCellProps {
  label: "Cool" | "Hot";
  action: Action | null;
  meta?: ActionMeta;
  tone: "cool" | "hot";
}

function ActionCell({ label, action, meta, tone }: ActionCellProps) {
  const toneClasses =
    tone === "cool" ? "border-blue-200 bg-white" : "border-rose-200 bg-white";

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm shadow-sm ${toneClasses}`}
      data-testid={`action-cell-${label.toLowerCase()}`}
    >
      <div className="room-heading flex items-center justify-between text-[11px] uppercase text-slate-500">
        <span className="font-semibold text-slate-800">{label}</span>
        {meta?.source ? <span>{meta.source}</span> : null}
      </div>
      <div className="mt-1 text-slate-900">
        {action ? formatActionJa(action) : "—"}
      </div>
      {meta?.fallbackReason ? (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          <span className="text-[12px]" aria-hidden>
            !
          </span>
          {`Fallback (${meta.fallbackReason})`}
        </div>
      ) : null}
    </div>
  );
}

interface PlayerStatusPaneProps {
  playerId: PlayerId;
  displayName: string;
  displayState: GameState | null;
  latestAction: Action | null;
  latestMeta?: ActionMeta;
  alertText?: string;
  latestTurn?: number;
}

function PlayerStatusPane({
  playerId,
  displayName,
  displayState,
  latestAction,
  latestMeta,
  alertText,
  latestTurn,
}: PlayerStatusPaneProps) {
  const isCool = playerId === "Cool";
  const items = displayState ? displayState.players[playerId].items : null;
  const actionText = latestAction ? formatActionJa(latestAction) : "—";
  void alertText;
  const issue = issueFromActionMeta({ meta: latestMeta, turn: latestTurn });

  return (
    <div
      className={`flex h-full flex-col gap-3 p-4 room-panel ${
        isCool
          ? "room-panel--cool text-slate-900"
          : "room-panel--hot text-slate-900"
      }`}
      data-testid={`player-pane-${playerId.toLowerCase()}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="room-heading text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {playerId}
          </div>
          <div className="text-base font-semibold">{displayName}</div>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
          Items {items ?? "—"}
        </div>
      </div>

      <div className="rounded-2xl bg-white/80 px-3 py-3 shadow-inner">
        <div className="room-heading text-[12px] font-semibold text-slate-700">
          いまの行動
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900">
          {actionText}
        </div>
        <BotIssuePanel issue={issue} className="mt-2" />
      </div>
    </div>
  );
}

// E2: fallback/error classification is handled via `issueFromActionMeta`.
