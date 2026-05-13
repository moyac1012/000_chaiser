import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

import { getTurnView, initGame } from "@/core/engine";
import { DEFAULT_MAP_ID } from "@/core/map";
import { WorkerRubyBotRuntime } from "@/lib/bot/runtime/WorkerRubyBotRuntime";

describe("WorkerRubyBotRuntime", () => {
  test("runs ruby bot code inside a worker", async () => {
    const require = createRequire(import.meta.url);
    const rubyWasmPath = require.resolve(
      "@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm",
    );
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(Bun.file(rubyWasmPath), {
          headers: {
            "Content-Type": "application/wasm",
          },
        });
      },
    });
    const runtime = new WorkerRubyBotRuntime({
      rubyWasmUrl: `http://127.0.0.1:${server.port}/ruby+stdlib.wasm`,
    });

    const state = initGame(DEFAULT_MAP_ID);

    try {
      await runtime.init({
        code: `
$step ||= 0

def onTurn(api)
  $step += 1
  api.walk_right
end
      `,
        timeoutMs: 1000,
      });

      const result = await runtime.onTurn({
        state,
        playerId: "Cool",
        around: getTurnView(state, "Cool").around,
      });

      expect(result.action).toEqual({ kind: "walk", dir: "Right" });
      expect(result.meta).toBeUndefined();

      await runtime.dispose();
    } finally {
      server.stop(true);
    }
  }, 15_000);
});
