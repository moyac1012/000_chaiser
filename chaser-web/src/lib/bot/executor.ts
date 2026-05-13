import {
  type Action,
  type GameState,
  isAction,
  type PlayerId,
} from "../../core/engine";
import type {
  BotConsoleEntry,
  BotRuntimeMeta,
  BotRuntimeResult,
} from "./runtime/BotRuntime";

export const defaultAction: Action = { kind: "walk", dir: "Right" };

export type BotTurnResult = BotRuntimeResult;

export type BotTurnContext = {
  state: GameState;
  playerId: PlayerId;
  around: number[];
};

function normalizeInvalidResult(
  meta?: BotRuntimeMeta,
  note = "invalid action result",
  logs?: BotConsoleEntry[],
): BotTurnResult {
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

function normalizeTurnResult(value: Action | BotTurnResult): BotTurnResult {
  if (!value || typeof value !== "object") {
    return normalizeInvalidResult(undefined, "action result is missing");
  }
  if ("action" in value) {
    const result = value as BotTurnResult;
    if (!isAction(result.action)) {
      return normalizeInvalidResult(
        result.meta,
        "invalid action in result",
        result.logs,
      );
    }
    return result;
  }
  if (!isAction(value)) {
    return normalizeInvalidResult(undefined, "invalid action");
  }
  return { action: value as Action };
}

export interface BotExecutor {
  /**
   * Execute one turn of bot logic.
   * Implementations may run synchronously or asynchronously (e.g., Web Worker).
   */
  runTurn(ctx: BotTurnContext): BotTurnResult | Promise<BotTurnResult>;
}

export type OnTurnFn = (
  ctx: BotTurnContext,
) => Action | BotTurnResult | Promise<Action | BotTurnResult>;

export class DirectFunctionExecutor implements BotExecutor {
  constructor(private readonly onTurn: OnTurnFn) {}

  runTurn(ctx: BotTurnContext): BotTurnResult | Promise<BotTurnResult> {
    const result = this.onTurn(ctx);
    return result instanceof Promise
      ? result.then((value) => normalizeTurnResult(value))
      : normalizeTurnResult(result);
  }
}

type WorkerRequest =
  | { type: "init"; code: string }
  | { type: "runTurn"; requestId: number; ctx: BotTurnContext };

type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; requestId: number; action: Action }
  | { type: "error"; requestId?: number; message: string; stack?: string }
  | {
      type: "log";
      requestId?: number;
      level: "log" | "info" | "warn" | "error";
      args: unknown[];
    };

interface WorkerBotExecutorOptions {
  timeoutMs?: number;
}

/**
 * Execute bot code inside a Web Worker for isolation and cancellation.
 */
export class WorkerBotExecutor implements BotExecutor {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private requestId = 0;
  private lastInitError: { message: string; stack?: string } | null = null;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: BotTurnResult) => void;
      timeoutId: ReturnType<typeof setTimeout>;
      logs: BotConsoleEntry[];
      nextLogId: number;
    }
  >();
  private readonly timeoutMs: number;
  private readonly code: string;

  constructor(code: string, options?: WorkerBotExecutorOptions) {
    this.code = code;
    this.timeoutMs = options?.timeoutMs ?? 500;
    this.readyPromise = this.spawnWorker();
  }

  runTurn(ctx: BotTurnContext): Promise<BotTurnResult> {
    return (this.readyPromise ?? Promise.resolve())
      .catch(() => {
        // If init failed once, try recreating the worker.
        this.readyPromise = this.spawnWorker();
        return this.readyPromise;
      })
      .then(() => this.executeTurn(ctx))
      .catch((err) => {
        console.error(
          "[WorkerBotExecutor] runTurn failed; fallback action used",
          err,
        );
        const initError = this.lastInitError;
        return {
          action: defaultAction,
          meta: {
            fallbackReason: "error",
            errorPhase: "init",
            errorMessage: initError?.message ?? "worker init failed",
            errorStack: initError?.stack,
            note: initError?.message ?? "worker init failed",
          },
        };
      });
  }

  private executeTurn(ctx: BotTurnContext): Promise<BotTurnResult> {
    if (!this.worker) {
      return Promise.resolve({
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "worker unavailable",
          note: "worker unavailable",
        },
      });
    }

    const requestId = ++this.requestId;
    return new Promise<BotTurnResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.handleTimeout(requestId);
        resolve({
          action: defaultAction,
          meta: { fallbackReason: "timeout" },
        });
      }, this.timeoutMs);
      this.pending.set(requestId, {
        resolve,
        timeoutId,
        logs: [],
        nextLogId: 0,
      });
      const message: WorkerRequest = { type: "runTurn", requestId, ctx };
      this.worker?.postMessage(message);
    });
  }

  private spawnWorker(): Promise<void> {
    this.worker?.terminate();
    this.pending.forEach(({ timeoutId }) => {
      clearTimeout(timeoutId);
    });
    this.pending.clear();
    this.lastInitError = null;

    const worker = new Worker(
      new URL("./worker/botWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    this.worker = worker;

    const readyPromise = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data, resolve, reject);
      };
      worker.onerror = (event) => {
        console.error("[WorkerBotExecutor] worker error", event);
        this.lastInitError = { message: "Worker error" };
        this.resetWorker();
        reject(event instanceof Error ? event : new Error("Worker error"));
      };
    }).catch((err) => {
      // Prevent unhandled rejection warnings; caller will retry spawn.
      console.error("[WorkerBotExecutor] worker init failed", err);
      throw err;
    });

    const initMessage: WorkerRequest = { type: "init", code: this.code };
    worker.postMessage(initMessage);
    return readyPromise;
  }

  private handleWorkerMessage(
    message: WorkerResponse,
    resolveReady: () => void,
    rejectReady: (reason?: unknown) => void,
  ): void {
    switch (message.type) {
      case "ready":
        resolveReady();
        break;
      case "result":
        this.resolvePending(message.requestId, message.action);
        break;
      case "error":
        if (typeof message.requestId === "number") {
          console.warn("[WorkerBotExecutor] worker error response", message);
          this.resolvePending(message.requestId, defaultAction, {
            fallbackReason: "error",
            errorPhase: "runtime",
            errorMessage: message.message,
            errorStack: message.stack,
            note: message.message,
          });
        } else {
          console.error("[WorkerBotExecutor] worker init error", message);
          this.lastInitError = {
            message: message.message ?? "worker init error",
            stack: message.stack,
          };
          this.resetWorker();
          rejectReady(new Error(message.message ?? "worker init error"));
        }
        break;
      case "log":
        if (typeof message.requestId === "number") {
          const pending = this.pending.get(message.requestId);
          if (pending) {
            pending.nextLogId += 1;
            pending.logs.push({
              id: pending.nextLogId,
              level: message.level,
              args: message.args,
            });
          }
        }
        console[message.level]?.("[BotWorker]", ...message.args);
        break;
      default:
        console.warn("[WorkerBotExecutor] unknown message", message);
    }
  }

  private resolvePending(
    requestId: number,
    action: Action,
    meta?: BotRuntimeMeta,
  ): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.pending.delete(requestId);
    pending.resolve({
      action: action ?? defaultAction,
      meta,
      logs: pending.logs.length > 0 ? pending.logs : undefined,
    });
  }

  private handleTimeout(requestId: number): void {
    this.pending.delete(requestId);
    console.warn("[WorkerBotExecutor] turn timed out; terminating worker");
    this.resetWorker();
    this.readyPromise = this.spawnWorker();
  }

  dispose(): void {
    this.readyPromise = null;
    this.lastInitError = null;
    this.resetWorker();
  }

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ timeoutId, resolve }) => {
      clearTimeout(timeoutId);
      // Best-effort resolve with a safe action to avoid dangling promises.
      resolve({
        action: defaultAction,
        meta: {
          fallbackReason: "timeout",
          note: "worker reset",
        },
      });
    });
    this.pending.clear();
  }
}
