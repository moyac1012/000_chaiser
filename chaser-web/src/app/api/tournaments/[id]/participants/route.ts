import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type AddParticipantRequest = {
  userId?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: tournamentId } = await params;
  if (!tournamentId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as AddParticipantRequest | null;
  const participantUserId =
    typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!participantUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await dbReady;
  const tournament = await db
    .selectFrom("tournaments")
    .select(["id", "owner_id"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();

  if (!tournament) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const canManage = await canManageTournament(userId, tournament.owner_id);
  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await db
      .insertInto("tournament_participants")
      .values({
        tournament_id: tournamentId,
        user_id: participantUserId,
      })
      .execute();
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json(
        { error: "already registered" },
        { status: 409 },
      );
    }
    throw error;
  }

  await db
    .deleteFrom("tournament_participant_requests")
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", participantUserId)
    .execute();

  return NextResponse.json(
    { tournamentId, userId: participantUserId },
    { status: 201 },
  );
}
