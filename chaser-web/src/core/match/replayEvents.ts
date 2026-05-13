import type {
  Action,
  Direction,
  GameState,
  PlayerId,
  Position,
  Tile,
} from "../engine";

export type ReplayActor = "cool" | "hot";

export type ActionEventResult = "applied" | "noChange" | "invalid" | "timeout";

export type ActionNoChangeReason = "outOfBounds" | "targetIsBlock";

export type ObservationKind = "look3x3" | "searchLine9";

export type ActionEvent = {
  type: "action";
  id: string;
  turnIndex: number;
  actor: ReplayActor;
  action: Action;
  result: ActionEventResult;
  affectedCells: Position[];
  noChangeReason?: ActionNoChangeReason;
  tileChanges?: Array<{ x: number; y: number; from: Tile; to: Tile }>;
  playerDelta?: {
    posBefore: Position;
    posAfter: Position;
    itemsBefore: number;
    itemsAfter: number;
  };
  observation?: { kind: ObservationKind; tiles: number[] };
};

export type TurnEvent = {
  type: "turn";
  id: string;
  turnIndex: number;
  actionEventId: string;
  flags?: {
    itemPicked: boolean;
    autoBlockByItem: boolean;
  };
};

export type GameEndReason =
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
  | "turnLimitDraw"
  | "forfeitTimeout"
  | "forfeitDisconnect"
  | "forfeitLeaveSlot"
  | "forfeitError"
  | "serverError"
  | "manualEnd";

export type GameEndWinner = "cool" | "hot" | "draw" | "none";

export type GameEndEvent = {
  type: "gameEnd";
  id: string;
  winner: GameEndWinner;
  reason: GameEndReason;
  turnIndex: number;
  point: Position | null;
};

export type ReplayEvent = ActionEvent | TurnEvent | GameEndEvent;

function actorToReplayActor(playerId: PlayerId): ReplayActor {
  return playerId === "Cool" ? "cool" : "hot";
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

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.width && y >= 0 && y < state.height;
}

function uniqCells(cells: Position[]): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cell);
  }
  return out;
}

function computeTileChanges(
  before: GameState,
  after: GameState,
): ActionEvent["tileChanges"] {
  const changes: NonNullable<ActionEvent["tileChanges"]> = [];
  for (let y = 0; y < before.height; y += 1) {
    const beforeRow = before.map[y];
    const afterRow = after.map[y];
    for (let x = 0; x < before.width; x += 1) {
      const from = beforeRow[x];
      const to = afterRow[x];
      if (from !== to) {
        changes.push({ x, y, from, to });
      }
    }
  }
  return changes.length > 0 ? changes : undefined;
}

function computePlayerDelta(
  before: GameState,
  after: GameState,
  actor: PlayerId,
): ActionEvent["playerDelta"] {
  const beforeSelf = before.players[actor];
  const afterSelf = after.players[actor];
  if (
    beforeSelf.pos.x === afterSelf.pos.x &&
    beforeSelf.pos.y === afterSelf.pos.y &&
    beforeSelf.items === afterSelf.items
  ) {
    return undefined;
  }
  return {
    posBefore: { ...beforeSelf.pos },
    posAfter: { ...afterSelf.pos },
    itemsBefore: beforeSelf.items,
    itemsAfter: afterSelf.items,
  };
}

function computeObservedCells(
  state: GameState,
  actor: PlayerId,
  action: Action,
): Position[] {
  const selfPos = state.players[actor].pos;
  const { dx, dy } = directionToDelta(action.dir);
  if (action.kind === "look") {
    // look は「自分のマスを含まない」3×3 を返す前提。
    // 1マス先〜3マス先をカバーするため、中心は2マス先になる。
    const centerX = selfPos.x + dx * 2;
    const centerY = selfPos.y + dy * 2;
    const cells: Position[] = [];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const x = centerX + ox;
        const y = centerY + oy;
        if (!inBounds(state, x, y)) continue;
        cells.push({ x, y });
      }
    }
    return cells;
  }

  if (action.kind === "search") {
    const cells: Position[] = [];
    for (let i = 1; i <= 9; i += 1) {
      const x = selfPos.x + dx * i;
      const y = selfPos.y + dy * i;
      if (!inBounds(state, x, y)) continue;
      cells.push({ x, y });
    }
    return cells;
  }

  return [];
}

export function buildActionAndTurnEvents(args: {
  turnIndex: number;
  actor: PlayerId;
  action: Action;
  beforeState: GameState;
  afterState: GameState;
  observationTiles: number[] | null;
  endReason: string | null;
}): { actionEvent: ActionEvent; turnEvent: TurnEvent } {
  const actionEventId = `action:${args.turnIndex}`;
  const turnEventId = `turn:${args.turnIndex}`;

  const { dx, dy } = directionToDelta(args.action.dir);
  const selfPosBefore = args.beforeState.players[args.actor].pos;
  const targetX = selfPosBefore.x + dx;
  const targetY = selfPosBefore.y + dy;

  let result: ActionEventResult = "applied";
  let noChangeReason: ActionNoChangeReason | undefined;

  if (
    args.endReason === "walkIntoBlock" ||
    args.endReason === "walkOutOfBounds"
  ) {
    result = "invalid";
  } else if (args.action.kind === "put") {
    if (!inBounds(args.beforeState, targetX, targetY)) {
      result = "noChange";
      noChangeReason = "outOfBounds";
    } else if (args.beforeState.map[targetY][targetX] === 2) {
      result = "noChange";
      noChangeReason = "targetIsBlock";
    }
  }

  const tileChanges = computeTileChanges(args.beforeState, args.afterState);
  const playerDelta = computePlayerDelta(
    args.beforeState,
    args.afterState,
    args.actor,
  );

  const affectedCells: Position[] = [];
  if (inBounds(args.beforeState, targetX, targetY)) {
    if (args.action.kind === "put") {
      affectedCells.push({ x: targetX, y: targetY });
    }
    if (args.action.kind === "walk") {
      affectedCells.push({ x: targetX, y: targetY });
    }
  }
  if (args.action.kind === "walk") {
    affectedCells.push({ x: selfPosBefore.x, y: selfPosBefore.y });
  }
  if (tileChanges) {
    for (const change of tileChanges) {
      affectedCells.push({ x: change.x, y: change.y });
    }
  }
  for (const cell of computeObservedCells(
    args.beforeState,
    args.actor,
    args.action,
  )) {
    affectedCells.push(cell);
  }

  const actionEvent: ActionEvent = {
    type: "action",
    id: actionEventId,
    turnIndex: args.turnIndex,
    actor: actorToReplayActor(args.actor),
    action: args.action,
    result,
    affectedCells: uniqCells(affectedCells),
    ...(noChangeReason ? { noChangeReason } : null),
    ...(tileChanges ? { tileChanges } : null),
    ...(playerDelta ? { playerDelta } : null),
    ...(args.observationTiles
      ? {
          observation: {
            kind: args.action.kind === "search" ? "searchLine9" : "look3x3",
            tiles: args.observationTiles,
          },
        }
      : null),
  };

  const itemsBefore = args.beforeState.players[args.actor].items;
  const itemsAfter = args.afterState.players[args.actor].items;
  const itemPicked = itemsAfter > itemsBefore;
  const autoBlockByItem = Boolean(
    itemPicked &&
      tileChanges?.some(
        (change) =>
          change.x === selfPosBefore.x &&
          change.y === selfPosBefore.y &&
          change.to === 2,
      ),
  );

  const turnEvent: TurnEvent = {
    type: "turn",
    id: turnEventId,
    turnIndex: args.turnIndex,
    actionEventId,
    flags: { itemPicked, autoBlockByItem },
  };

  return { actionEvent, turnEvent };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isPosition(value: unknown): value is Position {
  return (
    isObject(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isAction(value: unknown): value is Action {
  return (
    isObject(value) &&
    typeof value.kind === "string" &&
    typeof value.dir === "string" &&
    (value.kind === "walk" ||
      value.kind === "look" ||
      value.kind === "search" ||
      value.kind === "put") &&
    (value.dir === "Right" ||
      value.dir === "Left" ||
      value.dir === "Up" ||
      value.dir === "Down")
  );
}

function isActionEventResult(value: unknown): value is ActionEventResult {
  return (
    value === "applied" ||
    value === "noChange" ||
    value === "invalid" ||
    value === "timeout"
  );
}

function isActionNoChangeReason(value: unknown): value is ActionNoChangeReason {
  return value === "outOfBounds" || value === "targetIsBlock";
}

function isObservationKind(value: unknown): value is ObservationKind {
  return value === "look3x3" || value === "searchLine9";
}

function isTileChange(
  value: unknown,
): value is NonNullable<ActionEvent["tileChanges"]>[number] {
  return (
    isObject(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    (value.from === 0 ||
      value.from === 1 ||
      value.from === 2 ||
      value.from === 3) &&
    (value.to === 0 || value.to === 1 || value.to === 2 || value.to === 3)
  );
}

function isGameEndReason(value: unknown): value is GameEndReason {
  return (
    value === "putOnEnemy" ||
    value === "putOnEnemyMutualSurround" ||
    value === "walkIntoBlock" ||
    value === "walkOutOfBounds" ||
    value === "enemySurroundedByPut" ||
    value === "selfSurroundedByPut" ||
    value === "mutualSurroundedByPut" ||
    value === "enemySurroundedAfterWalk" ||
    value === "selfSurroundedAfterWalk" ||
    value === "mutualSurroundedAfterWalk" ||
    value === "enemySurroundedAfterItem" ||
    value === "selfSurroundedAfterItem" ||
    value === "mutualSurroundedAfterItem" ||
    value === "turnLimitItems" ||
    value === "turnLimitDraw" ||
    value === "forfeitTimeout" ||
    value === "forfeitDisconnect" ||
    value === "forfeitLeaveSlot" ||
    value === "forfeitError" ||
    value === "serverError" ||
    value === "manualEnd"
  );
}

function isGameEndWinner(value: unknown): value is GameEndWinner {
  return (
    value === "cool" || value === "hot" || value === "draw" || value === "none"
  );
}

function isReplayEvent(value: unknown): value is ReplayEvent {
  if (!isObject(value) || typeof value.type !== "string") return false;

  if (value.type === "action") {
    if (typeof value.id !== "string") return false;
    if (typeof value.turnIndex !== "number") return false;
    if (value.actor !== "cool" && value.actor !== "hot") return false;
    if (!isAction(value.action)) return false;
    if (!isActionEventResult(value.result)) return false;
    if (
      !Array.isArray(value.affectedCells) ||
      !value.affectedCells.every(isPosition)
    ) {
      return false;
    }
    if (
      value.noChangeReason !== undefined &&
      !isActionNoChangeReason(value.noChangeReason)
    ) {
      return false;
    }
    if (value.tileChanges !== undefined) {
      if (
        !Array.isArray(value.tileChanges) ||
        !value.tileChanges.every(isTileChange)
      ) {
        return false;
      }
    }
    if (value.playerDelta !== undefined) {
      if (!isObject(value.playerDelta)) return false;
      if (!isPosition(value.playerDelta.posBefore)) return false;
      if (!isPosition(value.playerDelta.posAfter)) return false;
      if (typeof value.playerDelta.itemsBefore !== "number") return false;
      if (typeof value.playerDelta.itemsAfter !== "number") return false;
    }
    if (value.observation !== undefined) {
      if (!isObject(value.observation)) return false;
      if (!isObservationKind(value.observation.kind)) return false;
      if (
        !Array.isArray(value.observation.tiles) ||
        !value.observation.tiles.every((n) => typeof n === "number")
      ) {
        return false;
      }
    }
    return true;
  }

  if (value.type === "turn") {
    if (typeof value.id !== "string") return false;
    if (typeof value.turnIndex !== "number") return false;
    if (typeof value.actionEventId !== "string") return false;
    if (value.flags !== undefined) {
      if (!isObject(value.flags)) return false;
      if (typeof value.flags.itemPicked !== "boolean") return false;
      if (typeof value.flags.autoBlockByItem !== "boolean") return false;
    }
    return true;
  }

  if (value.type === "gameEnd") {
    if (typeof value.id !== "string") return false;
    if (!isGameEndWinner(value.winner)) return false;
    if (!isGameEndReason(value.reason)) return false;
    if (typeof value.turnIndex !== "number") return false;
    if (
      value.point !== null &&
      value.point !== undefined &&
      !isPosition(value.point)
    ) {
      return false;
    }
    return true;
  }

  return false;
}

export function parseReplayEventsJson(
  json: string | null,
): ReplayEvent[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every(isReplayEvent)) return null;
    return parsed;
  } catch {
    return null;
  }
}
