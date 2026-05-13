import type {
  Action,
  GameState,
  GameStatus,
  PlayerId,
  Position,
  TurnView,
} from "../engine";
import type { GameEndReason } from "./replayEvents";
import type { RoomMode } from "./room";

export type ActionMeta = {
  source?: "bot" | "human";
  fallbackReason?: "error" | "timeout";
  errorPhase?: "init" | "runtime";
  errorMessage?: string;
  errorStack?: string;
  note?: string;
};

export type ParticipantRole = "owner" | "player" | "spectator";
export type ParticipantSlot = PlayerId | null;
export type RoomCloseReason = "owner" | "timeout";

export interface ParticipantSnapshot {
  userId: string;
  role: ParticipantRole;
  slot: ParticipantSlot;
  botId: number | null;
}

export type JoinIntent = "spectator" | "player" | undefined;

export type ClientMessage =
  | {
      type: "join";
      roomId: string;
      mode?: RoomMode;
      intent?: JoinIntent;
      slot?: ParticipantSlot;
      botId?: number | null;
    }
  | {
      type: "setMap";
      roomId: string;
      mapId: string;
    }
  | {
      type: "setSlot";
      roomId: string;
      slot: ParticipantSlot;
      botId?: number | null;
    }
  | {
      type: "leaveSlot";
      roomId: string;
    }
  | {
      type: "start";
      roomId: string;
    }
  | {
      type: "closeRoom";
      roomId: string;
    }
  | {
      type: "action";
      roomId: string;
      playerId: PlayerId;
      action: Action;
      meta?: ActionMeta;
    }
  | {
      type: "leave";
      roomId: string;
    };

export type ServerMessage =
  | {
      type: "joined";
      roomId: string;
      mode: RoomMode;
      you: ParticipantSnapshot;
      ownerId: string | null;
      participants: ParticipantSnapshot[];
      mapId: string;
      started: boolean;
    }
  | {
      type: "mapChanged";
      roomId: string;
      mapId: string;
    }
  | {
      type: "participants";
      roomId: string;
      participants: ParticipantSnapshot[];
    }
  | {
      type: "roomStatus";
      roomId: string;
      started: boolean;
    }
  | {
      type: "roomClosed";
      roomId: string;
      reason: RoomCloseReason;
    }
  | {
      type: "stateUpdate";
      roomId: string;
      state: GameState;
    }
  | {
      type: "actionLog";
      roomId: string;
      turn: number;
      actionCool: Action | null;
      actionHot: Action | null;
      metaCool?: ActionMeta;
      metaHot?: ActionMeta;
    }
  | {
      type: "turnStart";
      roomId: string;
      playerId: PlayerId;
      view: TurnView;
    }
  | {
      type: "gameEnd";
      roomId: string;
      status: GameStatus;
      winner: PlayerId | "draw" | null;
      replayId?: string;
      replayAvailableAt?: string;
      endReason?: GameEndReason;
      endPoint?: Position | null;
      endTurnIndex?: number;
    }
  | {
      type: "error";
      roomId?: string;
      message: string;
    };
