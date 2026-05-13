import type { GameState, PlayerId } from "@/core/engine";
import { defaultAction } from "../executor";
import type {
  BotConsoleEntry,
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeInitStatus,
  BotRuntimeResult,
  BotRuntimeTurnInput,
} from "./BotRuntime";

type BotTurnContext = {
  state: GameState;
  playerId: PlayerId;
  around: number[];
};

type WorkerRequest =
  | { type: "init"; code: string; rubyWasmUrl?: string }
  | { type: "runTurn"; requestId: number; ctx: BotTurnContext };

type WorkerResponse =
  | { type: "ready" }
  | { type: "initStatus"; phase: BotRuntimeInitStatus["phase"] }
  | { type: "result"; requestId: number; result: BotRuntimeResult }
  | { type: "error"; requestId?: number; message: string; stack?: string }
  | {
      type: "log";
      requestId?: number;
      level: BotConsoleEntry["level"];
      args: unknown[];
    };

type PendingTurn = {
  resolve: (value: BotRuntimeResult) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  logs: BotConsoleEntry[];
  nextLogId: number;
};

const DEFAULT_TIMEOUT_MS = 500;

type WorkerRubyBotRuntimeOptions = {
  rubyWasmUrl?: string;
};

export class WorkerRubyBotRuntime implements BotRuntime {
  readonly language = "ruby" as const;

  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private initStatusListener: ((status: BotRuntimeInitStatus) => void) | null =
    null;
  private timeoutMs = DEFAULT_TIMEOUT_MS;
  private code = "";
  private requestId = 0;
  private lastInitError: Error | null = null;
  private readonly pending = new Map<number, PendingTurn>();
  private readonly rubyWasmUrl?: string;

  constructor(options: WorkerRubyBotRuntimeOptions = {}) {
    this.rubyWasmUrl = options.rubyWasmUrl;
  }

  async init(input: BotRuntimeInitInput): Promise<void> {
    this.code = input.code;
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.initStatusListener = input.onInitStatus ?? null;
    this.lastInitError = null;
    this.initPromise = this.spawnWorker();
    await this.initPromise;
  }

  async onTurn(input: BotRuntimeTurnInput): Promise<BotRuntimeResult> {
    try {
      await (this.initPromise ?? this.spawnWorker());
    } catch (error) {
      const initError = this.lastInitError ?? toError(error);
      return {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: initError.message,
          errorStack: initError.stack,
          note: initError.message,
        },
      };
    }

    if (!this.worker) {
      return {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "ruby worker unavailable",
          note: "ruby worker unavailable",
        },
      };
    }

    const requestId = ++this.requestId;
    const ctx: BotTurnContext = {
      state: input.state,
      playerId: input.playerId,
      around: input.around,
    };

    return new Promise<BotRuntimeResult>((resolve) => {
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

      this.worker?.postMessage({
        type: "runTurn",
        requestId,
        ctx,
      } satisfies WorkerRequest);
    });
  }

  async dispose(): Promise<void> {
    this.initPromise = null;
    this.initStatusListener = null;
    this.lastInitError = null;
    this.resetWorker();
  }

  private spawnWorker(): Promise<void> {
    this.resetWorker();

    const worker = new Worker(
      new URL("../worker/rubyBotWorker.ts", import.meta.url),
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
        const error = new Error("Ruby worker error");
        this.lastInitError = error;
        this.resetWorker();
        reject(event instanceof Error ? event : error);
      };
    }).catch((error) => {
      this.lastInitError = toError(error);
      throw error;
    });

    worker.postMessage({
      type: "init",
      code: this.code,
      rubyWasmUrl: this.rubyWasmUrl,
    } satisfies WorkerRequest);
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
      case "initStatus":
        this.initStatusListener?.({ phase: message.phase });
        break;
      case "result":
        this.resolvePending(message.requestId, message.result);
        break;
      case "error":
        if (typeof message.requestId === "number") {
          this.resolvePending(message.requestId, {
            action: defaultAction,
            meta: {
              fallbackReason: "error",
              errorPhase: "runtime",
              errorMessage: message.message,
              errorStack: message.stack,
              note: message.message,
            },
          });
        } else {
          const error = new Error(message.message ?? "ruby worker init error");
          this.lastInitError = error;
          this.resetWorker();
          rejectReady(error);
        }
        break;
      case "log": {
        const requestId = message.requestId;
        if (typeof requestId === "number") {
          const pending = this.pending.get(requestId);
          if (pending) {
            pending.nextLogId += 1;
            pending.logs.push({
              id: pending.nextLogId,
              level: message.level,
              args: message.args,
            });
          }
        }
        console[message.level]?.("[RubyBotWorker]", ...message.args);
        break;
      }
    }
  }

  private resolvePending(requestId: number, result: BotRuntimeResult): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.pending.delete(requestId);
    pending.resolve({
      ...result,
      action: result.action ?? defaultAction,
      logs:
        pending.logs.length > 0
          ? [...pending.logs, ...(result.logs ?? [])]
          : result.logs,
    });
  }

  private handleTimeout(requestId: number): void {
    this.pending.delete(requestId);
    this.resetWorker();
    this.initPromise = this.spawnWorker();
  }

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(({ timeoutId, resolve }) => {
      clearTimeout(timeoutId);
      resolve({
        action: defaultAction,
        meta: {
          fallbackReason: "timeout",
          note: "ruby worker reset",
        },
      });
    });
    this.pending.clear();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
