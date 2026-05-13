import { parseChaserDotMap } from "./chaserDotMap";
import type { GameState, PlayerId, Position, Tile } from "./engine";

export interface GameMapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  maxTurns: number;
  tiles: Tile[][]; // [y][x], 0: floor / 1: character(未配置想定) / 2: block / 3: item
  spawn: Record<PlayerId, Position>;
  description?: string;
}

export interface MapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  maxTurns: number;
}

/**
 * DB の maps.id としても使う固定 ID。
 *
 * クライアント（LocalTrainingArena 等）でも参照されるため、Node の fs に依存しない。
 */
export const DEFAULT_MAP_ID = "sample-map-07";

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

const SAMPLE_07 = (() => {
  const parsed = parseChaserDotMap(SAMPLE_MAP_07_DOT_MAP);
  return {
    id: DEFAULT_MAP_ID,
    name: parsed.mapName,
    width: parsed.width,
    height: parsed.height,
    maxTurns: parsed.maxTurns,
    tiles: parsed.tiles,
    spawn: parsed.spawn,
  } satisfies GameMapDefinition;
})();

const BUILTIN_MAPS: Record<string, GameMapDefinition> = {
  [SAMPLE_07.id]: SAMPLE_07,
};

export function mapDefinitionToGameState(def: GameMapDefinition): GameState {
  // tiles は 2D 配列なので state 側で安全に扱えるようにディープコピーする
  const map: Tile[][] = def.tiles.map((row) => [...row]);

  // プレイヤー位置にキャラクタを配置
  const cool = def.spawn.Cool;
  const hot = def.spawn.Hot;
  map[cool.y][cool.x] = 1;
  map[hot.y][hot.x] = 1;

  return {
    width: def.width,
    height: def.height,
    map,
    players: {
      Cool: { id: "Cool", pos: { ...cool }, items: 0 },
      Hot: { id: "Hot", pos: { ...hot }, items: 0 },
    },
    turn: 0,
    maxTurns: def.maxTurns,
    status: "running",
  };
}

export function getMapDefinition(mapId: string): GameMapDefinition {
  const def = BUILTIN_MAPS[mapId];
  if (!def) {
    // 開発時の早期検知を優先して存在しない mapId は例外とする
    throw new Error(`Map not found: ${mapId}`);
  }
  return def;
}

export function listMapSummaries(): MapSummary[] {
  return Object.values(BUILTIN_MAPS).map((map) => ({
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    maxTurns: map.maxTurns,
  }));
}
