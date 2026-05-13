import type { Action, GameState, PlayerId } from "@/core/engine";
import { step } from "@/core/engine";

import { BotApi } from "../BotApi";
import type {
  BotConsoleEntry,
  BotRuntimeInitPhase,
  BotRuntimeResult,
} from "../runtime/BotRuntime";
import { resolveRubyWasmUrl } from "../runtime/rubyWasmUrl";

type RubyVM = import("@ruby/wasm-wasi").RubyVM;
type RbValue = import("@ruby/wasm-wasi").RbValue;

type BotTurnContext = {
  state: GameState;
  playerId: PlayerId;
  around: number[];
};

type WorkerRequest =
  | { type: "init"; code: string; rubyWasmUrl?: string }
  | { type: "runTurn"; requestId: number; ctx: BotTurnContext };

type WorkerResponse =
  | { type: "ready" }
  | { type: "initStatus"; phase: BotRuntimeInitPhase }
  | { type: "result"; requestId: number; result: BotRuntimeResult }
  | { type: "error"; requestId?: number; message: string; stack?: string }
  | {
      type: "log";
      requestId?: number;
      level: BotConsoleEntry["level"];
      args: unknown[];
    };

let rubyWasmUrl = resolveRubyWasmUrl();

let vm: RubyVM | null = null;
let onTurnMethod: RbValue | null = null;
let currentRequestId: number | null = null;
let activeVmToken: string | null = null;

type RubyWasmCache = {
  modulePromise?: Promise<WebAssembly.Module>;
};

const RUBY_WASM_CACHE_KEY = "__chaser_ruby_worker_wasm_cache__";
const LOG_SINK_KEY = `__chaser_ruby_worker_log_${Math.random()
  .toString(36)
  .slice(2)}`;

function getRubyWasmCache(): RubyWasmCache {
  const target = globalThis as typeof globalThis & {
    [RUBY_WASM_CACHE_KEY]?: RubyWasmCache;
  };
  const cached = target[RUBY_WASM_CACHE_KEY];
  if (cached) return cached;
  const fresh: RubyWasmCache = {};
  target[RUBY_WASM_CACHE_KEY] = fresh;
  return fresh;
}

async function getRubyWasmModule(): Promise<WebAssembly.Module> {
  const cache = getRubyWasmCache();
  if (!cache.modulePromise) {
    cache.modulePromise = fetchRubyWasmModule().catch((error) => {
      cache.modulePromise = undefined;
      throw error;
    });
  }
  return cache.modulePromise;
}

async function fetchRubyWasmModule(): Promise<WebAssembly.Module> {
  const response = fetch(rubyWasmUrl, { cache: "force-cache" });
  if (!WebAssembly.compileStreaming) {
    const buffer = await (await response).arrayBuffer();
    return WebAssembly.compile(buffer);
  }
  return WebAssembly.compileStreaming(response);
}

let rubyVmImportPromise: Promise<
  typeof import("@ruby/wasm-wasi/dist/browser")
> | null = null;

function loadRubyVmModule(): Promise<
  typeof import("@ruby/wasm-wasi/dist/browser")
> {
  if (!rubyVmImportPromise) {
    rubyVmImportPromise = import("@ruby/wasm-wasi/dist/browser").catch(
      (error) => {
        rubyVmImportPromise = null;
        throw error;
      },
    );
  }
  return rubyVmImportPromise;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

function postInitStatus(phase: BotRuntimeInitPhase): void {
  postMessage({ type: "initStatus", phase } satisfies WorkerResponse);
}

function createVmToken(): string {
  return Math.random().toString(36).slice(2);
}

function installLogSink(): void {
  const globalTarget = globalThis as typeof globalThis &
    Record<string, unknown>;
  globalTarget[LOG_SINK_KEY] = {
    log: (message: string, token?: string) => pushLog("log", message, token),
    info: (message: string, token?: string) => pushLog("info", message, token),
    warn: (message: string, token?: string) => pushLog("warn", message, token),
    error: (message: string, token?: string) =>
      pushLog("error", message, token),
  };
}

function pushLog(
  level: BotConsoleEntry["level"],
  message: string,
  token?: string,
): void {
  if (activeVmToken && token && token !== activeVmToken) {
    return;
  }
  const normalized = message.replace(/\n$/, "");
  postMessage({
    type: "log",
    requestId: currentRequestId ?? undefined,
    level,
    args: [normalized],
  } satisfies WorkerResponse);
}

function bootstrapRuby(code: string, vmToken: string): string {
  const tokenLiteral = JSON.stringify(vmToken);
  return `
require "js"

$stdout = Object.new.tap do |obj|
  def obj.write(str)
    JS.global[:${LOG_SINK_KEY}].call("log", str.to_s, ${tokenLiteral})
  end
end

$stderr = Object.new.tap do |obj|
  def obj.write(str)
    JS.global[:${LOG_SINK_KEY}].call("error", str.to_s, ${tokenLiteral})
  end
end

__chaser_verbose = $VERBOSE
$VERBOSE = nil
STDOUT = $stdout
STDERR = $stderr
$VERBOSE = __chaser_verbose

${code}

if !defined?(onTurn)
  raise "onTurn is not defined"
end
`;
}

function createRubyApiBridge(api: BotApi) {
  return {
    around: () => api.around,
    walk_up: () => api.walkUp(),
    walk_down: () => api.walkDown(),
    walk_left: () => api.walkLeft(),
    walk_right: () => api.walkRight(),
    look_up: () => api.lookUp(),
    look_down: () => api.lookDown(),
    look_left: () => api.lookLeft(),
    look_right: () => api.lookRight(),
    search_up: () => api.searchUp(),
    search_down: () => api.searchDown(),
    search_left: () => api.searchLeft(),
    search_right: () => api.searchRight(),
    put_up: () => api.putUp(),
    put_down: () => api.putDown(),
    put_left: () => api.putLeft(),
    put_right: () => api.putRight(),
  };
}

async function handleInit(message: Extract<WorkerRequest, { type: "init" }>) {
  const source = (message.code ?? "").trim();
  if (!source) {
    postMessage({
      type: "error",
      message: "Bot code is empty",
    } satisfies WorkerResponse);
    return;
  }

  try {
    rubyWasmUrl = message.rubyWasmUrl?.trim() || resolveRubyWasmUrl();
    postInitStatus("start");
    postInitStatus("loading-wasm");
    const rubyModule = await getRubyWasmModule();
    postInitStatus("initializing-vm");
    const { DefaultRubyVM } = await loadRubyVmModule();
    const created = await DefaultRubyVM(rubyModule, { consolePrint: false });
    vm = created.vm;
    activeVmToken = createVmToken();
    installLogSink();
    vm.eval(bootstrapRuby(source, activeVmToken));
    onTurnMethod = vm.eval("method(:onTurn)");
    postInitStatus("ready");
    postMessage({ type: "ready" } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: "error",
      message: formatError(error),
      stack: error instanceof Error ? error.stack : undefined,
    } satisfies WorkerResponse);
  }
}

async function handleRunTurn(
  message: Extract<WorkerRequest, { type: "runTurn" }>,
) {
  if (!vm || !onTurnMethod) {
    postMessage({
      type: "error",
      requestId: message.requestId,
      message: "Ruby worker not initialized",
    } satisfies WorkerResponse);
    return;
  }

  let chosenAction: Action | null = null;
  const api = new BotApi({
    around: message.ctx.around,
    performAction: (action) => {
      chosenAction = action;
      return step(message.ctx.state, message.ctx.playerId, action);
    },
  });

  currentRequestId = message.requestId;

  try {
    const apiValue = vm.wrap(createRubyApiBridge(api));
    onTurnMethod.call("call", apiValue);
    if (!chosenAction) {
      throw new Error("No action taken this turn");
    }
    postMessage({
      type: "result",
      requestId: message.requestId,
      result: {
        action: chosenAction,
      },
    } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: "result",
      requestId: message.requestId,
      result: {
        action: { kind: "walk", dir: "Right" },
        meta: {
          fallbackReason: "error",
          errorPhase: "runtime",
          errorMessage: formatError(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          note: formatError(error),
        },
      },
    } satisfies WorkerResponse);
  } finally {
    currentRequestId = null;
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (data.type === "init") {
    void handleInit(data);
    return;
  }
  if (data.type === "runTurn") {
    void handleRunTurn(data);
  }
};
