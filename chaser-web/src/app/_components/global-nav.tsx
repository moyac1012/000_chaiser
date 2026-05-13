"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { Button } from "@headlessui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  requiresTournamentAdmin?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "トップ" },
  { href: "/my/bots", label: "ボット" },
  { href: "/rooms", label: "対戦" },
  { href: "/replays", label: "リプレイ" },
  { href: "/tournaments", label: "大会管理", requiresTournamentAdmin: true },
];

type GlobalNavProps = {
  serverUserId: string | null;
  showTournamentNav: boolean;
};

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function UserSummary() {
  const hydrated = useHydrated();
  const { user } = useUser();
  const displayName =
    user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="flex items-center gap-2">
      {hydrated ? (
        <span className="max-w-[12rem] truncate text-sm text-slate-700">
          {displayName ?? "ログイン中"}
        </span>
      ) : (
        <span aria-hidden="true" className="h-4 w-24 rounded bg-slate-200" />
      )}
      {hydrated ? (
        <UserButton afterSignOutUrl="/" />
      ) : (
        <span
          aria-hidden="true"
          className="h-8 w-8 rounded-full bg-slate-200"
        />
      )}
    </div>
  );
}

export function GlobalNav({ serverUserId, showTournamentNav }: GlobalNavProps) {
  const visibleItems = navItems.filter(
    (item) => !item.requiresTournamentAdmin || showTournamentNav,
  );

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto w-full px-4 pt-4 sm:px-6 lg:px-8">
        <div className="room-panel room-panel--strong px-4 py-3 shadow-sm">
          <nav
            aria-label="グローバルナビゲーション"
            data-testid="global-nav"
            className="flex items-center gap-2 overflow-x-auto text-xs font-semibold text-slate-700"
          >
            <Link
              href="/"
              className="room-heading mr-2 shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-slate-800"
            >
              CHaser
            </Link>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-2 uppercase tracking-[0.18em] text-slate-700 transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
              {serverUserId ? (
                <UserSummary />
              ) : (
                <SignInButton mode="modal">
                  <Button
                    type="button"
                    className="rounded-full bg-slate-900 px-4 py-2 uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                  >
                    ログイン
                  </Button>
                </SignInButton>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
