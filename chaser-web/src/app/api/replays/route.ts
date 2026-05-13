import { sql } from "kysely";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import type { ReplaysTable } from "@/db/types";

interface ReplaySummary {
  id: string;
  roomId: string;
  createdAt: string;
  winner: ReplaysTable["winner"];
  entryCount: number;
  coolBotName: string;
  hotBotName: string;
}

export async function GET(_req: NextRequest) {
  await dbReady;
  const rows = await db
    .selectFrom("replays")
    .select([
      "id",
      "room_id",
      "created_at",
      "winner",
      "log",
      "cool_bot_name",
      "hot_bot_name",
    ])
    // Hide very recent replays to avoid early spoilers.
    .where(
      sql<string>`datetime(created_at)`,
      "<=",
      sql<string>`datetime('now', '-3 minutes')`,
    )
    .orderBy("created_at", "desc")
    .limit(50)
    .execute();

  const data: ReplaySummary[] = rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    createdAt: row.created_at,
    winner: row.winner,
    entryCount: safeCountLog(row.log),
    coolBotName: row.cool_bot_name ?? "",
    hotBotName: row.hot_bot_name ?? "",
  }));

  return NextResponse.json({ items: data });
}

function safeCountLog(log: string): number {
  try {
    const parsed = JSON.parse(log);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
