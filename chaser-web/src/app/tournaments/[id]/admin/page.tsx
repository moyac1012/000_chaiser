import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { db, dbReady } from "@/db/client";
import { canManageTournament } from "@/lib/server/permissions";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

import TournamentAdminClient from "./tournament-admin-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!id) {
    return { title: "大会管理" };
  }
  const tournament = await loadTournamentSummary(id);
  if (!tournament?.name) {
    return { title: "大会管理" };
  }
  return { title: `大会管理 ${tournament.name}` };
}

async function loadTournamentSummary(tournamentId: string) {
  await dbReady;
  return db
    .selectFrom("tournaments")
    .select(["id", "owner_id", "name"])
    .where("id", "=", tournamentId)
    .executeTakeFirst();
}

export default async function TournamentAdminPage({ params }: PageProps) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id: tournamentId } = await params;
  if (!tournamentId) {
    notFound();
  }

  const tournament = await loadTournamentSummary(tournamentId);
  if (!tournament) {
    notFound();
  }

  const canManage = await canManageTournament(userId, tournament.owner_id);
  if (!canManage) {
    return (
      <main className="px-4 py-10">
        <div className="room-shell">
          <div
            className="room-alert px-4 py-3 text-sm"
            data-testid="tournament-admin-forbidden"
          >
            403 Forbidden: この大会の管理権限がありません。
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell">
        <TournamentAdminClient tournamentId={tournamentId} />
      </div>
    </main>
  );
}
