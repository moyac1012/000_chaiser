import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canCreateTournament } from "@/lib/server/permissions";

import NewTournamentForm from "./tournament-new-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "大会作成",
};

export default async function NewTournamentPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  const canCreate = await canCreateTournament(userId);
  if (!canCreate) {
    return (
      <main className="px-4 py-10">
        <div className="room-shell room-shell--narrow">
          <div className="room-alert px-4 py-3 text-sm">
            403 Forbidden: 大会作成の権限がありません。
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell room-shell--narrow space-y-6">
        <header className="room-hud room-fade">
          <div className="relative z-10 space-y-2">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              New Tournament
            </div>
            <h1 className="text-3xl font-semibold text-white">大会を作成</h1>
            <p className="text-sm text-slate-300">
              大会名を入力して次へ進みます。
            </p>
          </div>
        </header>
        <div className="room-panel room-panel--strong p-6 room-fade room-fade--delay-1">
          <NewTournamentForm />
        </div>
      </div>
    </main>
  );
}
