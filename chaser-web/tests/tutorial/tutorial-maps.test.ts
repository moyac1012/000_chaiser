import { describe, test } from "bun:test";

import {
  type Action,
  step as applyStep,
  type CommandKind,
  type Direction,
  type EngineEndInfo,
  type GameState,
  type PlayerId,
  type Tile,
} from "@/core/engine";
import { TUTORIAL_STEPS } from "@/lib/tutorial/definitions";
import { TUTORIAL_MAPS } from "@/lib/tutorial/maps";
import type {
  TutorialMapAsset,
  TutorialStepDefinition,
} from "@/lib/tutorial/types";

const DIRECTIONS: Direction[] = ["Up", "Right", "Down", "Left"];

function initState(asset: TutorialMapAsset): GameState {
  const map: Tile[][] = asset.map.tiles.map((row) => row.slice());
  const cool = asset.map.spawn.Cool;
  const hot = asset.map.spawn.Hot;
  map[cool.y][cool.x] = 1;
  map[hot.y][hot.x] = 1;
  return {
    width: asset.map.width,
    height: asset.map.height,
    map,
    players: {
      Cool: { id: "Cool", pos: { ...cool }, items: 0 },
      Hot: { id: "Hot", pos: { ...hot }, items: 0 },
    },
    turn: 0,
    maxTurns: asset.map.maxTurns,
    status: "running",
  };
}

function isSurroundedByBlocks(state: GameState, player: PlayerId): boolean {
  const self = state.players[player];
  const deltas: Array<{ dx: number; dy: number }> = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  for (const { dx, dy } of deltas) {
    const x = self.pos.x + dx;
    const y = self.pos.y + dy;
    if (y < 0 || y >= state.height || x < 0 || x >= state.width) {
      continue;
    }
    if (state.map[y][x] !== 2) {
      return false;
    }
  }

  return true;
}

function isGoalReached(
  state: GameState,
  goal: { x: number; y: number },
): boolean {
  const pos = state.players.Cool.pos;
  return pos.x === goal.x && pos.y === goal.y;
}

function countItems(map: Tile[][]): number {
  let count = 0;
  for (const row of map) {
    for (const tile of row) {
      if (tile === 3) count += 1;
    }
  }
  return count;
}

function isPutWin(end?: EngineEndInfo): boolean {
  return (
    end?.reason === "putOnEnemy" || end?.reason === "putOnEnemyMutualSurround"
  );
}

function buildActionPool(step: TutorialStepDefinition): Action[] {
  const filteredKinds: CommandKind[] = step.allowedActions.filter(
    (kind) => kind !== "look" && kind !== "search",
  );
  const kinds = filteredKinds.length > 0 ? filteredKinds : step.allowedActions;
  const actions: Action[] = [];
  for (const kind of kinds) {
    for (const dir of DIRECTIONS) {
      actions.push({ kind, dir });
    }
  }
  return actions;
}

function stateKey(state: GameState): string {
  const mapKey = state.map.map((row) => row.join("")).join("|");
  const cool = state.players.Cool;
  const hot = state.players.Hot;
  return `${mapKey}:${cool.pos.x},${cool.pos.y},${cool.items}:${hot.pos.x},${hot.pos.y},${hot.items}:${state.status}`;
}

function findSolution(
  step: TutorialStepDefinition,
  asset: TutorialMapAsset,
  goal: { x: number; y: number },
): Action[] | null {
  const maxActions = step.validation.maxActions ?? asset.map.maxTurns * 2;
  const actionPool = buildActionPool(step);
  if (actionPool.length === 0) return null;

  const initialState = initState(asset);
  if (
    step.validation.kind === "reachGoal" &&
    isGoalReached(initialState, goal) &&
    (!step.validation.requireAllItems || countItems(initialState.map) === 0)
  ) {
    return [];
  }

  const visited = new Map<string, number>();
  visited.set(stateKey(initialState), initialState.turn);

  const queue: Array<{ state: GameState; path: Action[] }> = [
    { state: initialState, path: [] },
  ];

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (node.path.length >= maxActions) {
      continue;
    }

    for (const action of actionPool) {
      const next = applyStep(node.state, "Cool", action);
      const nextPath = [...node.path, action];
      if (nextPath.length > maxActions) {
        continue;
      }

      if (step.validation.kind === "reachGoal") {
        if (
          isGoalReached(next.state, goal) &&
          (!step.validation.requireAllItems || countItems(next.state.map) === 0)
        ) {
          return nextPath;
        }
      } else if (step.validation.kind === "winByPut") {
        if (isPutWin(next.end)) {
          return nextPath;
        }
      }

      if (next.state.status !== "running") {
        continue;
      }

      const key = stateKey(next.state);
      const minTurn = visited.get(key);
      if (minTurn !== undefined && minTurn <= next.state.turn) {
        continue;
      }
      visited.set(key, next.state.turn);
      queue.push({ state: next.state, path: nextPath });
    }
  }

  return null;
}

describe("tutorial maps", () => {
  test("Hot spawn is not surrounded by blocks", () => {
    for (const asset of Object.values(TUTORIAL_MAPS)) {
      const state = initState(asset);
      if (isSurroundedByBlocks(state, "Hot")) {
        throw new Error(
          `${asset.map.id}: Hot is surrounded by blocks at spawn`,
        );
      }
    }
  });
});

describe("tutorial steps", () => {
  test("step ids are sequential and ordered", () => {
    const expected = [
      "step-01-walk-up",
      "step-02-walk-repeat",
      "step-03-walk-right",
      "step-04-l-maze",
      "step-05-two-turns",
      "step-06-repeat-pattern",
      "step-07-turn-limit-basic",
      "step-08-up-down-branch",
      "step-09-branch-left-right",
      "step-10-remember-direction",
      "step-11-zigzag-loop",
      "step-12-look-branch",
      "step-13-look-dead-end",
      "step-14-search-branch",
      "step-15-search-dead-end",
      "step-16-look-search-combo",
      "step-17-item-intro",
      "step-18-collect-items",
      "step-19-avoid-trap-item",
      "step-20-search-items",
      "step-21-put-intro",
      "step-22-approach-put",
      "step-23-put-caution",
      "step-24-final-hunt-put",
    ];
    const actual = TUTORIAL_STEPS.map((step) => step.id);

    if (actual.length !== expected.length) {
      throw new Error(
        `expected ${expected.length} steps, got ${actual.length}`,
      );
    }

    for (let i = 0; i < expected.length; i += 1) {
      if (actual[i] !== expected[i]) {
        throw new Error(`step order mismatch at ${i + 1}: ${actual[i]}`);
      }
    }
  });

  test("map variants align with step numbering", () => {
    for (const step of TUTORIAL_STEPS) {
      const match = step.id.match(/^step-(\d{2})-/);
      if (!match) {
        throw new Error(`invalid step id format: ${step.id}`);
      }
      const stepNumber = match[1];
      const suffixes: string[] = [];

      for (const variant of step.mapVariants) {
        const mapMatch = variant.mapId.match(
          new RegExp(`^tutorial-step-${stepNumber}-([ab])$`),
        );
        if (!mapMatch) {
          throw new Error(
            `map id ${variant.mapId} does not match step ${step.id}`,
          );
        }
        suffixes.push(mapMatch[1]);
      }

      if (suffixes.length === 1 && suffixes[0] !== "a") {
        throw new Error(`${step.id} must use -a for single variant`);
      }
      if (suffixes.length === 2) {
        const suffixSet = new Set(suffixes);
        if (!(suffixSet.has("a") && suffixSet.has("b"))) {
          throw new Error(`${step.id} must have -a and -b variants`);
        }
      }
    }
  });

  test("no unused tutorial maps", () => {
    const usedMapIds = new Set<string>();
    for (const step of TUTORIAL_STEPS) {
      for (const variant of step.mapVariants) {
        if (!TUTORIAL_MAPS[variant.mapId]) {
          throw new Error(`${step.id}: missing map asset ${variant.mapId}`);
        }
        usedMapIds.add(variant.mapId);
      }
    }

    for (const mapId of Object.keys(TUTORIAL_MAPS)) {
      if (!usedMapIds.has(mapId)) {
        throw new Error(`unused tutorial map: ${mapId}`);
      }
    }
  });

  test("tutorial text avoids wall wording", () => {
    for (const step of TUTORIAL_STEPS) {
      const texts = [
        step.title,
        step.summary,
        ...step.description,
        ...(step.hints ?? []),
      ];
      for (const text of texts) {
        if (text.includes("壁")) {
          throw new Error(
            `step ${step.id} contains forbidden wording: ${text}`,
          );
        }
      }
    }
  });

  test("step-01 includes tile legend", () => {
    const step01 = TUTORIAL_STEPS.find((step) => step.id === "step-01-walk-up");
    if (!step01) {
      throw new Error("step-01-walk-up not found");
    }
    const legend = "0床/1キャラ/2ブロック/3アイテム";
    if (!step01.description.some((line) => line.includes(legend))) {
      throw new Error("step-01 is missing tile legend description");
    }
  });

  test("step-24 is winByPut with A/B variants", () => {
    const step24 = TUTORIAL_STEPS.find(
      (step) => step.id === "step-24-final-hunt-put",
    );
    if (!step24) {
      throw new Error("step-24-final-hunt-put not found");
    }
    if (step24.validation.kind !== "winByPut") {
      throw new Error("step-24 must use winByPut validation");
    }
    if (step24.mapVariants.length !== 2) {
      throw new Error("step-24 must have two map variants");
    }
    const mapIds = step24.mapVariants.map((variant) => variant.mapId);
    if (!mapIds.includes("tutorial-step-24-a")) {
      throw new Error("step-24 missing tutorial-step-24-a");
    }
    if (!mapIds.includes("tutorial-step-24-b")) {
      throw new Error("step-24 missing tutorial-step-24-b");
    }
  });

  test("each map variant has a solution within maxActions", () => {
    for (const step of TUTORIAL_STEPS) {
      for (const variant of step.mapVariants) {
        const asset = TUTORIAL_MAPS[variant.mapId];
        if (!asset) {
          throw new Error(`${step.id}: missing map asset ${variant.mapId}`);
        }
        const path = findSolution(step, asset, variant.goal);
        if (!path) {
          throw new Error(
            `${step.id} (${variant.mapId}) has no solution within maxActions`,
          );
        }
      }
    }
  });
});
