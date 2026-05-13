import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StartMatchButton } from "./_components/start-match-button";

export const metadata: Metadata = {
  title: "ホーム",
};

type HomeCardProps = {
  title: string;
  description: string;
  action: ReactNode;
};

function HomeCard({ title, description, action }: HomeCardProps) {
  return (
    <div className="room-panel room-panel--strong flex flex-col gap-4 p-6">
      <div>
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div>{action}</div>
    </div>
  );
}

function HomeLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
    >
      {label}
    </Link>
  );
}

export default async function HomePage() {
  const user = await currentUser();
  const canCreate = Boolean(user?.id);

  return (
    <main className="px-4 py-10">
      <div className="room-shell space-y-8">
        <header className="room-hud room-fade">
          <div className="relative z-10 space-y-3">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              CHaser Web
            </div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              ボット対戦をはじめよう
            </h1>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="room-hud-chip">作る</span>
              <span className="room-hud-chip">対戦</span>
              <span className="room-hud-chip">観戦</span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 room-fade room-fade--delay-1">
          <HomeCard
            title="対戦をはじめる"
            description="新しいルームを作って、すぐに対戦をスタート。"
            action={
              canCreate ? (
                <StartMatchButton label="ルームを作る" />
              ) : (
                <HomeLinkButton
                  href="/sign-in"
                  label="ログインしてルームを作る"
                />
              )
            }
          />
          <HomeCard
            title="自分のボットを作る"
            description="コードやブロックで、オリジナルのボットを育てよう。"
            action={
              canCreate ? (
                <HomeLinkButton href="/my/bots" label="ボットを作る" />
              ) : (
                <HomeLinkButton
                  href="/sign-in"
                  label="ログインしてボットを作る"
                />
              )
            }
          />
          <HomeCard
            title="みんなの対戦を見る"
            description="過去の対戦をチェックして、動きを学ぼう。"
            action={<HomeLinkButton href="/replays" label="リプレイを見る" />}
          />
        </section>

        <section className="room-panel room-panel--cool p-6 sm:p-8 room-fade room-fade--delay-2">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                  初心者向け
                </span>
                チュートリアル
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                まずはチュートリアルで基本操作を体験しよう
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                歩く・見る・探索・ブロック設置まで順番に学べます。
              </p>
            </div>
            {canCreate ? (
              <Link
                href="/tutorial"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                チュートリアルをはじめる
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                ログインしてチュートリアルをはじめる
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
