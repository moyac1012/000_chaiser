import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { db, dbReady } from "@/db/client";
import {
  type BotLanguage,
  formatBotLanguageLabel,
  normalizeBotLanguage,
} from "@/lib/bot/language";

export const metadata: Metadata = {
  title: "マイボット",
};

interface BotListItem {
  id: number;
  name: string;
  language: BotLanguage;
  createdAt: string | null;
}

async function loadBots(userId: string | null): Promise<BotListItem[]> {
  if (!userId) return [];
  await dbReady;
  const rows = await db
    .selectFrom("user_bots")
    .select(["id", "name", "language", "blockly_xml", "created_at"])
    .where("owner_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    language: normalizeBotLanguage(row.language, row.blockly_xml),
    createdAt: row.created_at ?? null,
  }));
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function languageLabel(language: BotLanguage): string {
  return formatBotLanguageLabel(language);
}

function editPath(bot: BotListItem): string {
  if (bot.language === "blockly") {
    return `/my/bots/blockly/${bot.id}`;
  }
  if (bot.language === "ruby") {
    return `/my/bots/ruby/${bot.id}`;
  }
  return `/my/bots/${bot.id}`;
}

export default async function MyBotsPage() {
  const user = await currentUser();
  const canCreate = Boolean(user?.id);
  let bots: BotListItem[] = [];
  let error: string | null = null;

  try {
    bots = await loadBots(user?.id ?? null);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell space-y-6">
        <header className="room-hud room-fade">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                My Bots
              </div>
              <h1 className="text-3xl font-semibold text-white">
                あなたのボット
              </h1>
              <p className="text-sm text-slate-300">
                作ったボットをまとめて管理します。
              </p>
            </div>
            {canCreate ? (
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/my/bots/new"
                  className="inline-flex items-center justify-center rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900 shadow-sm transition hover:bg-white"
                  data-testid="create-bot"
                >
                  ボットを作る
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="room-alert px-4 py-3 text-sm">
            ロードに失敗しました: {error}
          </div>
        ) : null}

        {!error && !user ? (
          <div className="room-panel room-panel--strong px-6 py-4 text-sm text-slate-700">
            ログインすると、自分のボット一覧が表示されます。
          </div>
        ) : null}

        {!error && bots.length === 0 ? (
          <div
            className="room-panel room-panel--strong px-6 py-10 text-center text-sm text-slate-600"
            data-testid="bot-empty-state"
          >
            まだボットがありません。
          </div>
        ) : null}

        {!error && bots.length > 0 ? (
          <div
            className="room-panel room-panel--strong overflow-hidden"
            data-testid="bot-table"
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white/70">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    ボット名
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    ボットID
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    言語
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    作成日時
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">
                    編集
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bots.map((bot) => (
                  <tr
                    key={bot.id}
                    className="hover:bg-slate-50/70"
                    data-testid="bot-row"
                  >
                    <td className="px-4 py-2" data-testid="bot-name">
                      <div className="font-medium text-slate-900">
                        {bot.name}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-xs text-slate-700">
                        {bot.id}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                        {languageLabel(bot.language)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-800">
                      {formatDate(bot.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={editPath(bot)}
                        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                        data-testid="bot-open"
                      >
                        ひらく
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
