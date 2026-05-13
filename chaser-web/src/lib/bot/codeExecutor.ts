import type { Action } from "@/core/engine";
import { step } from "@/core/engine";
import { BotApi } from "./BotApi";
import {
  type BotTurnContext,
  type BotTurnResult,
  defaultAction,
  type OnTurnFn,
} from "./executor";
import type { BotConsoleEntry } from "./runtime/BotRuntime";

export function compileBotCode(rawCode: string | null | undefined): OnTurnFn {
  const source = (rawCode ?? "").trim();
  if (source.length === 0) {
    return () => ({
      action: defaultAction,
      meta: {
        fallbackReason: "error",
        errorPhase: "init",
        errorMessage: "Bot code is empty",
        note: "Bot code is empty",
      },
    });
  }
  const code = source;

  try {
    const factory = new Function(
      `
const __chaserBotLogs = [];
let __chaserBotLogSeq = 0;
const __realConsole = globalThis.console;
function __captureLog(level, args) {
  __chaserBotLogSeq += 1;
  __chaserBotLogs.push({ id: __chaserBotLogSeq, level, args });
  try {
    __realConsole?.[level]?.(...args);
  } catch {
    // ignore
  }
}
const console = {
  log: (...args) => __captureLog('log', args),
  info: (...args) => __captureLog('info', args),
  warn: (...args) => __captureLog('warn', args),
  error: (...args) => __captureLog('error', args),
};
function __takeLogs() {
  const out = __chaserBotLogs.slice();
  __chaserBotLogs.length = 0;
  return out;
}
${code}
if (typeof onTurn !== 'function') {
  throw new Error('onTurn is not defined');
}
return { onTurn, __takeLogs };
` as string,
    ) as () => unknown;

    const exported = factory() as
      | {
          onTurn: unknown;
          __takeLogs: unknown;
        }
      | unknown;
    if (!exported || typeof exported !== "object") {
      return () => ({
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "bot init failed",
          note: "bot init failed",
        },
      });
    }
    const maybeOnTurn = (exported as { onTurn?: unknown }).onTurn;
    const maybeTakeLogs = (exported as { __takeLogs?: unknown }).__takeLogs;
    if (
      typeof maybeOnTurn !== "function" ||
      typeof maybeTakeLogs !== "function"
    ) {
      return () => ({
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: "onTurn is not a function",
          note: "onTurn is not a function",
        },
      });
    }
    const onTurn = maybeOnTurn as (api: unknown) => unknown;
    const takeLogs = maybeTakeLogs as () => BotConsoleEntry[];

    return (ctx) => {
      takeLogs();
      return executeTurn({ ctx, onTurn, takeLogs });
    };
  } catch (error) {
    console.error("[BotCompiler] Failed to compile bot code", error);
    return () => ({
      action: defaultAction,
      meta: {
        fallbackReason: "error",
        errorPhase: "init",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        note: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function executeTurn(args: {
  ctx: BotTurnContext;
  onTurn: (api: unknown) => unknown;
  takeLogs: () => BotConsoleEntry[];
}): BotTurnResult | Promise<BotTurnResult> {
  let chosenAction: Action | null = null;

  const api = new BotApi({
    around: args.ctx.around,
    performAction: (action) => {
      chosenAction = action;
      return step(args.ctx.state, args.ctx.playerId, action);
    },
  });

  const finishOk = (): BotTurnResult => {
    if (!chosenAction) {
      throw new Error("No action taken this turn");
    }
    const logs = args.takeLogs();
    return {
      action: chosenAction,
      logs: logs.length > 0 ? logs : undefined,
    };
  };

  const finishError = (error: unknown): BotTurnResult => {
    console.error("[BotCompiler] onTurn threw", error);
    const logs = args.takeLogs();
    return {
      action: defaultAction,
      meta: {
        fallbackReason: "error",
        errorPhase: "runtime",
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        note: error instanceof Error ? error.message : String(error),
      },
      logs: logs.length > 0 ? logs : undefined,
    };
  };

  try {
    const result = args.onTurn(api);
    if (result instanceof Promise) {
      return result.then(finishOk).catch(finishError);
    }
    return finishOk();
  } catch (error) {
    return finishError(error);
  }
}
