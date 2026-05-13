import { describe, expect, test } from "bun:test";

import { DEFAULT_RUBY_WASM_PATH } from "@/lib/bot/runtime/generatedRubyWasmAsset";
import { resolveRubyWasmUrl } from "@/lib/bot/runtime/rubyWasmUrl";

describe("resolveRubyWasmUrl", () => {
  test("defaults to the versioned public ruby wasm asset", () => {
    expect(resolveRubyWasmUrl()).toBe(DEFAULT_RUBY_WASM_PATH);
  });
});
