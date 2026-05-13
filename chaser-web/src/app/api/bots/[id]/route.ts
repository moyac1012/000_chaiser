import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import {
  type BotLanguage,
  isBotLanguage,
  normalizeBotLanguage,
} from "@/lib/bot/language";

interface BotResponse {
  id: number;
  name: string;
  language: BotLanguage;
  code: string;
  blocklyXml: string;
  updatedAt: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseBotId(rawId);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  await dbReady;
  const bot = await db
    .selectFrom("user_bots")
    .select([
      "id",
      "name",
      "language",
      "code",
      "blockly_xml",
      "owner_id",
      "user_id",
      "updated_at",
    ])
    .where("id", "=", id)
    .executeTakeFirst();

  if (!bot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const isOwner = bot.owner_id === userId;
  if (!isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json<BotResponse>({
    id: bot.id,
    name: bot.name,
    language: normalizeBotLanguage(bot.language, bot.blockly_xml),
    code: bot.code ?? "",
    blocklyXml: bot.blockly_xml,
    updatedAt: bot.updated_at,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = parseBotId(rawId);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    code?: string;
    name?: string;
    blocklyXml?: string;
    language?: BotLanguage;
  } | null;
  if (!body || typeof body.code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  const blocklyXmlInput =
    typeof body.blocklyXml === "string" ? body.blocklyXml : undefined;
  const requestedLanguage = isBotLanguage(body.language) ? body.language : null;

  await dbReady;
  const existing = await db
    .selectFrom("user_bots")
    .select(["id", "name", "language", "blockly_xml", "owner_id", "user_id"])
    .where("id", "=", id)
    .executeTakeFirst();

  const now = new Date().toISOString();
  if (existing) {
    const isOwner = existing.owner_id === userId;
    if (!isOwner) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const nextBlocklyXml = blocklyXmlInput ?? existing.blockly_xml;
    const nextLanguage =
      requestedLanguage ??
      normalizeBotLanguage(existing.language, nextBlocklyXml);

    await db
      .updateTable("user_bots")
      .set({
        language: nextLanguage,
        code: body.code,
        blockly_xml: nextBlocklyXml,
        updated_at: now,
      })
      .where("id", "=", id)
      .execute();

    return NextResponse.json<BotResponse>({
      id: existing.id,
      name: existing.name,
      language: nextLanguage,
      code: body.code,
      blocklyXml: nextBlocklyXml,
      updatedAt: now,
    });
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}

function parseBotId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}
