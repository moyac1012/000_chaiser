import { compileBotCode } from "../codeExecutor";
import {
  type BotTurnContext,
  DirectFunctionExecutor,
  defaultAction,
  type OnTurnFn,
} from "../executor";
import type {
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeLanguage,
  BotRuntimeResult,
  BotRuntimeTurnInput,
} from "./BotRuntime";

export type JsBotRuntimeOptions = {
  language?: BotRuntimeLanguage;
  onTurn?: OnTurnFn;
};

export class JsBotRuntime implements BotRuntime {
  readonly language: BotRuntimeLanguage;
  private executor: DirectFunctionExecutor | null = null;
  private readonly onTurnOverride: OnTurnFn | null;

  constructor(options?: JsBotRuntimeOptions) {
    this.language = options?.language ?? "js";
    this.onTurnOverride = options?.onTurn ?? null;
  }

  async init(input: BotRuntimeInitInput): Promise<void> {
    const onTurn = this.onTurnOverride ?? compileBotCode(input.code);
    this.executor = new DirectFunctionExecutor(onTurn);
  }

  async onTurn(input: BotRuntimeTurnInput): Promise<BotRuntimeResult> {
    if (!this.executor) {
      return {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "runtime not initialized",
          note: "runtime not initialized",
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
    this.executor = null;
  }
}
