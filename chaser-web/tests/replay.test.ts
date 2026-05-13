import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "kysely";
import { NextRequest } from "next/server";
import {
  buildReplayFacts,
  findActionEventForTurn,
  findGameEndEvent,
  findTurnEventForTurn,
} from "../src/app/replays/[id]/replayFacts";
import type { ReplayRecord } from "../src/core/match/replay";
import {
  createMatchSession,
  deleteMatchSession,
  getMatchSession,
  setMatchSessionMap,
  waitForReplaySave,
} from "../src/core/match/session";
import { createDb, setDbForTests } from "../src/db/client";
import { ensureSchema } from "../src/db/schema";
import { seed } from "../src/db/seed";

// 単体テスト用の分離 DB を使う（並行実行されても chaser.sqlite に影響しないようにする）
const TEST_DB_PATH = "chaser-test.sqlite";

describe("Replay logging", () => {
  beforeAll(async () => {
    const db = createDb(TEST_DB_PATH);
    await ensureSchema(db);
    await seed(db);
    setDbForTests(db);
  });

  afterAll(async () => {
    // best-effort cleanup: remove test db file
    await Bun.file(TEST_DB_PATH)
      .delete()
      .catch(() => {});
  });

  test("logs turns, winner, and can be fetched via API handler", async () => {
    const roomId = `replay-test-${Date.now()}`;
    const session = createMatchSession(roomId);

    const mapId = `test-map-walk-out-${Date.now()}`;
    const { db } = await import("../src/db/client");
    await db
      .insertInto("maps")
      .values({
        id: mapId,
        name: "Test Map (walk out)",
        width: 4,
        height: 4,
        max_turns: 100,
        cool_start_x: 2,
        cool_start_y: 2,
        hot_start_x: 3,
        hot_start_y: 2,
        map_data: JSON.stringify([
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        created_by: "test",
        is_official: 0,
      })
      .execute();

    const mapResult = await setMatchSessionMap(roomId, mapId);
    if ("error" in mapResult) {
      throw new Error(mapResult.error);
    }

    session.started = true; // simulate owner pressing start for test

    const { applyAction } = await import("../src/core/match/session");
    // Hot will eventually walk out of bounds on the left to lose.
    applyAction(roomId, "Cool", { kind: "look", dir: "Right" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Left" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Up" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Down" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" }); // crosses boundary -> Cool wins

    await waitForReplaySave(roomId);

    const row = await db
      .selectFrom("replays")
      .selectAll()
      .where("room_id", "=", roomId)
      .executeTakeFirst();

    expect(row).toBeTruthy();
    if (!row) return;

    expect(row.winner).toBe("Cool");

    const parsed = JSON.parse(row.log) as ReplayRecord["log"];
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    expect(parsed[0].turn).toBeGreaterThanOrEqual(1);

    const visibleCreatedAt = new Date(Date.now() - 3 * 60 * 1000 - 5_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    await db
      .updateTable("replays")
      .set({ created_at: sql`${visibleCreatedAt}` })
      .where("id", "=", row.id)
      .execute();

    // API handler should return the same payload
    const { GET } = await import("../src/app/api/replays/[id]/route");
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: row.id }),
    });
    const body = (await res.json()) as ReplayRecord;

    expect(body.id).toBe(row.id);
    expect(body.winner).toBe("Cool");
    expect(body.log.length).toBe(parsed.length);
    expect(body.events.length).toBeGreaterThan(0);
    const gameEnd = findGameEndEvent(body.events);
    expect(gameEnd?.winner).toBe("cool");
    expect(gameEnd?.reason).toBe("walkOutOfBounds");
    expect(gameEnd?.turnIndex).toBe(parsed.length - 1);

    deleteMatchSession(roomId);
  });

  test("stores ActionEvent/TurnEvent and they drive viewer text without inference", async () => {
    const roomId = `replay-events-test-${Date.now()}`;
    const session = createMatchSession(roomId);

    const mapId = `test-map-events-${Date.now()}`;
    const { db } = await import("../src/db/client");
    await db
      .insertInto("maps")
      .values({
        id: mapId,
        name: "Test Map (item + auto block)",
        width: 5,
        height: 5,
        max_turns: 100,
        cool_start_x: 1,
        cool_start_y: 1,
        hot_start_x: 4,
        hot_start_y: 4,
        map_data: JSON.stringify([
          [0, 0, 0, 0, 0],
          [0, 0, 3, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ]),
        created_by: "test",
        is_official: 0,
      })
      .execute();

    const mapResult = await setMatchSessionMap(roomId, mapId);
    if ("error" in mapResult) {
      throw new Error(mapResult.error);
    }

    session.started = true; // simulate owner pressing start for test

    const { applyAction } = await import("../src/core/match/session");
    // 1) Cool collects item -> auto block at previous cell
    applyAction(roomId, "Cool", { kind: "walk", dir: "Right" });
    // 2) Hot does a look (observation should be stored)
    applyAction(roomId, "Hot", { kind: "look", dir: "Up" });
    // 3) Cool tries to put onto the auto block -> noChange reason should be stored
    applyAction(roomId, "Cool", { kind: "put", dir: "Left" });
    // 4) Hot walks out of bounds -> game ends, replay persists
    applyAction(roomId, "Hot", { kind: "walk", dir: "Down" });

    await waitForReplaySave(roomId);

    const row = await db
      .selectFrom("replays")
      .selectAll()
      .where("room_id", "=", roomId)
      .executeTakeFirst();

    expect(row).toBeTruthy();
    if (!row) return;

    expect(row.events_json).toBeTruthy();

    const visibleCreatedAt = new Date(Date.now() - 3 * 60 * 1000 - 5_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    await db
      .updateTable("replays")
      .set({ created_at: sql`${visibleCreatedAt}` })
      .where("id", "=", row.id)
      .execute();

    const { GET } = await import("../src/app/api/replays/[id]/route");
    const res = await GET(new NextRequest("http://localhost"), {
      params: Promise.resolve({ id: row.id }),
    });
    const body = (await res.json()) as ReplayRecord;

    expect(body.events.length).toBeGreaterThanOrEqual(4);

    const itemTurn = findTurnEventForTurn(body.events, 0);
    expect(itemTurn?.flags?.itemPicked).toBe(true);
    expect(itemTurn?.flags?.autoBlockByItem).toBe(true);

    const putEvent = body.events.find(
      (e) =>
        e.type === "action" &&
        e.action.kind === "put" &&
        e.result === "noChange",
    );
    if (putEvent?.type !== "action")
      throw new Error("missing put action event");
    expect(putEvent?.noChangeReason).toBe("targetIsBlock");

    const lookEvent = body.events.find(
      (e) => e.type === "action" && e.action.kind === "look",
    );
    if (lookEvent?.type !== "action")
      throw new Error("missing look action event");
    expect(lookEvent.observation?.kind).toBe("look3x3");
    expect(lookEvent.observation?.tiles.length).toBe(9);

    // Viewer text uses stored events only (no inference)
    const putFacts = buildReplayFacts({
      actionEvent: putEvent,
      turnEvent: findTurnEventForTurn(body.events, putEvent.turnIndex),
    });
    expect(putFacts.noChangeReason).toContain("既にブロック");

    const itemFacts = buildReplayFacts({
      actionEvent: findActionEventForTurn(body.events, 0),
      turnEvent: itemTurn,
    });
    expect(itemFacts.itemCausality).toContain("アイテムを取得");
    expect(itemFacts.itemCausality).toContain("自動ブロック");

    const lookFacts = buildReplayFacts({
      actionEvent: lookEvent,
      turnEvent: findTurnEventForTurn(body.events, lookEvent.turnIndex),
    });
    expect(lookFacts.observation?.title).toContain("look");

    deleteMatchSession(roomId);
  });

  test("releases in-memory replay buffers after replay persistence", async () => {
    const roomId = `replay-release-test-${Date.now()}`;
    const session = createMatchSession(roomId);
    session.started = true;

    const { applyAction } = await import("../src/core/match/session");
    applyAction(roomId, "Cool", { kind: "look", dir: "Right" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Left" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Up" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });
    applyAction(roomId, "Cool", { kind: "look", dir: "Down" });
    applyAction(roomId, "Hot", { kind: "walk", dir: "Left" });

    await waitForReplaySave(roomId);

    const saved = getMatchSession(roomId);
    expect(saved).toBeTruthy();
    expect(saved?.replaySaved).toBe(true);
    expect(saved?.replayLog).toEqual([]);
    expect(saved?.replayEvents).toEqual([]);

    deleteMatchSession(roomId);
  });

  test("engine の内部不整合は無効試合として保存される", async () => {
    const roomId = `replay-invalid-test-${Date.now()}`;
    const session = createMatchSession(roomId);
    session.started = true;

    session.state.map[session.state.players.Cool.pos.y][
      session.state.players.Cool.pos.x + 1
    ] = 9 as never;

    const { applyAction } = await import("../src/core/match/session");
    const applied = applyAction(roomId, "Cool", { kind: "walk", dir: "Right" });
    if ("error" in applied) {
      throw new Error(applied.error);
    }

    expect(applied.session.state.status).toBe("invalid");
    expect(applied.result.state.status).toBe("invalid");

    await waitForReplaySave(roomId);

    const { db } = await import("../src/db/client");
    const row = await db
      .selectFrom("replays")
      .selectAll()
      .where("room_id", "=", roomId)
      .executeTakeFirst();

    expect(row).toBeTruthy();
    if (!row) return;

    expect(row.winner).toBeNull();

    const events = JSON.parse(
      row.events_json ?? "[]",
    ) as ReplayRecord["events"];
    const gameEnd = findGameEndEvent(events);
    expect(gameEnd?.winner).toBe("none");
    expect(gameEnd?.reason).toBe("serverError");

    deleteMatchSession(roomId);
  });
});
