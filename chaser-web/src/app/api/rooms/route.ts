import { NextResponse } from "next/server";

export type RoomListItem = {
  roomId: string;
  mapId: string;
  mode: "public" | "practice";
  status: "waiting" | "running" | "finished";
  turn: number;
  maxTurns: number;
  started: boolean;
  coolJoined: boolean;
  hotJoined: boolean;
};

export type RoomListResponse = {
  rooms: RoomListItem[];
};

type RoomListErrorResponse = {
  error: string;
};

const WS_SERVER_BASE_URL =
  process.env.WS_SERVER_BASE_URL ?? "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${WS_SERVER_BASE_URL}/api/rooms`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as RoomListResponse;
    return NextResponse.json<RoomListResponse>(data);
  } catch (error) {
    console.warn("[api/rooms] failed to fetch from ws server", error);
    const message =
      error instanceof Error ? error.message : "failed to fetch rooms";
    return NextResponse.json<RoomListErrorResponse>(
      { error: message },
      { status: 502 },
    );
  }
}
