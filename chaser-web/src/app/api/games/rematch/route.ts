import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { DEFAULT_MAP_ID } from "@/core/map";
import { db, dbReady } from "@/db/client";
import { mapExists } from "@/db/maps";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

type RematchRequest = {
  gameId?: unknown;
  invalidReason?: unknown;
  matchupId?: unknown;
  coolUserId?: unknown;
  hotUserId?: unknown;
  coolBotId?: unknown;
  hotBotId?: unknown;
  mapId?: unknown;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function ownsBot(
  bot: { owner_id: string; user_id: string },
  userId: string,
): boolean {
  // 大会管理UI要件: bot は user_bots.owner_id === userId のもののみ許可する。
  return bot.owner_id === userId;
}

export async function POST(req: NextRequest) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RematchRequest | null;
  const gameId = typeof body?.gameId === "string" ? body.gameId.trim() : "";
  const invalidReasonRaw =
    typeof body?.invalidReason === "string" ? body.invalidReason.trim() : "";
  // v1 管理UI要件: 無効理由は任意。空なら null 扱いで無効化のみ行う。
  const invalidReason = invalidReasonRaw ? invalidReasonRaw : null;
  const matchupId =
    typeof body?.matchupId === "string" ? body.matchupId.trim() : "";
  const coolUserId =
    typeof body?.coolUserId === "string" ? body.coolUserId.trim() : "";
  const hotUserId =
    typeof body?.hotUserId === "string" ? body.hotUserId.trim() : "";
  const coolBotId = parsePositiveInt(body?.coolBotId);
  const hotBotId = parsePositiveInt(body?.hotBotId);
  const mapIdRaw = typeof body?.mapId === "string" ? body.mapId.trim() : "";

  if (
    !gameId ||
    !matchupId ||
    !coolUserId ||
    !hotUserId ||
    !coolBotId ||
    !hotBotId
  ) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  if (coolUserId === hotUserId) {
    return NextResponse.json(
      { error: "coolUserId and hotUserId must be different" },
      { status: 400 },
    );
  }

  await dbReady;

  const existingGame = await db
    .selectFrom("games")
    .innerJoin("matchups", "matchups.id", "games.matchup_id")
    .innerJoin("tournaments", "tournaments.id", "matchups.tournament_id")
    .select([
      "games.id as id",
      "games.status as status",
      "games.matchup_id as matchup_id",
      "games.map_id as map_id",
      "tournaments.owner_id as owner_id",
    ])
    .where("games.id", "=", gameId)
    .executeTakeFirst();

  if (!existingGame) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const canManage = await canManageTournament(userId, existingGame.owner_id);
  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (existingGame.status !== "valid") {
    return NextResponse.json(
      { error: "game is already invalid" },
      { status: 409 },
    );
  }
  if (existingGame.matchup_id !== matchupId) {
    return NextResponse.json({ error: "matchupId mismatch" }, { status: 400 });
  }

  const mapId = mapIdRaw || existingGame.map_id || DEFAULT_MAP_ID;
  if (!(await mapExists(mapId))) {
    return NextResponse.json(
      { error: `map not found: ${mapId}` },
      { status: 400 },
    );
  }

  const matchup = await db
    .selectFrom("matchups")
    .innerJoin("tournaments", "tournaments.id", "matchups.tournament_id")
    .select([
      "matchups.id as id",
      "matchups.player_a_id as player_a_id",
      "matchups.player_b_id as player_b_id",
      "tournaments.owner_id as owner_id",
    ])
    .where("matchups.id", "=", matchupId)
    .executeTakeFirst();

  if (!matchup) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const playerSet = new Set([matchup.player_a_id, matchup.player_b_id]);
  if (!playerSet.has(coolUserId) || !playerSet.has(hotUserId)) {
    return NextResponse.json(
      { error: "coolUserId/hotUserId must match matchup players" },
      { status: 400 },
    );
  }

  const bots = await db
    .selectFrom("user_bots")
    .select(["id", "owner_id", "user_id"])
    .where("id", "in", [coolBotId, hotBotId])
    .execute();

  const coolBot = bots.find((b) => b.id === coolBotId);
  const hotBot = bots.find((b) => b.id === hotBotId);
  if (!coolBot || !hotBot) {
    return NextResponse.json({ error: "bot not found" }, { status: 404 });
  }
  if (!ownsBot(coolBot, coolUserId) || !ownsBot(hotBot, hotUserId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const roomId = randomUUID();
  const game = {
    id: randomUUID(),
    matchupId,
    coolUserId,
    hotUserId,
    coolBotId,
    hotBotId,
    roomId,
    mapId,
    status: "valid" as const,
    createdAt: now,
  };

  try {
    await db.transaction().execute(async (trx) => {
      const updateResult = await trx
        .updateTable("games")
        .set({ status: "invalid", invalid_reason: invalidReason })
        .where("id", "=", gameId)
        .where("status", "=", "valid")
        .executeTakeFirst();

      const updated = Number(updateResult?.numUpdatedRows ?? 0);
      if (updated <= 0) {
        throw new Error("conflict");
      }

      await trx
        .insertInto("games")
        .values({
          id: game.id,
          matchup_id: matchupId,
          cool_user_id: coolUserId,
          hot_user_id: hotUserId,
          cool_bot_id: coolBotId,
          hot_bot_id: hotBotId,
          room_id: roomId,
          map_id: mapId,
          result: null,
          status: "valid",
          invalid_reason: null,
          replay_id: null,
          created_at: now,
        })
        .execute();
    });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    if (message === "conflict") {
      return NextResponse.json(
        { error: "game is already invalid" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ game }, { status: 201 });
}
