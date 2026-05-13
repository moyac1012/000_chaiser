import type { ColumnType, Generated } from "kysely";
import type { PlayerId } from "@/core/engine";
import type { BotRuntimeLanguage } from "@/lib/bot/runtime/BotRuntime";

export interface UserBotsTable {
  id: Generated<number>;
  user_id: string;
  owner_id: string;
  name: string;
  language: BotRuntimeLanguage;
  code: string;
  blockly_xml: string;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export type RoomStatus = "waiting" | "running" | "finished";

export interface RoomsTable {
  id: Generated<number>;
  map_id: string;
  status: RoomStatus;
  cool_bot_id: number | null;
  hot_bot_id: number | null;
  owner_id: string | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export interface MapsTable {
  id: string;
  name: string;
  width: number;
  height: number;
  max_turns: number;
  cool_start_x: number;
  cool_start_y: number;
  hot_start_x: number;
  hot_start_y: number;
  map_data: string;
  created_by: string;
  created_at: ColumnType<string, string | undefined, never>;
  is_official: number;
}

export type ReplayWinner = "Cool" | "Hot" | "draw" | null;

export interface ReplaysTable {
  id: string;
  room_id: string;
  map_id: string;
  created_at: ColumnType<string, string | undefined, never>;
  winner: ReplayWinner;
  cool_bot_name: ColumnType<string, string | undefined, string>;
  hot_bot_name: ColumnType<string, string | undefined, string>;
  log: string;
  events_json: ColumnType<string, string | undefined, string>;
}

export interface TutorialProgressTable {
  user_id: string;
  language: BotRuntimeLanguage;
  current_step_id: string | null;
  completed_steps_json: string;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export interface TutorialStepStatesTable {
  user_id: string;
  language: BotRuntimeLanguage;
  step_id: string;
  code: string;
  blockly_xml: string;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export type ParticipantRole = "owner" | "player" | "spectator";

export interface RoomParticipantsTable {
  id: Generated<number>;
  room_id: string;
  user_id: string;
  role: ParticipantRole;
  slot: PlayerId | null;
  bot_id: number | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, string | undefined, string>;
}

export type TournamentStatus = "draft" | "running" | "finished";
export type TournamentRegistrationMode = "public" | "approval" | "invite";

export interface Tournament {
  id: string;
  name: string;
  owner_id: string;
  status: TournamentStatus;
  registration_mode: TournamentRegistrationMode;
  created_at: ColumnType<string, string, never>;
  finished_at: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
}

export interface TournamentParticipant {
  tournament_id: string;
  user_id: string;
}

export interface TournamentParticipantRequest {
  tournament_id: string;
  user_id: string;
  created_at: ColumnType<string, string | undefined, never>;
}

export interface Matchup {
  id: string;
  tournament_id: string;
  player_a_id: string;
  player_b_id: string;
  created_at: ColumnType<string, string, never>;
}

export type GameResult = "cool" | "hot" | "draw";
export type GameStatus = "valid" | "invalid";

export interface Game {
  id: string;
  matchup_id: string;
  cool_user_id: string;
  hot_user_id: string;
  cool_bot_id: number;
  hot_bot_id: number;
  room_id: string;
  map_id: string;
  result: GameResult | null;
  status: GameStatus;
  invalid_reason: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  replay_id: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
  created_at: ColumnType<string, string, never>;
}

export interface Database {
  user_bots: UserBotsTable;
  rooms: RoomsTable;
  maps: MapsTable;
  replays: ReplaysTable;
  tutorial_progress: TutorialProgressTable;
  tutorial_step_states: TutorialStepStatesTable;
  room_participants: RoomParticipantsTable;
  tournaments: Tournament;
  tournament_participants: TournamentParticipant;
  tournament_participant_requests: TournamentParticipantRequest;
  matchups: Matchup;
  games: Game;
}
