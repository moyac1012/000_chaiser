import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { StartMatchButton } from "@/app/_components/start-match-button";
import type { RoomListResponse } from "@/app/api/rooms/route";
import { db, dbReady } from "@/db/client";
import type { RoomStatus } from "@/db/types";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ルーム一覧",
};

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

type OwnedRoom = {
  roomId: string;
  mapId: string;
  mapName: string | null;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
};

type RoomScope = "all" | "mine";

function shortRoomId(roomId: string): string {
  return roomId.length > 10 ? `${roomId.slice(0, 8)}…` : roomId;
}

function statusLabel(
  status: RoomListResponse["rooms"][number]["status"],
): string {
  switch (status) {
    case "waiting":
      return "準備中";
    case "running":
      return "対戦中";
    case "finished":
      return "終了";
  }
}

function roomStatusBadge(status: RoomStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "waiting":
      return { label: "準備中", className: "bg-slate-100 text-slate-800" };
    case "running":
      return { label: "対戦中", className: "bg-blue-100 text-blue-800" };
    case "finished":
      return {
        label: "終了",
        className: "bg-emerald-100 text-emerald-800",
      };
  }
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildRoomsUrl(scope: RoomScope): string {
  const params = new URLSearchParams();
  if (scope === "mine") params.set("scope", "mine");
  const query = params.toString();
  return query ? `/rooms?${query}` : "/rooms";
}

function buildRoomHref(
  room: RoomListResponse["rooms"][number],
  intent?: "player",
): string {
  const params = new URLSearchParams();
  if (room.mode === "practice") params.set("mode", "practice");
  if (intent) params.set("intent", intent);
  const query = params.toString();
  return query ? `/rooms/${room.roomId}?${query}` : `/rooms/${room.roomId}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "不明なエラー";
}

async function fetchRooms(): Promise<RoomListResponse["rooms"]> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/api/rooms`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    const message =
      typeof body?.error === "string" && body.error
        ? body.error
        : "ルーム一覧の取得に失敗しました";
    throw new Error(message);
  }
  const data = (await res.json()) as RoomListResponse;
  return data.rooms ?? [];
}

async function loadOwnedRooms(userId: string): Promise<OwnedRoom[]> {
  await dbReady;
  const rows = await db
    .selectFrom("rooms")
    .leftJoin("maps", "maps.id", "rooms.map_id")
    .select([
      "rooms.id as id",
      "rooms.map_id as mapId",
      "maps.name as mapName",
      "rooms.status as status",
      "rooms.created_at as createdAt",
      "rooms.updated_at as updatedAt",
    ])
    .where("rooms.owner_id", "=", userId)
    .orderBy("rooms.created_at", "desc")
    .execute();

  return rows.map((row) => ({
    roomId: String(row.id),
    mapId: row.mapId,
    mapName: row.mapName ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export default async function RoomsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const scope: RoomScope = sp.scope === "mine" ? "mine" : "all";
  const authedUserId = await resolveAuthedUserId();
  const userId = scope === "mine" ? authedUserId : null;
  const canCreateRoom = Boolean(authedUserId);
  const headingTitle = scope === "mine" ? "自分のルーム" : "ルームを選ぼう";
  const headingDescription =
    scope === "mine"
      ? "自分が作成したルームの一覧です。"
      : canCreateRoom
        ? "新しいルームを作るか、今あるルームを見に行こう。"
        : "今あるルームを見に行こう。";

  let rooms: RoomListResponse["rooms"] = [];
  let ownedRooms: OwnedRoom[] = [];
  let error: string | null = null;

  if (scope === "mine") {
    if (userId) {
      try {
        ownedRooms = await loadOwnedRooms(userId);
      } catch (err) {
        error = errorMessage(err);
      }
    }
  } else {
    try {
      // Hide finished rooms from the public list to avoid early spoilers.
      rooms = (await fetchRooms()).filter((room) => room.status !== "finished");
    } catch (err) {
      error = errorMessage(err);
    }
  }

  return (
    <main className="px-4 py-10">
      <div className="room-shell space-y-6">
        <header className="room-hud room-fade">
          <div className="relative z-10 flex flex-col gap-3">
            <div className="room-heading text-[11px] uppercase tracking-[0.2em] text-slate-300">
              Rooms
            </div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              {headingTitle}
            </h1>
            <p className="text-sm text-slate-300">{headingDescription}</p>
          </div>
        </header>

        <div className="room-panel room-panel--strong px-4 py-4 room-fade room-fade--delay-1">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="grid gap-3 sm:grid-cols-2">
              {canCreateRoom ? (
                <>
                  <StartMatchButton label="対戦する" mode="public" />
                  <StartMatchButton
                    label="練習する（ひとり用）"
                    mode="practice"
                  />
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:col-span-2"
                >
                  ログインしてルームを作成
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 text-xs font-semibold">
              <Link
                href={buildRoomsUrl("all")}
                className={`rounded-full border px-4 py-2 uppercase tracking-[0.18em] transition ${
                  scope === "all"
                    ? "border-slate-300 bg-slate-900 text-white"
                    : "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-white"
                }`}
                aria-current={scope === "all" ? "page" : undefined}
              >
                すべてのルーム
              </Link>
              <Link
                href={buildRoomsUrl("mine")}
                className={`rounded-full border px-4 py-2 uppercase tracking-[0.18em] transition ${
                  scope === "mine"
                    ? "border-slate-300 bg-slate-900 text-white"
                    : "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-white"
                }`}
                aria-current={scope === "mine" ? "page" : undefined}
              >
                自分のルーム
              </Link>
            </div>
          </div>
        </div>

        <section className="grid gap-4 room-fade room-fade--delay-2">
          {error ? (
            <div className="room-alert px-4 py-3 text-sm">
              取得に失敗しました: {error}
            </div>
          ) : null}

          {scope === "mine" && !error ? (
            !userId ? (
              <div className="room-panel room-panel--strong p-6 text-center text-sm text-slate-600">
                ログインすると、自分のルームが表示されます。
              </div>
            ) : ownedRooms.length === 0 ? (
              <div className="room-panel room-panel--strong p-6 text-center text-sm text-slate-600">
                まだ自分のルームがありません。
              </div>
            ) : (
              <div className="room-panel room-panel--strong overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-white/70">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        ルームID
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        マップ
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        状態
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        作成日時
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        更新日時
                      </th>
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">
                        開く
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ownedRooms.map((room) => {
                      const badge = roomStatusBadge(room.status);
                      const mapLabel = room.mapName
                        ? `${room.mapName} (${room.mapId})`
                        : room.mapId;
                      return (
                        <tr key={room.roomId} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2 font-mono text-xs text-slate-700">
                            {room.roomId}
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {mapLabel}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {formatDate(room.createdAt)}
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {formatDate(room.updatedAt)}
                          </td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/rooms/${encodeURIComponent(room.roomId)}`}
                              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                            >
                              見る
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {scope === "all" && !error ? (
            rooms.length === 0 ? (
              <div className="room-panel room-panel--strong p-6 text-center text-sm text-slate-600">
                まだルームがありません。
              </div>
            ) : (
              rooms.map((room) => {
                const canJoin =
                  room.status === "waiting" &&
                  (!room.coolJoined || !room.hotJoined);
                const viewHref = buildRoomHref(room);
                const joinHref = buildRoomHref(room, "player");
                return (
                  <div
                    key={room.roomId}
                    data-testid="room-row"
                    className="room-panel room-panel--strong flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-lg font-semibold text-slate-900">
                        ルームID:{" "}
                        <span title={room.roomId}>
                          {shortRoomId(room.roomId)}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">
                        状態: {statusLabel(room.status)}
                      </div>
                      <div className="text-sm text-slate-600">
                        Cool: {room.coolJoined ? "参加中" : "未参加"} / Hot:{" "}
                        {room.hotJoined ? "参加中" : "未参加"}
                      </div>
                    </div>
                    <div className="sm:flex sm:items-center sm:gap-3">
                      <Link
                        href={viewHref}
                        className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:w-auto"
                      >
                        見る
                      </Link>
                      {canJoin ? (
                        <Link
                          href={joinHref}
                          className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 shadow transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 sm:mt-0 sm:w-auto"
                        >
                          参加する
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )
          ) : null}
        </section>
      </div>
    </main>
  );
}
