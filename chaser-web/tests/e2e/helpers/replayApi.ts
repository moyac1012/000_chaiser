import type { Page } from "@playwright/test";

export function roomIdFromRoomPath(roomPath: string): string {
  const url = new URL(roomPath, "http://localhost");
  const roomId = url.pathname.split("/").filter(Boolean).at(-1)?.trim() ?? "";
  if (!roomId) {
    throw new Error(`roomId not found in roomPath: ${roomPath}`);
  }
  return decodeURIComponent(roomId);
}

export async function makeReplayVisible(params: {
  page: Page;
  roomId: string;
}): Promise<string> {
  const response = await params.page.request.post("/api/e2e/replays/age", {
    data: { roomId: params.roomId },
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `makeReplayVisible failed: roomId=${params.roomId} status=${response.status()} body=${body}`,
    );
  }

  const json = (await response.json()) as { replayId?: unknown };
  if (typeof json.replayId !== "string" || !json.replayId) {
    throw new Error(`makeReplayVisible returned invalid replayId`);
  }
  return json.replayId;
}
