declare module "@ruby/wasm-wasi/dist/browser.js" {
  import type { RubyVM } from "@ruby/wasm-wasi";

  export const DefaultRubyVM: (
    rubyModule: WebAssembly.Module,
    options?: {
      consolePrint?: boolean;
      env?: Record<string, string>;
    },
  ) => Promise<{
    vm: RubyVM;
    wasi: unknown;
    instance: WebAssembly.Instance;
  }>;
}
