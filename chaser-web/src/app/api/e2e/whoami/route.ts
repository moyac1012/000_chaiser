import { NextResponse } from "next/server";
import { resolveAuthedUserId } from "@/lib/server/resolveAuthedUserId";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const userId = await resolveAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ userId });
}
