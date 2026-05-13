import { sql } from "kysely";
import type { Metadata } from "next";
import Link from "next/link";
import type { JSX } from "react";

import { db, dbReady } from "@/db/client";
import type { ReplayWinner } from "@/db/types";

export const metadata: Metadata = {
  title: "リプレイ",
};

type ReplayWinnerValue = ReplayWinner;

interface ReplaySummary {
  id: string;
  roomId: string;
  createdAt: string;
  winner: ReplayWinnerValue;
  entryCount: number;
  coolBotName: string;
  hotBotName: string;
}

async function loadReplays(): Promise<ReplaySummary[]> {
  await dbReady;
  const rows = await db
    .selectFrom("replays")
    .select([
      "id",
      "room_id",
      "created_at",
      "winner",
      "log",
      "cool_bot_name",
      "hot_bot_name",
    ])
    // Hide very recent replays to avoid early spoilers.
    .where(
      sql<string>`datetime(created_at)`,
      "<=",
      sql<string>`datetime('now', '-3 minutes')`,
    )
    .orderBy("created_at", "desc")
    .limit(50)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    roomId: row.room_id,
    createdAt: row.created_at,
    winner: row.winner,
    entryCount: safeCountLog(row.log),
    coolBotName: row.cool_bot_name ?? "",
    hotBotName: row.hot_bot_name ?? "",
  }));
}

function safeCountLog(log: string): number {
  try {
    const parsed = JSON.parse(log);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function displayBotName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed : fallback;
}

function matchupNames(replay: ReplaySummary): {
  cool: string;
  hot: string;
  hasStoredNames: boolean;
} {
  const cool = displayBotName(replay.coolBotName, "Cool");
  const hot = displayBotName(replay.hotBotName, "Hot");
  const hasStoredNames = Boolean(
    replay.coolBotName.trim() || replay.hotBotName.trim(),
  );
  return { cool, hot, hasStoredNames };
}

function winnerBadge(winner: ReplayWinnerValue): JSX.Element {
  if (winner === "Cool") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
        Cool 勝利
      </span>
    );
  }
  if (winner === "Hot") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
        Hot 勝利
      </span>
    );
  }
  if (winner === "draw") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        引き分け
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      -
    </span>
  );
}

export default async function ReplaysPage() {
  let replays: ReplaySummary[] = [];
  let error: string | null = null;

  try {
    replays = await loadReplays();
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell space-y-6">
        <header className="room-hud room-fade">
          <div className="relative z-10 space-y-3">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Replays
            </div>
            <h1 className="text-3xl font-semibold text-white">リプレイ</h1>
            <p className="text-sm text-slate-300">
              最近 50 件の対戦をカードで表示します。
            </p>
          </div>
        </header>

        {error ? (
          <div className="room-alert px-4 py-3 text-sm">
            リプレイの取得に失敗しました: {error}
          </div>
        ) : null}

        {!error && replays.length === 0 ? (
          <div className="room-panel room-panel--strong p-6 text-center text-sm text-slate-600">
            まだリプレイがありません。
          </div>
        ) : null}

        {!error && replays.length > 0 ? (
          <div
            className="grid gap-4 lg:grid-cols-2 room-fade room-fade--delay-1"
            data-testid="replay-table"
          >
            {replays.map((replay) => {
              const { cool, hot, hasStoredNames } = matchupNames(replay);
              const replayPath = `/replays/${encodeURIComponent(replay.id)}`;
              return (
                <article
                  key={replay.id}
                  className="room-panel room-panel--strong group relative overflow-hidden p-5 transition duration-200 hover:-translate-y-1"
                  data-testid="replay-row"
                >
                  <div className="relative space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                            Cool
                          </span>
                          <span className="text-base font-semibold text-slate-900">
                            {cool}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                            vs
                          </span>
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">
                            Hot
                          </span>
                          <span className="text-base font-semibold text-slate-900">
                            {hot}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono text-[11px] text-slate-500">
                            #{shortId(replay.id)}
                          </span>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <span>{formatDate(replay.createdAt)}</span>
                          {!hasStoredNames ? (
                            <span className="rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-[10px] text-slate-400">
                              Bot名未保存
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {winnerBadge(replay.winner)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                        手数 {replay.entryCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                        Room {shortId(replay.roomId)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <Link
                        href={replayPath}
                        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-800"
                        data-testid="replay-row-link"
                      >
                        リプレイを見る
                      </Link>
                      <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                        Watch
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}
