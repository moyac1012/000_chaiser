import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { type BotLanguage, normalizeBotLanguage } from "@/lib/bot/language";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export type TournamentParticipantBotListItem = {
  id: number;
  name: string;
  language: BotLanguage;
  updatedAt: string;
};

export type TournamentParticipantBotListResponse = {
  bots: TournamentParticipantBotListItem[];
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const currentUserId = await resolveAuthedUserId();
  if (!currentUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: tournamentId, userId } = await params;
  if (!tournamentId || !userId) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
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
  const canManage = await canManageTournament(
    currentUserId,
    tournament.owner_id,
  );
  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const participant = await db
    .selectFrom("tournament_participants")
    .select(["user_id"])
    .where("tournament_id", "=", tournamentId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!participant) {
    return NextResponse.json(
      { error: "userId is not a participant" },
      { status: 400 },
    );
  }

  const bots = await db
    .selectFrom("user_bots")
    .select(["id", "name", "language", "blockly_xml", "updated_at"])
    .where("owner_id", "=", userId)
    .orderBy("updated_at", "desc")
    .limit(100)
    .execute();

  return NextResponse.json<TournamentParticipantBotListResponse>({
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      language: normalizeBotLanguage(bot.language, bot.blockly_xml),
      updatedAt: bot.updated_at,
    })),
  });
}
