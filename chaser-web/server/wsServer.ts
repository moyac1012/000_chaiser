import { createHmac } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import type { Server, ServerWebSocket } from "bun";
import {
  type Action,
  type GameStatus,
  isAction,
  type PlayerId,
} from "../src/core/engine";
import { getReplayAvailableAt } from "../src/core/match/replayVisibility";
import type { RoomMode } from "../src/core/match/room";
import {
  applyAction,
  createMatchSession,
  deleteMatchSession,
  endMatch,
  forfeitMatch,
  getLatestGameEndEvent,
  getMatchSession,
  getMatchTurnView,
  listMatchRoomSummaries,
  setMatchSessionBotNames,
  setMatchSessionMap,
  waitForReplaySave,
} from "../src/core/match/session";
import type {
  ActionMeta,
  ClientMessage,
  JoinIntent,
  ParticipantRole,
  ParticipantSlot,
  ParticipantSnapshot,
  RoomCloseReason,
  ServerMessage,
} from "../src/core/match/wsTypes";
import { db, dbReady } from "../src/db/client";

type SlotBinding = { userId: string; botId: number | null };

interface RoomState {
  sockets: {
    cool?: ServerWebSocket<SocketData>;
    hot?: ServerWebSocket<SocketData>;
    spectators: Set<ServerWebSocket<SocketData>>;
  };
  participants: Map<string, ParticipantSnapshot>;
  slots: Record<PlayerId, SlotBinding | null>;
  started: boolean;
}

type GlobalWithRooms = typeof globalThis & {
  __matchRooms?: Map<string, RoomState>;
  __roomAutoCloseTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

type SocketData = { roomId: string; userId: string };

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkPublishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerk =
  clerkSecretKey && clerkPublishableKey
    ? createClerkClient({
        secretKey: clerkSecretKey,
        publishableKey: clerkPublishableKey,
      })
    : null;

type UserPermission = "admin" | "tournament:create";

function normalizePermission(value: string): UserPermission | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed === "admin" || trimmed === "tournament:create"
    ? (trimmed as UserPermission)
    : null;
}

function hasAdminPermission(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const record = metadata as Record<string, unknown>;
  const roles = record.roles;
  if (Array.isArray(roles)) {
    for (const role of roles) {
      if (typeof role !== "string") continue;
      if (normalizePermission(role) === "admin") return true;
    }
  }
  const permissions = record.permissions;
  if (Array.isArray(permissions)) {
    for (const permission of permissions) {
      if (typeof permission !== "string") continue;
      if (normalizePermission(permission) === "admin") return true;
    }
  }
  const singleRole = record.role;
  if (typeof singleRole === "string") {
    if (normalizePermission(singleRole) === "admin") return true;
  }
  return false;
}

async function isAdminUser(userId: string): Promise<boolean> {
  if (!clerk) return false;
  try {
    const user = await clerk.users.getUser(userId);
    return (
      hasAdminPermission(user.publicMetadata) ||
      hasAdminPermission(user.privateMetadata)
    );
  } catch {
    return false;
  }
}

async function canUseBot(
  userId: string,
  botId: number,
): Promise<{ ok: true } | { error: string }> {
  try {
    await dbReady;
    const bot = await db
      .selectFrom("user_bots")
      .select(["id", "owner_id"])
      .where("id", "=", botId)
      .executeTakeFirst();
    if (!bot) {
      return { error: "Bot not found" };
    }
    if (!bot.owner_id || !bot.owner_id.trim()) {
      return { error: "Bot owner is invalid" };
    }
    if (bot.owner_id === userId) {
      return { ok: true };
    }
    if (await isAdminUser(userId)) {
      return { ok: true };
    }
    return { error: "Forbidden bot" };
  } catch (error) {
    console.warn("[wsServer] bot ownership check failed", error);
    return { error: "Failed to validate bot" };
  }
}

function normalizeSlot(value: unknown): ParticipantSlot {
  return value === "Cool" || value === "Hot" ? value : null;
}

function normalizeBotId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

const globalWithRooms = globalThis as GlobalWithRooms;
const rooms: Map<string, RoomState> = globalWithRooms.__matchRooms ?? new Map();
if (!globalWithRooms.__matchRooms) {
  globalWithRooms.__matchRooms = rooms;
}
const roomAutoCloseTimers =
  globalWithRooms.__roomAutoCloseTimers ??
  new Map<string, ReturnType<typeof setTimeout>>();
if (!globalWithRooms.__roomAutoCloseTimers) {
  globalWithRooms.__roomAutoCloseTimers = roomAutoCloseTimers;
}

const socketRooms = new Map<
  ServerWebSocket<SocketData>,
  {
    roomId: string;
    role: ParticipantRole;
    slot: ParticipantSlot;
    userId: string;
  }
>();

const TURN_TIMEOUT_MS = (() => {
  const raw = process.env.TURN_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 500;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 500;
})();

const TURN_TIMEOUT_FIRST_MS = (() => {
  const raw = process.env.TURN_TIMEOUT_FIRST_MS;
  const parsed = raw ? Number(raw) : Math.max(TURN_TIMEOUT_MS, 2500);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2500;
})();

const ROOM_WAITING_TIMEOUT_MS = (() => {
  const raw = process.env.ROOM_WAITING_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 15 * 60 * 1000;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
})();

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

const WS_SERVER_PORT = (() => {
  const raw = process.env.WS_SERVER_PORT;
  if (!raw) return 8080;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 8080;
  return Math.floor(parsed);
})();

function pickRandomPort(): number {
  return Math.floor(20000 + Math.random() * 20000);
}

function isAddrInUse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: string }).code === "EADDRINUSE";
}

function clearTurnTimer(roomId: string): void {
  const timer = turnTimers.get(roomId);
  if (timer) clearTimeout(timer);
  turnTimers.delete(roomId);
}

function clearRoomAutoCloseTimer(roomId: string): void {
  const timer = roomAutoCloseTimers.get(roomId);
  if (timer) clearTimeout(timer);
  roomAutoCloseTimers.delete(roomId);
}

function scheduleRoomAutoClose(roomId: string): void {
  if (ROOM_WAITING_TIMEOUT_MS <= 0) return;
  if (roomAutoCloseTimers.has(roomId)) return;

  const session = getMatchSession(roomId);
  if (!session || session.started) return;
  if (!session.createdAt) {
    session.createdAt = Date.now();
  }

  const elapsed = Date.now() - session.createdAt;
  const remainingMs = ROOM_WAITING_TIMEOUT_MS - elapsed;
  if (remainingMs <= 0) {
    void closeRoom(roomId, "timeout");
    return;
  }

  roomAutoCloseTimers.set(
    roomId,
    setTimeout(() => {
      roomAutoCloseTimers.delete(roomId);
      const current = getMatchSession(roomId);
      if (!current || current.started) return;
      void closeRoom(roomId, "timeout");
    }, remainingMs),
  );
}

function closeRoom(
  roomId: string,
  reason: RoomCloseReason,
): { ok: true } | { error: string } {
  const session = getMatchSession(roomId);
  if (!session) {
    return { error: "Session not found" };
  }
  if (session.started) {
    return { error: "Match already started" };
  }

  clearTurnTimer(roomId);
  clearRoomAutoCloseTimer(roomId);

  broadcast(roomId, { type: "roomClosed", roomId, reason });

  const room = rooms.get(roomId);
  if (room) {
    const sockets: ServerWebSocket<SocketData>[] = [];
    if (room.sockets.cool) sockets.push(room.sockets.cool);
    if (room.sockets.hot) sockets.push(room.sockets.hot);
    for (const ws of room.sockets.spectators) sockets.push(ws);

    for (const ws of sockets) {
      try {
        ws.close(1000, "room closed");
      } catch {
        // ignore close errors
      }
    }

    if (
      !room.sockets.cool &&
      !room.sockets.hot &&
      room.sockets.spectators.size === 0
    ) {
      rooms.delete(roomId);
    }
  }

  deleteMatchSession(roomId);
  return { ok: true };
}

function hasActedOnce(roomId: string, playerId: PlayerId): boolean {
  const session = getMatchSession(roomId);
  if (!session) return false;
  return session.replayLog.some((entry) =>
    playerId === "Cool" ? Boolean(entry.actionCool) : Boolean(entry.actionHot),
  );
}

function serveWithPort(port: number): Server<SocketData> {
  return Bun.serve<SocketData>({
    port,
    async fetch(req: Request, server: Server<SocketData>) {
      const url = new URL(req.url);
      if (url.pathname === "/api/rooms") {
        if (req.method !== "GET") {
          return new Response("Method Not Allowed", { status: 405 });
        }
        const summaries = listMatchRoomSummaries().filter(
          (summary) => summary.mode === "public",
        );
        const roomsWithSockets = summaries.map((summary) => {
          const roomState = rooms.get(summary.roomId);
          const coolJoined = Boolean(roomState?.slots?.Cool);
          const hotJoined = Boolean(roomState?.slots?.Hot);
          return {
            ...summary,
            coolJoined,
            hotJoined,
          };
        });
        return Response.json({ rooms: roomsWithSockets });
      }

      if (url.pathname === "/api/rooms/init") {
        if (req.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }
        const body = (await req.json().catch(() => null)) as {
          roomId?: unknown;
          ownerId?: unknown;
          mode?: unknown;
          signature?: unknown;
        } | null;
        if (!body || typeof body.roomId !== "string") {
          return new Response("roomId required", { status: 400 });
        }
        if (!body || typeof body.ownerId !== "string") {
          return new Response("ownerId required", { status: 400 });
        }
        if (!body || typeof body.signature !== "string") {
          return new Response("signature required", { status: 400 });
        }

        const secret = process.env.CLERK_SECRET_KEY;
        if (!secret) {
          return new Response("CLERK_SECRET_KEY required", { status: 500 });
        }

        const mode = normalizeRoomMode(body.mode);
        const expected = createHmac("sha256", secret)
          .update(`${body.roomId}.${body.ownerId}.${mode}`)
          .digest("hex");
        if (body.signature !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        ensureRoom(body.roomId, body.ownerId, mode);
        scheduleRoomAutoClose(body.roomId);
        return Response.json({ ok: true });
      }

      if (url.pathname !== "/ws/match") {
        return new Response("Not Found", { status: 404 });
      }

      const roomId = url.searchParams.get("roomId");
      if (!roomId) {
        return new Response("roomId required", { status: 400 });
      }
      const mode = normalizeRoomMode(url.searchParams.get("mode"));

      // Clerk 認証（接続ごとに userId を確定）。
      // テストやローカル用途では `?userId=foo` を許可して簡易的に接続できるようにする。
      // NOTE: dev/test の WebSocket 接続は Clerk 側の一時的な揺れで authenticateRequest が失敗しうるため、
      // 明示 `?userId=` があればそれを優先して Clerk 認証をスキップする（prod では無効）。
      const urlUser = url.searchParams.get("userId");
      let userId: string | null =
        urlUser && process.env.NODE_ENV !== "production" ? urlUser : null;

      if (!userId && clerk) {
        try {
          const authRequest = await clerk.authenticateRequest(req);
          if (authRequest.isSignedIn) {
            const auth = authRequest.toAuth();
            userId = auth?.userId ?? null;
          }
        } catch (error) {
          console.warn("[wsServer] auth failed", error);
        }
      }

      if (!userId) {
        return new Response("Unauthorized", { status: 401 });
      }

      // tournament/admin 経由の roomId(UUID) のみ upgrade 前に owner を解決する。
      // 通常の room は join(intent) の情報が来るまで owner を確定させない。
      const looksLikeUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          roomId,
        );
      if (looksLikeUuid) {
        await ensureMatchSessionForRoom(roomId, userId, mode);
      }

      const upgraded = server.upgrade(req, { data: { roomId, userId } });
      if (upgraded) return undefined;
      return new Response("Upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws: ServerWebSocket<SocketData>) {
        const { roomId } = ws.data;
        setupSocket(ws, roomId);
      },
      message(
        ws: ServerWebSocket<SocketData>,
        message: string | ArrayBuffer | Uint8Array,
      ) {
        handleMessage(ws, message);
      },
      close(ws: ServerWebSocket<SocketData>) {
        cleanupSocket(ws);
      },
    },
  });
}

function createWsServer(): Server<SocketData> {
  if (WS_SERVER_PORT !== 0) {
    return serveWithPort(WS_SERVER_PORT);
  }

  const maxAttempts = 10;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = pickRandomPort();
    try {
      return serveWithPort(port);
    } catch (error) {
      lastError = error;
      if (!isAddrInUse(error)) {
        throw error;
      }
    }
  }

  throw (
    lastError ?? new Error("Failed to bind ws server after multiple attempts")
  );
}

const server = createWsServer();

console.log(`[wsServer] listening on ${server.hostname}:${server.port}`);

export const wsServer = server;

function handleMessage(
  ws: ServerWebSocket<SocketData>,
  raw: string | ArrayBuffer | Uint8Array,
) {
  const message = parseClientMessage(raw);
  if (!message) {
    sendError(ws, "Invalid message format");
    return;
  }

  const roomId = ws.data.roomId;
  const socketUserId = ws.data.userId;
  if (message.roomId && message.roomId !== roomId) {
    sendError(ws, "roomId mismatch between URL and message");
    return;
  }

  switch (message.type) {
    case "join":
      console.log("[wsServer] received join", message);
      {
        const normalizedSlot = normalizeSlot(message.slot);
        if (
          message.slot !== undefined &&
          message.slot !== null &&
          !normalizedSlot
        ) {
          sendError(ws, "Invalid slot");
          return;
        }
        const normalizedBotId = normalizeBotId(message.botId);
        if (
          message.botId !== undefined &&
          message.botId !== null &&
          normalizedBotId === null
        ) {
          sendError(ws, "Invalid botId");
          return;
        }
        void handleJoin(
          ws,
          roomId,
          socketUserId,
          normalizeRoomMode(message.mode),
          message.intent,
          normalizedSlot,
          normalizedBotId,
        );
      }
      break;
    case "setMap":
      void handleSetMap(ws, roomId, socketUserId, message.mapId);
      break;
    case "setSlot":
      {
        const normalizedSlot = normalizeSlot(message.slot);
        if (
          message.slot !== undefined &&
          message.slot !== null &&
          !normalizedSlot
        ) {
          sendError(ws, "Invalid slot");
          return;
        }
        const normalizedBotId = normalizeBotId(message.botId);
        if (
          message.botId !== undefined &&
          message.botId !== null &&
          normalizedBotId === null
        ) {
          sendError(ws, "Invalid botId");
          return;
        }
        void handleSetSlot(
          ws,
          roomId,
          socketUserId,
          normalizedSlot,
          normalizedBotId,
        );
      }
      break;
    case "leaveSlot":
      handleLeaveSlot(ws, roomId, socketUserId);
      break;
    case "start":
      void handleStart(ws, roomId, socketUserId);
      break;
    case "closeRoom":
      handleCloseRoom(ws, roomId, socketUserId);
      break;
    case "action":
      handleAction(
        ws,
        roomId,
        socketUserId,
        message.playerId,
        message.action,
        message.meta,
      );
      break;
    case "leave":
      cleanupSocket(ws);
      break;
  }
}

function setupSocket(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
): void {
  socketRooms.set(socket, {
    roomId,
    role: "spectator",
    slot: null,
    userId: socket.data.userId,
  });
}

async function handleJoin(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
  mode: RoomMode,
  intent?: JoinIntent,
  requestedSlot: ParticipantSlot = null,
  requestedBotId: number | null = null,
): Promise<void> {
  const room = ensureRoom(roomId, null, mode);
  const session = getMatchSession(roomId);
  if (!session) {
    sendError(socket, "Session not found");
    return;
  }

  if (!session.ownerId && intent === "player") {
    session.ownerId = userId;
  }

  const isOwner = session.ownerId ? userId === session.ownerId : false;
  const existing = room.participants.get(userId);
  // role は「排他的」ではなく、owner は slot に入っても owner のまま。
  // ただし UI/WS 制約のため、intent=player の接続は slot 未指定でも role=player を付与する。
  const baseRole: ParticipantRole = isOwner
    ? "owner"
    : intent === "player"
      ? "player"
      : (existing?.role ?? "spectator");
  const participant: ParticipantSnapshot = {
    userId,
    role: baseRole,
    slot: null,
    botId: null,
  };
  room.participants.set(userId, participant);

  // まずは観戦者として登録し、必要ならスロットを割り当てる
  room.sockets.spectators.add(socket);
  socketRooms.set(socket, {
    roomId,
    role: participant.role,
    slot: null,
    userId,
  });

  const occupiedSlots = occupiedSlotsForUser(room, userId);
  const autoSlot: ParticipantSlot =
    occupiedSlots.length === 1 ? occupiedSlots[0] : null;
  let desiredSlot: ParticipantSlot =
    intent === "player" ? (requestedSlot ?? autoSlot) : null;
  let desiredBotId =
    intent === "player"
      ? (requestedBotId ??
        (desiredSlot ? (room.slots[desiredSlot]?.botId ?? null) : null))
      : null;
  if (desiredSlot && desiredBotId !== null) {
    const check = await canUseBot(userId, desiredBotId);
    if ("error" in check) {
      sendError(socket, check.error);
      desiredSlot = null;
      desiredBotId = null;
    }
  }
  if (desiredSlot) {
    bindSlot({
      roomId,
      socket,
      userId,
      slot: desiredSlot,
      botId: desiredBotId,
      allowOwner: isOwner,
      bindSocket: intent === "player",
    });
  }

  const participants = buildParticipantList(room);
  const baseSnapshot = room.participants.get(userId) ?? participant;
  const you: ParticipantSnapshot =
    intent === "player" && desiredSlot
      ? {
          userId,
          role: baseSnapshot.role === "owner" ? "owner" : "player",
          slot: desiredSlot,
          botId: room.slots[desiredSlot]?.botId ?? null,
        }
      : baseSnapshot;

  sendMessage(socket, {
    type: "joined",
    roomId,
    mode: session.mode,
    you,
    ownerId: session.ownerId,
    participants,
    mapId: session.mapId,
    started: session.started,
  });
  if (session.started) {
    // 対戦開始までは盤面を隠すため、stateUpdate は開始後のみ送る。
    sendMessage(socket, {
      type: "stateUpdate",
      roomId,
      state: session.state,
    });
  }

  broadcastParticipants(roomId);

  if (session.started) {
    sendTurnStart(roomId);
  }
}

function participantForSlot(
  room: RoomState,
  slot: ParticipantSlot,
): SlotBinding | null {
  if (!slot) return null;
  return room.slots[slot] ?? null;
}

function clearSlotSocketBinding(
  roomId: string,
  slot: ParticipantSlot,
  userId?: string,
): void {
  if (!slot) return;
  const room = rooms.get(roomId);
  if (!room) return;

  if (
    slot === "Cool" &&
    room.sockets.cool &&
    (!userId || room.sockets.cool.data.userId === userId)
  ) {
    room.sockets.cool = undefined;
  }
  if (
    slot === "Hot" &&
    room.sockets.hot &&
    (!userId || room.sockets.hot.data.userId === userId)
  ) {
    room.sockets.hot = undefined;
  }
}

function clearSlot(
  roomId: string,
  slot: ParticipantSlot,
  userId?: string,
): void {
  if (!slot) return;
  const room = rooms.get(roomId);
  if (!room) return;

  const existing = room.slots[slot];
  if (existing && (!userId || existing.userId === userId)) {
    room.slots[slot] = null;
  }
  clearSlotSocketBinding(roomId, slot, userId);
}

function occupiedSlotsForUser(room: RoomState, userId: string): PlayerId[] {
  const slots: PlayerId[] = [];
  if (room.slots.Cool?.userId === userId) slots.push("Cool");
  if (room.slots.Hot?.userId === userId) slots.push("Hot");
  return slots;
}

function bindSlot(options: {
  roomId: string;
  socket: ServerWebSocket<SocketData>;
  userId: string;
  slot: ParticipantSlot;
  botId: number | null;
  allowOwner: boolean;
  bindSocket: boolean;
}): void {
  const { roomId, socket, userId, slot, botId, allowOwner, bindSocket } =
    options;
  if (!slot) return;
  const room = rooms.get(roomId);
  if (!room) return;
  const session = getMatchSession(roomId);
  if (!session) return;

  const occupant = participantForSlot(room, slot);
  if (session.started && occupant && occupant.userId !== userId) {
    sendError(socket, "Match already started");
    return;
  }
  if (occupant && occupant.userId !== userId) {
    sendError(socket, "Slot already taken");
    return;
  }

  if (session.mode === "public") {
    for (const other of occupiedSlotsForUser(room, userId)) {
      if (other !== slot) {
        clearSlot(roomId, other, userId);
      }
    }
  }

  const prevParticipant = room.participants.get(userId);
  const nextRole: ParticipantRole =
    prevParticipant?.role === "owner" && allowOwner ? "owner" : "player";
  if (prevParticipant) {
    room.participants.set(userId, {
      ...prevParticipant,
      role: nextRole,
      slot: null,
      botId: null,
    });
  }

  room.slots[slot] = {
    userId,
    botId: botId ?? occupant?.botId ?? null,
  };

  if (bindSocket) {
    clearSlotSocketBinding(roomId, slot, occupant?.userId ?? undefined);
    if (slot === "Cool") {
      room.sockets.cool = socket;
    } else {
      room.sockets.hot = socket;
    }
    room.sockets.spectators.delete(socket);
    socketRooms.set(socket, { roomId, role: nextRole, slot, userId });
  } else {
    socketRooms.set(socket, { roomId, role: nextRole, slot: null, userId });
  }
}

async function handleSetSlot(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
  slot: ParticipantSlot,
  botId: number | null,
): Promise<void> {
  const session = getMatchSession(roomId);
  const room = rooms.get(roomId);
  if (!session || !room) {
    sendError(socket, "Session not found");
    return;
  }
  const isOwner = session.ownerId ? userId === session.ownerId : false;
  const participant = room.participants.get(userId);
  if (!isOwner && participant?.role !== "player") {
    sendError(socket, "Spectators cannot join a slot");
    return;
  }

  if (!slot) {
    handleLeaveSlot(socket, roomId, userId);
    return;
  }
  if (botId === null) {
    sendError(socket, "botId is required to join a slot");
    return;
  }
  const canUse = await canUseBot(userId, botId);
  if ("error" in canUse) {
    sendError(socket, canUse.error);
    return;
  }
  const occupant = participantForSlot(room, slot);
  if (session.started && occupant && occupant.userId !== userId) {
    sendError(socket, "Match already started");
    return;
  }

  bindSlot({
    roomId,
    socket,
    userId,
    slot,
    botId,
    allowOwner: isOwner,
    bindSocket: false,
  });
  broadcastParticipants(roomId);
}

function handleLeaveSlot(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
): void {
  const session = getMatchSession(roomId);
  const room = rooms.get(roomId);
  const participant = room?.participants.get(userId);
  if (!session || !room || !participant) {
    sendError(socket, "Session not found");
    return;
  }

  const socketMeta = socketRooms.get(socket);
  const slotsToLeave: PlayerId[] = [];
  if (socketMeta?.slot) {
    slotsToLeave.push(socketMeta.slot);
  } else {
    slotsToLeave.push(...occupiedSlotsForUser(room, userId));
  }
  if (slotsToLeave.length === 0) {
    sendError(socket, "You are not seated in any slot");
    return;
  }

  if (session.started && session.state.status === "running") {
    // Room は中断しない: 離席は即負けとして扱う。
    // NOTE: practice で同一 user が両スロットに入っている場合は決め手が無いので draw にする。
    const unique = Array.from(new Set(slotsToLeave));
    if (unique.length === 1) {
      const forfeited = forfeitMatch(roomId, unique[0], "leaveSlot");
      if (!("error" in forfeited)) {
        broadcast(roomId, {
          type: "stateUpdate",
          roomId,
          state: forfeited.session.state,
        });
        broadcastGameEnd(roomId, forfeited.session.state.status);
      }
    } else {
      clearTurnTimer(roomId);
      const ended = endMatch(roomId, "draw");
      if (!("error" in ended)) {
        broadcast(roomId, {
          type: "stateUpdate",
          roomId,
          state: ended.session.state,
        });
        broadcastGameEnd(roomId, ended.session.state.status);
      }
    }
  }

  for (const slot of slotsToLeave) {
    clearSlot(roomId, slot, userId);
  }

  const nextRole: ParticipantRole =
    participant.role === "owner" ? "owner" : "spectator";
  room.participants.set(userId, {
    ...participant,
    role: nextRole,
    slot: null,
    botId: null,
  });
  room.sockets.spectators.add(socket);
  socketRooms.set(socket, { roomId, role: nextRole, slot: null, userId });

  broadcastParticipants(roomId);
}

async function loadBotNames(botIds: number[]): Promise<Map<number, string>> {
  if (botIds.length === 0) return new Map();
  await dbReady;
  const rows = await db
    .selectFrom("user_bots")
    .select(["id", "name"])
    .where("id", "in", botIds)
    .execute();
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function handleStart(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
): Promise<void> {
  const session = getMatchSession(roomId);
  const room = rooms.get(roomId);
  if (!session || !room) {
    sendError(socket, "Session not found");
    return;
  }

  if (!session.ownerId) {
    sendError(socket, "Room owner is not set");
    return;
  }
  if (session.ownerId !== userId) {
    sendError(socket, "Only room owner can start the match");
    return;
  }
  if (session.started) {
    sendError(socket, "Match already started");
    return;
  }
  if (session.state.status !== "running") {
    sendError(
      socket,
      `Game has already ended with status=${session.state.status}`,
    );
    return;
  }

  const cool = participantForSlot(room, "Cool");
  const hot = participantForSlot(room, "Hot");
  if (!cool || !hot) {
    sendError(socket, "Both Cool and Hot slots must be filled");
    return;
  }
  if (cool.botId === null || hot.botId === null) {
    sendError(socket, "Both players must select a bot");
    return;
  }
  const coolBotCheck = await canUseBot(cool.userId, cool.botId);
  if ("error" in coolBotCheck) {
    sendError(socket, `Cool bot: ${coolBotCheck.error}`);
    return;
  }
  const hotBotCheck = await canUseBot(hot.userId, hot.botId);
  if ("error" in hotBotCheck) {
    sendError(socket, `Hot bot: ${hotBotCheck.error}`);
    return;
  }
  if (!room.sockets.cool || !room.sockets.hot) {
    sendError(socket, "Both players need to be connected");
    return;
  }

  try {
    const botIds = [cool.botId, hot.botId].filter(
      (botId): botId is number => typeof botId === "number",
    );
    const nameMap = await loadBotNames(botIds);
    setMatchSessionBotNames(roomId, {
      coolBotName: nameMap.get(cool.botId) ?? "",
      hotBotName: nameMap.get(hot.botId) ?? "",
    });
  } catch (error) {
    console.warn("[wsServer] failed to load bot names", error);
  }

  session.started = true;
  room.started = true;
  clearRoomAutoCloseTimer(roomId);

  broadcast(roomId, { type: "roomStatus", roomId, started: true });
  // Bot が turnStart で state を読むため、開始時に初期 state を送る。
  broadcast(roomId, { type: "stateUpdate", roomId, state: session.state });
  sendTurnStart(roomId);
}

function handleCloseRoom(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
): void {
  const session = getMatchSession(roomId);
  const room = rooms.get(roomId);
  if (!session || !room) {
    sendError(socket, "Session not found");
    return;
  }
  if (!session.ownerId) {
    sendError(socket, "Room owner is not set");
    return;
  }
  if (session.ownerId !== userId) {
    sendError(socket, "Only room owner can close the room");
    return;
  }
  if (session.started || room.started) {
    sendError(socket, "Match already started");
    return;
  }

  const result = closeRoom(roomId, "owner");
  if ("error" in result) {
    sendError(socket, result.error);
  }
}

function isTournamentRoomId(roomId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    roomId,
  );
}

function handleSetMap(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string,
  mapId: string,
): Promise<void> {
  const session = getMatchSession(roomId);
  const room = rooms.get(roomId);
  if (!session || !room) {
    sendError(socket, "Session not found");
    return Promise.resolve();
  }
  if (!session.ownerId) {
    sendError(socket, "Room owner is not set");
    return Promise.resolve();
  }
  if (session.ownerId !== userId) {
    sendError(socket, "Only room owner can change the map");
    return Promise.resolve();
  }
  if (isTournamentRoomId(roomId)) {
    sendError(socket, "Tournament room map is fixed");
    return Promise.resolve();
  }
  if (session.started || room.started) {
    sendError(socket, "Match already started");
    return Promise.resolve();
  }
  if (typeof mapId !== "string" || !mapId.trim()) {
    sendError(socket, "mapId is required");
    return Promise.resolve();
  }

  return setMatchSessionMap(roomId, mapId.trim())
    .then((updated) => {
      if ("error" in updated) {
        sendError(socket, updated.error);
        return;
      }

      broadcast(roomId, {
        type: "mapChanged",
        roomId,
        mapId: updated.session.mapId,
      });
      if (updated.session.started) {
        // 対戦開始前は盤面を送らない。
        broadcast(roomId, {
          type: "stateUpdate",
          roomId,
          state: updated.session.state,
        });
      }
    })
    .catch((error) => {
      console.error("[wsServer] setMap failed", error);
      sendError(socket, "Failed to set map");
    });
}

function broadcastParticipants(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const participants = buildParticipantList(room);
  broadcast(roomId, {
    type: "participants",
    roomId,
    participants,
  });
}

function buildParticipantList(room: RoomState): ParticipantSnapshot[] {
  const base: ParticipantSnapshot[] = Array.from(
    room.participants.values(),
  ).map((p) => ({
    ...p,
    slot: null,
    botId: null,
  }));

  const list: ParticipantSnapshot[] = [...base];
  (["Cool", "Hot"] as const).forEach((slot) => {
    const binding = room.slots[slot];
    if (!binding) return;
    const baseRole = room.participants.get(binding.userId)?.role ?? "player";
    const role: ParticipantRole = baseRole === "owner" ? "owner" : "player";
    list.push({
      userId: binding.userId,
      role,
      slot,
      botId: binding.botId,
    });
  });
  return list;
}

function handleAction(
  socket: ServerWebSocket<SocketData>,
  roomId: string,
  userId: string | null,
  playerId: PlayerId,
  action: Action,
  meta?: ActionMeta,
): void {
  const socketMeta = socketRooms.get(socket);
  if (!socketMeta || socketMeta.roomId !== roomId) {
    sendError(socket, "Not joined to this room");
    return;
  }
  const room = rooms.get(roomId);
  if (!room) {
    sendError(socket, "Session not found");
    return;
  }
  if (!userId) {
    sendError(socket, "Unauthorized");
    return;
  }

  const session = getMatchSession(roomId);
  if (!session) {
    sendError(socket, "Session not found");
    return;
  }
  if (!session.started) {
    sendError(socket, "Match has not started yet");
    return;
  }
  if (session.state.status !== "running") {
    sendError(
      socket,
      `Game has already ended with status=${session.state.status}`,
    );
    return;
  }

  const boundSlot = socketMeta.slot;
  if (boundSlot && boundSlot !== playerId) {
    // プレイヤーに紐づくソケットからの playerId 不一致は無効コマンド扱いで即負け。
    clearTurnTimer(roomId);
    const forfeited = forfeitMatch(roomId, boundSlot, "error");
    if ("error" in forfeited) {
      sendError(socket, forfeited.error);
      return;
    }
    sendError(socket, "Invalid playerId for this socket");
    broadcast(roomId, {
      type: "stateUpdate",
      roomId,
      state: forfeited.session.state,
    });
    broadcastGameEnd(roomId, forfeited.session.state.status);
    return;
  }

  const binding = room.slots[playerId];
  if (!binding || binding.userId !== userId) {
    sendError(socket, "You are not seated in this slot");
    return;
  }

  if (meta?.fallbackReason) {
    // Bot の停止/例外/タイムアウトは即負けに統一する。
    clearTurnTimer(roomId);
    const forfeited = forfeitMatch(
      roomId,
      playerId,
      meta.fallbackReason === "timeout" ? "timeout" : "error",
    );
    if ("error" in forfeited) {
      sendError(socket, forfeited.error);
      return;
    }
    broadcast(roomId, {
      type: "stateUpdate",
      roomId,
      state: forfeited.session.state,
    });
    broadcastGameEnd(roomId, forfeited.session.state.status);
    return;
  }

  if (!isAction(action)) {
    // 不正コマンドは即負け（TCP 互換のルール準拠）。
    clearTurnTimer(roomId);
    const forfeited = forfeitMatch(roomId, playerId, "error");
    if ("error" in forfeited) {
      sendError(socket, forfeited.error);
      return;
    }
    sendError(socket, "Invalid action");
    broadcast(roomId, {
      type: "stateUpdate",
      roomId,
      state: forfeited.session.state,
    });
    broadcastGameEnd(roomId, forfeited.session.state.status);
    return;
  }

  const result = applyAction(roomId, playerId, action);
  if ("error" in result) {
    sendError(socket, result.error);
    return;
  }

  clearTurnTimer(roomId);
  const { session: updatedSession } = result;
  broadcastActionLog(roomId, playerId, meta);
  broadcast(roomId, {
    type: "stateUpdate",
    roomId,
    state: updatedSession.state,
  });

  if (updatedSession.state.status === "running") {
    sendTurnStart(roomId);
  } else {
    broadcastGameEnd(roomId, updatedSession.state.status);
  }
}

function sendTurnStart(roomId: string): void {
  const session = getMatchSession(roomId);
  const view = getMatchTurnView(roomId);
  if (!session || !view || !session.started) return;
  if (session.state.status !== "running") return;

  const room = rooms.get(roomId);
  if (!room) return;

  const targetSocket =
    session.currentPlayer === "Cool" ? room.sockets.cool : room.sockets.hot;
  if (!targetSocket) {
    // 対象プレイヤーが接続していない = 即負け
    const forfeited = forfeitMatch(roomId, session.currentPlayer, "disconnect");
    if (!("error" in forfeited)) {
      broadcast(roomId, {
        type: "stateUpdate",
        roomId,
        state: forfeited.session.state,
      });
      broadcastGameEnd(roomId, forfeited.session.state.status);
    }
    return;
  }

  sendMessage(targetSocket, {
    type: "turnStart",
    roomId,
    playerId: session.currentPlayer,
    view,
  });

  clearTurnTimer(roomId);
  const expectedTurn = session.state.turn;
  const expectedPlayer = session.currentPlayer;
  const timeoutMs = hasActedOnce(roomId, expectedPlayer)
    ? TURN_TIMEOUT_MS
    : TURN_TIMEOUT_FIRST_MS;
  turnTimers.set(
    roomId,
    setTimeout(() => {
      const current = getMatchSession(roomId);
      if (!current || !current.started) return;
      if (current.state.status !== "running") return;
      if (current.state.turn !== expectedTurn) return;
      if (current.currentPlayer !== expectedPlayer) return;

      const forfeited = forfeitMatch(roomId, expectedPlayer, "timeout");
      if ("error" in forfeited) return;
      broadcast(roomId, {
        type: "stateUpdate",
        roomId,
        state: forfeited.session.state,
      });
      broadcastGameEnd(roomId, forfeited.session.state.status);
    }, timeoutMs),
  );
}

function broadcastGameEnd(roomId: string, status: GameStatus): void {
  clearTurnTimer(roomId);
  const winner: PlayerId | "draw" | null =
    status === "winCool"
      ? "Cool"
      : status === "winHot"
        ? "Hot"
        : status === "draw"
          ? "draw"
          : null;
  const session = getMatchSession(roomId);
  const replayId = session?.replayId ?? null;
  const latestGameEnd = getLatestGameEndEvent(roomId);
  const replayAvailableAt =
    session?.mode === "public" && replayId
      ? getReplayAvailableAt(new Date())
      : undefined;

  broadcast(roomId, {
    type: "gameEnd",
    roomId,
    status,
    winner,
    replayId: session?.mode === "public" ? (replayId ?? undefined) : undefined,
    replayAvailableAt,
    endReason: latestGameEnd?.reason,
    endPoint: latestGameEnd?.point ?? null,
    endTurnIndex: latestGameEnd?.turnIndex,
  });

  if (session?.mode === "practice") {
    return;
  }

  // Ensure replay persistence even if sockets disappear soon after.
  void waitForReplaySave(roomId).then(() =>
    updateTournamentGameResultForRoom(roomId, status, replayId),
  );
}

async function updateTournamentGameResultForRoom(
  roomId: string,
  status: GameStatus,
  replayId: string | null,
): Promise<void> {
  // tournament/admin 以外の room では games テーブルの対応レコードが無いことがあるため best-effort.
  const result =
    status === "winCool"
      ? "cool"
      : status === "winHot"
        ? "hot"
        : status === "draw"
          ? "draw"
          : null;
  const gameStatus = status === "invalid" ? "invalid" : "valid";
  const invalidReason = status === "invalid" ? "serverError" : null;

  try {
    await dbReady;
    await db
      .updateTable("games")
      .set({
        result,
        replay_id: replayId,
        status: gameStatus,
        invalid_reason: invalidReason,
      })
      .where("room_id", "=", roomId)
      .where("status", "=", "valid")
      .execute();
  } catch (error) {
    console.warn("[wsServer] failed to update games result/replayId", {
      roomId,
      error,
    });
  }
}

function broadcastActionLog(
  roomId: string,
  playerId: PlayerId,
  meta?: ActionMeta,
): void {
  const session = getMatchSession(roomId);
  const lastEntry = session?.replayLog.at(-1);
  if (!session || !lastEntry) return;

  broadcast(roomId, {
    type: "actionLog",
    roomId,
    turn: lastEntry.turn,
    actionCool: lastEntry.actionCool,
    actionHot: lastEntry.actionHot,
    metaCool: playerId === "Cool" ? meta : undefined,
    metaHot: playerId === "Hot" ? meta : undefined,
  });
}

function ensureRoom(
  roomId: string,
  ownerId: string | null,
  mode: RoomMode,
): RoomState {
  const existing = rooms.get(roomId);
  const session = getMatchSession(roomId);

  if (existing) {
    if (!existing.slots) {
      existing.slots = { Cool: null, Hot: null };
    }
    if (session && !session.ownerId && ownerId) {
      session.ownerId = ownerId;
    }
    if (session) {
      existing.started = session.started;
    }
    if (session?.ownerId && !existing.participants.has(session.ownerId)) {
      existing.participants.set(session.ownerId, {
        userId: session.ownerId,
        role: "owner",
        slot: null,
        botId: null,
      });
    }
    scheduleRoomAutoClose(roomId);
    return existing;
  }

  const created = createMatchSession(roomId, undefined, ownerId ?? null, mode);
  const state: RoomState = {
    sockets: {
      spectators: new Set<ServerWebSocket<SocketData>>(),
    },
    participants: new Map<string, ParticipantSnapshot>(),
    slots: { Cool: null, Hot: null },
    started: created.started,
  };

  if (created.ownerId) {
    state.participants.set(created.ownerId, {
      userId: created.ownerId,
      role: "owner",
      slot: null,
      botId: null,
    });
  }

  rooms.set(roomId, state);
  scheduleRoomAutoClose(roomId);
  return state;
}

async function ensureMatchSessionForRoom(
  roomId: string,
  fallbackOwnerId: string,
  mode: RoomMode,
): Promise<void> {
  const session = getMatchSession(roomId);
  const tournamentConfig = await resolveTournamentConfigForRoom(roomId);
  if (!session) {
    createMatchSession(
      roomId,
      undefined,
      tournamentConfig?.ownerId ?? fallbackOwnerId,
      mode,
    );
    scheduleRoomAutoClose(roomId);
    if (tournamentConfig?.mapId) {
      const updated = await setMatchSessionMap(roomId, tournamentConfig.mapId);
      if ("error" in updated) {
        console.warn("[wsServer] failed to apply tournament mapId", {
          roomId,
          mapId: tournamentConfig.mapId,
          error: updated.error,
        });
      }
    }
    return;
  }
  if (!session.ownerId) {
    session.ownerId = tournamentConfig?.ownerId ?? fallbackOwnerId;
  }
  if (
    !session.started &&
    tournamentConfig?.mapId &&
    session.mapId !== tournamentConfig.mapId
  ) {
    const updated = await setMatchSessionMap(roomId, tournamentConfig.mapId);
    if ("error" in updated) {
      console.warn("[wsServer] failed to sync tournament mapId", {
        roomId,
        mapId: tournamentConfig.mapId,
        error: updated.error,
      });
    }
  }
}

function normalizeRoomMode(value: unknown): RoomMode {
  return value === "practice" ? "practice" : "public";
}

async function resolveTournamentConfigForRoom(
  roomId: string,
): Promise<{ ownerId: string; mapId: string } | null> {
  // 大会管理 UI 経由の roomId は UUID なので、それ以外では DB lookup を避ける
  // （unit test のような短い roomId で毎回 DB を引かない）
  if (!isTournamentRoomId(roomId)) return null;

  try {
    await dbReady;
    const row = await db
      .selectFrom("games")
      .innerJoin("matchups", "matchups.id", "games.matchup_id")
      .innerJoin("tournaments", "tournaments.id", "matchups.tournament_id")
      .select(["tournaments.owner_id as owner_id", "games.map_id as map_id"])
      .where("games.room_id", "=", roomId)
      .where("games.status", "=", "valid")
      .executeTakeFirst();
    if (!row?.owner_id || !row?.map_id) return null;
    return { ownerId: row.owner_id, mapId: row.map_id };
  } catch {
    return null;
  }
}

function broadcast(roomId: string, message: ServerMessage): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const targets: ServerWebSocket<SocketData>[] = [];
  if (room.sockets.cool) targets.push(room.sockets.cool);
  if (room.sockets.hot) targets.push(room.sockets.hot);
  for (const ws of room.sockets.spectators) {
    targets.push(ws);
  }

  const payload = JSON.stringify(message);
  for (const ws of targets) {
    try {
      ws.send(payload);
    } catch {
      // ignore individual socket errors
    }
  }
}

function cleanupSocket(socket: ServerWebSocket<SocketData>): void {
  const meta = socketRooms.get(socket);
  if (!meta) return;

  const room = rooms.get(meta.roomId);
  if (!room) return;

  const disconnectedSlot: PlayerId | null =
    room.sockets.cool === socket
      ? "Cool"
      : room.sockets.hot === socket
        ? "Hot"
        : null;
  const slotFromMeta: PlayerId | null = meta.slot ?? null;
  const effectiveDisconnectedSlot: PlayerId | null =
    disconnectedSlot ?? slotFromMeta;

  const hasRemainingConnectionForUser = (userId: string): boolean => {
    if (room.sockets.cool?.data.userId === userId) return true;
    if (room.sockets.hot?.data.userId === userId) return true;
    for (const ws of room.sockets.spectators) {
      if (ws.data.userId === userId) return true;
    }
    return false;
  };

  if (room.sockets.cool === socket) {
    room.sockets.cool = undefined;
  } else if (room.sockets.hot === socket) {
    room.sockets.hot = undefined;
  } else {
    room.sockets.spectators.delete(socket);
  }

  const participant = room.participants.get(meta.userId);
  // Room は Stop を持たない: player socket の切断は即負け + 離席扱い。
  // NOTE: 同一ユーザーが viewer socket + player socket を持つため、切断順によっては
  // room.sockets.{cool,hot} の参照が先に外れ disconnectedSlot を特定できないことがある。
  // その場合でも socketRooms の slot 情報で即負けに寄せる。
  if (effectiveDisconnectedSlot) {
    clearSlot(meta.roomId, effectiveDisconnectedSlot, meta.userId);
    if (participant) {
      const nextRole: ParticipantRole =
        participant.role === "owner" ? "owner" : "spectator";
      room.participants.set(meta.userId, {
        ...participant,
        role: nextRole,
        slot: null,
        botId: null,
      });
    }
    broadcastParticipants(meta.roomId);

    const session = getMatchSession(meta.roomId);
    if (session?.started && session.state.status === "running") {
      const forfeited = forfeitMatch(
        meta.roomId,
        effectiveDisconnectedSlot,
        "disconnect",
      );
      if (!("error" in forfeited)) {
        broadcast(meta.roomId, {
          type: "stateUpdate",
          roomId: meta.roomId,
          state: forfeited.session.state,
        });
        broadcastGameEnd(meta.roomId, forfeited.session.state.status);
      }
    }
  } else if (!hasRemainingConnectionForUser(meta.userId)) {
    // NOTE: Page (viewer) socket と Bot (player) socket がほぼ同時に切断されると、
    // 先に viewer 側の cleanup が走って slot socket binding が外れ、
    // disconnectedSlot 判定できずに「即負け」処理が抜けることがある。
    // 最終的に user の接続が全て無くなった時点で slot を占有しているなら、ここでも即負けに寄せる。
    const session = getMatchSession(meta.roomId);
    if (session?.started && session.state.status === "running") {
      const occupied = occupiedSlotsForUser(room, meta.userId);
      const unique = Array.from(new Set(occupied));
      if (unique.length === 1) {
        const forfeited = forfeitMatch(meta.roomId, unique[0], "disconnect");
        if (!("error" in forfeited)) {
          broadcast(meta.roomId, {
            type: "stateUpdate",
            roomId: meta.roomId,
            state: forfeited.session.state,
          });
          broadcastGameEnd(meta.roomId, forfeited.session.state.status);
        }
      } else if (unique.length >= 2) {
        // practice は同一ユーザーが両スロットに入れるので切断時に draw に寄せる。
        // public では起こらない想定だが、切断順の競合時は currentPlayer を負けとして収束させる。
        if (session.mode === "practice") {
          clearTurnTimer(meta.roomId);
          const ended = endMatch(meta.roomId, "draw");
          if (!("error" in ended)) {
            broadcast(meta.roomId, {
              type: "stateUpdate",
              roomId: meta.roomId,
              state: ended.session.state,
            });
            broadcastGameEnd(meta.roomId, ended.session.state.status);
          }
        } else {
          const loser = unique.includes(session.currentPlayer)
            ? session.currentPlayer
            : unique[0];
          const forfeited = forfeitMatch(meta.roomId, loser, "disconnect");
          if (!("error" in forfeited)) {
            broadcast(meta.roomId, {
              type: "stateUpdate",
              roomId: meta.roomId,
              state: forfeited.session.state,
            });
            broadcastGameEnd(meta.roomId, forfeited.session.state.status);
          }
        }
      }
    }

    // 観戦者が完全に離れた場合は participants を掃除する
    for (const slot of occupiedSlotsForUser(room, meta.userId)) {
      clearSlot(meta.roomId, slot, meta.userId);
    }
    if (participant) {
      const nextRole: ParticipantRole =
        participant.role === "owner" ? "owner" : "spectator";
      room.participants.set(meta.userId, {
        ...participant,
        role: nextRole,
        slot: null,
        botId: null,
      });
    }
    broadcastParticipants(meta.roomId);
  }

  socketRooms.delete(socket);

  if (
    !room.sockets.cool &&
    !room.sockets.hot &&
    room.sockets.spectators.size === 0
  ) {
    deleteMatchSession(meta.roomId);
    rooms.delete(meta.roomId);
    clearTurnTimer(meta.roomId);
    clearRoomAutoCloseTimer(meta.roomId);
  }
}

function parseClientMessage(data: unknown): ClientMessage | null {
  const text = normalizeData(data);
  if (!text) return null;
  try {
    return JSON.parse(text) as ClientMessage;
  } catch {
    return null;
  }
}

function normalizeData(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  return null;
}

function sendMessage(
  socket: ServerWebSocket<SocketData>,
  message: ServerMessage,
): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // ignore send errors
  }
}

function sendError(socket: ServerWebSocket<SocketData>, message: string): void {
  sendMessage(socket, { type: "error", message });
}
