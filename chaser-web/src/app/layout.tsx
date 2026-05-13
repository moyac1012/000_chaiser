import { jaJP } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import "./globals.css";
import { canCreateTournament } from "@/lib/server/permissions";
import { GlobalFooter } from "./_components/global-footer";
import { GlobalNav } from "./_components/global-nav";

export const metadata: Metadata = {
  title: {
    template: "%s | CHaser Web",
    default: "CHaser Web",
  },
  description: "CHaser をブラウザで楽しめる対戦・観戦プラットフォーム。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();
  const showTournamentNav = user?.id
    ? await canCreateTournament(user.id)
    : false;

  return (
    <ClerkProvider appearance={{ cssLayerName: "clerk" }} localization={jaJP}>
      <html lang="ja">
        <body
          // NOTE: next/font/google は Turbopack 経由での取得が環境依存で失敗することがあるため、現状は未使用。
          className="antialiased"
          data-clerk-user-id={user?.id ?? undefined}
        >
          <div className="room-theme min-h-screen flex flex-col">
            <GlobalNav
              serverUserId={user?.id ?? null}
              showTournamentNav={showTournamentNav}
            />
            <div className="flex-1">{children}</div>
            <GlobalFooter />
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
