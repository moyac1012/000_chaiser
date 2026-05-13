import { randomUUID } from "node:crypto";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { parseChaserDotMap } from "@/core/chaserDotMap";
import { db, dbReady } from "@/db/client";

function isAllowedOfficialSize(width: number, height: number): boolean {
  return height === 17 && (width === 15 || width === 21);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required (multipart field: file)" },
      { status: 400 },
    );
  }

  if (file.name && !file.name.toLowerCase().endsWith(".map")) {
    return NextResponse.json(
      { error: "invalid file extension (expected .map)" },
      { status: 400 },
    );
  }

  const content = await file.text();

  let parsed: ReturnType<typeof parseChaserDotMap>;
  try {
    parsed = parseChaserDotMap(content);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "invalid .map format" },
      { status: 400 },
    );
  }

  if (!isAllowedOfficialSize(parsed.width, parsed.height)) {
    return NextResponse.json(
      {
        error: `unsupported map size: ${parsed.width}x${parsed.height} (allowed: 15x17 or 21x17)`,
      },
      { status: 400 },
    );
  }

  await dbReady;

  const id = randomUUID();
  await db
    .insertInto("maps")
    .values({
      id,
      name: parsed.mapName,
      width: parsed.width,
      height: parsed.height,
      max_turns: parsed.maxTurns,
      cool_start_x: parsed.spawn.Cool.x,
      cool_start_y: parsed.spawn.Cool.y,
      hot_start_x: parsed.spawn.Hot.x,
      hot_start_y: parsed.spawn.Hot.y,
      map_data: JSON.stringify(parsed.tiles),
      created_by: userId,
      is_official: 0,
    })
    .execute();

  return NextResponse.json(
    {
      map: {
        id,
        name: parsed.mapName,
        width: parsed.width,
        height: parsed.height,
        maxTurns: parsed.maxTurns,
        isOfficial: false,
      },
    },
    { status: 201 },
  );
}
