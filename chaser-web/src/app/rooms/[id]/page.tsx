import { createHmac } from "node:crypto";

import type { Metadata } from "next";

import type { RoomMode } from "@/core/match/room";
import type { JoinIntent } from "@/core/match/wsTypes";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";
import RoomPageClient from "./RoomPageClient";

export const dynamic = "force-dynamic";

const WS_SERVER_BASE_URL =
  process.env.WS_SERVER_BASE_URL ?? "http://localhost:8080";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

type RoomInitState = {
  error: string | null;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: id ? `対戦ルーム ${id}` : "対戦ルーム" };
}

export default async function RoomPage({ params, searchParams }: PageProps) {
  const roomId = (await params).id;
  const sp = await searchParams;
  const rawMode = sp.mode;
  const roomMode: RoomMode = rawMode === "practice" ? "practice" : "public";
  const rawIntent = sp.intent;
  const initialViewerIntent: Exclude<JoinIntent, undefined> =
    rawIntent === "player" ? "player" : "spectator";
  const initialBackLink: { href: string; label: string } = (() => {
    const from = sp.from;
    const tournamentId = sp.tournamentId;
    if (
      (from === "tournament" || from === "tournament-viewer") &&
      tournamentId
    ) {
      return {
        href: `/tournaments/${encodeURIComponent(tournamentId)}`,
        label: "大会にもどる",
      };
    }
    return { href: "/", label: "もどる" };
  })();

  const roomInitState: RoomInitState = {
    error: null,
  };
  const userId = await resolveAuthedUserId();

  const looksLikeUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      roomId,
    );
  // tournament の roomId(UUID) は games/tournaments から owner を解決するため、このページからの init は行わない
  // （また、owner 決定を SSR 時点に寄せて E2E を安定させる）
  if (userId && roomId && !looksLikeUuid && rawIntent !== "player") {
    const secret = process.env.CLERK_SECRET_KEY;
    if (secret) {
      const signature = createHmac("sha256", secret)
        .update(`${roomId}.${userId}.${roomMode}`)
        .digest("hex");
      try {
        const response = await fetch(`${WS_SERVER_BASE_URL}/api/rooms/init`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            roomId,
            ownerId: userId,
            mode: roomMode,
            signature,
          }),
        });
        if (!response.ok) {
          roomInitState.error =
            "ルームの初期化に失敗しました。ページを再読み込みしてください。";
        }
      } catch (error) {
        console.warn("[rooms/[id]] failed to init ws room", { roomId, error });
        roomInitState.error =
          "ルームの初期化に失敗しました。ページを再読み込みしてください。";
      }
    } else {
      roomInitState.error =
        "ルーム初期化の署名設定が不足しています。管理者に確認してください。";
    }
  }

  return (
    <RoomPageClient
      roomId={roomId}
      initialUserId={userId ?? null}
      initialRoomMode={roomMode}
      initialViewerIntent={initialViewerIntent}
      initialBackLink={initialBackLink}
      initialRoomInitError={roomInitState.error}
    />
  );
}
