import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import { chromium, type FullConfig } from "@playwright/test";

type TestUserKey = "owner" | "player" | "spectator";

type TestUser = {
  key: TestUserKey;
  email: string;
  workerIndex: number;
  storageStatePath: string;
};

const authDir = path.join(process.cwd(), "playwright", ".clerk");
const authFingerprintPath = path.join(authDir, ".env-fingerprint");
const keys: TestUserKey[] = ["owner", "player", "spectator"];

function resolveUserEmail(params: {
  key: TestUserKey;
  suffix: string;
}): string {
  const { key, suffix } = params;
  const envKey = `E2E_CLERK_${key.toUpperCase()}_EMAIL`;
  const specific = process.env[envKey];
  if (typeof specific === "string" && specific.trim()) return specific.trim();

  const shared = process.env.E2E_CLERK_USER_EMAIL;
  if (typeof shared === "string" && shared.trim()) return shared.trim();

  return `e2e-${key}-${suffix}@example.com`;
}

const KNOWN_PERMISSIONS = new Set(["admin", "tournament:create"]);

function normalizePermission(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return KNOWN_PERMISSIONS.has(trimmed) ? trimmed : null;
}

function addPermissionsFromList(value: unknown, into: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizePermission(item);
    if (normalized) into.add(normalized);
  }
}

function addPermissionFromRole(value: unknown, into: Set<string>): void {
  if (typeof value !== "string") return;
  const normalized = normalizePermission(value);
  if (normalized) into.add(normalized);
}

function extractPermissions(metadata: unknown): Set<string> {
  const permissions = new Set<string>();
  if (!metadata || typeof metadata !== "object") return permissions;
  const record = metadata as Record<string, unknown>;
  addPermissionsFromList(record.permissions, permissions);
  addPermissionsFromList(record.roles, permissions);
  addPermissionFromRole(record.role, permissions);
  return permissions;
}

async function assertTournamentCreatePermission(email: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    return;
  }

  const client = createClerkClient({ secretKey, publishableKey });
  const { data } = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const user = data[0];
  if (!user) {
    throw new Error(
      `[e2e] owner user not found for tournament permission: ${email}`,
    );
  }

  const permissions = extractPermissions(user.publicMetadata);
  const privatePermissions = extractPermissions(user.privateMetadata);
  for (const permission of privatePermissions) {
    permissions.add(permission);
  }
  if (permissions.has("admin") || permissions.has("tournament:create")) {
    return;
  }
  throw new Error(
    `[e2e] owner user missing tournament:create permission: ${email}`,
  );
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

async function ensureEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), ".env");
  const envLocalPath = path.join(process.cwd(), ".env.local");
  let env: Record<string, string> = {};
  let envLocal: Record<string, string> = {};
  try {
    env = parseDotEnv(await readFile(envPath, "utf8"));
  } catch {
    env = {};
  }
  try {
    envLocal = parseDotEnv(await readFile(envLocalPath, "utf8"));
  } catch {
    envLocal = {};
  }

  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    envLocal.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey =
    process.env.CLERK_SECRET_KEY ??
    envLocal.CLERK_SECRET_KEY ??
    env.CLERK_SECRET_KEY;

  if (publishableKey) {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = publishableKey;
    process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
  }
  if (secretKey) {
    process.env.CLERK_SECRET_KEY = secretKey;
  }
}

async function waitForServer(baseURL: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(baseURL, { redirect: "follow" });
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for server at ${baseURL}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function gotoWithRetry(params: {
  page: import("@playwright/test").Page;
  url: string;
  baseURL: string;
}): Promise<void> {
  const { page, url, baseURL } = params;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (attempt < 7) {
        await waitForServer(baseURL);
        await page.waitForTimeout(200 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildClerkEnvFingerprint(): string {
  return createHash("sha256")
    .update(process.env.CLERK_SECRET_KEY ?? "")
    .update("\n")
    .update(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "")
    .digest("hex");
}

async function invalidateStorageStateIfClerkEnvChanged(): Promise<void> {
  const expectedFingerprint = buildClerkEnvFingerprint();
  const shouldForceRefresh =
    process.env.E2E_FORCE_REGENERATE_CLERK_STATE === "1";
  const existingFingerprint = await readFile(authFingerprintPath, "utf8").catch(
    () => null,
  );

  if (
    shouldForceRefresh ||
    existingFingerprint?.trim() !== expectedFingerprint
  ) {
    await rm(authDir, { recursive: true, force: true });
    await mkdir(authDir, { recursive: true });
  }

  await writeFile(authFingerprintPath, expectedFingerprint, "utf8");
}

async function isStorageStateValid(params: {
  browser: import("@playwright/test").Browser;
  baseURL: string;
  storageStatePath: string;
}): Promise<boolean> {
  const { browser, baseURL, storageStatePath } = params;
  if (!(await fileExists(storageStatePath))) return false;
  const context = await browser.newContext({
    baseURL,
    storageState: storageStatePath,
  });
  try {
    await setupClerkTestingToken({ context });
    const res = await context.request.get("/api/bots");
    return res.ok();
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

async function ensureStorageStateFresh(params: {
  browser: import("@playwright/test").Browser;
  user: TestUser;
  baseURL: string;
}): Promise<void> {
  const { browser, user, baseURL } = params;

  if (
    await isStorageStateValid({
      browser,
      baseURL,
      storageStatePath: user.storageStatePath,
    })
  ) {
    return;
  }

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await setupClerkTestingToken({ page });
    await gotoWithRetry({ page, url: "/", baseURL });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await clerk.signIn({ page, emailAddress: user.email });
        const authProbe = await page.request.get("/api/bots");
        if (authProbe.ok()) {
          await context.storageState({ path: user.storageStatePath });
          return;
        }
        lastError = new Error(
          `auth probe failed (status=${authProbe.status()})`,
        );
      } catch (error) {
        lastError = error;
      }
      await page.waitForTimeout(250 * (attempt + 1));
      await gotoWithRetry({ page, url: "/", baseURL });
    }

    throw new Error(
      `[e2e] failed to refresh storageState for ${user.key} w${user.workerIndex} (${user.email}): ${String(
        (lastError as Error)?.message ?? lastError,
      )}`,
    );
  } finally {
    await context.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  await ensureEnv();
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    throw new Error(
      "[e2e] Missing Clerk keys. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY before running tests.",
    );
  }
  await clerkSetup();

  const baseURL =
    (config.projects[0]?.use?.baseURL as string | undefined) ??
    "http://127.0.0.1:3000";
  await waitForServer(baseURL);

  await mkdir(authDir, { recursive: true });
  await invalidateStorageStateIfClerkEnvChanged();

  const suffix = process.env.CI ? "ci" : "local";
  const baseEmails = new Map<TestUserKey, string>();
  for (const key of keys) {
    baseEmails.set(key, resolveUserEmail({ key, suffix }));
  }

  const requestedWorkerCount =
    typeof config.workers === "number"
      ? config.workers
      : Number(process.env.PW_WORKERS ?? "1");
  const workerCount =
    Number.isFinite(requestedWorkerCount) && requestedWorkerCount > 0
      ? requestedWorkerCount
      : 1;

  const users: TestUser[] = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    for (const key of keys) {
      users.push({
        key,
        email: baseEmails.get(key) ?? resolveUserEmail({ key, suffix }),
        workerIndex,
        storageStatePath: path.join(authDir, `${key}-w${workerIndex}.json`),
      });
    }
  }

  const ownerEmail = baseEmails.get("owner");
  const playerEmail = baseEmails.get("player");
  if (ownerEmail && playerEmail && ownerEmail === playerEmail) {
    throw new Error(
      "[e2e] owner/player must be different users. Set E2E_CLERK_OWNER_EMAIL and E2E_CLERK_PLAYER_EMAIL.",
    );
  }
  if (ownerEmail) {
    await assertTournamentCreatePermission(ownerEmail);
  }

  const browser = await chromium.launch();
  try {
    for (const user of users) {
      await ensureStorageStateFresh({ browser, user, baseURL });
    }
  } finally {
    await browser.close();
  }
}
