import type { Action, GameState, PlayerId } from "@/core/engine";
import { step } from "@/core/engine";

import { BotApi } from "../BotApi";

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

type BotTurnContext = {
  state: GameState;
  playerId: PlayerId;
  around: number[];
};

let onTurnImpl: ((ctx: BotTurnContext) => Action | Promise<Action>) | null =
  null;
let currentRequestId: number | null = null;

// Relay console.* to parent for easier debugging (best-effort; optional for host to consume).
const levels: Array<"log" | "info" | "warn" | "error"> = [
  "log",
  "info",
  "warn",
  "error",
];
for (const level of levels) {
  const original = console[level];
  console[level] = (...args: unknown[]) => {
    original?.apply(console, args as []);
    postMessage({
      type: "log",
      requestId: currentRequestId ?? undefined,
      level,
      args,
    } satisfies WorkerResponse);
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (data?.type === "init") {
    handleInit(data);
    return;
  }
  if (data?.type === "runTurn") {
    handleRunTurn(data).catch((err) => {
      postMessage({
        type: "error",
        requestId: data.requestId,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      } satisfies WorkerResponse);
    });
  }
};

function handleInit(message: Extract<WorkerRequest, { type: "init" }>): void {
  const source = (message.code ?? "").trim();
  if (source.length === 0) {
    postMessage({
      type: "error",
      message: "Bot code is empty",
    } satisfies WorkerResponse);
    return;
  }
  const code = source;

  try {
    const factory = new Function(
      `
${code}
if (typeof onTurn !== 'function') {
  throw new Error('onTurn is not defined');
}
return onTurn;
` as string,
    ) as () => unknown;

    const onTurn = factory();
    if (typeof onTurn !== "function") {
      throw new Error("onTurn is not a function");
    }
    onTurnImpl = (ctx: BotTurnContext) => {
      let chosen: Action | null = null;
      const api = new BotApi({
        around: ctx.around,
        performAction: (action) => {
          chosen = action;
          return step(ctx.state, ctx.playerId, action);
        },
      });
      const result = onTurn(api);
      const promise =
        result instanceof Promise ? result : Promise.resolve(result);
      return promise.then(() => {
        if (!chosen) {
          throw new Error("No action taken this turn");
        }
        return chosen;
      });
    };
    postMessage({ type: "ready" } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: "error",
      message: formatError(error),
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies WorkerResponse);
    return;
  }
}

async function handleRunTurn(
  message: Extract<WorkerRequest, { type: "runTurn" }>,
): Promise<void> {
  if (!onTurnImpl) {
    postMessage({
      type: "error",
      requestId: message.requestId,
      message: "Worker not initialized",
    } satisfies WorkerResponse);
    return;
  }
  try {
    currentRequestId = message.requestId;
    const action = await onTurnImpl(message.ctx);
    postMessage({
      type: "result",
      requestId: message.requestId,
      action,
    } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: "error",
      requestId: message.requestId,
      message: formatError(error),
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies WorkerResponse);
  } finally {
    currentRequestId = null;
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}
