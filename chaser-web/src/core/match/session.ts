import { randomUUID } from "node:crypto";

import { db, dbReady } from "@/db/client";
import { getMapDefinitionFromDb } from "@/db/maps";
import type { ReplayWinner } from "@/db/types";
import type {
  Action,
  EngineEndReason,
  EngineStepResult,
  GameState,
  GameStatus,
  PlayerId,
  TurnView,
} from "../engine";
import { getTurnView, initGame, step } from "../engine";
import { DEFAULT_MAP_ID, mapDefinitionToGameState } from "../map";
import type { ReplayLogEntry } from "./replay";
import type {
  GameEndEvent,
  GameEndReason,
  GameEndWinner,
  ReplayEvent,
} from "./replayEvents";
import { buildActionAndTurnEvents } from "./replayEvents";
import type { RoomMode } from "./room";

export interface MatchSession {
  roomId: string;
  mapId: string;
  mode: RoomMode;
  ownerId: string | null;
  started: boolean;
  createdAt: number;
  state: GameState;
  currentPlayer: PlayerId;
  replayId: string | null;
  replayLog: ReplayLogEntry[];
  replayEvents: ReplayEvent[];
  replaySaved: boolean;
  replaySavePromise?: Promise<void>;
  coolBotName: string;
  hotBotName: string;
}

type GlobalWithSessions = typeof globalThis & {
  __matchSessions?: Map<string, MatchSession>;
};

const globalWithSessions = globalThis as GlobalWithSessions;
const sessions: Map<string, MatchSession> =
  globalWithSessions.__matchSessions ?? new Map<string, MatchSession>();

// 保持する Map をグローバルにぶら下げ、ホットリロードなどでも共有されるようにする
if (!globalWithSessions.__matchSessions) {
  globalWithSessions.__matchSessions = sessions;
}

export function createMatchSession(
  roomId: string,
  mapId: string = DEFAULT_MAP_ID,
  ownerId: string | null = null,
  mode: RoomMode = "public",
): MatchSession {
  const existing = sessions.get(roomId);
  if (existing) {
    if (!existing.ownerId && ownerId) {
      existing.ownerId = ownerId;
    }
    if (!existing.createdAt) {
      existing.createdAt = Date.now();
    }
    // mode は作成時に固定し、途中の join で変更しない（public room の挙動を守る）
    return existing;
  }

  const state = initGame(mapId);
  const session: MatchSession = {
    roomId,
    mapId,
    mode,
    ownerId,
    started: false,
    createdAt: Date.now(),
    state,
    currentPlayer: "Cool", // Cool starts first by rule assumption
    replayId: mode === "public" ? randomUUID() : null,
    replayLog: [],
    replayEvents: [],
    replaySaved: false,
    coolBotName: "",
    hotBotName: "",
  };
  sessions.set(roomId, session);
  return session;
}

export function getMatchSession(roomId: string): MatchSession | undefined {
  return sessions.get(roomId);
}

export function getLatestGameEndEvent(roomId: string): GameEndEvent | null {
  const session = sessions.get(roomId);
  if (!session) return null;
  for (let index = session.replayEvents.length - 1; index >= 0; index -= 1) {
    const event = session.replayEvents[index];
    if (event?.type === "gameEnd") {
      return event;
    }
  }
  return null;
}

export function setMatchSessionBotNames(
  roomId: string,
  botNames: { coolBotName: string; hotBotName: string },
): void {
  const session = sessions.get(roomId);
  if (!session) return;
  session.coolBotName = botNames.coolBotName;
  session.hotBotName = botNames.hotBotName;
  sessions.set(roomId, session);
}

export type SetMatchMapResult = { session: MatchSession } | { error: string };

export async function setMatchSessionMap(
  roomId: string,
  mapId: string,
): Promise<SetMatchMapResult> {
  const session = sessions.get(roomId);
  if (!session) {
    return { error: `Session not found for roomId=${roomId}` };
  }
  if (session.started) {
    return { error: "Match already started" };
  }

  try {
    const def = await getMapDefinitionFromDb(mapId);
    session.mapId = mapId;
    session.state = mapDefinitionToGameState(def);
    session.currentPlayer = "Cool";
    session.replayLog = [];
    session.replayEvents = [];
    session.replaySaved = false;
    session.replaySavePromise = undefined;
    sessions.set(roomId, session);
    return { session };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export type MatchRoomStatus = "waiting" | "running" | "finished";

export interface MatchRoomSummary {
  roomId: string;
  mapId: string;
  mode: RoomMode;
  status: MatchRoomStatus;
  turn: number;
  maxTurns: number;
  started: boolean;
}

// wsServer と Next.js API から参照するルーム一覧用の最小サマリ。
export function listMatchRoomSummaries(): MatchRoomSummary[] {
  const list: MatchRoomSummary[] = [];
  for (const session of sessions.values()) {
    const status: MatchRoomStatus = !session.started
      ? "waiting"
      : session.state.status === "running"
        ? "running"
        : session.state.status === "winCool" ||
            session.state.status === "winHot" ||
            session.state.status === "draw" ||
            session.state.status === "invalid"
          ? "finished"
          : "waiting";
    list.push({
      roomId: session.roomId,
      mapId: session.mapId,
      mode: session.mode,
      status,
      turn: session.state.turn,
      maxTurns: session.state.maxTurns,
      started: session.started,
    });
  }
  return list.reverse();
}

export function deleteMatchSession(roomId: string): void {
  const session = sessions.get(roomId);
  if (session) {
    if (!session.replaySaved && session.replayLog.length > 0) {
      void persistReplay(session);
    }
  }
  sessions.delete(roomId);
}

function releaseReplayBuffers(session: MatchSession): void {
  session.replayLog = [];
  session.replayEvents = [];
  session.replaySavePromise = undefined;
}

export function getMatchTurnView(roomId: string): TurnView | undefined {
  const session = sessions.get(roomId);
  if (!session) return undefined;
  return getTurnView(session.state, session.currentPlayer);
}

export type ApplyActionResult =
  | { session: MatchSession; result: EngineStepResult }
  | { error: string };

export function applyAction(
  roomId: string,
  playerId: PlayerId,
  action: Action,
): ApplyActionResult {
  const session = sessions.get(roomId);
  if (!session) {
    return { error: `Session not found for roomId=${roomId}` };
  }

  if (session.state.status !== "running") {
    return {
      error: `Game has already ended with status=${session.state.status}`,
    };
  }
  if (!session.started) {
    return { error: "Match has not started yet" };
  }

  if (session.currentPlayer !== playerId) {
    return {
      error: `It is not ${playerId}'s turn (current=${session.currentPlayer})`,
    };
  }

  const beforeState = session.state;
  let result: EngineStepResult;
  try {
    result = step(beforeState, playerId, action);
  } catch (error) {
    console.error("[match/session] engine step failed", {
      roomId,
      playerId,
      action,
      error,
    });
    const invalidated = endMatchWithReason(roomId, "invalid", "serverError");
    if ("error" in invalidated) {
      return invalidated;
    }
    const invalidResult = createInvalidStepResult(
      invalidated.session,
      playerId,
    );
    sessions.set(roomId, invalidated.session);
    return { session: invalidated.session, result: invalidResult };
  }
  session.state = result.state;

  recordReplayLog(session, playerId, action, result.state);
  recordReplayEvents(session, {
    playerId,
    action,
    beforeState,
    result,
  });

  if (session.state.status === "running") {
    session.currentPlayer = flipPlayer(playerId);
  } else {
    session.replayEvents.push(
      buildGameEndEvent({
        status: session.state.status,
        reason: result.end
          ? mapEngineEndReason(result.end.reason)
          : "manualEnd",
        turnIndex: session.replayLog.length - 1,
        point: result.end?.point ?? null,
      }),
    );
    void persistReplay(session);
  }

  sessions.set(roomId, session);
  return { session, result };
}

function flipPlayer(current: PlayerId): PlayerId {
  return current === "Cool" ? "Hot" : "Cool";
}

function winStatusForLoser(loser: PlayerId): GameStatus {
  return loser === "Cool" ? "winHot" : "winCool";
}

export type ForfeitReason = "disconnect" | "timeout" | "error" | "leaveSlot";

export type ForfeitMatchResult = { session: MatchSession } | { error: string };

export type EndMatchResult = { session: MatchSession } | { error: string };

/**
 * End a running match immediately with the given status.
 *
 * Used for non-action termination (disconnect/timeout/etc), where the engine does
 * not naturally transition the status.
 */
export function endMatch(roomId: string, status: GameStatus): EndMatchResult {
  return endMatchWithReason(roomId, status, "manualEnd");
}

export function endMatchWithReason(
  roomId: string,
  status: GameStatus,
  reason: GameEndReason,
): EndMatchResult {
  const session = sessions.get(roomId);
  if (!session) {
    return { error: `Session not found for roomId=${roomId}` };
  }
  if (session.state.status !== "running") {
    return { session };
  }

  const nextState: GameState = {
    ...session.state,
    status,
  };
  session.state = nextState;

  // 行動が発生しない終了でも、リプレイの最終盤面に反映させる。
  session.replayLog.push({
    turn: nextState.turn,
    state: nextState,
    actionCool: null,
    actionHot: null,
  });

  session.replayEvents.push(
    buildGameEndEvent({
      status,
      reason,
      turnIndex: session.replayLog.length - 1,
      point: null,
    }),
  );

  void persistReplay(session);
  sessions.set(roomId, session);
  return { session };
}

/**
 * End a running match immediately by declaring the given player as loser.
 *
 * Room の設計方針:
 * - 切断/停止/タイムアウトは即負け
 * - 試合は不可逆（途中再開しない）
 */
export function forfeitMatch(
  roomId: string,
  loser: PlayerId,
  reason?: ForfeitReason,
): ForfeitMatchResult {
  return endMatchWithReason(
    roomId,
    winStatusForLoser(loser),
    mapForfeitReason(reason ?? "error"),
  );
}

function recordReplayLog(
  session: MatchSession,
  playerId: PlayerId,
  action: Action,
  nextState: GameState,
): void {
  const entry: ReplayLogEntry = {
    turn: nextState.turn,
    state: nextState,
    actionCool: playerId === "Cool" ? action : null,
    actionHot: playerId === "Hot" ? action : null,
  };

  session.replayLog.push(entry);
}

function recordReplayEvents(
  session: MatchSession,
  args: {
    playerId: PlayerId;
    action: Action;
    beforeState: GameState;
    result: EngineStepResult;
  },
): void {
  const turnIndex = session.replayLog.length - 1;
  if (turnIndex < 0) return;

  session.replayEvents ??= [];

  const observationTiles =
    args.action.kind === "look" || args.action.kind === "search"
      ? (args.result.observation ?? null)
      : null;

  const { actionEvent, turnEvent } = buildActionAndTurnEvents({
    turnIndex,
    actor: args.playerId,
    action: args.action,
    beforeState: args.beforeState,
    afterState: args.result.state,
    observationTiles,
    endReason: args.result.end?.reason ?? null,
  });

  session.replayEvents.push(actionEvent, turnEvent);
}

function createInvalidStepResult(
  session: MatchSession,
  playerId: PlayerId,
): EngineStepResult {
  const self = session.state.players[playerId];
  const enemy = session.state.players[playerId === "Cool" ? "Hot" : "Cool"];
  return {
    state: session.state,
    view: {
      turn: session.state.turn,
      maxTurns: session.state.maxTurns,
      items: self.items,
      enemyItems: enemy.items,
      around: Array(9).fill(2),
    },
  };
}

function mapWinner(status: GameStatus): ReplayWinner {
  if (status === "winCool") return "Cool";
  if (status === "winHot") return "Hot";
  if (status === "draw") return "draw";
  return null;
}

function mapGameEndWinner(status: GameStatus): GameEndWinner {
  if (status === "winCool") return "cool";
  if (status === "winHot") return "hot";
  if (status === "draw") return "draw";
  return "none";
}

function buildGameEndEvent(input: {
  status: GameStatus;
  reason: GameEndReason;
  turnIndex: number;
  point: GameEndEvent["point"];
}): GameEndEvent {
  return {
    type: "gameEnd",
    id: "gameEnd",
    winner: mapGameEndWinner(input.status),
    reason: input.reason,
    turnIndex: input.turnIndex,
    point: input.point,
  };
}

function mapForfeitReason(reason: ForfeitReason): GameEndReason {
  switch (reason) {
    case "timeout":
      return "forfeitTimeout";
    case "disconnect":
      return "forfeitDisconnect";
    case "leaveSlot":
      return "forfeitLeaveSlot";
    case "error":
      return "forfeitError";
  }
}

function mapEngineEndReason(reason: EngineEndReason): GameEndReason {
  switch (reason) {
    case "putOnEnemy":
      return "putOnEnemy";
    case "putOnEnemyMutualSurround":
      return "putOnEnemyMutualSurround";
    case "walkIntoBlock":
      return "walkIntoBlock";
    case "walkOutOfBounds":
      return "walkOutOfBounds";
    case "enemySurroundedByPut":
      return "enemySurroundedByPut";
    case "selfSurroundedByPut":
      return "selfSurroundedByPut";
    case "mutualSurroundedByPut":
      return "mutualSurroundedByPut";
    case "enemySurroundedAfterWalk":
      return "enemySurroundedAfterWalk";
    case "selfSurroundedAfterWalk":
      return "selfSurroundedAfterWalk";
    case "mutualSurroundedAfterWalk":
      return "mutualSurroundedAfterWalk";
    case "enemySurroundedAfterItem":
      return "enemySurroundedAfterItem";
    case "selfSurroundedAfterItem":
      return "selfSurroundedAfterItem";
    case "mutualSurroundedAfterItem":
      return "mutualSurroundedAfterItem";
    case "turnLimitItems":
      return "turnLimitItems";
    case "turnLimitDraw":
      return "turnLimitDraw";
  }
}

async function persistReplay(session: MatchSession): Promise<void> {
  if (session.replaySaved) return;
  if (session.mode === "practice") return;
  const replayId = session.replayId;
  if (!replayId) return;

  if (!session.replaySavePromise) {
    session.replaySavePromise = dbReady
      .then(async () => {
        await db
          .insertInto("replays")
          .values({
            id: replayId,
            room_id: session.roomId,
            map_id: session.mapId,
            winner: mapWinner(session.state.status),
            cool_bot_name: session.coolBotName,
            hot_bot_name: session.hotBotName,
            log: JSON.stringify(session.replayLog),
            events_json: JSON.stringify(session.replayEvents),
          })
          .execute();
        session.replaySaved = true;
        releaseReplayBuffers(session);
      })
      .catch((error) => {
        console.error("[match/session] failed to persist replay", error);
        session.replaySavePromise = undefined;
      });
  }

  await session.replaySavePromise;
}

export async function waitForReplaySave(roomId: string): Promise<void> {
  const session = sessions.get(roomId);
  if (!session) return;
  if (session.mode === "practice") return;
  if (!session.replayId) return;
  if (session.replaySaved) return;
  if (!session.replaySavePromise) {
    // If save has not started yet (e.g., manual flush), trigger it.
    session.replaySavePromise = persistReplay(session);
  }
  await session.replaySavePromise;
}
