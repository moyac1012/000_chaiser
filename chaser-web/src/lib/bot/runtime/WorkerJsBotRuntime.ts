import {
  type BotTurnContext,
  defaultAction,
  WorkerBotExecutor,
} from "../executor";
import type {
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeLanguage,
  BotRuntimeResult,
  BotRuntimeTurnInput,
} from "./BotRuntime";

export type WorkerJsBotRuntimeOptions = {
  language?: BotRuntimeLanguage;
};

export class WorkerJsBotRuntime implements BotRuntime {
  readonly language: BotRuntimeLanguage;
  private executor: WorkerBotExecutor | null = null;

  constructor(options?: WorkerJsBotRuntimeOptions) {
    this.language = options?.language ?? "js";
  }

  async init(input: BotRuntimeInitInput): Promise<void> {
    this.executor?.dispose();
    this.executor = new WorkerBotExecutor(input.code, {
      timeoutMs: input.timeoutMs,
    });
  }

  async onTurn(input: BotRuntimeTurnInput): Promise<BotRuntimeResult> {
    if (!this.executor) {
      return {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "worker runtime not initialized",
          note: "worker runtime not initialized",
        },
      };
    }
    const ctx: BotTurnContext = {
      state: input.state,
      playerId: input.playerId,
      around: input.around,
    };
    const result = await this.executor.runTurn(ctx);
    return result as BotRuntimeResult;
  }

  async dispose(): Promise<void> {
    this.executor?.dispose();
    this.executor = null;
  }
}
