import Link from "next/link";

const footerLinks = [
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  {
    href: "https://github.com/sponsors/riaf",
    label: "GitHub Sponsor になって応援する",
    external: true,
  },
];

export function GlobalFooter() {
  const linkClassName =
    "rounded-full border border-slate-200/80 bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

  return (
    <footer className="mt-10 pb-10">
      <div className="px-4">
        <div className="room-shell">
          <div className="room-panel room-panel--strong px-6 py-4">
            <div className="flex flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <nav
                aria-label="フッターナビゲーション"
                className="flex flex-wrap items-center gap-2"
              >
                {footerLinks.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      className={linkClassName}
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={linkClassName}
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </nav>
              <p className="text-[11px] text-slate-600">
                ベータテスト期間中は予告なくデータをリセットする場合があります。ご了承
                ください。
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Powered by Kushiro All Action Inc.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
