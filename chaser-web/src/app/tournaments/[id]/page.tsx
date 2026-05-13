import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

import TournamentViewerClient from "./tournament-viewer-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `大会詳細 ${id}` : "大会詳細" };
}

export default async function TournamentViewerPage({ params }: PageProps) {
  const userId = await resolveAuthedUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id: tournamentId } = await params;
  if (!tournamentId) {
    notFound();
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell">
        <TournamentViewerClient tournamentId={tournamentId} />
      </div>
    </main>
  );
}
