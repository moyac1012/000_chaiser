import { describe, expect, test } from "bun:test";

import { type GameState, step, type Tile } from "@/core/engine";

function createOverlapState(tileAtTarget: Tile): GameState {
  return {
    width: 3,
    height: 3,
    map: [
      [0, 0, 0],
      [0, 1, tileAtTarget],
      [0, 0, 0],
    ],
    players: {
      Cool: { id: "Cool", pos: { x: 1, y: 1 }, items: 0 },
      Hot: { id: "Hot", pos: { x: 1, y: 1 }, items: 0 },
    },
    turn: 0,
    maxTurns: 10,
    status: "running",
  };
}

describe("engine walk overlap", () => {
  test("keeps enemy on the previous tile when players overlap", () => {
    const baseState = createOverlapState(0);
    const result = step(baseState, "Cool", { kind: "walk", dir: "Right" });

    expect(result.state.players.Cool.pos).toEqual({ x: 2, y: 1 });
    expect(result.state.players.Hot.pos).toEqual({ x: 1, y: 1 });
    expect(result.state.map[1][1]).toBe(1);
    expect(result.state.map[1][2]).toBe(1);
  });

  test("auto-blocks the previous tile when enemy remains there", () => {
    const baseState = createOverlapState(3);
    const result = step(baseState, "Cool", { kind: "walk", dir: "Right" });

    expect(result.state.players.Cool.items).toBe(1);
    expect(result.state.status).toBe("winCool");
    expect(result.end?.reason).toBe("putOnEnemy");
    expect(result.state.map[1][1]).toBe(2);
    expect(result.state.map[1][2]).toBe(1);
  });
});
