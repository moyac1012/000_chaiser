import { NextResponse } from "next/server";
import { db, dbReady } from "@/db/client";

type AgeReplayRequest = {
  roomId?: unknown;
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as AgeReplayRequest | null;
  const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ error: "invalid roomId" }, { status: 400 });
  }

  await dbReady;

  const replay = await db
    .selectFrom("replays")
    .select("id")
    .where("room_id", "=", roomId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  if (!replay?.id) {
    return NextResponse.json({ error: "replay not found" }, { status: 404 });
  }

  const visibleCreatedAt = new Date(Date.now() - 10 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  await db
    .updateTable("replays")
    .set({
      // E2E only: age the replay row to bypass spoiler delay without
      // changing production replay visibility rules.
      created_at: visibleCreatedAt as never,
    })
    .where("id", "=", replay.id)
    .execute();

  return NextResponse.json({ replayId: replay.id });
}
