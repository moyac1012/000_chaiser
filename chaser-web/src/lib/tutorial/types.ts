import type { CommandKind, PlayerId, Position, Tile } from "@/core/engine";

// Tutorial-specific data structures to keep core game logic untouched.
export type TutorialLevel = "beginner" | "intermediate" | "advanced";

export type TutorialLanguage = "js" | "blockly";

const TUTORIAL_LANGUAGES: TutorialLanguage[] = ["js", "blockly"];

export function isTutorialLanguage(value: unknown): value is TutorialLanguage {
  return TUTORIAL_LANGUAGES.includes(value as TutorialLanguage);
}

export function formatTutorialLanguageLabel(
  language: TutorialLanguage,
): string {
  return language === "blockly" ? "Blockly" : "JS";
}

export type TutorialGoal =
  | {
      kind: "reachGoal";
      maxActions?: number;
      requireAllItems?: boolean;
    }
  | {
      kind: "winByPut";
      maxActions?: number;
    };

export type TutorialMapVariant = {
  mapId: string;
  goal: Position;
};

export interface TutorialMapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  maxTurns: number;
  tiles: Tile[][]; // [y][x]
  spawn: Record<PlayerId, Position>;
}

export type TutorialMapAsset = {
  map: TutorialMapDefinition;
  goal: Position;
};

export interface TutorialStepDefinition {
  id: string;
  title: string;
  summary: string;
  description: string[];
  level: TutorialLevel;
  allowedActions: CommandKind[];
  blocklyBlocks?: readonly string[];
  validation: TutorialGoal;
  mapVariants: TutorialMapVariant[];
  starterCode: string;
  starterBlocklyXml: string;
  hints?: string[];
}
