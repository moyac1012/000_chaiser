import type { Kysely } from "kysely";

import { parseChaserDotMap } from "@/core/chaserDotMap";
import { DEFAULT_MAP_ID } from "@/core/map";

import type { Database } from "./types";

const SYSTEM_USER_ID = "system";

const SAMPLE_MAP_01_DOT_MAP = `N:サンプルマップ01_Lookの確認
T:100
S:15,17
D:2,2,2,2,2,2,2,2,2,0,0,0,0,0,0
D:2,0,0,2,0,3,0,0,2,0,0,0,0,0,0
D:2,0,0,2,0,3,0,0,2,0,0,0,0,0,0
D:2,2,2,2,0,3,3,3,2,0,0,0,0,0,0
D:2,0,0,0,0,0,0,0,2,0,0,0,0,0,0
D:2,3,3,3,0,2,2,2,2,0,0,0,0,0,0
D:2,0,0,3,0,2,0,0,2,0,0,0,0,0,0
D:2,0,0,3,0,2,0,0,2,0,0,0,0,0,0
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:0,0,0,0,0,0,2,0,0,2,0,3,0,0,2
D:0,0,0,0,0,0,2,0,0,2,0,3,0,0,2
D:0,0,0,0,0,0,2,2,2,2,0,3,3,3,2
D:0,0,0,0,0,0,2,0,0,0,0,0,0,0,2
D:0,0,0,0,0,0,2,3,3,3,0,2,2,2,2
D:0,0,0,0,0,0,2,0,0,3,0,2,0,0,2
D:0,0,0,0,0,0,2,0,0,3,0,2,0,0,2
D:0,0,0,0,0,0,2,2,2,2,2,2,2,2,2
C:4,4
H:10,12
`;

const SAMPLE_MAP_02_DOT_MAP = `N:サンプルマップ02_Searchの確認
T:100
S:15,17
D:0,0,2,0,0,0,0,0,0,2,0,0,0,0,0
D:0,0,2,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,2,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,2,0,0,3,0,0,0,0,0,0,0,0,0
D:0,0,2,0,0,3,0,0,0,3,0,0,0,0,0
D:0,0,2,0,0,3,0,0,0,3,0,0,0,0,0
D:2,2,0,0,0,0,2,2,2,3,3,3,0,0,0
D:0,0,2,0,0,2,0,0,0,2,0,0,0,0,0
D:0,0,2,0,0,2,0,0,0,2,0,0,2,0,0
D:0,0,0,0,0,2,0,0,0,2,0,0,2,0,0
D:0,0,0,3,3,3,2,2,2,0,0,0,0,2,2
D:0,0,0,0,0,3,0,0,0,3,0,0,2,0,0
D:0,0,0,0,0,3,0,0,0,3,0,0,2,0,0
D:0,0,0,0,0,0,0,0,0,3,0,0,2,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,2,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,2,0,0
D:0,0,0,0,0,2,0,0,0,0,0,0,2,0,0
C:5,6
H:9,10
`;

const SAMPLE_MAP_03_DOT_MAP = `N:サンプルマップ03_壁の回避の確認
T:100
S:15,17
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,0,0,0,2,2,0,0,0,2,2,0,0,0,2
D:2,0,0,0,2,2,0,0,0,2,2,0,0,0,2
D:2,2,2,0,2,2,2,2,0,2,2,2,2,0,2
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,2,0,0,0,0,2,0,0,0,0,2,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:2,0,2,2,2,2,0,2,2,2,2,0,2,2,2
D:2,0,0,0,2,2,0,0,0,2,2,0,0,0,2
D:2,0,0,0,2,2,0,0,0,2,2,0,0,0,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
C:5,8
H:9,8
`;

const SAMPLE_MAP_04_DOT_MAP = `N:サンプルマップ04_アイテム取得の確認
T:100
S:15,17
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,0,0,0,0,0,2,0,0,0,0,0,2,2
D:2,2,0,3,0,3,0,0,0,3,0,3,0,2,2
D:2,2,0,0,0,0,0,0,0,0,0,0,0,2,2
D:2,2,0,3,0,3,0,0,0,3,0,3,0,2,2
D:2,2,0,0,0,0,0,2,0,0,0,0,0,2,2
D:2,2,2,0,0,0,2,2,2,0,0,0,2,2,2
D:2,2,0,0,0,0,0,2,0,0,0,0,0,2,2
D:2,2,0,3,0,3,0,0,0,3,0,3,0,2,2
D:2,2,0,0,0,0,0,0,0,0,0,0,0,2,2
D:2,2,0,3,0,3,0,0,0,3,0,3,0,2,2
D:2,2,0,0,0,0,0,2,0,0,0,0,0,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
C:4,5
H:10,11
`;

const SAMPLE_MAP_05_DOT_MAP = `N:サンプルマップ05_ループ脱出の確認
T:100
S:15,17
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,0,0,2,0,0,0,0,0,2,0,0,2,2,2
D:2,0,0,0,0,0,2,0,0,0,0,0,2,2,2
D:2,0,2,2,2,2,2,2,2,2,2,0,0,0,2
D:2,0,0,0,2,0,0,0,0,2,2,0,0,0,2
D:2,0,0,0,0,0,0,0,0,2,2,0,0,0,2
D:2,0,0,0,2,0,0,0,0,2,2,2,2,2,2
D:2,2,2,2,2,2,2,0,2,2,2,2,2,2,2
D:2,2,2,2,2,2,0,0,0,0,2,0,0,0,2
D:2,0,0,0,2,2,0,0,0,0,0,0,0,0,2
D:2,0,0,0,2,2,0,0,0,0,2,0,0,0,2
D:2,0,0,0,2,2,2,2,2,2,2,2,2,0,2
D:2,2,2,0,0,0,0,0,2,0,0,0,0,0,2
D:2,2,2,0,0,2,0,0,0,0,0,2,0,0,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
D:2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
C:2,11
H:12,5
`;

const SAMPLE_MAP_06_DOT_MAP = `N:サンプルマップ06_索敵の確認
T:100
S:15,17
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,2,0,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,2,0,2,0,0,0,0,0,0
D:0,0,0,0,0,0,0,2,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
C:7,13
H:7,3
`;

const SAMPLE_MAP_07_DOT_MAP = `N:サンプルマップ07_本番風マップ
T:100
S:15,17
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,3,0,3,0,3,0,3,0,3,0,3,0,0,0
D:0,0,3,0,0,0,3,0,0,0,3,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,3,0,0,0,3,0,0,0,3,0,0
D:0,0,0,3,0,3,0,3,0,3,0,3,0,3,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,3,0,3,0,3,0,3,0,3,0,3,0,0,0
D:0,0,3,0,0,0,3,0,0,0,3,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,3,0,0,0,3,0,0,0,3,0,0
D:0,0,0,3,0,3,0,3,0,3,0,3,0,3,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
D:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
C:2,15
H:12,1
`;

type MapSeed = {
  id: string;
  name: string;
  width: number;
  height: number;
  maxTurns: number;
  coolStart: { x: number; y: number };
  hotStart: { x: number; y: number };
  mapData: number[][];
  createdBy: string;
  isOfficial: boolean;
};

function parseDotMapSeed(args: {
  id: string;
  content: string;
  isOfficial: boolean;
}): MapSeed {
  const parsed = parseChaserDotMap(args.content);
  return {
    id: args.id,
    name: parsed.mapName,
    width: parsed.width,
    height: parsed.height,
    maxTurns: parsed.maxTurns,
    coolStart: parsed.spawn.Cool,
    hotStart: parsed.spawn.Hot,
    mapData: parsed.tiles,
    createdBy: SYSTEM_USER_ID,
    isOfficial: args.isOfficial,
  };
}

const SAMPLE_SEEDS: MapSeed[] = [
  parseDotMapSeed({
    id: "sample-map-01",
    content: SAMPLE_MAP_01_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: "sample-map-02",
    content: SAMPLE_MAP_02_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: "sample-map-03",
    content: SAMPLE_MAP_03_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: "sample-map-04",
    content: SAMPLE_MAP_04_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: "sample-map-05",
    content: SAMPLE_MAP_05_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: "sample-map-06",
    content: SAMPLE_MAP_06_DOT_MAP,
    isOfficial: false,
  }),
  parseDotMapSeed({
    id: DEFAULT_MAP_ID,
    content: SAMPLE_MAP_07_DOT_MAP,
    isOfficial: false,
  }),
];

export async function seed(db: Kysely<Database>): Promise<void> {
  const builtinSeeds = SAMPLE_SEEDS;
  const ids = builtinSeeds.map((s) => s.id);
  const existing = await db
    .selectFrom("maps")
    .select(["id"])
    .where("id", "in", ids)
    .execute();
  const existingSet = new Set(existing.map((row) => row.id));

  const toInsert = builtinSeeds.filter((s) => !existingSet.has(s.id));
  const toUpdate = builtinSeeds.filter((s) => existingSet.has(s.id));

  if (toInsert.length > 0) {
    await db
      .insertInto("maps")
      .values(
        toInsert.map((s) => ({
          id: s.id,
          name: s.name,
          width: s.width,
          height: s.height,
          max_turns: s.maxTurns,
          cool_start_x: s.coolStart.x,
          cool_start_y: s.coolStart.y,
          hot_start_x: s.hotStart.x,
          hot_start_y: s.hotStart.y,
          map_data: JSON.stringify(s.mapData),
          created_by: s.createdBy,
          is_official: s.isOfficial ? 1 : 0,
        })),
      )
      .execute();
  }

  for (const seedMap of toUpdate) {
    await db
      .updateTable("maps")
      .set({
        name: seedMap.name,
        width: seedMap.width,
        height: seedMap.height,
        max_turns: seedMap.maxTurns,
        cool_start_x: seedMap.coolStart.x,
        cool_start_y: seedMap.coolStart.y,
        hot_start_x: seedMap.hotStart.x,
        hot_start_y: seedMap.hotStart.y,
        map_data: JSON.stringify(seedMap.mapData),
        created_by: seedMap.createdBy,
        is_official: seedMap.isOfficial ? 1 : 0,
      })
      .where("id", "=", seedMap.id)
      .execute();
  }
}
