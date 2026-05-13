import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import type { TournamentRegistrationMode, TournamentStatus } from "@/db/types";
import { canCreateTournament } from "@/lib/server/permissions";

type CreateTournamentRequest = {
  name?: unknown;
  registrationMode?: unknown;
};

type TournamentResponse = {
  id: string;
  name: string;
  ownerId: string;
  status: TournamentStatus;
  registrationMode: TournamentRegistrationMode;
  createdAt: string;
  finishedAt: string | null;
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await canCreateTournament(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as CreateTournamentRequest | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const registrationMode =
    typeof body?.registrationMode === "string"
      ? body.registrationMode.trim()
      : "";
  const allowedRegistrationModes: TournamentRegistrationMode[] = [
    "public",
    "approval",
    "invite",
  ];
  const normalizedRegistrationMode = allowedRegistrationModes.includes(
    registrationMode as TournamentRegistrationMode,
  )
    ? (registrationMode as TournamentRegistrationMode)
    : "invite";

  await dbReady;
  const now = new Date().toISOString();
  const tournament: TournamentResponse = {
    id: randomUUID(),
    name,
    ownerId: userId,
    status: "draft",
    registrationMode: normalizedRegistrationMode,
    createdAt: now,
    finishedAt: null,
  };

  await db
    .insertInto("tournaments")
    .values({
      id: tournament.id,
      name: tournament.name,
      owner_id: tournament.ownerId,
      status: tournament.status,
      registration_mode: tournament.registrationMode,
      created_at: tournament.createdAt,
      finished_at: tournament.finishedAt,
    })
    .execute();

  return NextResponse.json({ tournament });
}
