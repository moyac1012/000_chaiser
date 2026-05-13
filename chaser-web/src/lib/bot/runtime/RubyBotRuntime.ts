import type { Action } from "@/core/engine";
import { step } from "@/core/engine";
import { BotApi } from "../BotApi";
import { defaultAction } from "../executor";
import type {
  BotConsoleEntry,
  BotRuntime,
  BotRuntimeInitInput,
  BotRuntimeInitStatus,
  BotRuntimeLanguage,
  BotRuntimeResult,
  BotRuntimeTurnInput,
} from "./BotRuntime";
import { resolveRubyWasmUrl } from "./rubyWasmUrl";

type RubyVM = import("@ruby/wasm-wasi").RubyVM;
type RbValue = import("@ruby/wasm-wasi").RbValue;

type LogLevel = BotConsoleEntry["level"];

const RUBY_WASM_URL = resolveRubyWasmUrl();

const DEFAULT_TIMEOUT_MS = 500;
const RUBY_WASM_CACHE_KEY = "__chaser_ruby_wasm_module_cache__";

type RubyWasmCache = {
  modulePromise?: Promise<WebAssembly.Module>;
};

const getRubyWasmCache = (): RubyWasmCache => {
  const globalCache = globalThis as typeof globalThis & {
    [RUBY_WASM_CACHE_KEY]?: RubyWasmCache;
  };
  const cached = globalCache[RUBY_WASM_CACHE_KEY];
  if (cached) {
    return cached;
  }
  const fresh: RubyWasmCache = {};
  globalCache[RUBY_WASM_CACHE_KEY] = fresh;
  return fresh;
};

const preloadRubyWasmModule = (): void => {
  void getRubyWasmModule();
};

const getRubyWasmModule = (): Promise<WebAssembly.Module> => {
  const cache = getRubyWasmCache();
  if (!cache.modulePromise) {
    cache.modulePromise = fetchRubyWasmModule().catch((error) => {
      cache.modulePromise = undefined;
      throw error;
    });
  }
  return cache.modulePromise;
};

let rubyVmImportPromise: Promise<
  typeof import("@ruby/wasm-wasi/dist/browser")
> | null = null;

const loadRubyVmModule = (): Promise<
  typeof import("@ruby/wasm-wasi/dist/browser")
> => {
  if (!rubyVmImportPromise) {
    rubyVmImportPromise = import("@ruby/wasm-wasi/dist/browser").catch(
      (error) => {
        rubyVmImportPromise = null;
        throw error;
      },
    );
  }
  return rubyVmImportPromise;
};

const createVmToken = (): string => Math.random().toString(36).slice(2);

const bootstrapRuby = (
  logSinkKey: string,
  logToken: string,
  code: string,
): string => {
  const logTokenLiteral = JSON.stringify(logToken);
  return `
require "js"

$stdout = Object.new.tap do |obj|
  def obj.write(str)
    JS.global[:${logSinkKey}].call("log", str.to_s, ${logTokenLiteral})
  end
end

$stderr = Object.new.tap do |obj|
  def obj.write(str)
    JS.global[:${logSinkKey}].call("error", str.to_s, ${logTokenLiteral})
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
};

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export class RubyBotRuntime implements BotRuntime {
  readonly language: BotRuntimeLanguage = "ruby";

  private vm: RubyVM | null = null;
  private onTurnMethod: RbValue | null = null;
  private timeoutMs = DEFAULT_TIMEOUT_MS;
  private logBuffer: BotConsoleEntry[] | null = null;
  private logSeq = 0;
  private activeTurnToken: number | null = null;
  private turnTokenSeq = 0;
  private initPromise: Promise<void> | null = null;
  private initInput: BotRuntimeInitInput | null = null;
  private initStatusListener: ((status: BotRuntimeInitStatus) => void) | null =
    null;
  private lastInitError: Error | null = null;
  private resetPromise: Promise<void> | null = null;
  private activeVmToken: string | null = null;
  private readonly logSinkKey = `__chaser_ruby_log_${Math.random()
    .toString(36)
    .slice(2)}`;

  constructor() {
    if (typeof window !== "undefined") {
      preloadRubyWasmModule();
    }
  }

  async init(input: BotRuntimeInitInput): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("RubyBotRuntime must run in a browser context");
    }
    this.timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.initInput = input;
    this.initStatusListener = input.onInitStatus ?? null;
    await this.ensureInitPromise();
  }

  async onTurn(input: BotRuntimeTurnInput): Promise<BotRuntimeResult> {
    const ready = await this.ensureInitialized();
    if (!ready.ok) {
      return {
        action: defaultAction,
        meta: {
          fallbackReason: "error",
          errorPhase: "init",
          errorMessage: ready.error.message,
          errorStack: ready.error.stack,
          note: ready.error.message,
        },
      };
    }

    const logs: BotConsoleEntry[] = [];
    const turnToken = ++this.turnTokenSeq;
    this.activeTurnToken = turnToken;
    this.logBuffer = logs;
    this.logSeq = 0;
    let chosenAction: Action | null = null;

    const api = new BotApi({
      around: input.around,
      performAction: (action) => {
        chosenAction = action;
        return step(input.state, input.playerId, action);
      },
    });

    const apiBridge = createRubyApiBridge(api);

    const runTurn = async (): Promise<BotRuntimeResult> => {
      try {
        const apiValue = this.vm?.wrap(apiBridge);
        if (!apiValue || !this.onTurnMethod) {
          throw new Error("Ruby VM unavailable");
        }
        this.onTurnMethod.call("call", apiValue);
        if (!chosenAction) {
          throw new Error("No action taken this turn");
        }
        return {
          action: chosenAction,
          logs: logs.length > 0 ? logs : undefined,
        };
      } catch (error) {
        return {
          action: defaultAction,
          meta: {
            fallbackReason: "error",
            errorPhase: "runtime",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            note: error instanceof Error ? error.message : String(error),
          },
          logs: logs.length > 0 ? logs : undefined,
        };
      } finally {
        this.clearTurnLogBuffer(turnToken);
      }
    };

    return this.withTimeout(runTurn(), this.timeoutMs, turnToken);
  }

  async dispose(): Promise<void> {
    await this.resetRuntime(false);
  }

  private async ensureInitPromise(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.startInit().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    await this.initPromise;
  }

  private async ensureInitialized(): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        error: Error;
      }
  > {
    if (this.vm && this.onTurnMethod) {
      return { ok: true };
    }
    if (!this.initInput) {
      return {
        ok: false,
        error: new Error("ruby runtime not initialized"),
      };
    }
    try {
      await this.ensureInitPromise();
    } catch (error) {
      return {
        ok: false,
        error: this.lastInitError ?? toError(error),
      };
    }
    if (this.vm && this.onTurnMethod) {
      return { ok: true };
    }
    return {
      ok: false,
      error: new Error("ruby runtime not initialized"),
    };
  }

  private async startInit(): Promise<void> {
    const input = this.initInput;
    if (!input) {
      throw new Error("ruby runtime not initialized");
    }
    this.lastInitError = null;
    try {
      this.notifyInitStatus("start");
      const modulePromise = getRubyWasmModule();
      this.notifyInitStatus("loading-wasm");
      const rubyModule = await modulePromise;
      this.notifyInitStatus("initializing-vm");
      const { DefaultRubyVM } = await loadRubyVmModule();
      const { vm } = await DefaultRubyVM(rubyModule, { consolePrint: false });
      this.vm = vm;
      const vmToken = createVmToken();
      this.activeVmToken = vmToken;
      this.installLogSink();
      vm.eval(bootstrapRuby(this.logSinkKey, vmToken, input.code));
      this.onTurnMethod = vm.eval("method(:onTurn)");
      this.notifyInitStatus("ready");
    } catch (error) {
      const normalized = toError(error);
      this.lastInitError = normalized;
      throw normalized;
    }
  }

  private notifyInitStatus(phase: BotRuntimeInitStatus["phase"]): void {
    this.initStatusListener?.({ phase });
  }

  private async resetRuntime(preserveInit: boolean): Promise<void> {
    const globalTarget = globalThis as typeof globalThis &
      Record<string, unknown>;
    delete globalTarget[this.logSinkKey];
    this.vm = null;
    this.onTurnMethod = null;
    this.logBuffer = null;
    this.logSeq = 0;
    this.activeTurnToken = null;
    this.activeVmToken = null;
    if (!preserveInit) {
      this.initPromise = null;
      this.initInput = null;
      this.initStatusListener = null;
      this.lastInitError = null;
    } else {
      this.initPromise = null;
    }
  }

  private clearTurnLogBuffer(turnToken: number): void {
    if (this.activeTurnToken !== turnToken) {
      return;
    }
    this.activeTurnToken = null;
    this.logBuffer = null;
  }

  private scheduleResetAfterTimeout(): void {
    if (this.resetPromise) {
      return;
    }
    this.resetPromise = this.resetAfterTimeout().finally(() => {
      this.resetPromise = null;
    });
  }

  private async resetAfterTimeout(): Promise<void> {
    await this.resetRuntime(true);
    if (!this.initInput) {
      return;
    }
    this.initPromise = this.startInit().catch((error) => {
      this.initPromise = null;
      this.lastInitError = toError(error);
    });
  }

  private installLogSink(): void {
    const pushLog = (level: LogLevel, message: string, token?: string) => {
      if (this.activeVmToken && token && token !== this.activeVmToken) {
        return;
      }
      const normalized = message.replace(/\n$/, "");
      const entry: BotConsoleEntry = {
        id: ++this.logSeq,
        level,
        args: [normalized],
      };
      if (this.logBuffer) {
        this.logBuffer.push(entry);
      }
      try {
        console[level]?.("[RubyBot]", normalized);
      } catch {
        // ignore
      }
    };

    const logSink = {
      log: (message: string, token?: string) => {
        pushLog("log", message, token);
      },
      error: (message: string, token?: string) => {
        pushLog("error", message, token);
      },
    };

    const globalTarget = globalThis as typeof globalThis &
      Record<string, unknown>;
    globalTarget[this.logSinkKey] = logSink;
  }

  private async withTimeout(
    promise: Promise<BotRuntimeResult>,
    timeoutMs: number,
    turnToken: number,
  ): Promise<BotRuntimeResult> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<BotRuntimeResult>((resolve) => {
      timeoutId = setTimeout(() => {
        this.clearTurnLogBuffer(turnToken);
        this.scheduleResetAfterTimeout();
        resolve({
          action: defaultAction,
          meta: { fallbackReason: "timeout" },
        });
      }, timeoutMs);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return result;
  }
}

const createRubyApiBridge = (api: BotApi) => ({
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
});

async function fetchRubyWasmModule(): Promise<WebAssembly.Module> {
  const response = fetch(RUBY_WASM_URL, { cache: "force-cache" });
  return compileWebAssemblyModule(response);
}

async function compileWebAssemblyModule(
  response: Promise<Response>,
): Promise<WebAssembly.Module> {
  if (!WebAssembly.compileStreaming) {
    const buffer = await (await response).arrayBuffer();
    return WebAssembly.compile(buffer);
  }
  return WebAssembly.compileStreaming(response);
}
