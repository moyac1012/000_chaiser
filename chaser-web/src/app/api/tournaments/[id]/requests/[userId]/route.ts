import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: tournamentId, userId: requestUserId } = await params;
  if (!tournamentId || !requestUserId) {
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

  try {
    await db.transaction().execute(async (trx) => {
      const request = await trx
        .selectFrom("tournament_participant_requests")
        .select(["user_id"])
        .where("tournament_id", "=", tournamentId)
        .where("user_id", "=", requestUserId)
        .executeTakeFirst();

      if (!request) {
        throw new Error("not_found");
      }

      const existingParticipant = await trx
        .selectFrom("tournament_participants")
        .select(["user_id"])
        .where("tournament_id", "=", tournamentId)
        .where("user_id", "=", requestUserId)
        .executeTakeFirst();

      if (!existingParticipant) {
        await trx
          .insertInto("tournament_participants")
          .values({
            tournament_id: tournamentId,
            user_id: requestUserId,
          })
          .execute();
      }

      await trx
        .deleteFrom("tournament_participant_requests")
        .where("tournament_id", "=", tournamentId)
        .where("user_id", "=", requestUserId)
        .execute();
    });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    if (message === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json(
    { tournamentId, userId: requestUserId },
    { status: 200 },
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: tournamentId, userId: requestUserId } = await params;
  if (!tournamentId || !requestUserId) {
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

  const result = await db
    .deleteFrom("tournament_participant_requests")
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", requestUserId)
    .executeTakeFirst();

  if (!result || Number(result.numDeletedRows ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(
    { tournamentId, userId: requestUserId },
    { status: 200 },
  );
}
