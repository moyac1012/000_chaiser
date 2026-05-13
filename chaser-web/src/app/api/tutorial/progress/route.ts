import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";
import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import {
  isTutorialLanguage,
  type TutorialLanguage,
} from "@/lib/tutorial/types";

export const dynamic = "force-dynamic";

export type TutorialProgressResponse = {
  language: TutorialLanguage;
  currentStepId: string | null;
  completedSteps: string[];
  updatedAt: string | null;
};

type TutorialProgressUpdateRequest = {
  language?: TutorialLanguage;
  currentStepId?: string | null;
  completedSteps?: string[];
};

const STEP_IDS = new Set(TUTORIAL_STEPS.map((step) => step.id));
const STEP_ORDER = new Map(
  TUTORIAL_STEPS.map((step, index) => [step.id, index]),
);

function parseCompletedSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (stepId): stepId is string => typeof stepId === "string",
    );
  } catch {
    return [];
  }
}

function normalizeStepList(stepIds: string[]): string[] {
  const filtered = stepIds.filter((stepId) => STEP_IDS.has(stepId));
  const unique = Array.from(new Set(filtered));
  return unique.sort((a, b) => {
    const orderA = STEP_ORDER.get(a) ?? 0;
    const orderB = STEP_ORDER.get(b) ?? 0;
    return orderA - orderB;
  });
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const languageParam = req.nextUrl.searchParams.get("language");
  if (!isTutorialLanguage(languageParam)) {
    return NextResponse.json({ error: "invalid language" }, { status: 400 });
  }
  const language = languageParam;

  await dbReady;
  const progress = await db
    .selectFrom("tutorial_progress")
    .select(["current_step_id", "completed_steps_json", "updated_at"])
    .where("user_id", "=", userId)
    .where("language", "=", language)
    .executeTakeFirst();

  if (!progress) {
    return NextResponse.json<TutorialProgressResponse>({
      language,
      currentStepId: null,
      completedSteps: [],
      updatedAt: null,
    });
  }

  const completedSteps = normalizeStepList(
    parseCompletedSteps(progress.completed_steps_json),
  );
  const currentStepId = STEP_IDS.has(progress.current_step_id ?? "")
    ? progress.current_step_id
    : null;

  return NextResponse.json<TutorialProgressResponse>({
    language,
    currentStepId,
    completedSteps,
    updatedAt: progress.updated_at,
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req
    .json()
    .catch(() => null)) as TutorialProgressUpdateRequest | null;
  if (!body || !isTutorialLanguage(body.language)) {
    return NextResponse.json({ error: "invalid language" }, { status: 400 });
  }

  const language = body.language;
  const hasCurrentStepId = Object.hasOwn(body, "currentStepId");
  if (
    hasCurrentStepId &&
    body.currentStepId !== null &&
    typeof body.currentStepId !== "string"
  ) {
    return NextResponse.json({ error: "invalid step id" }, { status: 400 });
  }
  const requestedCurrentStepId = hasCurrentStepId
    ? typeof body.currentStepId === "string"
      ? body.currentStepId
      : null
    : undefined;
  if (
    typeof requestedCurrentStepId === "string" &&
    !STEP_IDS.has(requestedCurrentStepId)
  ) {
    return NextResponse.json({ error: "invalid step id" }, { status: 400 });
  }

  const completedInput = Array.isArray(body.completedSteps)
    ? body.completedSteps.filter(
        (stepId): stepId is string => typeof stepId === "string",
      )
    : [];

  await dbReady;
  const existing = await db
    .selectFrom("tutorial_progress")
    .select(["current_step_id", "completed_steps_json"])
    .where("user_id", "=", userId)
    .where("language", "=", language)
    .executeTakeFirst();

  const existingCompleted = normalizeStepList(
    parseCompletedSteps(existing?.completed_steps_json),
  );
  const mergedCompleted = normalizeStepList([
    ...existingCompleted,
    ...completedInput,
  ]);

  const normalizedExistingCurrent =
    existing?.current_step_id && STEP_IDS.has(existing.current_step_id)
      ? existing.current_step_id
      : null;
  const nextCurrentStepId =
    requestedCurrentStepId ?? normalizedExistingCurrent ?? null;
  const now = new Date().toISOString();

  if (existing) {
    await db
      .updateTable("tutorial_progress")
      .set({
        current_step_id: nextCurrentStepId,
        completed_steps_json: JSON.stringify(mergedCompleted),
        updated_at: now,
      })
      .where("user_id", "=", userId)
      .where("language", "=", language)
      .execute();
  } else {
    await db
      .insertInto("tutorial_progress")
      .values({
        user_id: userId,
        language,
        current_step_id: nextCurrentStepId,
        completed_steps_json: JSON.stringify(mergedCompleted),
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  return NextResponse.json<TutorialProgressResponse>({
    language,
    currentStepId: nextCurrentStepId,
    completedSteps: mergedCompleted,
    updatedAt: now,
  });
}
