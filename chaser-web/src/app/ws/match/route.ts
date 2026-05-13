import { NextResponse } from "next/server";

// NOTE: This endpoint is kept as a stub because the Bun WebSocket server
// (server/wsServer.ts) is the authoritative entrypoint. The legacy Next.js
// route previously mirrored the protocol but is intentionally disabled to
// avoid diverging behavior after the role/slot refactor.
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      error:
        "Use the Bun WebSocket server (/ws/match). Configure NEXT_PUBLIC_WS_URL if needed.",
    },
    { status: 410 },
  );
}
