import { DEFAULT_RUBY_WASM_PATH } from "./generatedRubyWasmAsset";

export function resolveRubyWasmUrl(): string {
  const configured = process.env.NEXT_PUBLIC_RUBY_WASM_URL?.trim();
  const target = configured || DEFAULT_RUBY_WASM_PATH;

  if (typeof location !== "undefined") {
    return new URL(target, location.origin).toString();
  }

  return target;
}
