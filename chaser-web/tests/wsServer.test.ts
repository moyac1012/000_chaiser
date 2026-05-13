import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { Action, PlayerId } from "../src/core/engine";
import { getMatchSession } from "../src/core/match/session";
import type { ServerMessage } from "../src/core/match/wsTypes";
import { createDb, db, setDbForTests } from "../src/db/client";
import { ensureSchema } from "../src/db/schema";
import { seed } from "../src/db/seed";

let wsServer: typeof import("../server/wsServer").wsServer;
let WS_BASE_URL = "";
let HTTP_BASE_URL = "";
const DEFAULT_TIMEOUT_MS = 2000;
const TEST_DB_PATH = "chaser-ws-test.sqlite";
const TEST_CLERK_SECRET = "test-clerk-secret";

type JoinIntent = "spectator" | "player";

interface WsClient {
  ws: WebSocket;
  messages: ServerMessage[];
  waitForMessage<T extends ServerMessage>(
    predicate: (msg: ServerMessage) => msg is T,
    timeoutMs?: number,
  ): Promise<T>;
}

interface RoomListResponse {
  rooms: Array<{
    roomId: string;
    mode: "public" | "practice";
  }>;
}

function parseServerMessage(data: unknown): ServerMessage {
  if (typeof data === "string") return JSON.parse(data) as ServerMessage;
  if (data instanceof ArrayBuffer)
    return JSON.parse(new TextDecoder().decode(data)) as ServerMessage;
  return JSON.parse(String(data)) as ServerMessage;
}

function createClient(roomId: string, userId: string): WsClient {
  const ws = new WebSocket(
    `${WS_BASE_URL}?roomId=${roomId}&userId=${encodeURIComponent(userId)}`,
  );
  const messages: ServerMessage[] = [];
  const listeners: Array<(msg: ServerMessage) => void> = [];

  ws.onmessage = (event) => {
    const parsed = parseServerMessage(event.data);
    messages.push(parsed);
    // copy listeners to avoid mutation during iteration
    for (const listener of [...listeners]) {
      listener(parsed);
    }
  };

  return {
    ws,
    messages,
    waitForMessage<T extends ServerMessage>(
      predicate: (msg: ServerMessage) => msg is T,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<T> {
      for (const existing of messages) {
        if (predicate(existing)) return Promise.resolve(existing);
      }

      return new Promise<T>((resolve, reject) => {
        let settled = false;

        const handler = (msg: ServerMessage) => {
          if (!predicate(msg) || settled) return;
          settled = true;
          clearTimeout(timer);
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          resolve(msg);
        };

        const timer = setTimeout(() => {
          if (settled) return;
          const idx = listeners.indexOf(handler);
          if (idx >= 0) listeners.splice(idx, 1);
          reject(new Error("Timed out waiting for WebSocket message"));
        }, timeoutMs);

        listeners.push(handler);
      });
    },
  };
}

async function waitForOpen(
  ws: WebSocket,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out opening WebSocket")),
      timeoutMs,
    );
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket encountered an error while opening"));
    });
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(20);
  }
  throw new Error("Timed out waiting for condition");
}

async function initRoom(
  roomId: string,
  ownerId: string,
  mode: "public" | "practice" = "public",
): Promise<void> {
  const signature = createHmac("sha256", TEST_CLERK_SECRET)
    .update(`${roomId}.${ownerId}.${mode}`)
    .digest("hex");
  const response = await fetch(`${HTTP_BASE_URL}/api/rooms/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomId,
      ownerId,
      mode,
      signature,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to init room: ${response.status}`);
  }
}

async function fetchRooms(): Promise<RoomListResponse> {
  const response = await fetch(`${HTTP_BASE_URL}/api/rooms`);
  if (!response.ok) {
    throw new Error(`Failed to fetch rooms: ${response.status}`);
  }
  return (await response.json()) as RoomListResponse;
}

function sendJoin(
  ws: WebSocket,
  roomId: string,
  intent: JoinIntent,
  slot?: PlayerId,
  botId?: number,
): void {
  ws.send(
    JSON.stringify({
      type: "join",
      roomId,
      intent,
      slot,
      botId,
    }),
  );
}

function sendAction(
  ws: WebSocket,
  roomId: string,
  playerId: PlayerId,
  action: Action,
): void {
  ws.send(
    JSON.stringify({
      type: "action",
      roomId,
      playerId,
      action,
    }),
  );
}

function sendStart(ws: WebSocket, roomId: string): void {
  ws.send(
    JSON.stringify({
      type: "start",
      roomId,
    }),
  );
}

function closeClients(...clients: WsClient[]): void {
  for (const client of clients) {
    if (
      client.ws.readyState === WebSocket.CLOSED ||
      client.ws.readyState === WebSocket.CLOSING
    )
      continue;
    client.ws.close();
  }
}

function isJoined(
  msg: ServerMessage,
): msg is Extract<ServerMessage, { type: "joined" }> {
  return msg.type === "joined";
}

function isTurnStart(
  msg: ServerMessage,
): msg is Extract<ServerMessage, { type: "turnStart" }> {
  return msg.type === "turnStart";
}

function isStateUpdate(
  msg: ServerMessage,
): msg is Extract<ServerMessage, { type: "stateUpdate" }> {
  return msg.type === "stateUpdate";
}

function isStateUpdateAfterAction(
  msg: ServerMessage,
): msg is Extract<ServerMessage, { type: "stateUpdate" }> {
  return msg.type === "stateUpdate" && msg.state.turn > 0;
}

function createRoomId(suffix: string): string {
  return `ws-test-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const botIdsByUser = new Map<string, number>();

async function ensureBotForUser(userId: string): Promise<number> {
  const existing = botIdsByUser.get(userId);
  if (existing) return existing;
  const inserted = await db
    .insertInto("user_bots")
    .values({
      user_id: userId,
      owner_id: userId,
      name: `Test Bot ${userId}`,
      language: "js",
      code: "function onTurn(api) { api.walkRight() }",
      blockly_xml: "",
    })
    .returning("id")
    .executeTakeFirst();
  if (!inserted) {
    throw new Error("Failed to create test bot");
  }
  botIdsByUser.set(userId, inserted.id);
  return inserted.id;
}

describe("wsServer WebSocket flow", () => {
  beforeAll(async () => {
    const dbInstance = createDb(TEST_DB_PATH);
    await ensureSchema(dbInstance);
    await seed(dbInstance);
    setDbForTests(dbInstance);
    process.env.CLERK_SECRET_KEY = TEST_CLERK_SECRET;
    process.env.WS_SERVER_PORT = "0";
    const mod = await import("../server/wsServer");
    wsServer = mod.wsServer;
    WS_BASE_URL = `ws://localhost:${wsServer.port}/ws/match`;
    HTTP_BASE_URL = `http://localhost:${wsServer.port}`;
  });

  afterAll(async () => {
    wsServer.stop(true);
    await Bun.file(TEST_DB_PATH)
      .delete()
      .catch(() => {});
  });

  test("Scenario A: spectator is not assigned as player", async () => {
    const roomId = createRoomId("scenario-a");
    await initRoom(roomId, "owner-a-viewer");
    const ownerViewer = createClient(roomId, "owner-a-viewer");
    const cool = createClient(roomId, "player-a-cool");
    const spectator = createClient(roomId, "spectator-a");
    const hot = createClient(roomId, "player-a-hot");
    const coolBotId = await ensureBotForUser("player-a-cool");
    const hotBotId = await ensureBotForUser("player-a-hot");

    await waitForOpen(ownerViewer.ws);
    sendJoin(ownerViewer.ws, roomId, "spectator");
    const joinedOwner = await ownerViewer.waitForMessage(isJoined);
    expect(joinedOwner.you.role).toBe("owner");

    await waitForOpen(cool.ws);
    sendJoin(cool.ws, roomId, "player", "Cool", coolBotId);
    const joinedCool = await cool.waitForMessage(isJoined);
    expect(joinedCool.you.slot).toBe("Cool");

    await waitForOpen(spectator.ws);
    sendJoin(spectator.ws, roomId, "spectator");
    const joinedSpectator = await spectator.waitForMessage(isJoined);
    expect(joinedSpectator.you.role).toBe("spectator");
    expect(joinedSpectator.you.slot).toBeNull();

    await waitForOpen(hot.ws);
    sendJoin(hot.ws, roomId, "player", "Hot", hotBotId);
    const joinedHot = await hot.waitForMessage(isJoined);
    expect(joinedHot.you.slot).toBe("Hot");

    closeClients(ownerViewer, cool, spectator, hot);
  });

  test("Scenario B: turnStart is delivered once two players join", async () => {
    const roomId = createRoomId("scenario-b");
    await initRoom(roomId, "owner-b-viewer");
    const ownerViewer = createClient(roomId, "owner-b-viewer");
    const cool = createClient(roomId, "player-b-cool");
    const hot = createClient(roomId, "player-b-hot");
    const coolBotId = await ensureBotForUser("player-b-cool");
    const hotBotId = await ensureBotForUser("player-b-hot");

    await waitForOpen(ownerViewer.ws);
    sendJoin(ownerViewer.ws, roomId, "spectator");
    await ownerViewer.waitForMessage(isJoined);

    await waitForOpen(cool.ws);
    sendJoin(cool.ws, roomId, "player", "Cool", coolBotId);
    await cool.waitForMessage(isJoined);

    await waitForOpen(hot.ws);
    sendJoin(hot.ws, roomId, "player", "Hot", hotBotId);
    await hot.waitForMessage(isJoined);

    sendStart(ownerViewer.ws, roomId);

    const turnStart = await Promise.race([
      cool.waitForMessage(isTurnStart),
      hot.waitForMessage(isTurnStart),
    ]);

    expect(turnStart.roomId).toBe(roomId);
    expect(turnStart.playerId === "Cool" || turnStart.playerId === "Hot").toBe(
      true,
    );

    closeClients(ownerViewer, cool, hot);
  });

  test("Scenario C: stateUpdate is broadcast after action", async () => {
    const roomId = createRoomId("scenario-c");
    await initRoom(roomId, "owner-c-viewer");
    const ownerViewer = createClient(roomId, "owner-c-viewer");
    const cool = createClient(roomId, "player-c-cool");
    const hot = createClient(roomId, "player-c-hot");
    const coolBotId = await ensureBotForUser("player-c-cool");
    const hotBotId = await ensureBotForUser("player-c-hot");

    await waitForOpen(ownerViewer.ws);
    sendJoin(ownerViewer.ws, roomId, "spectator");
    await ownerViewer.waitForMessage(isJoined);

    await waitForOpen(cool.ws);
    sendJoin(cool.ws, roomId, "player", "Cool", coolBotId);
    await cool.waitForMessage(isJoined);

    await waitForOpen(hot.ws);
    sendJoin(hot.ws, roomId, "player", "Hot", hotBotId);
    await hot.waitForMessage(isJoined);

    sendStart(ownerViewer.ws, roomId);
    await cool.waitForMessage(isTurnStart);

    sendAction(cool.ws, roomId, "Cool", { kind: "look", dir: "Right" });

    const updateForHot = await hot.waitForMessage(isStateUpdateAfterAction);
    expect(updateForHot.roomId).toBe(roomId);
    expect(updateForHot.state.turn).toBeGreaterThan(0);

    closeClients(ownerViewer, cool, hot);
  });

  test("Scenario D: messages do not leak between roomIds", async () => {
    const roomA = createRoomId("room-a");
    const roomB = createRoomId("room-b");
    await initRoom(roomA, "owner-a-viewer");
    await initRoom(roomB, "owner-b-viewer");

    const aOwner = createClient(roomA, "owner-a-viewer");
    const a1 = createClient(roomA, "player-a-cool");
    const a2 = createClient(roomA, "player-a-hot");
    const bOwner = createClient(roomB, "owner-b-viewer");
    const b1 = createClient(roomB, "player-b-cool");
    const b2 = createClient(roomB, "player-b-hot");
    const aCoolBotId = await ensureBotForUser("player-a-cool");
    const aHotBotId = await ensureBotForUser("player-a-hot");
    const bCoolBotId = await ensureBotForUser("player-b-cool");
    const bHotBotId = await ensureBotForUser("player-b-hot");

    await waitForOpen(aOwner.ws);
    sendJoin(aOwner.ws, roomA, "spectator");
    await aOwner.waitForMessage(isJoined);

    await waitForOpen(a2.ws);
    sendJoin(a2.ws, roomA, "player", "Hot", aHotBotId);
    await a2.waitForMessage(isJoined);

    await waitForOpen(a1.ws);
    sendJoin(a1.ws, roomA, "player", "Cool", aCoolBotId);
    await a1.waitForMessage(isJoined);

    await waitForOpen(bOwner.ws);
    sendJoin(bOwner.ws, roomB, "spectator");
    await bOwner.waitForMessage(isJoined);

    await waitForOpen(b2.ws);
    sendJoin(b2.ws, roomB, "player", "Hot", bHotBotId);
    await b2.waitForMessage(isJoined);

    await waitForOpen(b1.ws);
    sendJoin(b1.ws, roomB, "player", "Cool", bCoolBotId);
    await b1.waitForMessage(isJoined);

    sendStart(bOwner.ws, roomB);
    await b1.waitForMessage(isTurnStart);
    sendStart(aOwner.ws, roomA);

    sendAction(b1.ws, roomB, "Cool", { kind: "look", dir: "Right" });
    await b2.waitForMessage(isStateUpdate);

    const a1HasForeign = a1.messages.some((msg) => msg.roomId === roomB);
    const a2HasForeign = a2.messages.some((msg) => msg.roomId === roomB);

    expect(a1HasForeign || a2HasForeign).toBe(false);

    closeClients(aOwner, a1, a2, bOwner, b1, b2);
  });

  test("cleans up session after the last socket disconnects", async () => {
    const roomId = createRoomId("cleanup");
    await initRoom(roomId, "owner-cleanup-viewer");
    const ownerViewer = createClient(roomId, "owner-cleanup-viewer");
    const cool = createClient(roomId, "player-cleanup-cool");
    const hot = createClient(roomId, "player-cleanup-hot");
    const coolBotId = await ensureBotForUser("player-cleanup-cool");
    const hotBotId = await ensureBotForUser("player-cleanup-hot");

    await waitForOpen(ownerViewer.ws);
    sendJoin(ownerViewer.ws, roomId, "spectator");
    await ownerViewer.waitForMessage(isJoined);

    await waitForOpen(cool.ws);
    sendJoin(cool.ws, roomId, "player", "Cool", coolBotId);
    await cool.waitForMessage(isJoined);

    await waitForOpen(hot.ws);
    sendJoin(hot.ws, roomId, "player", "Hot", hotBotId);
    await hot.waitForMessage(isJoined);

    expect(getMatchSession(roomId)).toBeTruthy();

    closeClients(ownerViewer, cool, hot);

    await waitForCondition(() => !getMatchSession(roomId));
    expect(getMatchSession(roomId)).toBeUndefined();
  });

  test("spectator join does not claim owner before signed init", async () => {
    const roomId = createRoomId("owner-claim");
    const spectator = createClient(roomId, "spectator-owner-claim");

    await waitForOpen(spectator.ws);
    sendJoin(spectator.ws, roomId, "spectator");
    const joined = await spectator.waitForMessage(isJoined);

    expect(joined.you.role).toBe("spectator");
    expect(joined.ownerId).toBeNull();

    closeClients(spectator);
  });

  test("first player join claims owner when room was not pre-initialized", async () => {
    const roomId = createRoomId("player-owner-claim");
    const ownerPlayer = createClient(roomId, "owner-player-claim");
    const hotPlayer = createClient(roomId, "hot-player-claim");
    const coolBotId = await ensureBotForUser("owner-player-claim");
    const hotBotId = await ensureBotForUser("hot-player-claim");

    await waitForOpen(ownerPlayer.ws);
    sendJoin(ownerPlayer.ws, roomId, "player", "Cool", coolBotId);
    const ownerJoined = await ownerPlayer.waitForMessage(isJoined);

    expect(ownerJoined.you.role).toBe("owner");
    expect(ownerJoined.ownerId).toBe("owner-player-claim");

    await waitForOpen(hotPlayer.ws);
    sendJoin(hotPlayer.ws, roomId, "player", "Hot", hotBotId);
    await hotPlayer.waitForMessage(isJoined);

    sendStart(ownerPlayer.ws, roomId);
    const turnStart = await ownerPlayer.waitForMessage(isTurnStart);

    expect(turnStart.playerId).toBe("Cool");
    expect(getMatchSession(roomId)?.ownerId).toBe("owner-player-claim");

    closeClients(ownerPlayer, hotPlayer);
  });

  test("room list excludes practice rooms from the public index", async () => {
    const publicRoomId = createRoomId("public-list");
    const practiceRoomId = createRoomId("practice-list");

    await initRoom(publicRoomId, "owner-public-list", "public");
    await initRoom(practiceRoomId, "owner-practice-list", "practice");

    const body = await fetchRooms();

    expect(body.rooms.some((room) => room.roomId === publicRoomId)).toBe(true);
    expect(body.rooms.some((room) => room.roomId === practiceRoomId)).toBe(
      false,
    );
  });
});
