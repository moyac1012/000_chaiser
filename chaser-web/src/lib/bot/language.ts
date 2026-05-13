import type { BotRuntimeLanguage } from "./runtime/BotRuntime";

const BOT_LANGUAGE_VALUES: BotRuntimeLanguage[] = ["js", "blockly", "ruby"];

export type BotLanguage = BotRuntimeLanguage;

export function isBotLanguage(value: unknown): value is BotRuntimeLanguage {
  return BOT_LANGUAGE_VALUES.includes(value as BotRuntimeLanguage);
}

export function normalizeBotLanguage(
  value: unknown,
  blocklyXml?: string | null,
): BotRuntimeLanguage {
  if (isBotLanguage(value)) {
    return value;
  }
  if (blocklyXml) {
    return "blockly";
  }
  return "js";
}

export function formatBotLanguageLabel(language: BotRuntimeLanguage): string {
  switch (language) {
    case "blockly":
      return "Blockly";
    case "ruby":
      return "Ruby";
    default:
      return "JS";
  }
}

export type BotRuntimeSurface = "localTraining" | "onlineMatch";

export function getUnsupportedBotRuntimeReason(
  language: BotRuntimeLanguage,
  surface: BotRuntimeSurface,
): string | null {
  void language;
  void surface;
  return null;
}
