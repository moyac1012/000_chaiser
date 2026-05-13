import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "kysely";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import type {
  GameResult,
  GameStatus,
  TournamentRegistrationMode,
  TournamentStatus,
} from "@/db/types";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type PublicUser = {
  displayName: string;
};

type TournamentDetailResponse = {
  id: string;
  name: string;
  status: TournamentStatus;
  registrationMode: TournamentRegistrationMode;
  createdAt: string;
  finishedAt: string | null;
  viewer: {
    status: "owner" | "participant" | "requested" | "none";
    canJoin: boolean;
    canRequest: boolean;
  };
  participants: Array<PublicUser>;
  matchups: Array<{
    id: string;
    playerA: PublicUser;
    playerB: PublicUser;
    createdAt: string;
    games: Array<{
      id: string;
      cool: PublicUser;
      hot: PublicUser;
      coolBotId: number;
      hotBotId: number;
      roomId: string;
      result: GameResult | null;
      status: GameStatus;
      invalidReason: string | null;
      replayId: string | null;
      replayVisible: boolean;
      createdAt: string;
    }>;
  }>;
};

function resolveDisplayNameFromClerkUser(user: {
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

function* chunked<T>(items: T[], size: number): Iterable<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

async function loadDisplayNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueUserIds = Array.from(
    new Set(userIds.map((id) => id.trim()).filter(Boolean)),
  );
  const displayNames = new Map<string, string>();
  if (uniqueUserIds.length === 0) return displayNames;

  const client = await clerkClient();
  for (const chunk of chunked(uniqueUserIds, 100)) {
    const { data } = await client.users.getUserList({
      userId: chunk,
      limit: chunk.length,
    });
    for (const user of data) {
      displayNames.set(user.id, resolveDisplayNameFromClerkUser(user));
    }
  }

  for (const userId of uniqueUserIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, "Unknown");
    }
  }

  return displayNames;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  await dbReady;
  const tournament = await db
    .selectFrom("tournaments")
    .select([
      "id",
      "name",
      "owner_id",
      "status",
      "registration_mode",
      "created_at",
      "finished_at",
    ])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!tournament) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const participants = await db
    .selectFrom("tournament_participants")
    .select(["user_id"])
    .where("tournament_id", "=", id)
    .orderBy("user_id")
    .execute();

  const viewerRequest = await db
    .selectFrom("tournament_participant_requests")
    .select(["user_id"])
    .where("tournament_id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  const matchups = await db
    .selectFrom("matchups")
    .select(["id", "player_a_id", "player_b_id", "created_at"])
    .where("tournament_id", "=", id)
    .orderBy("created_at", "asc")
    .execute();

  // Hide very recent replays to avoid early spoilers in tournament listings.
  const replayVisibleExpr =
    sql<number>`datetime(replays.created_at) <= datetime('now', '-3 minutes')`.as(
      "replay_visible",
    );
  const games = await db
    .selectFrom("games")
    .innerJoin("matchups", "matchups.id", "games.matchup_id")
    .leftJoin("replays", "replays.id", "games.replay_id")
    .select([
      "games.id as id",
      "games.matchup_id as matchup_id",
      "games.cool_user_id as cool_user_id",
      "games.hot_user_id as hot_user_id",
      "games.cool_bot_id as cool_bot_id",
      "games.hot_bot_id as hot_bot_id",
      "games.room_id as room_id",
      "games.result as result",
      "games.status as status",
      "games.invalid_reason as invalid_reason",
      "games.replay_id as replay_id",
      "games.created_at as created_at",
      replayVisibleExpr,
    ])
    .where("matchups.tournament_id", "=", id)
    .orderBy("games.created_at", "asc")
    .execute();

  const gamesByMatchup = new Map<
    string,
    TournamentDetailResponse["matchups"][0]["games"]
  >();

  const userIdsForDisplayName: string[] = [
    tournament.owner_id,
    ...participants.map((p) => p.user_id),
    ...matchups.flatMap((m) => [m.player_a_id, m.player_b_id]),
    ...games.flatMap((g) => [g.cool_user_id, g.hot_user_id]),
  ];
  const displayNameByUserId = await loadDisplayNames(userIdsForDisplayName);
  const asPublicUser = (userId: string): PublicUser => ({
    displayName: displayNameByUserId.get(userId) ?? "Unknown",
  });
  const registrationMode =
    tournament.registration_mode === "public" ||
    tournament.registration_mode === "approval" ||
    tournament.registration_mode === "invite"
      ? (tournament.registration_mode as TournamentRegistrationMode)
      : "invite";

  for (const game of games) {
    const list = gamesByMatchup.get(game.matchup_id) ?? [];
    const replayId = game.replay_id ?? null;
    const replayVisible = Boolean(replayId && game.replay_visible);
    const cool = asPublicUser(game.cool_user_id);
    const hot = asPublicUser(game.hot_user_id);
    list.push({
      id: game.id,
      cool,
      hot,
      coolBotId: game.cool_bot_id,
      hotBotId: game.hot_bot_id,
      roomId: game.room_id,
      result: game.result as GameResult | null,
      status: game.status as GameStatus,
      invalidReason: game.invalid_reason ?? null,
      replayId,
      replayVisible,
      createdAt: game.created_at,
    });
    gamesByMatchup.set(game.matchup_id, list);
  }

  const detail: TournamentDetailResponse = {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status as TournamentStatus,
    registrationMode,
    createdAt: tournament.created_at,
    finishedAt: tournament.finished_at ?? null,
    viewer: (() => {
      const isOwner = tournament.owner_id === userId;
      const isParticipant = participants.some((p) => p.user_id === userId);
      const hasRequest = Boolean(viewerRequest);
      const status = isOwner
        ? "owner"
        : isParticipant
          ? "participant"
          : hasRequest
            ? "requested"
            : "none";
      return {
        status,
        canJoin:
          status === "none" &&
          registrationMode === "public" &&
          tournament.status !== "finished",
        canRequest:
          status === "none" &&
          registrationMode === "approval" &&
          tournament.status !== "finished",
      };
    })(),
    participants: participants.map((p) => asPublicUser(p.user_id)),
    matchups: matchups.map((m) => ({
      id: m.id,
      playerA: asPublicUser(m.player_a_id),
      playerB: asPublicUser(m.player_b_id),
      createdAt: m.created_at,
      games: gamesByMatchup.get(m.id) ?? [],
    })),
  };

  return NextResponse.json({ tournament: detail });
}
