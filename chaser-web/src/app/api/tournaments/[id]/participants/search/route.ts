import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type SearchUsersResponse = {
  users: Array<{
    userId: string;
    displayName: string;
    username: string | null;
    isParticipant: boolean;
  }>;
};

function resolveDisplayName(user: {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const firstName = user.firstName?.trim() ?? "";
  const lastName = user.lastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  const username = user.username?.trim();
  if (username) return username;

  return "Unknown";
}

export async function GET(
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

  const query = req.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
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
    .execute();
  const participantSet = new Set(participants.map((p) => p.user_id));

  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    query,
    limit: 20,
  });

  const response: SearchUsersResponse = {
    users: data.map((user) => ({
      userId: user.id,
      displayName: resolveDisplayName(user),
      username: user.username ?? null,
      isParticipant: participantSet.has(user.id),
    })),
  };

  return NextResponse.json(response);
}
