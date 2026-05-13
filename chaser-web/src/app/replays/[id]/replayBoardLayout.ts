const FALLBACK_TILE_SIZE_PX = 32;
const MIN_READABLE_TILE_SIZE_PX = 20;
const MAX_TILE_SIZE_PX = 48;

type ResolveReplayBoardTileSizeArgs = {
  boardWidthTiles: number;
  boardHeightTiles: number;
  maxBoardWidthPx: number;
  maxBoardHeightPx: number;
};

export function resolveReplayBoardTileSize(
  args: ResolveReplayBoardTileSizeArgs,
): number {
  if (
    args.boardWidthTiles <= 0 ||
    args.boardHeightTiles <= 0 ||
    args.maxBoardWidthPx <= 0 ||
    args.maxBoardHeightPx <= 0
  ) {
    return FALLBACK_TILE_SIZE_PX;
  }

  const widthBound = Math.floor(args.maxBoardWidthPx / args.boardWidthTiles);
  const heightBound = Math.floor(args.maxBoardHeightPx / args.boardHeightTiles);
  const constrained = Math.min(widthBound, heightBound, MAX_TILE_SIZE_PX);

  if (constrained >= MIN_READABLE_TILE_SIZE_PX) {
    return constrained;
  }

  return Math.max(1, constrained);
}
