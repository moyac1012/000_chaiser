import { describe, expect, test } from "bun:test";

import { getPlaybackWindow } from "@/lib/ui/playbackWindow";

describe("getPlaybackWindow", () => {
  test("keeps display turn when lag is within future window", () => {
    expect(
      getPlaybackWindow({
        displayTurn: 20,
        latestTurn: 60,
        retainedPastTurns: 10,
        retainedFutureTurns: 50,
      }),
    ).toEqual({
      nextDisplayTurn: 20,
      minTurnToKeep: 10,
      maxTurnToKeep: 70,
    });
  });

  test("fast-forwards display turn when lag exceeds future window", () => {
    expect(
      getPlaybackWindow({
        displayTurn: 20,
        latestTurn: 400,
        retainedPastTurns: 80,
        retainedFutureTurns: 240,
      }),
    ).toEqual({
      nextDisplayTurn: 160,
      minTurnToKeep: 80,
      maxTurnToKeep: 400,
    });
  });
});
