import { NextResponse } from "next/server";
import type { ReplayRecord } from "@/core/match/replay";
import { parseReplayEventsJson } from "@/core/match/replayEvents";
import { isReplayVisible } from "@/core/match/replayVisibility";
import { db, dbReady } from "@/db/client";
import type { ReplayWinner } from "@/db/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  await dbReady;
  const record = await db
    .selectFrom("replays")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!record || !isReplayVisible(record.created_at)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body: ReplayRecord = mapRecord(record);
  return NextResponse.json(body);
}

type ReplayRow = {
  id: string;
  room_id: string;
  map_id: string;
  created_at: string;
  winner: ReplayWinner;
  log: string;
  events_json: string;
};

function mapRecord(row: ReplayRow): ReplayRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    mapId: row.map_id,
    createdAt: row.created_at,
    winner: row.winner,
    log: parseReplayLog(row.log),
    events: parseReplayEventsJson(row.events_json) ?? [],
  };
}

function parseReplayLog(log: string): ReplayRecord["log"] {
  try {
    const parsed = JSON.parse(log);
    return Array.isArray(parsed) ? (parsed as ReplayRecord["log"]) : [];
  } catch {
    return [];
  }
}
