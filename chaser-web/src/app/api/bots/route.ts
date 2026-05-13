import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import {
  type BotLanguage,
  isBotLanguage,
  normalizeBotLanguage,
} from "@/lib/bot/language";

const starterJsCode = `// これはサンプルボットです。onTurn(api) の中で 1 回だけ行動メソッドを呼べば OK です。
let step = 0

function onTurn(api) {
  step++
  // 偶数ターンは右、奇数ターンは下に歩く単純なボット
  if (step % 2 === 0) {
    api.walkRight()
    return
  }
  api.walkDown()
}
`;

const starterBlocklyXml = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="chaser_on_turn" id="onturn" x="40" y="40">
    <statement name="DO">
      <block type="controls_if" id="if-right">
        <mutation else="1"></mutation>
        <value name="IF0">
          <block type="chaser_is_tile" id="is-block-r">
            <field name="DIR">Right</field>
            <field name="TILE">2</field>
          </block>
        </value>
        <statement name="DO0">
          <block type="chaser_action_walk" id="walk-d">
            <field name="DIR">Down</field>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="chaser_action_walk" id="walk-r">
            <field name="DIR">Right</field>
          </block>
        </statement>
        <next>
          <block type="chaser_turn_end" id="turn-end"></block>
        </next>
      </block>
    </statement>
  </block>
</xml>
`.trim();

const starterRubyCode = `# これはサンプルボットです。onTurn(api) の中で 1 回だけ行動メソッドを呼べば OK です。
$step = 0

def onTurn(api)
  $step += 1
  # 偶数ターンは右、奇数ターンは下に歩く単純なボット
  if $step.even?
    api.walk_right
    return
  end
  api.walk_down
end
`;

export type Lang = BotLanguage;

interface CreateBotRequest {
  name?: string;
  lang?: Lang;
}

export interface BotListItem {
  id: number;
  name: string;
  language: BotLanguage;
  updatedAt: string;
}

export interface BotListResponse {
  bots: BotListItem[];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await dbReady;
  const bots = await db
    .selectFrom("user_bots")
    .select([
      "id",
      "name",
      "language",
      "blockly_xml",
      "updated_at",
      "owner_id",
      "user_id",
    ])
    .where("owner_id", "=", userId)
    .orderBy("updated_at", "desc")
    .limit(50)
    .execute();

  return NextResponse.json<BotListResponse>({
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      language: normalizeBotLanguage(bot.language, bot.blockly_xml),
      updatedAt: bot.updated_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as CreateBotRequest | null;
  const lang = body?.lang;
  if (!isBotLanguage(lang)) {
    return NextResponse.json({ error: "lang is required" }, { status: 400 });
  }
  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = rawName.trim() || "New Bot";

  await dbReady;
  const now = new Date().toISOString();
  const initialCode =
    lang === "js" ? starterJsCode : lang === "ruby" ? starterRubyCode : "";
  const initialBlocklyXml = lang === "blockly" ? starterBlocklyXml : "";

  const inserted = await db
    .insertInto("user_bots")
    .values({
      user_id: userId,
      owner_id: userId,
      name,
      language: lang,
      code: initialCode,
      blockly_xml: initialBlocklyXml,
      created_at: now,
      updated_at: now,
    })
    .returning("id")
    .executeTakeFirst();

  if (!inserted) {
    return NextResponse.json(
      { error: "failed to create bot" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id });
}
