import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NewBotForm from "./NewBotForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ボット作成",
};

export default async function NewBotPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell room-shell--narrow space-y-6">
        <header className="room-hud room-fade">
          <div className="relative z-10 space-y-2">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              New Bot
            </div>
            <h1 className="text-3xl font-semibold text-white">ボットを作る</h1>
            <p className="text-sm text-slate-300">
              JS / Blockly / Ruby を選んでスタートします。
            </p>
          </div>
        </header>

        <div className="room-panel room-panel--strong p-6 room-fade room-fade--delay-1">
          <NewBotForm />
        </div>
      </div>
    </main>
  );
}
