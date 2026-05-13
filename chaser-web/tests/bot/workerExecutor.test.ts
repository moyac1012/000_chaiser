import { describe, expect, it } from "bun:test";

import type { PlayerId } from "@/core/engine";
import { getTurnView, initGame } from "@/core/engine";
import { DEFAULT_MAP_ID } from "@/core/map";
import type { BotTurnContext } from "@/lib/bot/executor";
import { defaultAction, WorkerBotExecutor } from "@/lib/bot/executor";

const baseState = initGame(DEFAULT_MAP_ID);

function createCtx(
  playerId: PlayerId,
  overrides?: Partial<BotTurnContext>,
): BotTurnContext {
  return {
    state: baseState,
    playerId,
    around: getTurnView(baseState, playerId).around,
    ...overrides,
  };
}

function createExecutor(code: string, timeoutMs = 100): WorkerBotExecutor {
  return new WorkerBotExecutor(code, { timeoutMs });
}

describe("WorkerBotExecutor", () => {
  it("returns Action for a simple bot", async () => {
    const executor = createExecutor(`
      function onTurn(api){ api.walkRight(); }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual({ kind: "walk", dir: "Right" });
    expect(result.meta).toBeUndefined();
  });

  it("runs Blockly-like generated code", async () => {
    const executor = createExecutor(`
      function onTurn(api){ api.searchLeft(); }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual({ kind: "search", dir: "Left" });
    expect(result.meta).toBeUndefined();
  });

  it("falls back when bot throws", async () => {
    const executor = createExecutor(`
      function onTurn(api){ throw new Error("fail"); }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual(defaultAction);
    expect(result.meta?.fallbackReason).toBe("error");
  });

  it("falls back when no action is taken", async () => {
    const executor = createExecutor(`
      function onTurn(api){ /* no-op */ }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual(defaultAction);
    expect(result.meta?.fallbackReason).toBe("error");
    expect(result.meta?.errorMessage).toBe("No action taken this turn");
  });

  it("throws when action is used twice in a turn", async () => {
    const executor = createExecutor(`
      function onTurn(api){
        api.walkRight();
        api.walkLeft();
      }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual(defaultAction);
    expect(result.meta?.fallbackReason).toBe("error");
    expect(result.meta?.errorMessage).toBe("Action already used this turn");
  });

  it("times out infinite loop, terminates, and recovers on next run", async () => {
    const executor = createExecutor(
      `
      function onTurn(api){
        if (api.around[0] === 0) { while(true){} }
        api.walkDown();
      }
    `,
      50,
    );
    const timedOut = await executor.runTurn(
      createCtx("Cool", { around: Array(9).fill(0) }),
    );
    expect(timedOut.action).toEqual(defaultAction);
    expect(timedOut.meta?.fallbackReason).toBe("timeout");

    const recovered = await executor.runTurn(
      createCtx("Cool", { around: [1, ...Array(8).fill(0)] }),
    );
    expect(recovered.action).toEqual({ kind: "walk", dir: "Down" });
  });

  it("denies DOM access and returns fallback", async () => {
    const executor = createExecutor(`
      function onTurn(api){ console.log(document.body.innerHTML); }
    `);
    const result = await executor.runTurn(createCtx("Cool"));
    expect(result.action).toEqual(defaultAction);
    expect(result.meta?.fallbackReason).toBe("error");
  });

  it("relays logs from worker", async () => {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args);
      originalLog.apply(console, args as []);
    };
    try {
      const executor = createExecutor(`
        function onTurn(api){ console.log("X"); api.walkUp(); }
      `);
      const action = await executor.runTurn(createCtx("Cool"));
      expect(action.action).toEqual({ kind: "walk", dir: "Up" });
      const hasRelay = logs.some(
        (args) => args.includes("[BotWorker]") && args.includes("X"),
      );
      expect(hasRelay).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("keeps the same worker across multiple runs until timeout", async () => {
    const executor = createExecutor(`
      let counter = 0;
      function onTurn(api){
        counter += 1;
        if (counter === 1) { api.walkRight(); return; }
        api.walkLeft();
      }
    `);
    const firstWorker = (executor as unknown as { worker: Worker | null })
      .worker;
    const first = await executor.runTurn(createCtx("Cool"));
    const second = await executor.runTurn(createCtx("Cool"));
    const secondWorker = (executor as unknown as { worker: Worker | null })
      .worker;

    expect(first.action).toEqual({ kind: "walk", dir: "Right" });
    expect(second.action).toEqual({ kind: "walk", dir: "Left" });
    expect(firstWorker).toBe(secondWorker);
  });

  it("handles concurrent requests with distinct requestIds", async () => {
    const executor = createExecutor(`
      function onTurn(api){
        const marker = api.around[0];
        if (marker === 1) { api.walkLeft(); return; }
        if (marker === 2) { api.walkUp(); return; }
        api.walkRight();
      }
    `);
    const [first, second] = await Promise.all([
      executor.runTurn(createCtx("Cool", { around: [1, ...Array(8).fill(0)] })),
      executor.runTurn(createCtx("Cool", { around: [2, ...Array(8).fill(0)] })),
    ]);
    expect(first.action).toEqual({ kind: "walk", dir: "Left" });
    expect(second.action).toEqual({ kind: "walk", dir: "Up" });
  });
});
