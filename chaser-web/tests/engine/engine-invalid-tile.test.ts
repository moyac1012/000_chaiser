import { describe, expect, test } from "bun:test";

import { type GameState, step, type Tile } from "@/core/engine";

function createInvalidTileState(): GameState {
  return {
    width: 3,
    height: 3,
    map: [
      [0, 0, 0],
      [0, 1, 9 as Tile],
      [0, 0, 0],
    ],
    players: {
      Cool: { id: "Cool", pos: { x: 1, y: 1 }, items: 0 },
      Hot: { id: "Hot", pos: { x: 0, y: 0 }, items: 0 },
    },
    turn: 0,
    maxTurns: 10,
    status: "running",
  };
}

describe("engine invalid tile handling", () => {
  test("throws when walk target has an unexpected tile value", () => {
    const state = createInvalidTileState();

    expect(() => step(state, "Cool", { kind: "walk", dir: "Right" })).toThrow(
      "Unexpected tile value at (2,1): 9",
    );
  });
});
