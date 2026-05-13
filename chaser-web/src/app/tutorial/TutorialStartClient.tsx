"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import type { TutorialLanguage } from "@/lib/tutorial/types";

type TutorialProgress = {
  language: TutorialLanguage;
  currentStepId: string | null;
  completedSteps: string[];
  updatedAt: string | null;
};

type IntroSlideBlock =
  | { kind: "text"; lines: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "emphasis"; text: string; suffix?: string };

type IntroSlide = {
  id: string;
  image: string;
  alt: string;
  blocks: IntroSlideBlock[];
};

const LANGUAGES: TutorialLanguage[] = ["blockly", "js"];
const STEP_ID_SET = new Set(TUTORIAL_STEPS.map((step) => step.id));

const LANGUAGE_DETAILS: Record<
  TutorialLanguage,
  { title: string; summary: string; features: string[]; ctaClass: string }
> = {
  blockly: {
    title: "Blockly",
    summary: "ブロックをつなげて命令を作る",
    features: [
      "ブロック操作だけで動きを作れる",
      "条件分岐・繰り返しを視覚的に理解できる",
      "生成されたコードを見ながら学べる",
    ],
    ctaClass:
      "bg-emerald-500 text-white hover:bg-emerald-400 focus-visible:outline-emerald-500",
  },
  js: {
    title: "JavaScript",
    summary: "コードでアルゴリズムを組み立てる",
    features: [
      "変数や関数でロジックを整理できる",
      "Bot開発の実装と同じ感覚で学べる",
      "アルゴリズムに集中しやすい",
    ],
    ctaClass:
      "bg-amber-400 text-amber-950 hover:bg-amber-300 focus-visible:outline-amber-400",
  },
};

const INTRO_SLIDES: IntroSlide[] = [
  {
    id: "slide01",
    image: "/tutorial/slide01.png",
    alt: "CHaserとは？",
    blocks: [
      {
        kind: "text",
        lines: [
          "CHaser（チェイサー）は",
          "2つのプログラムが対戦するゲームです",
        ],
      },
      {
        kind: "text",
        lines: ["キーボードやマウスは使いません"],
      },
      {
        kind: "text",
        lines: ["自分で書いたプログラムが", "キャラクターを動かします"],
      },
    ],
  },
  {
    id: "slide02",
    image: "/tutorial/slide02.png",
    alt: "フィールドとマスの種類",
    blocks: [
      {
        kind: "text",
        lines: ["フィールドは", "マス目でできた世界"],
      },
      {
        kind: "text",
        lines: ["マスには"],
      },
      {
        kind: "list",
        items: ["なにもない床", "キャラクター", "ブロック", "ハートのアイテム"],
      },
      {
        kind: "text",
        lines: ["だけがあります"],
      },
    ],
  },
  {
    id: "slide03",
    image: "/tutorial/slide03.png",
    alt: "4つの行動",
    blocks: [
      {
        kind: "text",
        lines: ["キャラクターができる行動は", "たった4種類"],
      },
      {
        kind: "list",
        items: ["歩く", "見る", "調べる", "ブロックを置く"],
      },
    ],
  },
  {
    id: "slide04",
    image: "/tutorial/slide04.png",
    alt: "勝ち方",
    blocks: [
      {
        kind: "text",
        lines: ["勝ち方は2つ"],
      },
      {
        kind: "list",
        items: [
          "① 相手の上にブロックを置く → その時点で勝ち",
          "② 時間切れならハートの数勝負",
        ],
      },
    ],
  },
  {
    id: "slide05",
    image: "/tutorial/slide05.png",
    alt: "即負けになる条件",
    blocks: [
      {
        kind: "text",
        lines: ["ただし注意！"],
      },
      {
        kind: "list",
        items: [
          "ブロックに囲まれる",
          "自分で囲んでしまう",
          "ブロックの上に乗る",
        ],
      },
      {
        kind: "text",
        lines: ["これらは即負けです"],
      },
    ],
  },
  {
    id: "slide06",
    image: "/tutorial/slide06.png",
    alt: "プログラムで作るのは頭脳",
    blocks: [
      {
        kind: "text",
        lines: ["あなたが作るのは", "キャラクターそのものではありません"],
      },
      {
        kind: "emphasis",
        text: "「どう動くか考える頭脳」",
        suffix: "です",
      },
      {
        kind: "text",
        lines: ["次のスライドから", "プログラムの書き方を学びます"],
      },
    ],
  },
];

function resolveFirstStepId(): string {
  return TUTORIAL_STEPS[0]?.id ?? "step-01-walk-up";
}

function resolveResumeStepId(
  progress: TutorialProgress | null,
  fallbackStepId: string,
): string {
  if (!progress) return fallbackStepId;
  if (progress.currentStepId && STEP_ID_SET.has(progress.currentStepId)) {
    return progress.currentStepId;
  }

  const completed = new Set(
    progress.completedSteps.filter((stepId) => STEP_ID_SET.has(stepId)),
  );
  const next = TUTORIAL_STEPS.find((step) => !completed.has(step.id));
  return next?.id ?? fallbackStepId;
}

function progressStatusLabel(
  completedCount: number,
  stepTotal: number,
): string {
  if (completedCount >= stepTotal && stepTotal > 0) return "完了";
  if (completedCount > 0) return "進行中";
  return "未着手";
}

function progressStatusTone(completedCount: number, stepTotal: number): string {
  if (completedCount >= stepTotal && stepTotal > 0) {
    return "border-emerald-200/60 bg-emerald-100 text-emerald-800";
  }
  if (completedCount > 0) {
    return "border-amber-200/70 bg-amber-100 text-amber-800";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export default function TutorialStartClient() {
  const firstStepId = useMemo(() => resolveFirstStepId(), []);
  const [introIndex, setIntroIndex] = useState(0);
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
  const totalSlides = INTRO_SLIDES.length;
  const introSlide = INTRO_SLIDES[introIndex] ?? INTRO_SLIDES[0];
  const canGoPrev = introIndex > 0;
  const canGoNext = introIndex < totalSlides - 1;

  return (
    <div className="room-shell space-y-8">
      <header className="room-hud room-fade">
        <div className="relative z-10 space-y-3">
          <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
            Tutorial
          </div>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            チュートリアルをはじめよう
          </h1>
          <p className="text-sm text-slate-300">
            言語を選ぶと、すぐに最初のステップから始められます。
          </p>
        </div>
      </header>

      <section className="room-panel room-panel--strong p-6 room-fade room-fade--delay-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-500">
              CHaser Intro
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">
              CHaser とは？
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {introIndex + 1}/{totalSlides}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIntroIndex((prev) => prev - 1)}
                disabled={!canGoPrev}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                前へ
              </button>
              <button
                type="button"
                onClick={() => setIntroIndex((prev) => prev + 1)}
                disabled={!canGoNext}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                次へ
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,480px)_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Image
                src={introSlide.image}
                alt={introSlide.alt}
                width={1536}
                height={1024}
                className="h-auto w-full"
              />
            </div>
          </div>
          <div className="space-y-4 text-slate-700">
            {introSlide.blocks.map((block, index) => {
              if (block.kind === "list") {
                return (
                  <ul
                    // biome-ignore lint/suspicious/noArrayIndexKey: static slide layout
                    key={index}
                    className="list-disc space-y-1 pl-5 text-base text-slate-700"
                  >
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }
              if (block.kind === "emphasis") {
                return (
                  <p
                    // biome-ignore lint/suspicious/noArrayIndexKey: static slide layout
                    key={index}
                    className="text-base text-slate-700"
                  >
                    <span className="font-semibold text-slate-900">
                      {block.text}
                    </span>
                    {block.suffix ?? ""}
                  </p>
                );
              }
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static slide layout
                  key={index}
                  className="space-y-1 text-base leading-relaxed text-slate-700"
                >
                  {block.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {INTRO_SLIDES.map((slide, index) => {
              const isActive = index === introIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setIntroIndex(index)}
                  aria-label={`スライド ${index + 1}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`h-2.5 w-2.5 rounded-full transition ${
                    isActive
                      ? "bg-slate-900"
                      : "bg-slate-300 hover:bg-slate-400"
                  }`}
                />
              );
            })}
          </div>
          <span className="text-xs text-slate-500">
            すべて見終わったら、下のチュートリアルに進みましょう。
          </span>
        </div>
      </section>

      <section className="room-panel room-panel--strong p-6 room-fade room-fade--delay-2">
        <div className="grid gap-4 lg:grid-cols-2">
          {LANGUAGES.map((language) => {
            const data = progress[language] ?? null;
            const completedCount = data?.completedSteps.length ?? 0;
            const resumeStepId = resolveResumeStepId(data, firstStepId);
            const percent =
              stepTotal > 0
                ? Math.round((completedCount / stepTotal) * 100)
                : 0;
            const statusLabel = progressStatusLabel(completedCount, stepTotal);
            const statusTone = progressStatusTone(completedCount, stepTotal);
            const detail = LANGUAGE_DETAILS[language];
            const resumeLabel =
              completedCount > 0 ? "続きから再開します" : "最初のステップから";
            const updatedAt = data?.updatedAt
              ? `最終更新: ${new Date(data.updatedAt).toLocaleString()}`
              : "まだ進捗はありません";

            return (
              <div
                key={language}
                className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {detail.title}
                    </p>
                    <p className="text-sm text-slate-600">{detail.summary}</p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusTone}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {detail.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>

                <div className="mt-4 space-y-2 text-xs text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>
                      進捗 {completedCount}/{stepTotal}（{percent}%）
                    </span>
                    {loading ? (
                      <span>進捗を読み込み中...</span>
                    ) : error ? (
                      <span className="text-rose-600">
                        進捗を読み込めませんでした
                      </span>
                    ) : (
                      <span>{updatedAt}</span>
                    )}
                  </div>
                  <div className="room-turn__bar">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <Link
                    href={`/tutorial/${resumeStepId}?lang=${language}`}
                    className={`inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.18em] shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${detail.ctaClass}`}
                  >
                    {language === "blockly"
                      ? "Blocklyではじめる"
                      : "JavaScriptではじめる"}
                  </Link>
                  <p className="text-xs text-slate-500">{resumeLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
