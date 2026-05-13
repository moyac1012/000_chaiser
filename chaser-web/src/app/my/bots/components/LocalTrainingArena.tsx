"use client";

import { Button, Field, Input, Label } from "@headlessui/react";
import { Console as ConsoleFeed } from "console-feed";
import { useEffect, useRef, useState } from "react";

import BoardView from "@/components/BoardView";
import BotIssuePanel from "@/components/BotIssuePanel";
import { parseChaserDotMap } from "@/core/chaserDotMap";
import type { Action, GameState, GameStatus, PlayerId } from "@/core/engine";
import {
  getCurrentTurnNumber,
  getTurnView,
  isAction,
  step,
} from "@/core/engine";
import {
  DEFAULT_MAP_ID,
  type GameMapDefinition,
  mapDefinitionToGameState,
} from "@/core/map";
import type { ActionMeta } from "@/core/match/wsTypes";
import { type BotTurnContext, defaultAction } from "@/lib/bot/executor";
import { getUnsupportedBotRuntimeReason } from "@/lib/bot/language";
import type {
  BotRuntime,
  BotRuntimeLanguage,
  BotRuntimeMeta,
  BotRuntimeResult,
} from "@/lib/bot/runtime/BotRuntime";
import {
  createBotRuntime,
  createBotRuntimeFromFunction,
} from "@/lib/bot/runtime/createBotRuntime";
import {
  type BotIssue,
  formatEndReasonJa,
  issueFromActionMeta,
} from "@/lib/editor/botIssue";

type LocalTurnLog = {
  id: number;
  turn: number;
  player: PlayerId;
  viewAround: number[];
  action: Action;
  meta?: ActionMeta;
  ended?: {
    status: GameStatus;
    reason?: string;
  };
};

type ConsoleFeedLog = {
  id: string;
  method: "log" | "info" | "warn" | "error";
  data: unknown[];
};

interface LocalTrainingArenaProps {
  getCode: () => string;
  ready?: boolean;
  language?: BotRuntimeLanguage;
}

const MAX_TURN_LOGS = 30;
const MAX_CONSOLE_LINES = 500;
const AROUND_POSITIONS = Array.from({ length: 9 }, (_, index) => ({
  key: `pos-${index}`,
  index,
}));

const SAMPLE_MAP_07_DOT_MAP = `N:サンプルマップ07_本番風マップ
T:100
S:15,17
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,3,0,3,0,3,0,3,0,3,0,3,0,0,0
D:0,0,3,0,0,0,3,0,0,0,3,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,3,0,0,0,3,0,0,0,3,0,0
D:0,0,0,3,0,3,0,3,0,3,0,3,0,3,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,3,0,3,0,3,0,3,0,3,0,3,0,0,0
D:0,0,3,0,0,0,3,0,0,0,3,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,3,0,0,0,3,0,0,0,3,0,0
D:0,0,0,3,0,3,0,3,0,3,0,3,0,3,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
C:2,15
H:12,1
`;

const TRAINING_MAP_DEF = (() => {
  const parsed = parseChaserDotMap(SAMPLE_MAP_07_DOT_MAP);
  return {
    id: DEFAULT_MAP_ID,
    name: parsed.mapName,
    width: parsed.width,
    height: parsed.height,
    maxTurns: parsed.maxTurns,
    tiles: parsed.tiles,
    spawn: parsed.spawn,
  } satisfies GameMapDefinition;
})();

function initTrainingState(): GameState {
  return mapDefinitionToGameState(TRAINING_MAP_DEF);
}

function tileAt(around: number[], dir: Action["dir"]): number {
  switch (dir) {
    case "Up":
      return around[1] ?? 2;
    case "Down":
      return around[7] ?? 2;
    case "Left":
      return around[3] ?? 2;
    case "Right":
      return around[5] ?? 2;
  }
}

function rightOf(dir: Action["dir"]): Action["dir"] {
  switch (dir) {
    case "Up":
      return "Right";
    case "Right":
      return "Down";
    case "Down":
      return "Left";
    case "Left":
      return "Up";
  }
}

function leftOf(dir: Action["dir"]): Action["dir"] {
  switch (dir) {
    case "Up":
      return "Left";
    case "Left":
      return "Down";
    case "Down":
      return "Right";
    case "Right":
      return "Up";
  }
}

function backOf(dir: Action["dir"]): Action["dir"] {
  switch (dir) {
    case "Up":
      return "Down";
    case "Down":
      return "Up";
    case "Left":
      return "Right";
    case "Right":
      return "Left";
  }
}

/**
 * 検証用の相手ボット:
 * - put しない（詰ませない/勝ちに行かない）
 * - 盤外やブロックへ walk しない（自滅しない）
 * - できるだけアイテムも踏まない（自動ブロックでの事故を避ける）
 * - 壁に沿って歩き続ける（決定的・安定）
 */
function createTrainingOpponentRuntime(): BotRuntime {
  let facing: Action["dir"] = "Right";
  let stalledTurns = 0;

  return createBotRuntimeFromFunction((ctx: BotTurnContext) => {
    const around = ctx.around;
    const candidates: Action["dir"][] = [
      rightOf(facing),
      facing,
      leftOf(facing),
      backOf(facing),
    ];

    const floors = candidates.filter((dir) => tileAt(around, dir) === 0);
    const items = candidates.filter((dir) => tileAt(around, dir) === 3);

    const chosen = floors[0] ?? (stalledTurns >= 3 ? (items[0] ?? null) : null);
    if (chosen) {
      facing = chosen;
      stalledTurns = 0;
      return { kind: "walk", dir: chosen } satisfies Action;
    }

    stalledTurns += 1;
    return { kind: "look", dir: facing } satisfies Action;
  });
}

function normalizeResult(
  result: BotRuntimeResult | Action | null | undefined,
): BotRuntimeResult {
  if (!result || typeof result !== "object") {
    return normalizeInvalidResult(undefined, "action result is missing");
  }
  if ("action" in result) {
    if (!isAction(result.action)) {
      return normalizeInvalidResult(
        result.meta,
        "invalid action in result",
        result.logs,
      );
    }
    return {
      action: result.action,
      meta: result.meta,
      logs: result.logs,
    } satisfies BotRuntimeResult;
  }
  if (!isAction(result)) {
    return normalizeInvalidResult(undefined, "invalid action");
  }
  return { action: result as Action };
}

function normalizeInvalidResult(
  meta?: BotRuntimeMeta,
  note = "invalid action result",
  logs?: BotRuntimeResult["logs"],
): BotRuntimeResult {
  return {
    action: defaultAction,
    meta: {
      ...meta,
      fallbackReason: meta?.fallbackReason ?? "invalid",
      errorPhase: meta?.errorPhase ?? "runtime",
      note: meta?.note ?? note,
    },
    logs,
  };
}

function toActionMeta(meta?: BotRuntimeMeta): ActionMeta | undefined {
  if (!meta) return undefined;
  const fallbackReason =
    meta.fallbackReason === "invalid" ? "error" : meta.fallbackReason;
  return { ...meta, fallbackReason, source: "bot" };
}

export function LocalTrainingArena({
  getCode,
  ready = true,
  language = "js",
}: LocalTrainingArenaProps) {
  const [gameState, setGameState] = useState<GameState>(() =>
    initTrainingState(),
  );
  const [latestAction, setLatestAction] = useState<{
    playerId: PlayerId;
    action: Action;
    turn?: number;
  } | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>("Cool");
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [turnLogs, setTurnLogs] = useState<LocalTurnLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"turn-log" | "console">(
    "turn-log",
  );
  const [consoleLogs, setConsoleLogs] = useState<ConsoleFeedLog[]>([]);
  const [consoleHasUnread, setConsoleHasUnread] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<BotIssue | null>(null);

  const stateRef = useRef<GameState>(gameState);
  const playerRef = useRef<PlayerId>("Cool");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimesRef = useRef<{
    Cool: BotRuntime | null;
    Hot: BotRuntime | null;
  }>({ Cool: null, Hot: null });
  const logIdRef = useRef(0);
  const consoleLogIdRef = useRef(0);
  const speedRef = useRef(speedMs);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    speedRef.current = speedMs;
  }, [speedMs]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = runtimesRef.current;
      runtimesRef.current = { Cool: null, Hot: null };
      void current.Cool?.dispose();
      void current.Hot?.dispose();
    };
  }, []);

  const disposeRuntimes = () => {
    const current = runtimesRef.current;
    runtimesRef.current = { Cool: null, Hot: null };
    void current.Cool?.dispose();
    void current.Hot?.dispose();
  };

  const resetState = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    disposeRuntimes();
    const nextState = initTrainingState();
    stateRef.current = nextState;
    playerRef.current = "Cool";
    logIdRef.current = 0;
    consoleLogIdRef.current = 0;
    setGameState(nextState);
    setCurrentPlayer("Cool");
    setTurnLogs([]);
    setExpandedLogId(null);
    setConsoleLogs([]);
    setConsoleHasUnread(false);
    setRunning(false);
    setStatusMessage(null);
    setError(null);
    setIssue(null);
    setLatestAction(null);
  };

  const stopMatch = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  };

  const appendConsoleLogs = (entries: Array<Omit<ConsoleFeedLog, "id">>) => {
    if (entries.length === 0) return;
    const nextEntries = entries.map((entry) => ({
      ...entry,
      id: String(++consoleLogIdRef.current),
    }));
    if (activeTabRef.current !== "console") {
      setConsoleHasUnread(true);
    }
    setConsoleLogs((prev) => {
      const next = [...prev, ...nextEntries];
      return next.slice(-MAX_CONSOLE_LINES);
    });
  };

  const applyTurn = (
    player: PlayerId,
    around: number[],
    result: BotRuntimeResult,
  ) => {
    const action = result.action ?? defaultAction;
    const meta = toActionMeta(result.meta);
    if (meta?.fallbackReason) {
      const nextStatus: GameStatus = player === "Cool" ? "winHot" : "winCool";
      const nextState = { ...stateRef.current, status: nextStatus };
      stateRef.current = nextState;
      setLatestAction({ playerId: player, action, turn: nextState.turn });
      logIdRef.current += 1;
      setGameState(nextState);
      setExpandedLogId(logIdRef.current);
      setTurnLogs((prev) => {
        const entry: LocalTurnLog = {
          id: logIdRef.current,
          turn: nextState.turn,
          player,
          viewAround: around,
          action,
          meta,
          ended: {
            status: nextStatus,
            reason:
              meta.fallbackReason === "timeout"
                ? "forfeitTimeout"
                : "forfeitError",
          },
        };
        return [entry, ...prev].slice(0, MAX_TURN_LOGS);
      });
      setStatusMessage(
        `Fallback (${meta.fallbackReason})${meta.note ? `: ${meta.note}` : ""}`,
      );

      if (player === "Cool") {
        const fallbackIssue = issueFromActionMeta({
          meta,
          turn: nextState.turn,
        });
        if (fallbackIssue) {
          setIssue(fallbackIssue);
        }
      }

      if (player === "Cool" && result.logs && result.logs.length > 0) {
        appendConsoleLogs(
          result.logs.map((entry) => ({
            method: entry.level,
            data: entry.args,
          })),
        );
      }

      setRunning(false);
      return;
    }

    const stepResult = step(stateRef.current, player, action);
    const nextState = stepResult.state;
    stateRef.current = nextState;
    setLatestAction({ playerId: player, action, turn: nextState.turn });
    logIdRef.current += 1;
    setGameState(nextState);
    setExpandedLogId(logIdRef.current);
    setTurnLogs((prev) => {
      const entry: LocalTurnLog = {
        id: logIdRef.current,
        turn: nextState.turn,
        player,
        viewAround: around,
        action,
        meta,
        ended:
          nextState.status !== "running"
            ? {
                status: nextState.status,
                reason: stepResult.end?.reason,
              }
            : undefined,
      };
      return [entry, ...prev].slice(0, MAX_TURN_LOGS);
    });
    setStatusMessage(
      meta?.fallbackReason
        ? `Fallback (${meta.fallbackReason})${
            meta.note ? `: ${meta.note}` : ""
          }`
        : null,
    );

    if (player === "Cool") {
      const fallbackIssue = issueFromActionMeta({ meta, turn: nextState.turn });
      if (fallbackIssue) {
        setIssue(fallbackIssue);
      }
    }

    if (
      player === "Cool" &&
      nextState.status !== "running" &&
      stepResult.end &&
      nextState.status === "winHot"
    ) {
      setIssue({
        category: "rule",
        title: "ルール即敗",
        summary: formatEndReasonJa(stepResult.end.reason),
        detail: stepResult.end.point
          ? `point: (${stepResult.end.point.x}, ${stepResult.end.point.y})`
          : undefined,
        turn: nextState.turn,
      });
    }

    if (player === "Cool" && result.logs && result.logs.length > 0) {
      appendConsoleLogs(
        result.logs.map((entry) => ({
          method: entry.level,
          data: entry.args,
        })),
      );
    }

    if (nextState.status !== "running") {
      setRunning(false);
      return;
    }

    const nextPlayer: PlayerId = player === "Cool" ? "Hot" : "Cool";
    playerRef.current = nextPlayer;
    setCurrentPlayer(nextPlayer);
    timerRef.current = setTimeout(() => {
      void runTurn();
    }, speedRef.current);
  };

  const runTurn = async (): Promise<void> => {
    if (stateRef.current.status !== "running") {
      setRunning(false);
      return;
    }
    const player = playerRef.current;
    const runtime = runtimesRef.current[player];
    if (!runtime) {
      setError("ボットの初期化に失敗しました。もう一度お試しください。");
      setRunning(false);
      return;
    }

    if (player === "Cool") {
      appendConsoleLogs([
        {
          method: "info",
          data: [`ターン ${stateRef.current.turn}: start`],
        },
      ]);
    }

    const around = getTurnView(stateRef.current, player).around;
    const ctx: BotTurnContext = {
      state: stateRef.current,
      playerId: player,
      around,
    };

    try {
      const result = normalizeResult(await runtime.onTurn(ctx));
      applyTurn(player, around, result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ボットの実行中にエラーが発生しました。",
      );
      applyTurn(player, around, {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          note: err instanceof Error ? err.message : undefined,
        },
      });
    }
  };

  const startMatch = async () => {
    if (!ready) {
      setError("エディタの準備中です。少し待ってから試してください。");
      return;
    }
    const unsupportedReason = getUnsupportedBotRuntimeReason(
      language,
      "localTraining",
    );
    if (unsupportedReason) {
      setError(unsupportedReason);
      setRunning(false);
      return;
    }
    resetState();
    const coolRuntime = createBotRuntime({ language });
    const hotRuntime = createTrainingOpponentRuntime();
    runtimesRef.current = { Cool: coolRuntime, Hot: hotRuntime };
    const code = getCode();
    try {
      await Promise.all([
        coolRuntime.init({ code, timeoutMs: 600 }),
        hotRuntime.init({ code: "", timeoutMs: 600 }),
      ]);
    } catch (err) {
      disposeRuntimes();
      setError(
        err instanceof Error ? err.message : "ボットの初期化に失敗しました。",
      );
      setRunning(false);
      return;
    }
    setRunning(true);
    setStatusMessage(null);
    void runTurn();
  };

  const statusLabel = (() => {
    if (gameState.status !== "running") return `終了: ${gameState.status}`;
    return running ? `進行中 / 手番: ${currentPlayer}` : "一時停止";
  })();

  const renderTileLabel = (value: number): string => {
    if (value === 0) return "床";
    if (value === 1) return "キャラ";
    if (value === 2) return "ブロック";
    if (value === 3) return "アイテム";
    return String(value);
  };

  const handleTabChange = (tab: "turn-log" | "console") => {
    setActiveTab(tab);
    if (tab === "console") {
      setConsoleHasUnread(false);
    }
  };

  return (
    <div className="room-panel room-panel--strong flex h-full min-h-0 flex-col gap-4 p-4">
      <BotIssuePanel issue={issue} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={startMatch}
          disabled={!ready || running}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-sm disabled:opacity-60"
        >
          {running ? "実行中" : "対戦スタート"}
        </Button>
        <Button
          type="button"
          onClick={stopMatch}
          disabled={!running}
          className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm disabled:opacity-60"
        >
          実行停止
        </Button>
        <Button
          type="button"
          onClick={resetState}
          className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-sm"
        >
          リセット
        </Button>
        {running ? (
          <span className="text-xs font-semibold text-emerald-600">
            実行中…（再実行は停止/リセット後）
          </span>
        ) : null}
        <Field className="flex items-center gap-2 text-sm text-slate-700">
          <Label>スピード</Label>
          <Input
            type="range"
            min={150}
            max={900}
            step={50}
            value={speedMs}
            onChange={(e) => setSpeedMs(Number(e.target.value))}
            className="h-2 w-40 cursor-pointer appearance-none rounded bg-slate-200"
          />
          <span className="text-xs text-slate-500">{speedMs}ms/turn</span>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
        <span className="rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">
          ターン {getCurrentTurnNumber(gameState.turn)} / {gameState.maxTurns}
        </span>
        <span className="rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">
          状態: {statusLabel}
        </span>
        <span className="text-xs text-slate-500">
          Cool アイテム: {gameState.players.Cool.items} / Hot アイテム:{" "}
          {gameState.players.Hot.items}
        </span>
        {statusMessage ? (
          <span className="text-xs font-semibold text-amber-700">
            {statusMessage}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs font-semibold text-rose-600">{error}</span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="room-arena flex flex-none items-center justify-center p-4">
          <BoardView
            state={gameState}
            tileSize={40}
            latestAction={latestAction}
          />
        </div>

        <div className="room-panel room-panel--console flex min-h-0 flex-1 flex-col gap-2 p-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => handleTabChange("turn-log")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  activeTab === "turn-log"
                    ? "bg-slate-900 text-white"
                    : "bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                ターンログ
              </Button>
              <Button
                type="button"
                onClick={() => handleTabChange("console")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  activeTab === "console"
                    ? "bg-slate-900 text-white"
                    : "bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                コンソール
                {consoleHasUnread ? (
                  <span
                    className="ml-2 inline-block h-2 w-2 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                ) : null}
              </Button>
            </div>
            {activeTab === "turn-log" ? (
              <span className="text-xs text-slate-500">
                Cool = 青 / Hot = 赤
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                ボットのコンソール出力
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200/70 bg-white/70 p-2 text-xs text-slate-800">
            {activeTab === "turn-log" ? (
              turnLogs.length === 0 ? (
                <p className="text-slate-500">
                  まだログはありません。対戦スタートで記録されます。
                </p>
              ) : (
                turnLogs.map((log, idx) => {
                  const tone =
                    log.player === "Cool"
                      ? "border-blue-200"
                      : "border-rose-200";
                  const endedLabel =
                    log.ended?.status && log.ended.status !== "running"
                      ? `終了: ${log.ended.status}`
                      : null;
                  return (
                    <div
                      key={log.id}
                      className={`rounded-2xl border ${tone} bg-white/80 p-2 shadow-sm`}
                    >
                      <Button
                        type="button"
                        onClick={() =>
                          setExpandedLogId((prev) =>
                            prev === log.id ? null : log.id,
                          )
                        }
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            ターン {log.turn}:{" "}
                            {log.player === "Cool" ? "Cool" : "Hot"}
                            {idx === 0 ? "（最新）" : ""}
                          </span>
                          <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                            {log.action.kind}/{log.action.dir}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
                          {log.meta?.fallbackReason ? (
                            <span className="font-semibold text-amber-700">
                              フォールバック: {log.meta.fallbackReason}
                            </span>
                          ) : null}
                          {endedLabel ? (
                            <span className="font-semibold text-rose-700">
                              {endedLabel}
                            </span>
                          ) : null}
                          <span className="ml-auto text-slate-500">
                            {expandedLogId === log.id ? "閉じる" : "開く"}
                          </span>
                        </div>
                      </Button>

                      {expandedLogId === log.id ? (
                        <div className="mt-2 grid gap-2">
                          <div>
                            <div className="text-[11px] font-semibold text-slate-700">
                              周囲 (3×3)
                            </div>
                            <div className="mt-1 inline-grid grid-cols-3 gap-1">
                              {AROUND_POSITIONS.map((pos) => {
                                const value = log.viewAround[pos.index] ?? 0;
                                return (
                                  <div
                                    key={pos.key}
                                    className="flex h-9 w-9 flex-col items-center justify-center rounded border border-slate-200/70 bg-white/80 text-[10px]"
                                    title={renderTileLabel(value)}
                                  >
                                    <div className="font-semibold">{value}</div>
                                    <div className="text-slate-500">
                                      {renderTileLabel(value)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {log.meta?.fallbackReason ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-700">
                                エラー情報
                              </div>
                              <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                                {log.meta.errorPhase
                                  ? `${log.meta.errorPhase}: `
                                  : ""}
                                {log.meta.errorMessage ??
                                  log.meta.note ??
                                  "エラー"}
                              </div>
                            </div>
                          ) : null}

                          {log.ended ? (
                            <div>
                              <div className="text-[11px] font-semibold text-slate-700">
                                終了
                              </div>
                              <div className="mt-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-900">
                                {endedLabel}
                                {log.ended.reason
                                  ? ` / ${formatEndReasonJa(log.ended.reason)}`
                                  : ""}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )
            ) : consoleLogs.length === 0 ? (
              <p className="text-slate-500">
                対戦を開始するとボットのログが表示されます。
              </p>
            ) : (
              <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-2">
                <ConsoleFeed
                  logs={consoleLogs}
                  variant="light"
                  logGrouping={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LocalTrainingArena;
