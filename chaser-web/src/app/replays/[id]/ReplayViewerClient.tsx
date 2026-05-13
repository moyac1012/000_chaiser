"use client";

import { Button, Input, Select } from "@headlessui/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MapListResponse } from "@/app/api/maps/route";
import BoardView from "@/components/BoardView";
import type { Action, GameState, PlayerId } from "@/core/engine";
import type { ReplayLogEntry, ReplayRecord } from "@/core/match/replay";
import { getDisplayTurnDelayMs } from "@/lib/ui/displayTurn";
import { formatActionJa } from "@/lib/ui/formatAction";
import { resolveReplayBoardTileSize } from "./replayBoardLayout";
import {
  buildReplayFacts,
  findActionEventForTurn,
  findGameEndEvent,
  findTurnEventForTurn,
  formatActionEventResultJa,
  formatGameEndReasonJa,
  formatGameEndWinnerJa,
  formatNoChangeReasonJa,
} from "./replayFacts";

interface Props {
  replayId: string;
  initialBackLink: { href: string; label: string };
}

interface ReplayState {
  loading: boolean;
  error: string | null;
  replay: ReplayRecord | null;
}

const REPLAY_BOARD_HORIZONTAL_PADDING_PX = 24;
const REPLAY_BOARD_BOTTOM_SAFE_AREA_PX = 220;

export default function ReplayViewerClient({
  replayId,
  initialBackLink,
}: Props) {
  const [{ loading, error, replay }, setReplayState] = useState<ReplayState>({
    loading: true,
    error: null,
    replay: null,
  });
  const [mapMeta, setMapMeta] = useState<
    MapListResponse["maps"][number] | null
  >(null);
  const [mapMetaLoading, setMapMetaLoading] = useState(false);
  const [mapMetaError, setMapMetaError] = useState<string | null>(null);
  const backLink = initialBackLink;
  const [turnIndex, setTurnIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const [boardTileSize, setBoardTileSize] = useState(32);

  useEffect(() => {
    let cancelled = false;
    setReplayState({ loading: true, error: null, replay: null });

    fetch(`/api/replays/${encodeURIComponent(replayId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const message =
            res.status === 404
              ? "リプレイが見つかりません"
              : "リプレイの取得に失敗しました";
          throw new Error(message);
        }
        return (await res.json()) as ReplayRecord;
      })
      .then((data) => {
        if (cancelled) return;
        setReplayState({ loading: false, error: null, replay: data });
        setTurnIndex(0);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setReplayState({ loading: false, error: err.message, replay: null });
      });

    return () => {
      cancelled = true;
    };
  }, [replayId]);

  // リプレイが切り替わったら UI 状態を初期化する（初見でも迷子にならないように）。
  useEffect(() => {
    if (!replay) return;
    setIsPlaying(false);
    setTurnIndex(0);
  }, [replay]);

  // mapId → Map メタデータ（DB変更なしで「何のマップか」を表示する）
  useEffect(() => {
    if (!replay?.mapId) return;
    let cancelled = false;
    setMapMeta(null);
    setMapMetaError(null);
    setMapMetaLoading(true);

    fetch("/api/maps", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("マップ情報の取得に失敗しました");
        return (await res.json()) as MapListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        const found = data.maps.find((m) => m.id === replay.mapId) ?? null;
        setMapMeta(found);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setMapMetaError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setMapMetaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [replay?.mapId]);

  const currentEntry: ReplayLogEntry | null = useMemo(() => {
    if (!replay || replay.log.length === 0) return null;
    return replay.log[Math.min(turnIndex, replay.log.length - 1)];
  }, [replay, turnIndex]);

  useEffect(() => {
    const boardViewport = boardViewportRef.current;
    const boardState = currentEntry?.state;

    if (!boardViewport || !boardState) {
      return;
    }

    const measure = () => {
      const rect = boardViewport.getBoundingClientRect();
      const maxBoardWidthPx =
        boardViewport.clientWidth - REPLAY_BOARD_HORIZONTAL_PADDING_PX;
      const maxBoardHeightPx =
        window.innerHeight - rect.top - REPLAY_BOARD_BOTTOM_SAFE_AREA_PX;

      setBoardTileSize(
        resolveReplayBoardTileSize({
          boardWidthTiles: boardState.width,
          boardHeightTiles: boardState.height,
          maxBoardWidthPx,
          maxBoardHeightPx,
        }),
      );
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(boardViewport);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [currentEntry?.state]);

  const actor: PlayerId | null = useMemo(() => {
    if (!currentEntry) return null;
    if (currentEntry.actionCool) return "Cool";
    if (currentEntry.actionHot) return "Hot";
    return null;
  }, [currentEntry]);

  const actorAction: Action | null = useMemo(() => {
    if (!currentEntry) return null;
    if (actor === "Cool") return currentEntry.actionCool;
    if (actor === "Hot") return currentEntry.actionHot;
    return null;
  }, [actor, currentEntry]);

  const latestAction = useMemo(() => {
    if (!currentEntry || !actor || !actorAction) return null;
    return { playerId: actor, action: actorAction, turn: currentEntry.turn };
  }, [actor, actorAction, currentEntry]);

  // Play 中は「いま表示している 1手」を基準に、行動種別で再生速度を可変にする。
  useEffect(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    if (!isPlaying) return;
    if (!replay || replay.log.length === 0) {
      setIsPlaying(false);
      return;
    }

    const maxIndex = replay.log.length - 1;
    if (turnIndex >= maxIndex) {
      setIsPlaying(false);
      return;
    }

    const entry = replay.log[turnIndex];
    const action = entry.actionCool ?? entry.actionHot ?? null;
    const delayMs = Math.max(
      80,
      Math.round(
        getDisplayTurnDelayMs({
          state: entry.state as GameState,
          action,
        }) / playbackSpeed,
      ),
    );

    playbackTimerRef.current = setTimeout(() => {
      setTurnIndex((prev) => {
        if (!replay) return prev;
        const max = replay.log.length - 1;
        if (prev >= max) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delayMs);

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, replay, turnIndex]);

  const maxIndex = (replay?.log.length ?? 0) - 1;
  const speedOptions = [0.5, 1, 1.5, 2, 4] as const;
  const hasTurns = maxIndex >= 0;
  const isAtStart = !hasTurns || turnIndex <= 0;
  const isAtEnd = !hasTurns || turnIndex >= maxIndex;

  const totalHands = replay?.log.length ?? 0;
  const handInfo =
    currentEntry && totalHands > 0
      ? `${turnIndex + 1}手目 / ${totalHands}手`
      : "0手目 / 0手";
  const handProgress = !hasTurns
    ? 0
    : maxIndex === 0
      ? 1
      : Math.min(1, turnIndex / maxIndex);

  const jumpTo = useCallback(
    (nextIndex: number) => {
      if (!hasTurns) return;
      setIsPlaying(false);
      const clamped = Math.max(0, Math.min(nextIndex, maxIndex));
      setTurnIndex(clamped);
    },
    [hasTurns, maxIndex],
  );

  const stepBy = useCallback(
    (delta: number) => {
      if (!hasTurns) return;
      setIsPlaying(false);
      setTurnIndex((prev) => {
        const next = prev + delta;
        return Math.max(0, Math.min(next, maxIndex));
      });
    },
    [hasTurns, maxIndex],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!hasTurns) return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepBy(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepBy(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasTurns, stepBy]);

  function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function shortId(value: string): string {
    if (value.length <= 14) return value;
    return `${value.slice(0, 8)}…${value.slice(-4)}`;
  }

  const coolItems = currentEntry?.state.players.Cool.items ?? 0;
  const hotItems = currentEntry?.state.players.Hot.items ?? 0;

  const actorBadge =
    actor === "Cool" ? (
      <span className="room-scorecard__pill room-scorecard__pill--cool">
        Cool
      </span>
    ) : actor === "Hot" ? (
      <span className="room-scorecard__pill room-scorecard__pill--hot">
        Hot
      </span>
    ) : currentEntry?.state.status !== "running" ? (
      <span className="room-scorecard__pill">終局</span>
    ) : (
      <span className="room-scorecard__pill">—</span>
    );

  const renderAction = (playerId: PlayerId, action: Action | null) => {
    const isActor = actor === playerId;
    const isGameEnd = currentEntry?.state.status !== "running";

    if (isActor) {
      if (!action) {
        return <span className="text-sm text-slate-500">行動なし</span>;
      }
      return (
        <span className="text-sm text-slate-900">{formatActionJa(action)}</span>
      );
    }

    if (actor) {
      return <span className="text-sm text-slate-400">手番外</span>;
    }
    return (
      <span className="text-sm text-slate-400">
        {isGameEnd ? "終局" : "行動なし"}
      </span>
    );
  };

  const events = replay?.events ?? [];
  const gameEndEvent = useMemo(() => findGameEndEvent(events), [events]);
  const winnerLabel = useMemo(() => {
    const formatWinner = (winner: string) => {
      if (winner === "draw") return "引き分け";
      if (winner === "none") return "無効試合";
      if (winner === "cool" || winner === "Cool") return "Cool";
      if (winner === "hot" || winner === "Hot") return "Hot";
      return winner;
    };

    if (gameEndEvent) {
      const winner =
        gameEndEvent.winner === "cool"
          ? "Cool"
          : gameEndEvent.winner === "hot"
            ? "Hot"
            : gameEndEvent.winner === "draw"
              ? "draw"
              : "none";
      return formatWinner(winner);
    }
    if (replay?.winner) return formatWinner(replay.winner);
    return "進行中";
  }, [gameEndEvent, replay?.winner]);

  const actionEvent = useMemo(
    () => findActionEventForTurn(events, turnIndex),
    [events, turnIndex],
  );
  const turnEvent = useMemo(
    () => findTurnEventForTurn(events, turnIndex),
    [events, turnIndex],
  );
  const facts = useMemo(
    () => buildReplayFacts({ actionEvent, turnEvent }),
    [actionEvent, turnEvent],
  );
  const actionSummary = actionEvent
    ? {
        actorLabel: actionEvent.actor === "cool" ? "Cool" : "Hot",
        actionLabel: formatActionJa(actionEvent.action),
      }
    : null;
  const actionResultLabel = actionEvent
    ? formatActionEventResultJa(actionEvent.result)
    : null;
  const noChangeReasonLabel =
    actionEvent?.result === "noChange" && actionEvent.noChangeReason
      ? formatNoChangeReasonJa(actionEvent.noChangeReason)
      : null;
  const actionResultTone =
    actionEvent?.result === "applied"
      ? "bg-emerald-100 text-emerald-800"
      : actionEvent?.result === "noChange"
        ? "bg-amber-100 text-amber-800"
        : actionEvent?.result === "invalid"
          ? "bg-rose-100 text-rose-800"
          : actionEvent?.result === "timeout"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700";
  const actionActorTone =
    actionSummary?.actorLabel === "Cool"
      ? "bg-blue-100 text-blue-800"
      : "bg-red-100 text-red-800";
  const isCoolActor = actor === "Cool";
  const isHotActor = actor === "Hot";
  const gameShell = "mx-auto w-full px-4 sm:px-6 lg:px-8";

  return (
    <div className="room-theme min-h-screen py-6">
      <div className={gameShell}>
        <div className="space-y-6">
          <div className="room-hud room-fade">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
                <Link
                  href={backLink.href}
                  className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-x-[1px] hover:bg-white/20"
                  data-testid="replay-back-link"
                >
                  <span aria-hidden>←</span>
                  <span>{backLink.label}</span>
                </Link>
                <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                  Replay
                </div>
                <div className="text-lg font-semibold text-white">
                  #{shortId(replayId)}
                </div>
                <div className="text-xs text-slate-300">
                  {replay ? formatDate(replay.createdAt) : "—"}
                </div>
              </div>
              <div className="min-w-[220px]">
                <div className="room-turn">
                  <div className="room-heading text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    Turn
                  </div>
                  <div className="room-turn__value">{handInfo}</div>
                  <div className="room-turn__bar">
                    <span style={{ width: `${handProgress * 100}%` }} />
                  </div>
                </div>
              </div>
              <div
                className="flex flex-wrap items-center gap-2 text-xs font-semibold"
                data-testid="replay-winner"
              >
                <span className="room-hud-chip">Winner {winnerLabel}</span>
                <span className="room-hud-chip">速度 {playbackSpeed}x</span>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 room-fade room-fade--delay-1">
            <div className="room-panel room-panel--strong px-3 py-2">
              <div className="room-heading text-xs font-semibold text-slate-500">
                マップ
              </div>
              <div className="mt-1 text-sm text-slate-900">
                {mapMetaLoading ? (
                  <span className="text-slate-500">読み込み中...</span>
                ) : mapMeta ? (
                  <span>
                    {mapMeta.name}{" "}
                    <span className="text-slate-500">
                      ({mapMeta.width}×{mapMeta.height}, 最大 {mapMeta.maxTurns}
                      )
                    </span>
                  </span>
                ) : replay?.mapId ? (
                  <span className="font-mono text-xs">{replay.mapId}</span>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </div>
              {mapMetaError ? (
                <div className="mt-1 text-xs text-slate-500">
                  ({mapMetaError})
                </div>
              ) : null}
            </div>
            <div className="room-panel room-panel--strong px-3 py-2">
              <div className="room-heading text-xs font-semibold text-slate-500">
                ルーム
              </div>
              <div className="mt-1 font-mono text-xs text-slate-900">
                {replay ? shortId(replay.roomId) : "—"}
              </div>
            </div>
            <div className="room-panel room-panel--strong px-3 py-2">
              <div className="room-heading text-xs font-semibold text-slate-500">
                リプレイ
              </div>
              <div className="mt-1 font-mono text-xs text-slate-900">
                {replay ? shortId(replay.id) : "—"}
              </div>
            </div>
          </div>

          {loading && (
            <div className="room-panel room-panel--strong px-4 py-3 text-slate-700">
              読み込み中...
            </div>
          )}
          {error && <div className="room-alert px-4 py-3 text-sm">{error}</div>}

          {!loading && !error && replay && replay.log.length === 0 && (
            <div className="room-panel room-panel--strong px-4 py-3 text-slate-700">
              記録がありません
            </div>
          )}

          {!loading &&
            !error &&
            replay &&
            replay.log.length > 0 &&
            currentEntry && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] room-fade room-fade--delay-2">
                <div className="space-y-4">
                  <div className="room-panel room-panel--strong p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {actorBadge}
                        <span className="text-xs text-slate-500">
                          ターン {currentEntry.turn}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {handInfo}
                      </div>
                    </div>
                  </div>

                  <div className="room-panel room-panel--strong p-3">
                    <div className="room-heading text-xs font-semibold text-slate-500">
                      盤面
                    </div>
                    <div className="mt-2 overflow-auto" ref={boardViewportRef}>
                      <div className="room-arena p-3">
                        <BoardView
                          state={currentEntry.state as GameState}
                          tileSize={boardTileSize}
                          latestAction={latestAction}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="room-panel p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => jumpTo(0)}
                          disabled={isAtStart}
                        >
                          先頭
                        </Button>
                        <Button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => stepBy(-1)}
                          disabled={isAtStart}
                        >
                          前へ
                        </Button>
                        <Button
                          type="button"
                          className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => setIsPlaying((prev) => !prev)}
                          disabled={!hasTurns}
                        >
                          {isPlaying ? "停止" : "再生"}
                        </Button>
                        <Button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => stepBy(1)}
                          disabled={isAtEnd}
                        >
                          次へ
                        </Button>
                        <Button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => jumpTo(maxIndex)}
                          disabled={isAtEnd}
                        >
                          末尾
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="room-heading text-xs font-semibold text-slate-500">
                          速度
                        </span>
                        <Select
                          name="playback-speed"
                          value={String(playbackSpeed)}
                          onChange={(e) =>
                            setPlaybackSpeed(Number.parseFloat(e.target.value))
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          {speedOptions.map((speed) => (
                            <option key={speed} value={speed}>
                              {speed}x
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="ml-auto text-sm text-slate-700">
                        {handInfo}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Input
                        type="range"
                        min={0}
                        max={maxIndex}
                        value={turnIndex}
                        onChange={(e) =>
                          jumpTo(Number.parseInt(e.target.value, 10))
                        }
                        className="flex-1"
                        disabled={!hasTurns}
                        data-testid="replay-slider"
                      />
                    </div>
                  </div>

                  <div className="room-panel p-3" data-testid="replay-facts">
                    <div className="room-heading text-xs font-semibold text-slate-500">
                      確定イベント（推測なし）
                    </div>
                    <div className="mt-1 text-sm text-slate-900">
                      {actionSummary ? (
                        <div
                          className="flex flex-wrap items-center gap-2"
                          data-testid="replay-action-summary"
                        >
                          <span className="text-xs font-semibold text-slate-500">
                            行動記録
                          </span>
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold ${actionActorTone}`}
                          >
                            {actionSummary.actorLabel}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {actionSummary.actionLabel}
                          </span>
                          {actionResultLabel ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${actionResultTone}`}
                            >
                              {actionResultLabel}
                            </span>
                          ) : null}
                          {noChangeReasonLabel ? (
                            <span
                              className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                              data-testid="replay-nochange-reason"
                            >
                              {noChangeReasonLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-slate-500">行動記録: なし</div>
                      )}
                      {facts.itemCausality ? (
                        <div
                          className="mt-1 text-slate-700"
                          data-testid="replay-item-causality"
                        >
                          {facts.itemCausality}
                        </div>
                      ) : null}
                    </div>

                    {facts.observation ? (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-slate-600">
                          {facts.observation.title}
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          0=床 / 1=キャラ / 2=ブロック / 3=アイテム
                        </div>
                        {facts.observation.kind === "look3x3" &&
                        facts.observation.tiles.length === 9 ? (
                          <div className="mt-2 inline-grid grid-cols-3 gap-1 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-sm text-slate-900">
                            {facts.observation.tiles.map((value, index) => (
                              <div
                                // tiles は保存済みイベントの表示用（index は位置表現のために必要）
                                // biome-ignore lint/suspicious/noArrayIndexKey: deterministic 3x3 grid
                                key={index}
                                className="flex h-8 w-8 items-center justify-center rounded bg-white shadow-sm"
                              >
                                {value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 font-mono text-sm text-slate-900">
                            {facts.observation.tiles.join(" ")}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="room-panel p-3">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <div className="room-heading font-semibold">
                        タイムライン
                      </div>
                    </div>
                    <div className="mt-2 max-h-72 space-y-2 overflow-auto pr-1">
                      {replay.log.map((entry, index) => {
                        const action =
                          entry.actionCool ?? entry.actionHot ?? null;
                        const actorLabel = entry.actionCool
                          ? "Cool"
                          : entry.actionHot
                            ? "Hot"
                            : "—";
                        const actorTone =
                          actorLabel === "Cool"
                            ? "bg-blue-100 text-blue-800"
                            : actorLabel === "Hot"
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-100 text-slate-600";
                        const isActive = index === turnIndex;

                        return (
                          <Button
                            key={`${entry.turn}-${index}`}
                            type="button"
                            onClick={() => jumpTo(index)}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                              isActive
                                ? "border-slate-300 bg-slate-100"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold">
                                {index + 1}手目
                              </span>
                              <span>ターン {entry.turn}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={`rounded px-2 py-1 text-xs font-semibold ${actorTone}`}
                              >
                                {actorLabel}
                              </span>
                              <span className="text-sm text-slate-900">
                                {action ? formatActionJa(action) : "行動なし"}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="room-panel p-3">
                    <div className="room-heading text-sm font-semibold text-slate-700">
                      プレイヤー
                    </div>
                    <div className="mt-2 grid gap-2">
                      <div
                        className={`rounded-xl border px-3 py-2 ${
                          isCoolActor
                            ? "border-blue-200 bg-blue-50/70 ring-1 ring-blue-200/60"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                            Cool
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Items {coolItems}
                          </span>
                        </div>
                        <div className="mt-2">
                          {renderAction("Cool", currentEntry.actionCool)}
                        </div>
                      </div>
                      <div
                        className={`rounded-xl border px-3 py-2 ${
                          isHotActor
                            ? "border-rose-200 bg-rose-50/70 ring-1 ring-rose-200/60"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                            Hot
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Items {hotItems}
                          </span>
                        </div>
                        <div className="mt-2">
                          {renderAction("Hot", currentEntry.actionHot)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {gameEndEvent ? (
                    <div
                      className="room-panel p-3 text-sm"
                      data-testid="replay-game-end"
                    >
                      <div className="room-heading text-xs font-semibold text-slate-500">
                        終局理由（推測なし）
                      </div>
                      <div className="mt-0.5 text-slate-900">
                        <span className="font-semibold">
                          {formatGameEndWinnerJa(gameEndEvent.winner)}
                        </span>
                        <span className="mx-2 text-slate-400">/</span>
                        <span>
                          {formatGameEndReasonJa(gameEndEvent.reason)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        決定手:{" "}
                        <span className="font-mono">
                          {gameEndEvent.turnIndex + 1}
                        </span>
                        {totalHands > 0 ? (
                          <span className="text-slate-500">
                            {" "}
                            / {totalHands}手
                          </span>
                        ) : null}
                        {gameEndEvent.point ? (
                          <span className="ml-2 text-slate-500">
                            座標: (
                            <span className="font-mono">
                              {gameEndEvent.point.x},{gameEndEvent.point.y}
                            </span>
                            )
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
