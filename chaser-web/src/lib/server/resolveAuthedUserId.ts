import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

function decodeBase64Url(text: string): string {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

async function fallbackUserIdFromSessionCookie(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const store = await cookies();
  const sessionCookie =
    store.get("__session")?.value ??
    store.getAll().find((cookie) => cookie.name.startsWith("__session"))
      ?.value ??
    "";
  const payload = sessionCookie.split(".")[1] ?? "";
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { sub?: unknown };
    return typeof parsed.sub === "string" && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}

export async function resolveAuthedUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? (await fallbackUserIdFromSessionCookie()) ?? null;
}
