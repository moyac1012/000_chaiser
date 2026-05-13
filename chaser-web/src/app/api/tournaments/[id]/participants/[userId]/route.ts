import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: tournamentId, userId: participantUserId } = await params;
  if (!tournamentId || !participantUserId) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
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

  const hasMatchup = await db
    .selectFrom("matchups")
    .select(["id"])
    .where("tournament_id", "=", tournamentId)
    .where((eb) =>
      eb.or([
        eb("player_a_id", "=", participantUserId),
        eb("player_b_id", "=", participantUserId),
      ]),
    )
    .executeTakeFirst();

  if (hasMatchup) {
    return NextResponse.json(
      { error: "participant is used in matchups" },
      { status: 409 },
    );
  }

  const result = await db
    .deleteFrom("tournament_participants")
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", participantUserId)
    .executeTakeFirst();

  if (!result || Number(result.numDeletedRows ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(
    { tournamentId, userId: participantUserId },
    { status: 200 },
  );
}
