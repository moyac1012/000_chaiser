import { describe, expect, test } from "bun:test";

import { resolveReplayBoardTileSize } from "@/app/replays/[id]/replayBoardLayout";

describe("resolveReplayBoardTileSize", () => {
  test("caps tile size at the configured maximum", () => {
    expect(
      resolveReplayBoardTileSize({
        boardWidthTiles: 5,
        boardHeightTiles: 5,
        maxBoardWidthPx: 800,
        maxBoardHeightPx: 800,
      }),
    ).toBe(48);
  });

  test("shrinks tile size to fit the available width", () => {
    expect(
      resolveReplayBoardTileSize({
        boardWidthTiles: 10,
        boardHeightTiles: 10,
        maxBoardWidthPx: 300,
        maxBoardHeightPx: 800,
      }),
    ).toBe(30);
  });

  test("shrinks tile size to fit the available height", () => {
    expect(
      resolveReplayBoardTileSize({
        boardWidthTiles: 8,
        boardHeightTiles: 12,
        maxBoardWidthPx: 800,
        maxBoardHeightPx: 240,
      }),
    ).toBe(20);
  });
});
