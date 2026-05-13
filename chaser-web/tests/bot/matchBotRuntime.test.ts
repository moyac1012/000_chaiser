import { describe, expect, test } from "bun:test";

import type { GameState, TurnView } from "@/core/engine";
import { MatchBotRuntime } from "@/lib/bot/MatchBotRuntime";
import type {
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeResult,
  BotRuntimeTurnInput,
} from "@/lib/bot/runtime/BotRuntime";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createState(): GameState {
  return {
    width: 3,
    height: 3,
    map: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    players: {
      Cool: { id: "Cool", pos: { x: 1, y: 1 }, items: 0 },
      Hot: { id: "Hot", pos: { x: 2, y: 2 }, items: 0 },
    },
    turn: 0,
    maxTurns: 100,
    status: "running",
  };
}

function createView(): TurnView {
  return {
    turn: 0,
    maxTurns: 100,
    items: 0,
    enemyItems: 0,
    around: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  };
}

describe("MatchBotRuntime", () => {
  test("drops late bot results after stop", async () => {
    const deferred = createDeferred<BotRuntimeResult>();
    const runtime: BotRuntime = {
      language: "js",
      init: async (_input: BotRuntimeInitInput) => {},
      onTurn: async (_input: BotRuntimeTurnInput) => deferred.promise,
      dispose: async () => {},
    };

    const matchRuntime = new MatchBotRuntime({
      roomId: "room-test",
      slot: "Cool",
      runtime,
      runtimeInit: {
        code: "function onTurn(api) { api.walkRight() }",
        timeoutMs: 500,
      },
    });

    const sent: unknown[] = [];
    const fakeClient = {
      connect: () => {},
      disconnect: () => {},
      onMessage: () => () => {},
      sendAction: (...args: unknown[]) => {
        sent.push(args);
      },
    };

    (matchRuntime as unknown as { client: typeof fakeClient }).client =
      fakeClient;
    (
      matchRuntime as unknown as {
        runtimeInitPromise: Promise<void>;
        latestState: GameState;
      }
    ).runtimeInitPromise = Promise.resolve();
    (matchRuntime as unknown as { latestState: GameState }).latestState =
      createState();

    (
      matchRuntime as unknown as {
        handleTurnStart: (playerId: "Cool", view: TurnView) => void;
      }
    ).handleTurnStart("Cool", createView());

    matchRuntime.stop();
    deferred.resolve({ action: { kind: "walk", dir: "Right" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toHaveLength(0);
  });
});
