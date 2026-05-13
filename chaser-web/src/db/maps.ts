import type { Position, Tile } from "@/core/engine";
import type { GameMapDefinition } from "@/core/map";
import { db, dbReady } from "./client";

function assertTile(value: unknown, label: string): asserts value is Tile {
  if (value === 0 || value === 2 || value === 3) return;
  throw new Error(`${label} must be a Tile(0/2/3), got ${String(value)}`);
}

function parseMapData(args: {
  json: string;
  width: number;
  height: number;
}): Tile[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.json);
  } catch {
    throw new Error("map_data must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("map_data must be a 2D array");
  }
  if (parsed.length !== args.height) {
    throw new Error(
      `map_data height mismatch: expected ${args.height}, got ${parsed.length}`,
    );
  }
  const rows: Tile[][] = [];
  for (let y = 0; y < args.height; y += 1) {
    const row = (parsed as unknown[])[y];
    if (!Array.isArray(row)) {
      throw new Error(`map_data row ${y} must be an array`);
    }
    if (row.length !== args.width) {
      throw new Error(
        `map_data width mismatch at row ${y}: expected ${args.width}, got ${row.length}`,
      );
    }
    const tiles: Tile[] = [];
    for (let x = 0; x < args.width; x += 1) {
      const value = (row as unknown[])[x];
      assertTile(value, `map_data[${y}][${x}]`);
      tiles.push(value);
    }
    rows.push(tiles);
  }
  return rows;
}

function assertSpawnPositions(args: {
  width: number;
  height: number;
  tiles: Tile[][];
  cool: Position;
  hot: Position;
}): void {
  const { width, height, tiles, cool, hot } = args;
  const inBounds = (pos: Position) =>
    pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;

  if (!inBounds(cool)) {
    throw new Error(`Cool spawn is out of bounds: (${cool.x},${cool.y})`);
  }
  if (!inBounds(hot)) {
    throw new Error(`Hot spawn is out of bounds: (${hot.x},${hot.y})`);
  }
  if (cool.x === hot.x && cool.y === hot.y) {
    throw new Error("Cool and Hot spawns must be different");
  }

  const coolTile = tiles[cool.y]?.[cool.x];
  const hotTile = tiles[hot.y]?.[hot.x];
  if (coolTile === 2) {
    throw new Error("Cool spawn cannot be on a block");
  }
  if (hotTile === 2) {
    throw new Error("Hot spawn cannot be on a block");
  }
  if (coolTile === 3) {
    throw new Error("Cool spawn cannot be on an item");
  }
  if (hotTile === 3) {
    throw new Error("Hot spawn cannot be on an item");
  }
}

export async function getMapDefinitionFromDb(
  mapId: string,
): Promise<GameMapDefinition> {
  await dbReady;
  const row = await db
    .selectFrom("maps")
    .selectAll()
    .where("id", "=", mapId)
    .executeTakeFirst();
  if (!row) {
    throw new Error(`Map not found: ${mapId}`);
  }

  const tiles = parseMapData({
    json: row.map_data,
    width: row.width,
    height: row.height,
  });

  const cool = { x: row.cool_start_x, y: row.cool_start_y };
  const hot = { x: row.hot_start_x, y: row.hot_start_y };

  assertSpawnPositions({
    width: row.width,
    height: row.height,
    tiles,
    cool,
    hot,
  });

  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    maxTurns: row.max_turns,
    tiles,
    spawn: {
      Cool: cool,
      Hot: hot,
    },
  };
}

export async function mapExists(mapId: string): Promise<boolean> {
  await dbReady;
  const row = await db
    .selectFrom("maps")
    .select(["id"])
    .where("id", "=", mapId)
    .executeTakeFirst();
  return Boolean(row?.id);
}
