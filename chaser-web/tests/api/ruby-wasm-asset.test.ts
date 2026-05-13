import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_RUBY_WASM_PATH } from "@/lib/bot/runtime/generatedRubyWasmAsset";

describe("ruby wasm asset", () => {
  test("points to a versioned public asset", () => {
    expect(DEFAULT_RUBY_WASM_PATH).toMatch(
      /^\/vendor\/ruby-wasm\/\d+\.\d+\.\d+\/ruby\+stdlib\.wasm$/,
    );
  });

  test("the referenced public wasm file exists", async () => {
    const relativePath = DEFAULT_RUBY_WASM_PATH.replace(/^\//, "");
    const absolutePath = path.join(process.cwd(), "public", relativePath);
    const body = await readFile(absolutePath);

    expect(body.byteLength).toBeGreaterThan(0);
  });
});
