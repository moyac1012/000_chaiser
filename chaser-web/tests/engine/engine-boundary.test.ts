import { describe, expect, test } from "bun:test";

import { type GameState, step, type Tile } from "@/core/engine";

function createCornerState(): GameState {
  const map: Tile[][] = [
    [1, 2, 0],
    [0, 1, 0],
    [0, 0, 0],
  ];

  return {
    width: 3,
    height: 3,
    map,
    players: {
      Cool: { id: "Cool", pos: { x: 0, y: 0 }, items: 0 },
      Hot: { id: "Hot", pos: { x: 1, y: 1 }, items: 0 },
    },
    turn: 0,
    maxTurns: 10,
    status: "running",
  };
}

describe("engine boundary handling", () => {
  test("treats out-of-bounds as blocks when checking surround after put", () => {
    const baseState = createCornerState();

    const result = step(baseState, "Hot", { kind: "put", dir: "Left" });

    expect(result.state.status).toBe("winHot");
    expect(result.end?.reason).toBe("enemySurroundedByPut");
    expect(result.end?.point).toEqual({ x: 0, y: 0 });
  });
});
