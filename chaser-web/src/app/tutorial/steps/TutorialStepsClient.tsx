"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import {
  formatTutorialLanguageLabel,
  type TutorialLanguage,
  type TutorialLevel,
} from "@/lib/tutorial/types";

type TutorialProgress = {
  language: TutorialLanguage;
  currentStepId: string | null;
  completedSteps: string[];
  updatedAt: string | null;
};

const LANGUAGES: TutorialLanguage[] = ["js", "blockly"];
const STEP_ID_SET = new Set(TUTORIAL_STEPS.map((step) => step.id));

function formatLevelLabel(level: TutorialLevel): string {
  switch (level) {
    case "advanced":
      return "上級";
    case "intermediate":
      return "中級";
    default:
      return "初級";
  }
}

function resolveResumeStepId(progress: TutorialProgress | null): string {
  const firstStep = TUTORIAL_STEPS[0]?.id ?? "";
  if (!progress) return firstStep;

  if (progress.currentStepId && STEP_ID_SET.has(progress.currentStepId)) {
    return progress.currentStepId;
  }

  const completed = new Set(
    progress.completedSteps.filter((stepId) => STEP_ID_SET.has(stepId)),
  );
  const next = TUTORIAL_STEPS.find((step) => !completed.has(step.id));
  return next?.id ?? firstStep;
}

function buildStepStatus(
  progress: TutorialProgress | null,
  stepId: string,
): "done" | "current" | "todo" {
  if (!progress) return "todo";
  if (progress.completedSteps.includes(stepId)) return "done";
  if (progress.currentStepId === stepId) return "current";
  return "todo";
}

function statusTone(status: "done" | "current" | "todo"): string {
  switch (status) {
    case "done":
      return "border-emerald-200/60 bg-emerald-100 text-emerald-800";
    case "current":
      return "border-amber-200/70 bg-amber-100 text-amber-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function statusLabel(status: "done" | "current" | "todo"): string {
  switch (status) {
    case "done":
      return "完了";
    case "current":
      return "進行中";
    default:
      return "未着手";
  }
}

export default function TutorialStepsClient() {
  const [progress, setProgress] = useState<
    Record<TutorialLanguage, TutorialProgress | null>
  >({
    js: null,
    blockly: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const responses = await Promise.all(
          LANGUAGES.map((language) =>
            fetch(`/api/tutorial/progress?language=${language}`),
          ),
        );
        const next: Record<TutorialLanguage, TutorialProgress | null> = {
          js: null,
          blockly: null,
        };
        for (let i = 0; i < responses.length; i += 1) {
          const res = responses[i];
          if (!res.ok) {
            throw new Error(await res.text());
          }
          const json = (await res.json()) as TutorialProgress;
          next[json.language] = json;
        }
        if (active) {
          setProgress(next);
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const stepTotal = TUTORIAL_STEPS.length;
  const stepList = useMemo(() => TUTORIAL_STEPS, []);

  return (
    <div className="room-shell space-y-8">
      <header className="room-hud room-fade">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Tutorial Steps
            </div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              ステップ一覧
            </h1>
            <p className="text-sm text-slate-300">
              進捗の確認と、任意のステップへのジャンプができます。
            </p>
          </div>
          <Link
            href="/tutorial"
            className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
          >
            チュートリアル開始へ
          </Link>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2 room-fade room-fade--delay-1">
        {LANGUAGES.map((language) => {
          const data = progress[language] ?? null;
          const completedCount = data?.completedSteps.length ?? 0;
          const isComplete = completedCount >= stepTotal;
          const resumeStepId = resolveResumeStepId(data);
          const label = isComplete
            ? "復習する"
            : completedCount === 0
              ? "はじめる"
              : "続きから";

          return (
            <div
              key={language}
              className="room-panel room-panel--strong flex flex-col gap-4 p-6"
            >
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {formatTutorialLanguageLabel(language)} チュートリアル
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {completedCount}/{stepTotal} ステップ達成
                </p>
                {loading ? (
                  <p className="mt-2 text-xs text-slate-400">
                    進捗を読み込み中...
                  </p>
                ) : error ? (
                  <p className="mt-2 text-xs text-rose-600">{error}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {data?.updatedAt
                      ? `最終更新: ${new Date(data.updatedAt).toLocaleString()}`
                      : "まだ進捗はありません"}
                  </p>
                )}
              </div>
              <Link
                href={`/tutorial/${resumeStepId}?lang=${language}`}
                className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                {label}
              </Link>
            </div>
          );
        })}
      </section>

      <section className="room-panel room-panel--strong p-6 room-fade room-fade--delay-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">ステップ一覧</h2>
          <span className="text-xs text-slate-500">
            クリックすると任意のステップから再開できます
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {stepList.map((step, index) => (
            <div
              key={step.id}
              className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Step {index + 1} · {formatLevelLabel(step.level)}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {step.title}
                  </div>
                  <div className="text-xs text-slate-600">{step.summary}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {LANGUAGES.map((language) => {
                    const status = buildStepStatus(progress[language], step.id);
                    return (
                      <Link
                        key={`${step.id}-${language}`}
                        href={`/tutorial/${step.id}?lang=${language}`}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone(
                          status,
                        )}`}
                      >
                        {formatTutorialLanguageLabel(language)}{" "}
                        {statusLabel(status)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
