import type { Action, GameState } from "../engine";
import type { ReplayEvent } from "./replayEvents";

export interface ReplayLogEntry {
  turn: number;
  state: GameState;
  actionCool: Action | null;
  actionHot: Action | null;
}

export interface ReplayRecord {
  id: string;
  roomId: string;
  mapId: string;
  createdAt: string;
  winner: "Cool" | "Hot" | "draw" | null;
  log: ReplayLogEntry[];
  events: ReplayEvent[];
}
