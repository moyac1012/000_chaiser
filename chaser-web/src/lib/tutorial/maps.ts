import type { Position, Tile } from "@/core/engine";

import type { TutorialMapAsset, TutorialMapDefinition } from "./types";

// ASCII grid parser for tutorial-only maps (keeps core map logic untouched).
type GridSpec = {
  id: string;
  name: string;
  maxTurns: number;
  rows: string[];
};

function parseTutorialGrid(spec: GridSpec): TutorialMapAsset {
  const { id, name, maxTurns, rows } = spec;
  if (rows.length === 0) {
    throw new Error(`${id}: rows are required`);
  }
  const width = rows[0]?.length ?? 0;
  if (width === 0) {
    throw new Error(`${id}: row width must be > 0`);
  }

  let cool: Position | null = null;
  let hot: Position | null = null;
  let goal: Position | null = null;

  const tiles: Tile[][] = rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `${id}: row ${y} must be width=${width}, got ${row.length}`,
      );
    }
    const rowTiles: Tile[] = [];
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      switch (ch) {
        case "#":
          rowTiles.push(2);
          break;
        case ".":
          rowTiles.push(0);
          break;
        case "I":
          rowTiles.push(3);
          break;
        case "C":
          if (cool) {
            throw new Error(`${id}: multiple C spawns are not allowed`);
          }
          cool = { x, y };
          rowTiles.push(0);
          break;
        case "H":
          if (hot) {
            throw new Error(`${id}: multiple H spawns are not allowed`);
          }
          hot = { x, y };
          rowTiles.push(0);
          break;
        case "G":
          if (goal) {
            throw new Error(`${id}: multiple goals are not allowed`);
          }
          goal = { x, y };
          rowTiles.push(0);
          break;
        default:
          throw new Error(`${id}: unsupported tile '${ch}' at (${x},${y})`);
      }
    }
    return rowTiles;
  });

  if (!cool) throw new Error(`${id}: C spawn is required`);
  if (!hot) throw new Error(`${id}: H spawn is required`);
  if (!goal) throw new Error(`${id}: goal is required`);

  const map: TutorialMapDefinition = {
    id,
    name,
    width,
    height: rows.length,
    maxTurns,
    tiles,
    spawn: {
      Cool: cool,
      Hot: hot,
    },
  };

  return { map, goal };
}

const STEP_01_A = parseTutorialGrid({
  id: "tutorial-step-01-a",
  name: "Step 01 Walk Up",
  maxTurns: 30,
  rows: ["#######", "#H#...#", "#.#.G.#", "#.#.C.#", "#######"],
});

const STEP_02_A = parseTutorialGrid({
  id: "tutorial-step-02-a",
  name: "Step 02 Walk Repeat",
  maxTurns: 30,
  rows: [
    "#######",
    "#.##G##",
    "#.##.##",
    "#H##.##",
    "#.##.##",
    "#.##C##",
    "#######",
  ],
});

const STEP_03_A = parseTutorialGrid({
  id: "tutorial-step-03-a",
  name: "Step 03 Walk Right",
  maxTurns: 30,
  rows: ["#######", "#H....#", "#C...G#", "#.....#", "#######"],
});

const STEP_04_A = parseTutorialGrid({
  id: "tutorial-step-04-a",
  name: "Step 04 L Maze",
  maxTurns: 40,
  rows: [
    "#######",
    "#....G#",
    "#.#####",
    "#.#####",
    "#.###.#",
    "#C###H#",
    "#######",
  ],
});

const STEP_05_A = parseTutorialGrid({
  id: "tutorial-step-05-a",
  name: "Step 05 Three Turns",
  maxTurns: 40,
  rows: [
    "#######",
    "###..G#",
    "###.###",
    "#...###",
    "#.#####",
    "#C.#.H#",
    "#######",
  ],
});

const STEP_06_A = parseTutorialGrid({
  id: "tutorial-step-06-a",
  name: "Step 06 Repeat Pattern",
  maxTurns: 40,
  rows: [
    "#######",
    "#####G#",
    "####..#",
    "###..##",
    "##..###",
    "#C.#.H#",
    "#######",
  ],
});

const STEP_07_A = parseTutorialGrid({
  id: "tutorial-step-07-a",
  name: "Step 07 Turn Limit",
  maxTurns: 30,
  rows: [
    "#######",
    "#..G..#",
    "#..#..#",
    "#..#..#",
    "#..#..#",
    "#C...H#",
    "#######",
  ],
});

const STEP_08_A = parseTutorialGrid({
  id: "tutorial-step-08-a",
  name: "Step 08 Up",
  maxTurns: 20,
  rows: ["#######", "#..G..#", "#..C..#", "#..#H.#", "#######"],
});

const STEP_08_B = parseTutorialGrid({
  id: "tutorial-step-08-b",
  name: "Step 08 Down",
  maxTurns: 20,
  rows: ["#######", "#H.#..#", "#..C..#", "#..G..#", "#######"],
});

const STEP_09_A = parseTutorialGrid({
  id: "tutorial-step-09-a",
  name: "Step 09 Branch Left",
  maxTurns: 40,
  rows: [
    "#######",
    "##G####",
    "##.####",
    "##..###",
    "###.###",
    "#..C.H#",
    "#######",
  ],
});

const STEP_09_B = parseTutorialGrid({
  id: "tutorial-step-09-b",
  name: "Step 09 Branch Right",
  maxTurns: 40,
  rows: [
    "#######",
    "####G##",
    "####.##",
    "###..##",
    "###.###",
    "#H.C..#",
    "#######",
  ],
});

const STEP_10_A = parseTutorialGrid({
  id: "tutorial-step-10-a",
  name: "Step 10 Remember Direction A",
  maxTurns: 30,
  rows: [
    "#########",
    "#########",
    "#########",
    "#########",
    "#####H###",
    "#G....C.#",
    "#########",
  ],
});

const STEP_10_B = parseTutorialGrid({
  id: "tutorial-step-10-b",
  name: "Step 10 Remember Direction B",
  maxTurns: 30,
  rows: [
    "#########",
    "#########",
    "#########",
    "#########",
    "###H#####",
    "#.C....G#",
    "#########",
  ],
});

const STEP_11_A = parseTutorialGrid({
  id: "tutorial-step-11-a",
  name: "Step 11 Zigzag A",
  maxTurns: 50,
  rows: [
    "#######",
    "#.#.#G#",
    "#.#.#.#",
    "#.#...#",
    "#.#.#.#",
    "#C..#H#",
    "#######",
  ],
});

const STEP_11_B = parseTutorialGrid({
  id: "tutorial-step-11-b",
  name: "Step 11 Zigzag B",
  maxTurns: 50,
  rows: [
    "#######",
    "#G#.#.#",
    "#.#.#.#",
    "#...#.#",
    "#.#.#.#",
    "#H#..C#",
    "#######",
  ],
});

const STEP_12_A = parseTutorialGrid({
  id: "tutorial-step-12-a",
  name: "Step 12 Look Branch A",
  maxTurns: 40,
  rows: [
    "#######",
    "#G##.H#",
    "#.#####",
    "#....##",
    "###.###",
    "###C###",
    "#######",
  ],
});

const STEP_12_B = parseTutorialGrid({
  id: "tutorial-step-12-b",
  name: "Step 12 Look Branch B",
  maxTurns: 40,
  rows: [
    "#######",
    "#H.##G#",
    "#####.#",
    "##....#",
    "###.###",
    "###C###",
    "#######",
  ],
});

const STEP_13_A = parseTutorialGrid({
  id: "tutorial-step-13-a",
  name: "Step 13 Look Dead End",
  maxTurns: 40,
  rows: [
    "#######",
    "#....G#",
    "####..#",
    "##....#",
    "###.###",
    "#..C.H#",
    "#######",
  ],
});

const STEP_14_A = parseTutorialGrid({
  id: "tutorial-step-14-a",
  name: "Step 14 Search Branch A",
  maxTurns: 50,
  rows: [
    "###########",
    "#H.######G#",
    "#########.#",
    "#..#......#",
    "#####.#####",
    "#####C#####",
    "###########",
  ],
});

const STEP_14_B = parseTutorialGrid({
  id: "tutorial-step-14-b",
  name: "Step 14 Search Branch B",
  maxTurns: 50,
  rows: [
    "###########",
    "#G######.H#",
    "#.#########",
    "#......#..#",
    "#####.#####",
    "#####C#####",
    "###########",
  ],
});

const STEP_15_A = parseTutorialGrid({
  id: "tutorial-step-15-a",
  name: "Step 15 Search Dead End",
  maxTurns: 40,
  rows: [
    "#########",
    "#H......#",
    "####.####",
    "#.#....G#",
    "####.####",
    "####C####",
    "#########",
  ],
});

const STEP_16_A = parseTutorialGrid({
  id: "tutorial-step-16-a",
  name: "Step 16 Look Search Combo A",
  maxTurns: 60,
  rows: [
    "###############",
    "#H..###########",
    "###############",
    "#########.#####",
    "#########.#####",
    "#########.#####",
    "#####........G#",
    "#######.#######",
    "#######.#######",
    "#######C#######",
    "###############",
  ],
});

const STEP_16_B = parseTutorialGrid({
  id: "tutorial-step-16-b",
  name: "Step 16 Look Search Combo B",
  maxTurns: 60,
  rows: [
    "###############",
    "###########..H#",
    "###############",
    "#####.#########",
    "#####.#########",
    "#####.#########",
    "#G........#####",
    "#######.#######",
    "#######.#######",
    "#######C#######",
    "###############",
  ],
});

const STEP_17_A = parseTutorialGrid({
  id: "tutorial-step-17-a",
  name: "Step 17 Item Intro",
  maxTurns: 40,
  rows: ["#######", "#H....#", "#C.I.G#", "#.....#", "#######"],
});

const STEP_18_A = parseTutorialGrid({
  id: "tutorial-step-18-a",
  name: "Step 18 Collect Items A",
  maxTurns: 60,
  rows: [
    "#########",
    "#H.....##",
    "#.......#",
    "#.C.I.G.#",
    "#..I....#",
    "#.......#",
    "#########",
  ],
});

const STEP_18_B = parseTutorialGrid({
  id: "tutorial-step-18-b",
  name: "Step 18 Collect Items B",
  maxTurns: 60,
  rows: [
    "#########",
    "##.....H#",
    "#.......#",
    "#.G.I.C.#",
    "#....I..#",
    "#.......#",
    "#########",
  ],
});

const STEP_19_A = parseTutorialGrid({
  id: "tutorial-step-19-a",
  name: "Step 19 Avoid Trap A",
  maxTurns: 60,
  rows: [
    "#######",
    "#H#####",
    "#..#G.#",
    "#..I#.#",
    "#..#..#",
    "#C....#",
    "#######",
  ],
});

const STEP_19_B = parseTutorialGrid({
  id: "tutorial-step-19-b",
  name: "Step 19 Avoid Trap B",
  maxTurns: 60,
  rows: [
    "#######",
    "#####H#",
    "#.G#..#",
    "#.#I..#",
    "#..#..#",
    "#....C#",
    "#######",
  ],
});

const STEP_20_A = parseTutorialGrid({
  id: "tutorial-step-20-a",
  name: "Step 20 Search Items",
  maxTurns: 60,
  rows: [
    "#########",
    "#..G....#",
    "#.###.###",
    "#..I.I..#",
    "#.###.###",
    "#C.....H#",
    "#########",
  ],
});

const STEP_21_A = parseTutorialGrid({
  id: "tutorial-step-21-a",
  name: "Step 21 Put Intro A",
  maxTurns: 30,
  rows: [
    "#######",
    "#..G..#",
    "#..H..#",
    "#..C..#",
    "#.....#",
    "#.....#",
    "#######",
  ],
});

const STEP_21_B = parseTutorialGrid({
  id: "tutorial-step-21-b",
  name: "Step 21 Put Intro B",
  maxTurns: 30,
  rows: [
    "#######",
    "#..G..#",
    "#.....#",
    "#..CH.#",
    "#.....#",
    "#.....#",
    "#######",
  ],
});

const STEP_22_A = parseTutorialGrid({
  id: "tutorial-step-22-a",
  name: "Step 22 Put Approach",
  maxTurns: 30,
  rows: [
    "#######",
    "#..H..#",
    "#G....#",
    "#.....#",
    "#.....#",
    "#..C..#",
    "#######",
  ],
});

const STEP_23_A = parseTutorialGrid({
  id: "tutorial-step-23-a",
  name: "Step 23 Put Caution A",
  maxTurns: 40,
  rows: [
    "#########",
    "#...G...#",
    "#########",
    "####C####",
    "####.####",
    "####H####",
    "#########",
  ],
});

const STEP_23_B = parseTutorialGrid({
  id: "tutorial-step-23-b",
  name: "Step 23 Put Caution B",
  maxTurns: 40,
  rows: [
    "#########",
    "#...G...#",
    "#########",
    "###C.H###",
    "#########",
    "#########",
    "#########",
  ],
});

const STEP_24_A = parseTutorialGrid({
  id: "tutorial-step-24-a",
  name: "Step 24 Final Hunt Put A",
  maxTurns: 80,
  rows: [
    "###########",
    "#...G.....#",
    "#####.#####",
    "#####.#####",
    "#####.#####",
    "#H........#",
    "#####.#####",
    "#####.#####",
    "#####.#####",
    "#####C#####",
    "###########",
  ],
});

const STEP_24_B = parseTutorialGrid({
  id: "tutorial-step-24-b",
  name: "Step 24 Final Hunt Put B",
  maxTurns: 80,
  rows: [
    "###########",
    "#...G.....#",
    "#####.#####",
    "#####.#####",
    "#####.#####",
    "#........H#",
    "#####.#####",
    "#####.#####",
    "#####.#####",
    "#####C#####",
    "###########",
  ],
});

export const TUTORIAL_MAPS = {
  [STEP_01_A.map.id]: STEP_01_A,
  [STEP_02_A.map.id]: STEP_02_A,
  [STEP_03_A.map.id]: STEP_03_A,
  [STEP_04_A.map.id]: STEP_04_A,
  [STEP_05_A.map.id]: STEP_05_A,
  [STEP_06_A.map.id]: STEP_06_A,
  [STEP_07_A.map.id]: STEP_07_A,
  [STEP_08_A.map.id]: STEP_08_A,
  [STEP_08_B.map.id]: STEP_08_B,
  [STEP_09_A.map.id]: STEP_09_A,
  [STEP_09_B.map.id]: STEP_09_B,
  [STEP_10_A.map.id]: STEP_10_A,
  [STEP_10_B.map.id]: STEP_10_B,
  [STEP_11_A.map.id]: STEP_11_A,
  [STEP_11_B.map.id]: STEP_11_B,
  [STEP_12_A.map.id]: STEP_12_A,
  [STEP_12_B.map.id]: STEP_12_B,
  [STEP_13_A.map.id]: STEP_13_A,
  [STEP_14_A.map.id]: STEP_14_A,
  [STEP_14_B.map.id]: STEP_14_B,
  [STEP_15_A.map.id]: STEP_15_A,
  [STEP_16_A.map.id]: STEP_16_A,
  [STEP_16_B.map.id]: STEP_16_B,
  [STEP_17_A.map.id]: STEP_17_A,
  [STEP_18_A.map.id]: STEP_18_A,
  [STEP_18_B.map.id]: STEP_18_B,
  [STEP_19_A.map.id]: STEP_19_A,
  [STEP_19_B.map.id]: STEP_19_B,
  [STEP_20_A.map.id]: STEP_20_A,
  [STEP_21_A.map.id]: STEP_21_A,
  [STEP_21_B.map.id]: STEP_21_B,
  [STEP_22_A.map.id]: STEP_22_A,
  [STEP_23_A.map.id]: STEP_23_A,
  [STEP_23_B.map.id]: STEP_23_B,
  [STEP_24_A.map.id]: STEP_24_A,
  [STEP_24_B.map.id]: STEP_24_B,
} as const satisfies Record<string, TutorialMapAsset>;

export function getTutorialMapAsset(mapId: string): TutorialMapAsset {
  const asset = TUTORIAL_MAPS[mapId];
  if (!asset) {
    throw new Error(`Tutorial map not found: ${mapId}`);
  }
  return asset;
}
