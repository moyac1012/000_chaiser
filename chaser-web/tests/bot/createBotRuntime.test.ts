import { describe, expect, test } from "bun:test";

import { createBotRuntime } from "@/lib/bot/runtime/createBotRuntime";
import { WorkerRubyBotRuntime } from "@/lib/bot/runtime/WorkerRubyBotRuntime";

describe("createBotRuntime", () => {
  test("uses worker isolation for ruby when Worker is available", () => {
    const runtime = createBotRuntime({ language: "ruby" });
    expect(runtime).toBeInstanceOf(WorkerRubyBotRuntime);
  });
});
