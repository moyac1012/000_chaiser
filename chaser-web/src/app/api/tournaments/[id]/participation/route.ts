import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import type { TournamentRegistrationMode } from "@/db/types";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type ParticipationResponse = {
  status: "owner" | "participant" | "joined" | "requested";
};

export async function POST(
  _req: NextRequest,
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

  await dbReady;
  const tournament = await db
    .selectFrom("tournaments")
    .select(["id", "owner_id", "status", "registration_mode"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();

  if (!tournament) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (tournament.status === "finished") {
    return NextResponse.json(
      { error: "tournament is finished" },
      { status: 409 },
    );
  }
  if (tournament.owner_id === userId) {
    const response: ParticipationResponse = { status: "owner" };
    return NextResponse.json(response);
  }

  const existingParticipant = await db
    .selectFrom("tournament_participants")
    .select(["user_id"])
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (existingParticipant) {
    const response: ParticipationResponse = { status: "participant" };
    return NextResponse.json(response);
  }

  const mode =
    tournament.registration_mode === "public" ||
    tournament.registration_mode === "approval" ||
    tournament.registration_mode === "invite"
      ? (tournament.registration_mode as TournamentRegistrationMode)
      : "invite";
  if (mode === "invite") {
    return NextResponse.json(
      { error: "tournament is invite-only" },
      { status: 403 },
    );
  }

  if (mode === "public") {
    try {
      await db
        .insertInto("tournament_participants")
        .values({
          tournament_id: tournamentId,
          user_id: userId,
        })
        .execute();
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      if (message.includes("UNIQUE constraint failed")) {
        const response: ParticipationResponse = { status: "participant" };
        return NextResponse.json(response);
      }
      throw error;
    }
    await db
      .deleteFrom("tournament_participant_requests")
      .where("tournament_id", "=", tournamentId)
      .where("user_id", "=", userId)
      .execute();
    const response: ParticipationResponse = { status: "joined" };
    return NextResponse.json(response, { status: 201 });
  }

  try {
    await db
      .insertInto("tournament_participant_requests")
      .values({
        tournament_id: tournamentId,
        user_id: userId,
      })
      .execute();
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    if (message.includes("UNIQUE constraint failed")) {
      const response: ParticipationResponse = { status: "requested" };
      return NextResponse.json(response);
    }
    throw error;
  }

  const response: ParticipationResponse = { status: "requested" };
  return NextResponse.json(response, { status: 201 });
}

export async function DELETE(
  _req: NextRequest,
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

  await dbReady;
  const tournament = await db
    .selectFrom("tournaments")
    .select(["id"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();

  if (!tournament) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const result = await db
    .deleteFrom("tournament_participant_requests")
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!result || Number(result.numDeletedRows ?? 0) === 0) {
    return NextResponse.json({ error: "request not found" }, { status: 404 });
  }

  return NextResponse.json(
    { tournamentId, userId, status: "canceled" },
    { status: 200 },
  );
}
