import type {
  Action,
  CommandKind,
  EngineEndInfo,
  EngineEndReason,
  GameState,
  GameStatus,
  Position,
  Tile,
  TurnView,
} from "@/core/engine";
import { step as applyStep, getTurnView } from "@/core/engine";
import type {
  BotConsoleEntry,
  BotRuntimeLanguage,
  BotRuntimeMeta,
} from "@/lib/bot/runtime/BotRuntime";
import { createBotRuntime } from "@/lib/bot/runtime/createBotRuntime";

import { getTutorialMapAsset } from "./maps";
import type { TutorialMapDefinition, TutorialStepDefinition } from "./types";

const DEFAULT_SPEED_MS = 240;
const DEFAULT_TIMEOUT_MS = 600;

export type TutorialRunFailureReason =
  | "runtimeInitFailed"
  | "botFallback"
  | "actionNotAllowed"
  | "goalBeforeItems"
  | "maxActionsExceeded"
  | "wrongWinCondition"
  | "gameEnded"
  | "aborted";

export type TutorialRunFailure = {
  reason: TutorialRunFailureReason;
  mapId: string;
  actionIndex: number;
  action?: Action;
  endReason?: EngineEndReason;
  status?: GameStatus;
  itemsRemaining?: number;
  meta?: BotRuntimeMeta;
  message: string;
};

export type TutorialMapRunSummary = {
  mapId: string;
  actions: number;
  usedActionKinds: CommandKind[];
  status: GameStatus;
  reachedGoal: boolean;
  endReason?: EngineEndReason;
};

export type TutorialStepRunResult = {
  status: "success" | "failed" | "aborted";
  mapResults: TutorialMapRunSummary[];
  failure?: TutorialRunFailure;
};

export type TutorialTurnEvent = {
  mapId: string;
  actionIndex: number;
  action: Action;
  state: GameState;
  view: TurnView;
  observation?: number[];
  meta?: BotRuntimeMeta;
  logs?: BotConsoleEntry[];
  end?: EngineEndInfo;
};

export type TutorialRunCallbacks = {
  onMapStart?: (args: {
    mapId: string;
    mapIndex: number;
    totalMaps: number;
    state: GameState;
    goal: Position;
  }) => void;
  onTurn?: (event: TutorialTurnEvent) => void;
  onMapEnd?: (args: {
    mapId: string;
    success: boolean;
    summary: TutorialMapRunSummary;
  }) => void;
  onFailure?: (failure: TutorialRunFailure) => void;
};

export type TutorialRunConfig = {
  step: TutorialStepDefinition;
  code: string;
  language: BotRuntimeLanguage;
  speedMs?: number;
  timeoutMs?: number;
  startDelayMs?: number;
  useWorker?: boolean;
  signal?: AbortSignal;
  callbacks?: TutorialRunCallbacks;
};

function initTutorialState(def: TutorialMapDefinition): GameState {
  const map: Tile[][] = def.tiles.map((row) => [...row]);
  const cool = def.spawn.Cool;
  const hot = def.spawn.Hot;
  map[cool.y][cool.x] = 1;
  map[hot.y][hot.x] = 1;
  return {
    width: def.width,
    height: def.height,
    map,
    players: {
      Cool: { id: "Cool", pos: { ...cool }, items: 0 },
      Hot: { id: "Hot", pos: { ...hot }, items: 0 },
    },
    turn: 0,
    maxTurns: def.maxTurns,
    status: "running",
  };
}

function countItems(map: Tile[][]): number {
  let count = 0;
  for (const row of map) {
    for (const tile of row) {
      if (tile === 3) count += 1;
    }
  }
  return count;
}

function isGoalReached(state: GameState, goal: Position): boolean {
  const pos = state.players.Cool.pos;
  return pos.x === goal.x && pos.y === goal.y;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        resolve();
      } else {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      }
    }
  });
}

function isPutWin(end?: EngineEndInfo): boolean {
  return (
    end?.reason === "putOnEnemy" || end?.reason === "putOnEnemyMutualSurround"
  );
}

export async function runTutorialStep(
  config: TutorialRunConfig,
): Promise<TutorialStepRunResult> {
  const speedMs = config.speedMs ?? DEFAULT_SPEED_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startDelayMs = config.startDelayMs ?? 0;
  const mapResults: TutorialMapRunSummary[] = [];
  const { step, code, language, callbacks, signal } = config;

  for (let index = 0; index < step.mapVariants.length; index += 1) {
    if (signal?.aborted) {
      return { status: "aborted", mapResults };
    }

    const variant = step.mapVariants[index];
    const asset = getTutorialMapAsset(variant.mapId);
    let state = initTutorialState(asset.map);

    const runtime = createBotRuntime({
      language,
      useWorker: config.useWorker,
    });
    try {
      await runtime.init({ code, timeoutMs });
    } catch (error) {
      const failure: TutorialRunFailure = {
        reason: "runtimeInitFailed",
        mapId: variant.mapId,
        actionIndex: 0,
        message: error instanceof Error ? error.message : "runtime init failed",
      };
      callbacks?.onFailure?.(failure);
      await runtime.dispose();
      return { status: "failed", mapResults, failure };
    }

    const usedActionKinds = new Set<CommandKind>();
    let actionIndex = 0;
    let reachedGoal = false;
    let endReason: EngineEndReason | undefined;
    let mapSuccess = false;

    callbacks?.onMapStart?.({
      mapId: variant.mapId,
      mapIndex: index,
      totalMaps: step.mapVariants.length,
      state,
      goal: variant.goal,
    });

    try {
      if (startDelayMs > 0) {
        await wait(startDelayMs, signal);
        if (signal?.aborted) {
          return { status: "aborted", mapResults };
        }
      }
      while (state.status === "running") {
        if (signal?.aborted) {
          return { status: "aborted", mapResults };
        }

        const around = getTurnView(state, "Cool").around;
        const result = await runtime.onTurn({
          state,
          playerId: "Cool",
          around,
        });

        const action = result.action;
        actionIndex += 1;

        if (result.meta?.fallbackReason) {
          const failure: TutorialRunFailure = {
            reason: "botFallback",
            mapId: variant.mapId,
            actionIndex,
            action,
            meta: result.meta,
            message:
              result.meta.note ?? "ボットのフォールバックが発生しました。",
          };
          callbacks?.onFailure?.(failure);
          return { status: "failed", mapResults, failure };
        }

        if (!step.allowedActions.includes(action.kind)) {
          const failure: TutorialRunFailure = {
            reason: "actionNotAllowed",
            mapId: variant.mapId,
            actionIndex,
            action,
            message: "このステップでは使用できない行動です。",
          };
          callbacks?.onFailure?.(failure);
          return { status: "failed", mapResults, failure };
        }

        usedActionKinds.add(action.kind);

        const stepResult = applyStep(state, "Cool", action);
        state = stepResult.state;
        endReason = stepResult.end?.reason;

        callbacks?.onTurn?.({
          mapId: variant.mapId,
          actionIndex,
          action,
          state,
          view: stepResult.view,
          observation: stepResult.observation,
          meta: result.meta,
          logs: result.logs,
          end: stepResult.end,
        });

        if (step.validation.kind === "reachGoal") {
          reachedGoal = isGoalReached(state, variant.goal);
          if (reachedGoal) {
            const remainingItems = step.validation.requireAllItems
              ? countItems(state.map)
              : 0;
            if (remainingItems > 0) {
              const failure: TutorialRunFailure = {
                reason: "goalBeforeItems",
                mapId: variant.mapId,
                actionIndex,
                action,
                itemsRemaining: remainingItems,
                message: "アイテムをすべて集める前にゴールしました。",
              };
              callbacks?.onFailure?.(failure);
              return { status: "failed", mapResults, failure };
            }

            mapSuccess = true;
            break;
          }
        }

        if (step.validation.kind === "winByPut" && isPutWin(stepResult.end)) {
          mapSuccess = true;
          break;
        }

        if (state.status !== "running") {
          const failure: TutorialRunFailure = {
            reason: "gameEnded",
            mapId: variant.mapId,
            actionIndex,
            action,
            endReason,
            status: state.status,
            message: "ゴール達成前にゲームが終了しました。",
          };
          callbacks?.onFailure?.(failure);
          return { status: "failed", mapResults, failure };
        }

        if (
          step.validation.maxActions &&
          actionIndex >= step.validation.maxActions
        ) {
          const limit = step.validation.maxActions;
          const failure: TutorialRunFailure = {
            reason: "maxActionsExceeded",
            mapId: variant.mapId,
            actionIndex,
            action,
            message: limit
              ? `最大${limit}ターン以内にクリアできませんでした。ルートを短くするか、無駄な行動を減らしてみましょう。`
              : "手数制限に到達しました。",
          };
          callbacks?.onFailure?.(failure);
          return { status: "failed", mapResults, failure };
        }

        await wait(speedMs, signal);
      }
    } finally {
      await runtime.dispose();
    }

    if (!mapSuccess) {
      const failure: TutorialRunFailure = {
        reason: "wrongWinCondition",
        mapId: variant.mapId,
        actionIndex,
        endReason,
        status: state.status,
        message: "ゴール条件を満たせないまま終了しました。",
      };
      callbacks?.onFailure?.(failure);
      return { status: "failed", mapResults, failure };
    }

    const summary: TutorialMapRunSummary = {
      mapId: variant.mapId,
      actions: actionIndex,
      usedActionKinds: Array.from(usedActionKinds),
      status: state.status,
      reachedGoal,
      endReason,
    };
    mapResults.push(summary);
    callbacks?.onMapEnd?.({ mapId: variant.mapId, success: true, summary });
  }

  return { status: "success", mapResults };
}
