import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db, dbReady } from "@/db/client";
import type { TournamentRegistrationMode, TournamentStatus } from "@/db/types";
import { canCreateTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "大会管理",
};

type ManagedTournament = {
  id: string;
  name: string;
  status: TournamentStatus;
  registrationMode: TournamentRegistrationMode;
  createdAt: string;
  finishedAt: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function tournamentStatusBadge(status: TournamentStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "draft":
      return { label: "下書き", className: "bg-slate-100 text-slate-800" };
    case "running":
      return { label: "開催中", className: "bg-blue-100 text-blue-800" };
    case "finished":
      return {
        label: "終了",
        className: "bg-emerald-100 text-emerald-800",
      };
  }
}

function registrationModeLabel(mode: TournamentRegistrationMode): string {
  switch (mode) {
    case "public":
      return "公開";
    case "approval":
      return "承認制";
    case "invite":
      return "招待制";
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "不明なエラー";
}

async function loadManagedTournaments(
  userId: string,
): Promise<ManagedTournament[]> {
  await dbReady;
  const rows = await db
    .selectFrom("tournaments")
    .select([
      "id",
      "name",
      "status",
      "registration_mode",
      "created_at",
      "finished_at",
    ])
    .where("owner_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    registrationMode: row.registration_mode,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? null,
  }));
}

export default async function ManagePage() {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    redirect("/sign-in");
  }
  const canCreate = await canCreateTournament(userId);

  let tournaments: ManagedTournament[] = [];
  let tournamentError: string | null = null;
  try {
    tournaments = await loadManagedTournaments(userId);
  } catch (error) {
    tournamentError = errorMessage(error);
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell space-y-8">
        <header className="room-hud room-fade">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
                Tournaments
              </div>
              <h1 className="text-3xl font-semibold text-white">大会管理</h1>
              <p className="text-sm text-slate-300">
                管理中の大会をまとめて確認します。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {canCreate ? (
                <Link
                  href="/tournaments/new"
                  className="inline-flex items-center justify-center rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900 shadow-sm transition hover:bg-white"
                >
                  大会を作成
                </Link>
              ) : (
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  大会作成は管理者へ
                </span>
              )}
            </div>
          </div>
        </header>

        <section className="space-y-4 room-fade room-fade--delay-1">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              管理中の大会
            </h2>
            <p className="text-sm text-slate-600">
              管理権限のある大会だけが表示されます。
            </p>
          </div>

          {tournamentError ? (
            <div className="room-alert px-4 py-3 text-sm">
              大会の取得に失敗しました: {tournamentError}
            </div>
          ) : null}

          {!tournamentError && tournaments.length === 0 ? (
            <div className="room-panel room-panel--strong px-6 py-10 text-center text-sm text-slate-600">
              まだ大会がありません。
            </div>
          ) : null}

          {!tournamentError && tournaments.length > 0 ? (
            <div className="room-panel room-panel--strong overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-white/70">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      大会名
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      状態
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      参加方式
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      作成日時
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      終了日時
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      管理
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tournaments.map((tournament) => {
                    const badge = tournamentStatusBadge(tournament.status);
                    return (
                      <tr key={tournament.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2 text-slate-900">
                          <div className="font-medium">{tournament.name}</div>
                          <div className="text-xs text-slate-500">
                            {tournament.id}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-800">
                          {registrationModeLabel(tournament.registrationMode)}
                        </td>
                        <td className="px-4 py-2 text-slate-800">
                          {formatDate(tournament.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-slate-800">
                          {formatDate(tournament.finishedAt)}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/tournaments/${encodeURIComponent(tournament.id)}/admin`}
                            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                          >
                            開く
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
