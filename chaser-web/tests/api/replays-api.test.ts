import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Insertable } from "kysely";
import { NextRequest } from "next/server";

import { DEFAULT_MAP_ID } from "@/core/map";
import { createDb, setDbForTests } from "@/db/client";
import { ensureSchema } from "@/db/schema";
import { seed } from "@/db/seed";
import type { ReplaysTable } from "@/db/types";

const TEST_DB_PATH = "replays-api-test.sqlite";

describe("/api/replays", () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb(TEST_DB_PATH);
    await ensureSchema(db);
    await seed(db);
    setDbForTests(db);
  });

  beforeEach(async () => {
    await db.deleteFrom("replays").execute();
  });

  afterAll(async () => {
    await Bun.file(TEST_DB_PATH)
      .delete()
      .catch(() => {});
  });

  test("returns empty list when no replays", async () => {
    const { GET } = await import("@/app/api/replays/route");
    const res = await GET(new NextRequest("http://localhost/api/replays"));
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  test("returns sorted replay summaries with entry counts", async () => {
    const now = Date.now();
    const delayMs = 3 * 60 * 1000 + 5_000;
    const toSqliteDatetime = (value: Date) =>
      value.toISOString().replace("T", " ").replace("Z", "");
    const rows: Array<Insertable<ReplaysTable>> = [
      {
        id: "r2",
        room_id: "room-b",
        map_id: DEFAULT_MAP_ID,
        winner: "Hot",
        log: JSON.stringify([{ turn: 1 }, { turn: 2 }]),
        created_at: toSqliteDatetime(new Date(now - delayMs - 1_000)),
      },
      {
        id: "r1",
        room_id: "room-a",
        map_id: DEFAULT_MAP_ID,
        winner: "Cool",
        log: JSON.stringify([{ turn: 1 }]),
        created_at: toSqliteDatetime(new Date(now - delayMs)),
      },
      {
        id: "r3",
        room_id: "room-c",
        map_id: DEFAULT_MAP_ID,
        winner: "draw",
        log: JSON.stringify([{ turn: 1 }, { turn: 2 }, { turn: 3 }]),
        created_at: toSqliteDatetime(new Date(now)),
      },
    ];

    await db.insertInto("replays").values(rows).execute();

    const { GET } = await import("@/app/api/replays/route");
    const res = await GET(new NextRequest("http://localhost/api/replays"));
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        roomId: string;
        winner: string | null;
        entryCount: number;
        createdAt: string;
      }>;
    };

    expect(body.items.length).toBe(2);
    expect(body.items[0].id).toBe("r1");
    expect(body.items[1].id).toBe("r2");
    expect(body.items[0]).toMatchObject({
      roomId: "room-a",
      winner: "Cool",
      entryCount: 1,
    });
    expect(body.items[1]).toMatchObject({
      roomId: "room-b",
      winner: "Hot",
      entryCount: 2,
    });
  });

  test("hides replay detail until the spoiler window passes", async () => {
    const now = Date.now();
    const toSqliteDatetime = (value: Date) =>
      value.toISOString().replace("T", " ").replace("Z", "");

    await db
      .insertInto("replays")
      .values({
        id: "recent-replay",
        room_id: "room-recent",
        map_id: DEFAULT_MAP_ID,
        winner: "Cool",
        log: JSON.stringify([{ turn: 1 }]),
        events_json: JSON.stringify([]),
        created_at: toSqliteDatetime(new Date(now)),
      })
      .execute();

    const { GET } = await import("@/app/api/replays/[id]/route");
    const res = await GET(
      new NextRequest("http://localhost/api/replays/recent-replay"),
      {
        params: Promise.resolve({ id: "recent-replay" }),
      },
    );

    expect(res.status).toBe(404);
  });

  test("returns replay detail after the spoiler window passes", async () => {
    const now = Date.now();
    const delayMs = 3 * 60 * 1000 + 5_000;
    const toSqliteDatetime = (value: Date) =>
      value.toISOString().replace("T", " ").replace("Z", "");

    await db
      .insertInto("replays")
      .values({
        id: "visible-replay",
        room_id: "room-visible",
        map_id: DEFAULT_MAP_ID,
        winner: "Hot",
        log: JSON.stringify([{ turn: 1 }]),
        events_json: JSON.stringify([{ type: "gameEnd", winner: "hot" }]),
        created_at: toSqliteDatetime(new Date(now - delayMs)),
      })
      .execute();

    const { GET } = await import("@/app/api/replays/[id]/route");
    const res = await GET(
      new NextRequest("http://localhost/api/replays/visible-replay"),
      {
        params: Promise.resolve({ id: "visible-replay" }),
      },
    );
    const body = (await res.json()) as {
      id: string;
      roomId: string;
      winner: string;
    };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: "visible-replay",
      roomId: "room-visible",
      winner: "Hot",
    });
  });
});
