import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import {
  isTutorialLanguage,
  type TutorialLanguage,
} from "@/lib/tutorial/types";

export const dynamic = "force-dynamic";

export type TutorialStepStateResponse = {
  stepId: string;
  language: TutorialLanguage;
  code: string;
  blocklyXml: string;
  updatedAt: string | null;
};

type TutorialStepStateUpdateRequest = {
  language?: TutorialLanguage;
  code?: string;
  blocklyXml?: string;
};

const STEP_MAP = new Map(TUTORIAL_STEPS.map((step) => [step.id, step]));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { stepId } = await params;
  const step = STEP_MAP.get(stepId);
  if (!step) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const languageParam = req.nextUrl.searchParams.get("language");
  if (!isTutorialLanguage(languageParam)) {
    return NextResponse.json({ error: "invalid language" }, { status: 400 });
  }
  const language = languageParam;

  await dbReady;
  const existing = await db
    .selectFrom("tutorial_step_states")
    .select(["code", "blockly_xml", "updated_at"])
    .where("user_id", "=", userId)
    .where("language", "=", language)
    .where("step_id", "=", stepId)
    .executeTakeFirst();

  if (existing) {
    return NextResponse.json<TutorialStepStateResponse>({
      stepId,
      language,
      code: existing.code ?? "",
      blocklyXml: existing.blockly_xml ?? "",
      updatedAt: existing.updated_at,
    });
  }

  const defaultCode = language === "js" ? step.starterCode : "";
  const defaultBlocklyXml =
    language === "blockly" ? step.starterBlocklyXml : "";

  return NextResponse.json<TutorialStepStateResponse>({
    stepId,
    language,
    code: defaultCode,
    blocklyXml: defaultBlocklyXml,
    updatedAt: null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stepId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { stepId } = await params;
  const step = STEP_MAP.get(stepId);
  if (!step) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as TutorialStepStateUpdateRequest | null;
  if (!body || !isTutorialLanguage(body.language)) {
    return NextResponse.json({ error: "invalid language" }, { status: 400 });
  }

  const language = body.language;
  const code =
    typeof body.code === "string"
      ? body.code
      : language === "js"
        ? step.starterCode
        : "";
  const blocklyXml =
    typeof body.blocklyXml === "string"
      ? body.blocklyXml
      : language === "blockly"
        ? step.starterBlocklyXml
        : "";

  if (language === "js" && typeof body.code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (language === "blockly" && typeof body.blocklyXml !== "string") {
    return NextResponse.json(
      { error: "blocklyXml is required" },
      { status: 400 },
    );
  }

  await dbReady;
  const existing = await db
    .selectFrom("tutorial_step_states")
    .select(["step_id"])
    .where("user_id", "=", userId)
    .where("language", "=", language)
    .where("step_id", "=", stepId)
    .executeTakeFirst();

  const now = new Date().toISOString();
  if (existing) {
    await db
      .updateTable("tutorial_step_states")
      .set({
        code,
        blockly_xml: blocklyXml,
        updated_at: now,
      })
      .where("user_id", "=", userId)
      .where("language", "=", language)
      .where("step_id", "=", stepId)
      .execute();
  } else {
    await db
      .insertInto("tutorial_step_states")
      .values({
        user_id: userId,
        language,
        step_id: stepId,
        code,
        blockly_xml: blocklyXml,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  return NextResponse.json<TutorialStepStateResponse>({
    stepId,
    language,
    code,
    blocklyXml,
    updatedAt: now,
  });
}
