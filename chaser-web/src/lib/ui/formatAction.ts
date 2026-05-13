import type { Action } from "@/core/engine";

export type ActionKindLabel = Action["kind"];
export type ActionDirectionLabel = Action["dir"];

export function formatActionJa(action: Action): string {
  const kindText: Record<ActionKindLabel, string> = {
    walk: "すすむ",
    look: "みる",
    search: "さがす",
    put: "ブロック",
  };
  const dirText: Record<ActionDirectionLabel, string> = {
    Up: "うえ",
    Down: "した",
    Left: "ひだり",
    Right: "みぎ",
  };
  return `${kindText[action.kind]} ${dirText[action.dir]}`;
}
