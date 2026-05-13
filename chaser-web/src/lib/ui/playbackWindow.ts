export type PlaybackWindow = {
  nextDisplayTurn: number;
  minTurnToKeep: number;
  maxTurnToKeep: number;
};

export function getPlaybackWindow(args: {
  displayTurn: number;
  latestTurn: number;
  retainedPastTurns: number;
  retainedFutureTurns: number;
}): PlaybackWindow {
  const caughtUpDisplayTurn =
    args.latestTurn - args.displayTurn > args.retainedFutureTurns
      ? args.latestTurn - args.retainedFutureTurns
      : args.displayTurn;

  return {
    nextDisplayTurn: Math.max(0, caughtUpDisplayTurn),
    minTurnToKeep: Math.max(0, caughtUpDisplayTurn - args.retainedPastTurns),
    maxTurnToKeep: Math.max(0, caughtUpDisplayTurn + args.retainedFutureTurns),
  };
}
