import { NextResponse } from "next/server";

import { db, dbReady } from "@/db/client";

export type MapListResponse = {
  maps: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    maxTurns: number;
    isOfficial: boolean;
  }>;
};

export async function GET() {
  await dbReady;
  const rows = await db
    .selectFrom("maps")
    .select([
      "id",
      "name",
      "width",
      "height",
      "max_turns as max_turns",
      "is_official as is_official",
    ])
    .orderBy("is_official", "desc")
    .orderBy("created_at", "desc")
    .execute();

  const maps: MapListResponse["maps"] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    maxTurns: row.max_turns,
    isOfficial: Boolean(row.is_official),
  }));

  return NextResponse.json<MapListResponse>({ maps });
}
