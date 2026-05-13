import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type CreateMatchupRequest = {
  playerAId?: unknown;
  playerBId?: unknown;
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
    .catch(() => null)) as CreateMatchupRequest | null;
  const playerAId = typeof body?.playerAId === "string" ? body.playerAId : "";
  const playerBId = typeof body?.playerBId === "string" ? body.playerBId : "";
  const trimmedPlayerAId = playerAId.trim();
  const trimmedPlayerBId = playerBId.trim();
  if (!trimmedPlayerAId || !trimmedPlayerBId) {
    return NextResponse.json(
      { error: "playerAId and playerBId are required" },
      { status: 400 },
    );
  }
  if (trimmedPlayerAId === trimmedPlayerBId) {
    return NextResponse.json(
      { error: "playerAId and playerBId must be different" },
      { status: 400 },
    );
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

  const participants = await db
    .selectFrom("tournament_participants")
    .select(["user_id"])
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "in", [trimmedPlayerAId, trimmedPlayerBId])
    .execute();

  const participantSet = new Set(participants.map((p) => p.user_id));
  if (
    !participantSet.has(trimmedPlayerAId) ||
    !participantSet.has(trimmedPlayerBId)
  ) {
    return NextResponse.json(
      { error: "both players must be registered participants" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const matchup = {
    id: randomUUID(),
    tournamentId,
    playerAId: trimmedPlayerAId,
    playerBId: trimmedPlayerBId,
    createdAt: now,
  };

  await db
    .insertInto("matchups")
    .values({
      id: matchup.id,
      tournament_id: tournamentId,
      player_a_id: trimmedPlayerAId,
      player_b_id: trimmedPlayerBId,
      created_at: now,
    })
    .execute();

  return NextResponse.json({ matchup }, { status: 201 });
}
