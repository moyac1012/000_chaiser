"use client";

import type { BotIssue } from "@/lib/editor/botIssue";

type BotIssuePanelProps = {
  issue: BotIssue | null;
  className?: string;
};

function toneClasses(category: BotIssue["category"]): string {
  switch (category) {
    case "timeout":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "rule":
      return "border-rose-200 bg-rose-50 text-rose-950";
    case "forfeit":
      return "border-rose-200 bg-rose-50 text-rose-950";
    case "init":
      return "border-rose-200 bg-rose-50 text-rose-950";
    case "runtime":
      return "border-rose-200 bg-rose-50 text-rose-950";
  }
}

export default function BotIssuePanel({
  issue,
  className,
}: BotIssuePanelProps) {
  if (!issue) return null;

  const turnLabel =
    typeof issue.turn === "number" ? `手番 ${issue.turn}` : null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-sm ${toneClasses(issue.category)} ${className ?? ""}`}
      data-testid="bot-issue-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-base font-extrabold">{issue.title}</div>
        {turnLabel ? (
          <div className="shrink-0 rounded bg-white/60 px-2 py-0.5 text-xs font-semibold">
            {turnLabel}
          </div>
        ) : null}
      </div>
      <div className="mt-1 text-sm">{issue.summary}</div>
      {issue.detail ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold underline">
            詳細
          </summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white/60 p-2 text-xs">
            {issue.detail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
