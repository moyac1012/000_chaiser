import { getMapDefinition, mapDefinitionToGameState } from "./map";

export type Tile = 0 | 1 | 2 | 3;
// 0: floor, 1: character, 2: block, 3: item

export type PlayerId = "Cool" | "Hot";

export interface Position {
  x: number; // 0..width-1
  y: number; // 0..height-1
}

export interface PlayerState {
  id: PlayerId;
  pos: Position;
  items: number; // number of acquired items
}

export type GameStatus = "running" | "winCool" | "winHot" | "draw" | "invalid";

export interface GameState {
  width: number;
  height: number;
  map: Tile[][]; // [y][x]
  players: Record<PlayerId, PlayerState>;
  turn: number; // action index (1 action per increment; 2 actions = 1 full turn)
  maxTurns: number; // full-turn limit (Cool+Hot = 1 turn)
  status: GameStatus;
}

export type Direction = "Right" | "Left" | "Up" | "Down";

export type CommandKind = "walk" | "look" | "search" | "put";

export interface Action {
  kind: CommandKind;
  dir: Direction;
}

export interface TurnView {
  turn: number; // action index (same semantics as GameState.turn)
  maxTurns: number; // full-turn limit
  items: number; // own acquired items
  enemyItems: number; // opponent's acquired items
  around: number[]; // self-centered 3x3 info, length 9, values are Tile(0..3)
}

export type EngineEndReason =
  | "putOnEnemy"
  | "putOnEnemyMutualSurround"
  | "walkIntoBlock"
  | "walkOutOfBounds"
  | "enemySurroundedByPut"
  | "selfSurroundedByPut"
  | "mutualSurroundedByPut"
  | "enemySurroundedAfterWalk"
  | "selfSurroundedAfterWalk"
  | "mutualSurroundedAfterWalk"
  | "enemySurroundedAfterItem"
  | "selfSurroundedAfterItem"
  | "mutualSurroundedAfterItem"
  | "turnLimitItems"
  | "turnLimitDraw";

export interface EngineEndInfo {
  reason: EngineEndReason;
  point: Position | null;
}

export interface EngineStepResult {
  state: GameState;
  view: TurnView;
  /**
   * look/search の観測結果（Bot API v1 用）
   *
   * - walk/put では undefined
   * - look/search では「観測した配列（長さ 9）」を返す
   */
  observation?: number[];
  end?: EngineEndInfo;
}

function formatUnexpectedTileError(x: number, y: number, tile: number): string {
  return `Unexpected tile value at (${x},${y}): ${tile}`;
}

export function getCompletedTurns(actionTurn: number): number {
  return Math.floor(actionTurn / 2);
}

export function getCurrentTurnNumber(actionTurn: number): number {
  return Math.floor((actionTurn + 1) / 2);
}

export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object") return false;
  const record = value as { kind?: unknown; dir?: unknown };
  return (
    (record.kind === "walk" ||
      record.kind === "look" ||
      record.kind === "search" ||
      record.kind === "put") &&
    (record.dir === "Right" ||
      record.dir === "Left" ||
      record.dir === "Up" ||
      record.dir === "Down")
  );
}

export function getTurnView(state: GameState, player: PlayerId): TurnView {
  const self = state.players[player];
  const enemy = state.players[player === "Cool" ? "Hot" : "Cool"];

  const around: number[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = self.pos.x + dx;
      const y = self.pos.y + dy;
      if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
        // 盤面外をどう扱うかは仕様次第。現状はブロック扱い(2)で塞いでおく。
        around.push(2);
      } else {
        around.push(getTileAt(state, x, y));
      }
    }
  }

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    items: self.items,
    enemyItems: enemy.items,
    around,
  };
}

/**
 * mapId に対応するマップ定義を読み込み、初期 GameState を構築する。
 */
export function initGame(mapId: string): GameState {
  const def = getMapDefinition(mapId);
  return mapDefinitionToGameState(def);
}

function getLookView(
  state: GameState,
  player: PlayerId,
  dir: Direction,
): TurnView {
  const self = state.players[player];
  const enemy = state.players[player === "Cool" ? "Hot" : "Cool"];

  const { dx, dy } = directionToDelta(dir);
  // look は「自分のマスを含まない」3×3 を返す前提。
  // 1マス先〜3マス先をカバーするため、中心は2マス先になる。
  const centerX = self.pos.x + dx * 2;
  const centerY = self.pos.y + dy * 2;

  const around: number[] = [];

  for (let dy2 = -1; dy2 <= 1; dy2++) {
    for (let dx2 = -1; dx2 <= 1; dx2++) {
      const x = centerX + dx2;
      const y = centerY + dy2;
      if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
        // 盤面外は walk/put と同様にブロック扱い(2)
        around.push(2);
      } else {
        around.push(getTileAt(state, x, y));
      }
    }
  }

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    items: self.items,
    enemyItems: enemy.items,
    around,
  };
}

function getSearchView(
  state: GameState,
  player: PlayerId,
  dir: Direction,
): TurnView {
  const self = state.players[player];
  const enemy = state.players[player === "Cool" ? "Hot" : "Cool"];

  const { dx, dy } = directionToDelta(dir);
  const around: number[] = [];

  for (let i = 1; i <= 9; i++) {
    const x = self.pos.x + dx * i;
    const y = self.pos.y + dy * i;
    if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
      around.push(2);
    } else {
      around.push(getTileAt(state, x, y));
    }
  }

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    items: self.items,
    enemyItems: enemy.items,
    around,
  };
}

function stepNoop(state: GameState, player: PlayerId): EngineStepResult {
  const nextState: GameState = {
    ...state,
    turn: state.turn + 1,
  };

  return {
    state: nextState,
    view: getTurnView(nextState, player),
  };
}

function directionToDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case "Right":
      return { dx: 1, dy: 0 };
    case "Left":
      return { dx: -1, dy: 0 };
    case "Up":
      return { dx: 0, dy: -1 };
    case "Down":
      return { dx: 0, dy: 1 };
  }
}

function getTileAt(state: GameState, x: number, y: number): Tile {
  const tile = state.map[y]?.[x];
  if (tile === 0 || tile === 1 || tile === 2 || tile === 3) {
    return tile;
  }
  throw new Error(formatUnexpectedTileError(x, y, Number(tile)));
}

function isEnemyAt(
  state: GameState,
  player: PlayerId,
  x: number,
  y: number,
): boolean {
  const enemyId: PlayerId = player === "Cool" ? "Hot" : "Cool";
  const enemy = state.players[enemyId];
  return enemy.pos.x === x && enemy.pos.y === y;
}

function isSurroundedByBlocks(state: GameState, player: PlayerId): boolean {
  const self = state.players[player];
  const deltas: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 }, // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 }, // right
  ];

  for (const { dx, dy } of deltas) {
    const x = self.pos.x + dx;
    const y = self.pos.y + dy;
    // 盤面外はルール上の壁として扱う。
    if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
      continue;
    }
    if (getTileAt(state, x, y) !== 2) {
      return false;
    }
  }

  return true;
}

function setWinStatusFor(state: GameState, winner: PlayerId): GameState {
  return {
    ...state,
    status: winner === "Cool" ? "winCool" : "winHot",
  };
}

function applyTurnLimitIfNeeded(state: GameState): GameState {
  if (state.status !== "running") {
    return state;
  }

  const completedTurns = getCompletedTurns(state.turn);
  if (completedTurns < state.maxTurns) {
    return state;
  }

  const coolItems = state.players.Cool.items;
  const hotItems = state.players.Hot.items;

  if (coolItems > hotItems) {
    return setWinStatusFor(state, "Cool");
  }
  if (hotItems > coolItems) {
    return setWinStatusFor(state, "Hot");
  }

  return {
    ...state,
    status: "draw",
  };
}

function stepWalk(
  state: GameState,
  player: PlayerId,
  dir: Direction,
): EngineStepResult {
  const delta = directionToDelta(dir);
  const self = state.players[player];
  const targetX = self.pos.x + delta.dx;
  const targetY = self.pos.y + delta.dy;

  const targetOutOfBounds =
    targetX < 0 ||
    targetX >= state.width ||
    targetY < 0 ||
    targetY >= state.height;

  if (targetOutOfBounds) {
    const status: GameStatus = player === "Cool" ? "winHot" : "winCool";
    const nextState: GameState = {
      ...state,
      turn: state.turn + 1,
      status,
    };
    return {
      state: nextState,
      view: getTurnView(nextState, player),
      end: { reason: "walkOutOfBounds", point: { x: targetX, y: targetY } },
    };
  }

  const targetTile = getTileAt(state, targetX, targetY);
  const enemyAtTarget = isEnemyAt(state, player, targetX, targetY);

  if (targetTile === 2) {
    const status: GameStatus = player === "Cool" ? "winHot" : "winCool";
    const nextState: GameState = {
      ...state,
      turn: state.turn + 1,
      status,
    };
    return {
      state: nextState,
      view: getTurnView(nextState, player),
      end: { reason: "walkIntoBlock", point: { x: targetX, y: targetY } },
    };
  }

  if (targetTile !== 0 && targetTile !== 3 && !enemyAtTarget) {
    throw new Error(formatUnexpectedTileError(targetX, targetY, targetTile));
  }

  // 床またはアイテムへの移動
  // NOTE: ルールブックに敵マスへ歩いた際の特別な勝敗条件は明記されていないため、
  // 同じマスに重なることを許可する。
  const mapCopy: Tile[][] = state.map.map((row) => row.slice());
  const playersCopy: Record<PlayerId, PlayerState> = {
    Cool: { ...state.players.Cool, pos: { ...state.players.Cool.pos } },
    Hot: { ...state.players.Hot, pos: { ...state.players.Hot.pos } },
  };

  const enemyId: PlayerId = player === "Cool" ? "Hot" : "Cool";
  const enemyPos = state.players[enemyId].pos;

  const previousPos = { ...self.pos };
  const didCollectItem = targetTile === 3;
  const enemyAtPrevious =
    enemyPos.x === previousPos.x && enemyPos.y === previousPos.y;

  // 元位置を床にしておき、必要なら後でブロックで上書きする
  mapCopy[previousPos.y][previousPos.x] = enemyAtPrevious ? 1 : 0;

  playersCopy[player].pos = { x: targetX, y: targetY };
  if (didCollectItem) {
    playersCopy[player].items += 1;
  }

  mapCopy[targetY][targetX] = 1;

  if (didCollectItem) {
    mapCopy[previousPos.y][previousPos.x] = 2;
  }

  const nextState: GameState = {
    ...state,
    map: mapCopy,
    players: playersCopy,
    turn: state.turn + 1,
    status: "running",
  };

  const selfSurrounded = isSurroundedByBlocks(nextState, player);
  const enemySurrounded = isSurroundedByBlocks(nextState, enemyId);

  if (didCollectItem && enemyAtPrevious) {
    const updated: GameState = selfSurrounded
      ? { ...nextState, status: "draw" }
      : setWinStatusFor(nextState, player);
    const reason: EngineEndReason = selfSurrounded
      ? "putOnEnemyMutualSurround"
      : "putOnEnemy";
    return {
      state: updated,
      view: getTurnView(updated, player),
      end: { reason, point: { ...previousPos } },
    };
  }

  if (selfSurrounded && enemySurrounded) {
    const updated: GameState = { ...nextState, status: "draw" };
    const reason: EngineEndReason = didCollectItem
      ? "mutualSurroundedAfterItem"
      : "mutualSurroundedAfterWalk";
    return {
      state: updated,
      view: getTurnView(updated, player),
      end: { reason, point: null },
    };
  } else if (enemySurrounded) {
    const updated = setWinStatusFor(nextState, player);
    const reason: EngineEndReason = didCollectItem
      ? "enemySurroundedAfterItem"
      : "enemySurroundedAfterWalk";
    return {
      state: updated,
      view: getTurnView(updated, player),
      end: { reason, point: { ...playersCopy[enemyId].pos } },
    };
  } else if (selfSurrounded) {
    const updated = setWinStatusFor(nextState, enemyId);
    const reason: EngineEndReason = didCollectItem
      ? "selfSurroundedAfterItem"
      : "selfSurroundedAfterWalk";
    return {
      state: updated,
      view: getTurnView(updated, player),
      end: { reason, point: { ...playersCopy[player].pos } },
    };
  }

  return {
    state: nextState,
    view: getTurnView(nextState, player),
  };
}

function stepPut(
  state: GameState,
  player: PlayerId,
  dir: Direction,
): EngineStepResult {
  const delta = directionToDelta(dir);
  const targetX = state.players[player].pos.x + delta.dx;
  const targetY = state.players[player].pos.y + delta.dy;

  const outOfBounds =
    targetX < 0 ||
    targetX >= state.width ||
    targetY < 0 ||
    targetY >= state.height;
  if (outOfBounds) {
    return stepNoop(state, player);
  }

  const targetTile = getTileAt(state, targetX, targetY);
  const enemyAtTarget = isEnemyAt(state, player, targetX, targetY);

  // 既にブロックなら何も起こらない
  if (targetTile === 2) {
    return stepNoop(state, player);
  }

  const mapCopy: Tile[][] = state.map.map((row) => row.slice());
  mapCopy[targetY][targetX] = 2;

  const putOnEnemy = enemyAtTarget;

  let nextState: GameState = {
    ...state,
    map: mapCopy,
    turn: state.turn + 1,
    status: "running",
  };

  const enemyId: PlayerId = player === "Cool" ? "Hot" : "Cool";
  const selfSurrounded = isSurroundedByBlocks(nextState, player);
  const enemySurrounded = isSurroundedByBlocks(nextState, enemyId);

  if (putOnEnemy) {
    if (selfSurrounded) {
      nextState = { ...nextState, status: "draw" };
    } else {
      nextState = setWinStatusFor(nextState, player);
    }
  } else {
    if (selfSurrounded && enemySurrounded) {
      nextState = { ...nextState, status: "draw" };
    } else if (enemySurrounded) {
      nextState = setWinStatusFor(nextState, player);
    } else if (selfSurrounded) {
      nextState = setWinStatusFor(nextState, enemyId);
    }
  }

  // NOTE: アイテム取得時の自動ブロックでも同じ囲まれ判定を再利用する予定。
  let end: EngineEndInfo | undefined;
  if (nextState.status !== "running") {
    if (putOnEnemy) {
      end = {
        reason: selfSurrounded ? "putOnEnemyMutualSurround" : "putOnEnemy",
        point: { x: targetX, y: targetY },
      };
    } else if (selfSurrounded && enemySurrounded) {
      end = { reason: "mutualSurroundedByPut", point: null };
    } else if (enemySurrounded) {
      end = {
        reason: "enemySurroundedByPut",
        point: { ...state.players[enemyId].pos },
      };
    } else if (selfSurrounded) {
      end = {
        reason: "selfSurroundedByPut",
        point: { ...state.players[player].pos },
      };
    }
  }

  return {
    state: nextState,
    view: getTurnView(nextState, player),
    end,
  };
}

/**
 * 1 プレイヤーの 1 アクションを適用する。
 *
 * - state: 現在のゲーム状態
 * - player: 行動するプレイヤー (Cool / Hot)
 * - action: walk/look/search/put のいずれか
 *
 * 戻り値:
 * - 更新後の GameState
 * - 行動したプレイヤー視点の TurnView
 *
 * このタスクではまだロジックを完全実装しなくてよい。
 */
export function step(
  state: GameState,
  player: PlayerId,
  action: Action,
): EngineStepResult {
  // NOTE:
  // 本来、GameState.status !== 'running' の状態で step が呼ばれることは想定していないが、
  // 呼ばれても状態を変えないようにするための防御的ガード。
  if (state.status !== "running") {
    return { state, view: getTurnView(state, player) };
  }

  switch (action.kind) {
    case "walk":
      return applyTurnLimit(stepWalk(state, player, action.dir));
    case "look": {
      // 状態は変えず、観測結果（look）だけを返す。view は「通常の周囲 3x3」として統一する。
      const nextLookState: GameState = { ...state, turn: state.turn + 1 };
      const observation = getLookView(nextLookState, player, action.dir).around;
      return applyTurnLimit({
        state: nextLookState,
        view: getTurnView(nextLookState, player),
        observation,
      });
    }
    case "search": {
      // 状態は変えず、観測結果（search）だけを返す。view は「通常の周囲 3x3」として統一する。
      const nextSearchState: GameState = { ...state, turn: state.turn + 1 };
      const observation = getSearchView(
        nextSearchState,
        player,
        action.dir,
      ).around;
      return applyTurnLimit({
        state: nextSearchState,
        view: getTurnView(nextSearchState, player),
        observation,
      });
    }
    case "put":
      return applyTurnLimit(stepPut(state, player, action.dir));
  }
}

function applyTurnLimit(result: EngineStepResult): EngineStepResult {
  const nextState = applyTurnLimitIfNeeded(result.state);
  if (nextState === result.state) return result;

  if (
    result.state.status === "running" &&
    nextState.status !== "running" &&
    !result.end
  ) {
    const reason: EngineEndReason =
      nextState.status === "draw" ? "turnLimitDraw" : "turnLimitItems";
    return { ...result, state: nextState, end: { reason, point: null } };
  }

  return { ...result, state: nextState };
}
