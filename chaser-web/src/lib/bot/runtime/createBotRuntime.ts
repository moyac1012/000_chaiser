import type { OnTurnFn } from "../executor";
import type { BotRuntime, BotRuntimeLanguage } from "./BotRuntime";
import { JsBotRuntime, type JsBotRuntimeOptions } from "./JsBotRuntime";
import { RubyBotRuntime } from "./RubyBotRuntime";
import {
  WorkerJsBotRuntime,
  type WorkerJsBotRuntimeOptions,
} from "./WorkerJsBotRuntime";
import { WorkerRubyBotRuntime } from "./WorkerRubyBotRuntime";

export type CreateBotRuntimeOptions = {
  language?: BotRuntimeLanguage;
  useWorker?: boolean;
};

export function createBotRuntime(
  options?: CreateBotRuntimeOptions,
): BotRuntime {
  const language = options?.language ?? "js";
  const shouldUseWorker =
    options?.useWorker !== false && typeof Worker !== "undefined";
  if (language === "ruby") {
    if (shouldUseWorker) {
      return new WorkerRubyBotRuntime();
    }
    return new RubyBotRuntime();
  }
  if (shouldUseWorker) {
    const workerOptions: WorkerJsBotRuntimeOptions = { language };
    return new WorkerJsBotRuntime(workerOptions);
  }
  const jsOptions: JsBotRuntimeOptions = { language };
  return new JsBotRuntime(jsOptions);
}

export type CreateBotRuntimeFromFunctionOptions = {
  language?: BotRuntimeLanguage;
};

export function createBotRuntimeFromFunction(
  onTurn: OnTurnFn,
  options?: CreateBotRuntimeFromFunctionOptions,
): BotRuntime {
  return new JsBotRuntime({ language: options?.language ?? "js", onTurn });
}
