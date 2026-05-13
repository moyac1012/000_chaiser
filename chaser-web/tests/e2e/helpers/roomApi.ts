import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import type { Page } from "@playwright/test";
import { setupAuthedPage } from "./e2eAuth";

type RoomMode = "public" | "practice";
type E2EUserKey = "owner" | "player" | "spectator";

function decodeBase64Url(text: string): string {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

async function loadDotEnvValue(key: string): Promise<string | null> {
  for (const fileName of [".env.local", ".env"]) {
    try {
      const filePath = path.join(process.cwd(), fileName);
      const env = parseDotEnv(await readFile(filePath, "utf8"));
      const value = env[key]?.trim();
      if (value) {
        return value;
      }
    } catch {
      // ignore missing local env files in CI
    }
  }
  return null;
}

async function resolveClerkSecretKey(): Promise<string> {
  const fromProcess = process.env.CLERK_SECRET_KEY?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const fromDotEnv = await loadDotEnvValue("CLERK_SECRET_KEY");
  if (fromDotEnv) {
    return fromDotEnv;
  }

  throw new Error("CLERK_SECRET_KEY is required to initialize an e2e room");
}

async function resolveClerkPublishableKey(): Promise<string> {
  const fromProcess = (
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const fromDotEnv =
    (await loadDotEnvValue("CLERK_PUBLISHABLE_KEY")) ??
    (await loadDotEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"));
  if (fromDotEnv) {
    return fromDotEnv;
  }

  throw new Error(
    "CLERK_PUBLISHABLE_KEY is required to initialize an e2e room",
  );
}

function parseStorageStateUserKey(filePath: string): E2EUserKey | null {
  const name = path.basename(filePath);
  const matched = /^(owner|player|spectator)(?:-w\d+)?\.json$/u.exec(name);
  if (!matched) {
    return null;
  }
  return matched[1] as E2EUserKey;
}

function resolveUserEmail(key: E2EUserKey): string {
  const envKey = `E2E_CLERK_${key.toUpperCase()}_EMAIL`;
  const specific = process.env[envKey]?.trim();
  if (specific) {
    return specific;
  }

  const shared = process.env.E2E_CLERK_USER_EMAIL?.trim();
  if (shared) {
    return shared;
  }

  const suffix = process.env.CI ? "ci" : "local";
  return `e2e-${key}-${suffix}@example.com`;
}

async function resolveUserIdFromClerk(key: E2EUserKey): Promise<string | null> {
  const secretKey = await resolveClerkSecretKey();
  const publishableKey = await resolveClerkPublishableKey();
  const client = createClerkClient({ secretKey, publishableKey });
  const { data } = await client.users.getUserList({
    emailAddress: [resolveUserEmail(key)],
    limit: 1,
  });
  return data[0]?.id ?? null;
}

function parseRoomPath(roomPath: string): { roomId: string; mode: RoomMode } {
  const url = new URL(roomPath, "http://localhost");
  const roomId = url.pathname.split("/").filter(Boolean).at(-1)?.trim() ?? "";
  if (!roomId) {
    throw new Error(`roomId not found in roomPath: ${roomPath}`);
  }
  return {
    roomId: decodeURIComponent(roomId),
    mode: url.searchParams.get("mode") === "practice" ? "practice" : "public",
  };
}

export async function userIdFromStorageState(
  filePath: string,
): Promise<string> {
  const raw = await readFile(filePath, "utf8");
  const state = JSON.parse(raw) as {
    cookies?: Array<{ name?: string; value?: string }>;
  };
  const cookies = state.cookies ?? [];
  const sessionCookie =
    cookies.find((cookie) => cookie.name === "__session") ??
    cookies.find((cookie) => (cookie.name ?? "").startsWith("__session"));
  const jwt = sessionCookie?.value ?? "";
  const payload = jwt.split(".")[1] ?? "";
  if (!payload) {
    throw new Error(`__session cookie not found in storageState: ${filePath}`);
  }

  const parsed = JSON.parse(decodeBase64Url(payload)) as { sub?: unknown };
  if (typeof parsed.sub !== "string" || !parsed.sub) {
    throw new Error(`Failed to read userId from __session cookie: ${filePath}`);
  }
  return parsed.sub;
}

export async function initRoomForOwnerStorageState(params: {
  roomPath: string;
  ownerStorageStatePath: string;
}): Promise<void> {
  const { roomId, mode } = parseRoomPath(params.roomPath);
  const ownerId =
    (await (async () => {
      const userKey = parseStorageStateUserKey(params.ownerStorageStatePath);
      if (userKey) {
        return await resolveUserIdFromClerk(userKey);
      }
      return null;
    })()) ?? (await userIdFromStorageState(params.ownerStorageStatePath));
  const secret = await resolveClerkSecretKey();
  const signature = createHmac("sha256", secret)
    .update(`${roomId}.${ownerId}.${mode}`)
    .digest("hex");
  const baseUrl = process.env.WS_SERVER_BASE_URL ?? "http://localhost:8080";

  const response = await fetch(`${baseUrl}/api/rooms/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roomId,
      ownerId,
      mode,
      signature,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `failed to init room: roomId=${roomId} status=${response.status} body=${body}`,
  );
}

export async function currentUserIdFromPage(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.request.get("/api/e2e/whoami");
    if (response.ok()) {
      const json = (await response.json()) as { userId?: unknown };
      if (typeof json.userId === "string" && json.userId) {
        return json.userId;
      }
    }
    if (response.status() === 401 && attempt < 3) {
      await setupAuthedPage(page);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(200 * (attempt + 1));
      continue;
    }
    const body = await response.text().catch(() => "");
    throw new Error(
      `failed to resolve current user id: status=${response.status()} body=${body}`,
    );
  }

  throw new Error("failed to resolve current user id");
}

export async function initRoomForOwnerPage(params: {
  roomPath: string;
  page: Page;
}): Promise<void> {
  const { roomId, mode } = parseRoomPath(params.roomPath);
  const ownerId = await currentUserIdFromPage(params.page);
  const secret = await resolveClerkSecretKey();
  const signature = createHmac("sha256", secret)
    .update(`${roomId}.${ownerId}.${mode}`)
    .digest("hex");
  const baseUrl = process.env.WS_SERVER_BASE_URL ?? "http://localhost:8080";

  const response = await fetch(`${baseUrl}/api/rooms/init`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roomId,
      ownerId,
      mode,
      signature,
    }),
  });

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `failed to init room: roomId=${roomId} status=${response.status} body=${body}`,
  );
}
