import type { PlayerId, Position, Tile } from "./engine";

export type ChaserDotMap = {
  mapName: string;
  width: number;
  height: number;
  maxTurns: number;
  tiles: Tile[][]; // [y][x]
  spawn: Record<PlayerId, Position>;
};

function parseIntStrict(value: string, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer: ${value}`);
  }
  return parsed;
}

function parseCsvInts(
  value: string,
  expected: number,
  label: string,
): number[] {
  const parts = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (parts.length !== expected) {
    throw new Error(`${label} must have ${expected} values: ${value}`);
  }
  return parts.map((p, idx) => parseIntStrict(p, `${label}[${idx}]`));
}

function mapDotMapTile(value: number, y: number, x: number): Tile {
  if (value === 0) return 0;
  if (value === 2) return 2;
  if (value === 3) return 3;
  throw new Error(`Unsupported tile value at D[${y}][${x}]: ${value}`);
}

function parseSpawn(value: string, label: "C" | "H"): Position {
  const [x, y] = parseCsvInts(value, 2, `${label} (x,y)`);
  return { x, y };
}

/**
 * Parse CHaser official `.map` format.
 *
 * Supported tags:
 * - N: map name
 * - T: max turns
 * - S: width,height
 * - C: Cool spawn x,y
 * - H: Hot spawn x,y
 * - D: row values (0=floor, 2=block, 3=item)
 */
export function parseChaserDotMap(content: string): ChaserDotMap {
  let mapName: string | null = null;
  let maxTurns: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let coolSpawn: Position | null = null;
  let hotSpawn: Position | null = null;
  const rows: number[][] = [];

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const withoutComment = rawLine.split("#")[0] ?? "";
    const line = withoutComment.trim();
    if (!line) continue;

    const idx = line.indexOf(":");
    if (idx < 0) continue;

    const tag = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!tag) continue;

    switch (tag) {
      case "N":
        mapName = value.trim();
        break;
      case "T":
        maxTurns = parseIntStrict(value, "T (maxTurns)");
        break;
      case "S": {
        const [w, h] = parseCsvInts(value, 2, "S (width,height)");
        width = w;
        height = h;
        break;
      }
      case "C":
        coolSpawn = parseSpawn(value, "C");
        break;
      case "H":
        hotSpawn = parseSpawn(value, "H");
        break;
      case "D": {
        const row = value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
          .map((v, col) =>
            parseIntStrict(v, `D value (${rows.length},${col})`),
          );
        rows.push(row);
        break;
      }
      default:
        // ignore unknown tags for forward compatibility
        break;
    }
  }

  if (!mapName) throw new Error("N (map name) is required");
  if (maxTurns === null) throw new Error("T (maxTurns) is required");
  if (width === null || height === null)
    throw new Error("S (width,height) is required");
  if (!coolSpawn) throw new Error("C (Cool spawn) is required");
  if (!hotSpawn) throw new Error("H (Hot spawn) is required");

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid map size: ${width}x${height}`);
  }

  if (rows.length !== height) {
    throw new Error(
      `D rows must be exactly height=${height}, got ${rows.length}`,
    );
  }
  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? [];
    if (row.length !== width) {
      throw new Error(`D row ${y} must have width=${width}, got ${row.length}`);
    }
  }

  const resolvedWidth = width;
  const resolvedHeight = height;
  const inBounds = (pos: Position) =>
    pos.x >= 0 && pos.x < resolvedWidth && pos.y >= 0 && pos.y < resolvedHeight;
  if (!inBounds(coolSpawn)) {
    throw new Error(
      `C spawn is out of bounds: (${coolSpawn.x},${coolSpawn.y})`,
    );
  }
  if (!inBounds(hotSpawn)) {
    throw new Error(`H spawn is out of bounds: (${hotSpawn.x},${hotSpawn.y})`);
  }
  if (coolSpawn.x === hotSpawn.x && coolSpawn.y === hotSpawn.y) {
    throw new Error("C and H spawns must be different");
  }

  const tiles: Tile[][] = rows.map((row, y) =>
    row.map((value, x) => mapDotMapTile(value, y, x)),
  );

  const coolTile = tiles[coolSpawn.y]?.[coolSpawn.x];
  const hotTile = tiles[hotSpawn.y]?.[hotSpawn.x];
  if (coolTile === 2) throw new Error("C spawn cannot be on a block");
  if (hotTile === 2) throw new Error("H spawn cannot be on a block");
  if (coolTile === 3) throw new Error("C spawn cannot be on an item");
  if (hotTile === 3) throw new Error("H spawn cannot be on an item");

  return {
    mapName,
    width,
    height,
    maxTurns,
    tiles,
    spawn: {
      Cool: coolSpawn,
      Hot: hotSpawn,
    },
  };
}
