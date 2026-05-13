"use client";

/**
 * BoardView: konva/react-konva ベースの正式実装。
 * - Room / Replay は「状態の供給元が異なるだけで、表示再生モデルは同一」なので、上位で displayTurn を共通利用する
 * - 描画以外のロジック（勝敗、WS、ログなど）は一切触らない
 * - ターン進行や再生タイムラインの制御は行わない（内部の setTimeout は短い演出の後片付け用途のみ）
 *
 * テスト都合:
 * - 盤面は Canvas だが、E2E で必要な情報は `data-*` に反映する（セル DOM は生成しない）
 */

import Konva from "konva";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  RegularPolygon,
  Stage,
  Text,
} from "react-konva";
import type { Action, Direction, GameState, PlayerId } from "@/core/engine";

export interface BoardViewProps {
  /**
   * 描画すべき状態そのもの（displayState）。
   * - ここで渡される state は「すでに再生制御された結果」であり、BoardView は純粋に描画するだけ。
   * - state を進める（turn を増やす / ログを読む / WS を待つ）などの再生制御は上位の責務。
   */
  state: GameState;
  /** px。省略時は 32。 */
  tileSize?: number;
  /**
   * v0.1 演出用: 直近ターンのアクション（room 側などで ActionLog から渡す想定）
   * - 演出専用の入力であり、ゲームロジック用途（勝敗判定・状態遷移・Bot 実行など）には使わない
   * - `undefined` / `null` の場合は演出を行わない想定
   * - kind=look/search: 対象セルの一時ハイライト
   * - kind=put: 対象セルの一時ハイライト（ブロック出現 pop は state 差分から検出）
   * - kind=walk: キャラ移動は Konva Tween で表現
   */
  latestAction?: { playerId: PlayerId; action: Action; turn?: number } | null;
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

function directionToRotation(dir: Direction): number {
  switch (dir) {
    case "Up":
      return 0;
    case "Right":
      return 90;
    case "Down":
      return 180;
    case "Left":
      return 270;
  }
}

function toKey(x: number, y: number): string {
  return `${x},${y}`;
}

function clampToBoard(
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return { x, y };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function easeOutCubic(t: number): number {
  const clamped = clamp01(t);
  return 1 - (1 - clamped) ** 3;
}

const BOARD_THEME = {
  floor: {
    base: "#f2e3c9",
    alt: "#e7d2b2",
    bevel: "rgba(255, 252, 245, 0.65)",
    shadow: "rgba(106, 84, 60, 0.25)",
    grid: "rgba(109, 85, 64, 0.26)",
    rune: "rgba(120, 96, 76, 0.35)",
  },
  block: {
    base: "#3a2116",
    top: "#6a3f2b",
    edge: "#1d0f09",
    highlight: "rgba(255, 223, 184, 0.35)",
  },
  item: {
    core: "#ffb347",
    glow: "rgba(255, 209, 128, 0.65)",
    edge: "#b86a24",
    sparkle: "rgba(255, 241, 214, 0.9)",
  },
} as const;

function highlightFill(args: {
  playerId: PlayerId;
  kind: "look" | "search" | "put";
}): string {
  const base = playerRgb(args.playerId);
  const a = args.kind === "put" ? 0.18 : args.kind === "look" ? 0.2 : 0.12;
  return `rgba(${base.r},${base.g},${base.b},${a})`;
}

function playerRgb(playerId: PlayerId): { r: number; g: number; b: number } {
  return playerId === "Cool"
    ? { r: 28, g: 198, b: 184 }
    : { r: 255, g: 122, b: 61 };
}

function playerFill(playerId: PlayerId): string {
  return playerId === "Cool" ? "#1cc6b8" : "#ff7a3d";
}

function rgba(rgb: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function isPlayerId(v: unknown): v is PlayerId {
  return v === "Cool" || v === "Hot";
}

export function BoardView({
  state,
  tileSize = 32,
  latestAction = null,
}: BoardViewProps) {
  const cellSize = tileSize;

  const boardStyle: CSSProperties = {
    width: state.width * cellSize,
    height: state.height * cellSize,
  };

  const [highlightKeys, setHighlightKeys] = useState<string[]>([]);
  const [highlightKind, setHighlightKind] = useState<
    "look" | "search" | "put" | null
  >(null);
  const [highlightPlayerId, setHighlightPlayerId] = useState<PlayerId | null>(
    null,
  );
  const [poppingBlockKeys, setPoppingBlockKeys] = useState<string[]>([]);
  const [walkPulse, setWalkPulse] = useState<{
    id: string;
    playerId: PlayerId;
  } | null>(null);
  const [gazeGuide, setGazeGuide] = useState<{
    id: string;
    kind: "look" | "search";
    playerId: PlayerId;
    points: Array<{ x: number; y: number }>;
  } | null>(null);
  const [putMarker, setPutMarker] = useState<{
    id: string;
    outcome: "success" | "miss";
    playerId: PlayerId;
    x: number;
    y: number;
  } | null>(null);
  const [itemSparkles, setItemSparkles] = useState<
    Array<{ id: string; x: number; y: number }>
  >([]);
  const [itemFloats, setItemFloats] = useState<
    Array<{ id: string; playerId: PlayerId; x: number; y: number; label: "+1" }>
  >([]);
  const [gameEndEmphasis, setGameEndEmphasis] = useState<{
    id: string;
    actorId: PlayerId;
    kind: Action["kind"];
    targetKeys: string[];
  } | null>(null);
  const [mapReveal, setMapReveal] = useState<{ id: string; progress: number }>(
    () => ({ id: "init", progress: 1 }),
  );
  const [spawnBursts, setSpawnBursts] = useState<
    Array<{ id: string; playerId: PlayerId; x: number; y: number }>
  >([]);
  const [walkTrail, setWalkTrail] = useState<{
    id: string;
    playerId: PlayerId;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [putTrail, setPutTrail] = useState<{
    id: string;
    playerId: PlayerId;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [victoryBurst, setVictoryBurst] = useState<{
    id: string;
    winner: PlayerId | "draw";
    x: number;
    y: number;
  } | null>(null);
  const [facing, setFacing] = useState<Record<PlayerId, Direction>>(() => ({
    Cool: "Down",
    Hot: "Up",
  }));
  const [reducedMotion, setReducedMotion] = useState(false);

  const highlightTimeoutRef = useRef<number | null>(null);
  const popTimeoutRef = useRef<number | null>(null);
  const putMarkerTimeoutRef = useRef<number | null>(null);
  const walkPulseTimeoutRef = useRef<number | null>(null);
  const gazeGuideTimeoutRef = useRef<number | null>(null);
  const gameEndTimeoutRef = useRef<number | null>(null);
  const mapRevealFrameRef = useRef<number | null>(null);
  const mapRevealStartRef = useRef<number | null>(null);
  const mapRevealTimeoutRef = useRef<number | null>(null);
  const spawnRemovalTimeoutsRef = useRef<Map<string, number>>(new Map());
  const walkTrailTimeoutRef = useRef<number | null>(null);
  const putTrailTimeoutRef = useRef<number | null>(null);
  const victoryBurstTimeoutRef = useRef<number | null>(null);
  const sparkleRemovalTimeoutsRef = useRef<Map<string, number>>(new Map());
  const floatRemovalTimeoutsRef = useRef<Map<string, number>>(new Map());
  const prevStateRef = useRef<GameState | null>(null);
  const lastTransitionRef = useRef<{ prev: GameState; next: GameState } | null>(
    null,
  );
  const lastPutMarkerIdRef = useRef<string | null>(null);
  const lastGameEndEmphasisIdRef = useRef<string | null>(null);
  const lastWalkPulseIdRef = useRef<string | null>(null);
  const lastGazeGuideIdRef = useRef<string | null>(null);
  const lastWalkTrailIdRef = useRef<string | null>(null);
  const lastPutTrailIdRef = useRef<string | null>(null);
  const lastVictoryBurstIdRef = useRef<string | null>(null);
  const lastSpawnIdRef = useRef<string | null>(null);
  const mapRevealSeedRef = useRef<string | null>(null);
  const lastWalkTrailAnimatedIdRef = useRef<string | null>(null);
  const lastPutTrailAnimatedIdRef = useRef<string | null>(null);
  const lastVictoryBurstAnimatedIdRef = useRef<string | null>(null);
  const sparkleRefs = useRef<Map<string, unknown>>(new Map());
  const sparkleAnimStartedRef = useRef<Set<string>>(new Set());
  const floatRefs = useRef<Map<string, unknown>>(new Map());
  const floatAnimStartedRef = useRef<Set<string>>(new Set());
  const spawnRefs = useRef<Map<string, unknown>>(new Map());
  const spawnAnimStartedRef = useRef<Set<string>>(new Set());
  const walkTrailRef = useRef<unknown>(null);
  const putTrailRef = useRef<unknown>(null);
  const victoryBurstRef = useRef<unknown>(null);

  const latestPlayerId = latestAction?.playerId ?? null;
  const latestKind = latestAction?.action.kind ?? null;
  const latestDir = latestAction?.action.dir ?? null;
  const latestTurn = latestAction?.turn ?? null;

  const actionKey = useMemo(() => {
    if (!latestPlayerId || !latestKind || !latestDir) return null;
    return `${latestTurn ?? state.turn}:${latestPlayerId}:${latestKind}:${latestDir}`;
  }, [latestDir, latestKind, latestPlayerId, latestTurn, state.turn]);

  const width = state.width;
  const height = state.height;
  const coolX = state.players.Cool.pos.x;
  const coolY = state.players.Cool.pos.y;
  const hotX = state.players.Hot.pos.x;
  const hotY = state.players.Hot.pos.y;
  const selfX =
    latestPlayerId === "Cool" ? coolX : latestPlayerId === "Hot" ? hotX : null;
  const selfY =
    latestPlayerId === "Cool" ? coolY : latestPlayerId === "Hot" ? hotY : null;

  const computedHighlight = useMemo(() => {
    if (!latestPlayerId || !latestKind || !latestDir) return null;
    if (!actionKey) return null;
    const kind = latestKind;
    if (kind !== "look" && kind !== "search" && kind !== "put") return null;
    if (selfX === null || selfY === null) return null;

    const { dx, dy } = directionToDelta(latestDir);
    const keys: string[] = [];

    if (kind === "look") {
      // look は「自分のマスを含まない」3×3（=1〜3マス先）をハイライトする。
      const centerX = selfX + dx * 2;
      const centerY = selfY + dy * 2;
      for (let dy2 = -1; dy2 <= 1; dy2++) {
        for (let dx2 = -1; dx2 <= 1; dx2++) {
          const pos = clampToBoard(width, height, centerX + dx2, centerY + dy2);
          if (pos) keys.push(toKey(pos.x, pos.y));
        }
      }
    } else if (kind === "search") {
      for (let i = 1; i <= 9; i++) {
        const pos = clampToBoard(width, height, selfX + dx * i, selfY + dy * i);
        if (pos) keys.push(toKey(pos.x, pos.y));
      }
    } else if (kind === "put") {
      const pos = clampToBoard(width, height, selfX + dx, selfY + dy);
      if (pos) keys.push(toKey(pos.x, pos.y));
    }

    return { key: actionKey, kind, playerId: latestPlayerId, keys };
  }, [
    actionKey,
    height,
    latestDir,
    latestKind,
    latestPlayerId,
    selfX,
    selfY,
    width,
  ]);

  const resolvedWinner: PlayerId | "draw" | null =
    state.status === "winCool"
      ? "Cool"
      : state.status === "winHot"
        ? "Hot"
        : state.status === "draw"
          ? "draw"
          : null;

  const resultText =
    resolvedWinner === "draw"
      ? "ひきわけ"
      : resolvedWinner === "Cool"
        ? "Cool の勝ち!"
        : resolvedWinner === "Hot"
          ? "Hot の勝ち!"
          : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const prev = prevStateRef.current;
    const revealSeed = `${state.width}x${state.height}:${state.maxTurns}:${state.players.Cool.pos.x},${state.players.Cool.pos.y}:${state.players.Hot.pos.x},${state.players.Hot.pos.y}`;
    const allowReveal = state.turn <= 1 && state.status === "running";
    const shouldStartReveal =
      allowReveal && mapRevealSeedRef.current !== revealSeed;
    const revealIdle =
      mapRevealFrameRef.current === null &&
      mapRevealTimeoutRef.current === null;

    if (shouldStartReveal) {
      const id = `${state.width}x${state.height}:${state.turn}:${Date.now()}`;
      mapRevealSeedRef.current = revealSeed;
      if (reducedMotion || typeof window === "undefined") {
        setMapReveal({ id, progress: 1 });
      } else {
        setMapReveal({ id, progress: 0 });
        mapRevealStartRef.current = performance.now();
        if (mapRevealFrameRef.current) {
          window.cancelAnimationFrame(mapRevealFrameRef.current);
        }
        if (mapRevealTimeoutRef.current) {
          window.clearTimeout(mapRevealTimeoutRef.current);
        }

        const durationMs = 1600;
        const tick = (now: number) => {
          const start = mapRevealStartRef.current ?? now;
          const progress = clamp01((now - start) / durationMs);
          setMapReveal((current) => {
            if (current.id !== id) return current;
            return { ...current, progress };
          });
          if (progress < 1) {
            mapRevealFrameRef.current = window.requestAnimationFrame(tick);
          } else {
            mapRevealFrameRef.current = null;
          }
        };
        mapRevealFrameRef.current = window.requestAnimationFrame(tick);
        mapRevealTimeoutRef.current = window.setTimeout(() => {
          setMapReveal((current) => {
            if (current.id !== id) return current;
            return { ...current, progress: 1 };
          });
          mapRevealTimeoutRef.current = null;
        }, durationMs + 160);
      }
    } else if (mapReveal.progress < 1 && revealIdle) {
      if (mapRevealFrameRef.current) {
        window.cancelAnimationFrame(mapRevealFrameRef.current);
      }
      if (mapRevealTimeoutRef.current) {
        window.clearTimeout(mapRevealTimeoutRef.current);
      }
      setMapReveal((current) => ({ ...current, progress: 1 }));
    }
    if (!prev) {
      prevStateRef.current = state;
      return;
    }
    lastTransitionRef.current = { prev, next: state };

    const nextPopKeys: string[] = [];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const before = prev.map[y]?.[x];
        const after = state.map[y]?.[x];
        if (before !== 2 && after === 2) {
          nextPopKeys.push(toKey(x, y));
        }
      }
    }

    if (nextPopKeys.length > 0) {
      setPoppingBlockKeys(nextPopKeys);
      if (popTimeoutRef.current) window.clearTimeout(popTimeoutRef.current);
      popTimeoutRef.current = window.setTimeout(() => {
        setPoppingBlockKeys([]);
        popTimeoutRef.current = null;
      }, 200);
    }

    prevStateRef.current = state;
  }, [mapReveal.progress, reducedMotion, state]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    if (!latestAction) return;
    if (latestAction.action.kind !== "put") return;

    const prev = transition.prev;
    const next = state;
    if (prev.turn === next.turn) return;

    const { playerId, action } = latestAction;
    const pos = prev.players[playerId]?.pos;
    if (!pos) return;

    const { dx, dy } = directionToDelta(action.dir);
    const target = clampToBoard(
      prev.width,
      prev.height,
      pos.x + dx,
      pos.y + dy,
    );
    if (!target) return;

    const before = prev.map[target.y]?.[target.x];
    const after = next.map[target.y]?.[target.x];
    const success = before !== 2 && after === 2;

    const id = `${next.turn}:${playerId}:put:${action.dir}`;
    if (lastPutMarkerIdRef.current === id) return;
    lastPutMarkerIdRef.current = id;
    setPutMarker({
      id,
      outcome: success ? "success" : "miss",
      playerId,
      x: target.x,
      y: target.y,
    });

    if (putMarkerTimeoutRef.current)
      window.clearTimeout(putMarkerTimeoutRef.current);
    putMarkerTimeoutRef.current = window.setTimeout(() => {
      setPutMarker((current) => {
        if (current?.id === id) return null;
        return current;
      });
      putMarkerTimeoutRef.current = null;
    }, 520);
  }, [latestAction, state]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    if (!latestAction) return;
    if (latestAction.action.kind !== "walk") return;
    if (!isPlayerId(latestAction.playerId)) return;

    const prev = transition.prev;
    const next = state;
    if (prev.turn === next.turn) return;

    const fromPos = prev.players[latestAction.playerId]?.pos;
    const toPos = next.players[latestAction.playerId]?.pos;
    if (!fromPos || !toPos) return;
    if (fromPos.x === toPos.x && fromPos.y === toPos.y) return;

    const id = `${next.turn}:${latestAction.playerId}:walk-trail`;
    if (lastWalkTrailIdRef.current === id) return;
    lastWalkTrailIdRef.current = id;

    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });

    setWalkTrail({
      id,
      playerId: latestAction.playerId,
      from: toCenter(fromPos.x, fromPos.y),
      to: toCenter(toPos.x, toPos.y),
    });

    if (walkTrailTimeoutRef.current)
      window.clearTimeout(walkTrailTimeoutRef.current);
    walkTrailTimeoutRef.current = window.setTimeout(() => {
      setWalkTrail((current) => {
        if (current?.id === id) return null;
        return current;
      });
      walkTrailTimeoutRef.current = null;
    }, 520);
  }, [cellSize, latestAction, state]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    if (!latestAction) return;
    if (latestAction.action.kind !== "put") return;
    if (!isPlayerId(latestAction.playerId)) return;

    const prev = transition.prev;
    const next = state;
    if (prev.turn === next.turn) return;

    const { dx, dy } = directionToDelta(latestAction.action.dir);
    const fromPos = prev.players[latestAction.playerId]?.pos;
    if (!fromPos) return;
    const target = clampToBoard(
      prev.width,
      prev.height,
      fromPos.x + dx,
      fromPos.y + dy,
    );
    if (!target) return;

    const id = `${next.turn}:${latestAction.playerId}:put-trail`;
    if (lastPutTrailIdRef.current === id) return;
    lastPutTrailIdRef.current = id;

    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });

    setPutTrail({
      id,
      playerId: latestAction.playerId,
      from: toCenter(fromPos.x, fromPos.y),
      to: toCenter(target.x, target.y),
    });

    if (putTrailTimeoutRef.current)
      window.clearTimeout(putTrailTimeoutRef.current);
    putTrailTimeoutRef.current = window.setTimeout(() => {
      setPutTrail((current) => {
        if (current?.id === id) return null;
        return current;
      });
      putTrailTimeoutRef.current = null;
    }, 420);
  }, [cellSize, latestAction, state]);

  useEffect(() => {
    if (reducedMotion) return;
    if (!mapReveal.id || mapReveal.id === "init") return;
    if (lastSpawnIdRef.current === mapReveal.id) return;
    lastSpawnIdRef.current = mapReveal.id;
    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });
    const bursts = (["Cool", "Hot"] as const satisfies PlayerId[]).map(
      (playerId) => {
        const pos = state.players[playerId]?.pos;
        const center = pos ? toCenter(pos.x, pos.y) : { x: 0, y: 0 };
        return {
          id: `${mapReveal.id}:spawn:${playerId}`,
          playerId,
          x: center.x,
          y: center.y,
        };
      },
    );
    setSpawnBursts(bursts);
    for (const burst of bursts) {
      if (spawnRemovalTimeoutsRef.current.has(burst.id)) continue;
      const timeoutId = window.setTimeout(() => {
        setSpawnBursts((prev) => prev.filter((v) => v.id !== burst.id));
        spawnAnimStartedRef.current.delete(burst.id);
        spawnRemovalTimeoutsRef.current.delete(burst.id);
      }, 1400);
      spawnRemovalTimeoutsRef.current.set(burst.id, timeoutId);
    }
  }, [cellSize, mapReveal.id, reducedMotion, state.players]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    const prev = transition.prev;
    const next = state;
    if (prev.turn === next.turn) return;

    const sparkles: Array<{ id: string; x: number; y: number }> = [];
    for (let y = 0; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        const before = prev.map[y]?.[x];
        const after = next.map[y]?.[x];
        if (before === 3 && after !== 3) {
          sparkles.push({ id: `${next.turn}:sparkle:${x},${y}`, x, y });
        }
      }
    }
    if (sparkles.length > 0) {
      setItemSparkles((prevList) => [...prevList, ...sparkles]);
      for (const s of sparkles) {
        if (sparkleRemovalTimeoutsRef.current.has(s.id)) continue;
        const timeoutId = window.setTimeout(() => {
          setItemSparkles((prevList) => prevList.filter((v) => v.id !== s.id));
          sparkleAnimStartedRef.current.delete(s.id);
          sparkleRemovalTimeoutsRef.current.delete(s.id);
        }, 650);
        sparkleRemovalTimeoutsRef.current.set(s.id, timeoutId);
      }
    }

    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });

    const floats: Array<{
      id: string;
      playerId: PlayerId;
      x: number;
      y: number;
      label: "+1";
    }> = [];
    for (const playerId of ["Cool", "Hot"] as const satisfies PlayerId[]) {
      const beforeItems = prev.players[playerId]?.items ?? 0;
      const afterItems = next.players[playerId]?.items ?? 0;
      const gained = Math.max(0, afterItems - beforeItems);
      if (gained <= 0) continue;
      const center = toCenter(
        next.players[playerId].pos.x,
        next.players[playerId].pos.y,
      );
      for (let i = 0; i < Math.min(gained, 3); i++) {
        floats.push({
          id: `${next.turn}:float:${playerId}:${i}`,
          playerId,
          x: center.x + i * 5,
          y: center.y - cellSize * 0.55 - i * 2,
          label: "+1",
        });
      }
    }
    if (floats.length > 0) {
      setItemFloats((prevList) => [...prevList, ...floats]);
      for (const f of floats) {
        if (floatRemovalTimeoutsRef.current.has(f.id)) continue;
        const timeoutId = window.setTimeout(() => {
          setItemFloats((prevList) => prevList.filter((v) => v.id !== f.id));
          floatAnimStartedRef.current.delete(f.id);
          floatRemovalTimeoutsRef.current.delete(f.id);
        }, 720);
        floatRemovalTimeoutsRef.current.set(f.id, timeoutId);
      }
    }
  }, [cellSize, state]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    if (!latestAction) return;
    const prev = transition.prev;
    const next = state;
    if (prev.status !== "running" || next.status === "running") return;
    if (!isPlayerId(latestAction.playerId)) return;

    const actorId = latestAction.playerId;
    const kind = latestAction.action.kind;
    const { dx, dy } = directionToDelta(latestAction.action.dir);
    const keys: string[] = [];

    if (kind === "walk") {
      const pos = next.players[actorId]?.pos;
      if (pos) keys.push(toKey(pos.x, pos.y));
    } else if (kind === "look") {
      const self = next.players[actorId]?.pos;
      if (self) {
        const center = clampToBoard(
          next.width,
          next.height,
          self.x + dx * 2,
          self.y + dy * 2,
        );
        if (center) {
          for (let dy2 = -1; dy2 <= 1; dy2++) {
            for (let dx2 = -1; dx2 <= 1; dx2++) {
              const pos = clampToBoard(
                next.width,
                next.height,
                center.x + dx2,
                center.y + dy2,
              );
              if (pos) keys.push(toKey(pos.x, pos.y));
            }
          }
        }
      }
    } else if (kind === "search") {
      const self = next.players[actorId]?.pos;
      if (self) {
        for (let i = 1; i <= 9; i++) {
          const pos = clampToBoard(
            next.width,
            next.height,
            self.x + dx * i,
            self.y + dy * i,
          );
          if (pos) keys.push(toKey(pos.x, pos.y));
        }
      }
    } else if (kind === "put") {
      const self = next.players[actorId]?.pos;
      if (self) {
        const pos = clampToBoard(
          next.width,
          next.height,
          self.x + dx,
          self.y + dy,
        );
        if (pos) keys.push(toKey(pos.x, pos.y));
      }
    }

    const id = `${next.turn}:gameEnd:${actorId}:${kind}:${latestAction.action.dir}`;
    if (lastGameEndEmphasisIdRef.current === id) return;
    lastGameEndEmphasisIdRef.current = id;
    setGameEndEmphasis({ id, actorId, kind, targetKeys: keys });
    if (gameEndTimeoutRef.current)
      window.clearTimeout(gameEndTimeoutRef.current);
    gameEndTimeoutRef.current = window.setTimeout(() => {
      setGameEndEmphasis((current) => {
        if (current?.id === id) return null;
        return current;
      });
      gameEndTimeoutRef.current = null;
    }, 1400);
  }, [latestAction, state]);

  useEffect(() => {
    const transition = lastTransitionRef.current;
    if (!transition) return;
    const prev = transition.prev;
    const next = state;
    if (prev.status !== "running" || next.status === "running") return;

    const winner = resolvedWinner ?? "draw";
    const id = `${next.turn}:victory:${winner}`;
    if (lastVictoryBurstIdRef.current === id) return;
    lastVictoryBurstIdRef.current = id;

    const center = (() => {
      if (winner === "Cool" || winner === "Hot") {
        const pos = next.players[winner]?.pos;
        if (pos)
          return {
            x: pos.x * cellSize + cellSize / 2,
            y: pos.y * cellSize + cellSize / 2,
          };
      }
      return {
        x: (next.width * cellSize) / 2,
        y: (next.height * cellSize) / 2,
      };
    })();

    setVictoryBurst({ id, winner, x: center.x, y: center.y });
    if (victoryBurstTimeoutRef.current)
      window.clearTimeout(victoryBurstTimeoutRef.current);
    victoryBurstTimeoutRef.current = window.setTimeout(() => {
      setVictoryBurst((current) => {
        if (current?.id === id) return null;
        return current;
      });
      victoryBurstTimeoutRef.current = null;
    }, 1800);
  }, [cellSize, resolvedWinner, state]);

  useEffect(() => {
    if (!latestPlayerId || !latestDir) return;
    setFacing((prev) => ({ ...prev, [latestPlayerId]: latestDir }));
  }, [latestDir, latestPlayerId]);

  useEffect(() => {
    if (!latestAction) return;
    if (!isPlayerId(latestAction.playerId)) return;
    if (latestAction.action.kind !== "walk") return;

    const id = `${state.turn}:${latestAction.playerId}:walk:${latestAction.action.dir}`;
    if (lastWalkPulseIdRef.current === id) return;
    lastWalkPulseIdRef.current = id;

    setWalkPulse({ id, playerId: latestAction.playerId });
    if (walkPulseTimeoutRef.current)
      window.clearTimeout(walkPulseTimeoutRef.current);
    walkPulseTimeoutRef.current = window.setTimeout(() => {
      setWalkPulse((current) => {
        if (current?.id === id) return null;
        return current;
      });
      walkPulseTimeoutRef.current = null;
    }, 320);
  }, [latestAction, state.turn]);

  useEffect(() => {
    if (!latestAction) return;
    if (!isPlayerId(latestAction.playerId)) return;
    const kind = latestAction.action.kind;
    if (kind !== "look" && kind !== "search") return;

    const playerId = latestAction.playerId;
    const dir = latestAction.action.dir;
    const id = `${state.turn}:${playerId}:${kind}:${dir}`;
    if (lastGazeGuideIdRef.current === id) return;

    const pos = state.players[playerId]?.pos;
    if (!pos) return;

    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });
    const from = toCenter(pos.x, pos.y);
    const { dx, dy } = directionToDelta(dir);

    const points: Array<{ x: number; y: number }> = [from];
    if (kind === "look") {
      const target = clampToBoard(
        state.width,
        state.height,
        pos.x + dx * 2,
        pos.y + dy * 2,
      );
      if (target) points.push(toCenter(target.x, target.y));
    } else {
      for (let i = 1; i <= 9; i++) {
        const target = clampToBoard(
          state.width,
          state.height,
          pos.x + dx * i,
          pos.y + dy * i,
        );
        if (!target) break;
        points.push(toCenter(target.x, target.y));
      }
    }

    if (points.length < 2) return;

    lastGazeGuideIdRef.current = id;
    setGazeGuide({ id, kind, playerId, points });
    if (gazeGuideTimeoutRef.current)
      window.clearTimeout(gazeGuideTimeoutRef.current);
    gazeGuideTimeoutRef.current = window.setTimeout(() => {
      setGazeGuide((current) => {
        if (current?.id === id) return null;
        return current;
      });
      gazeGuideTimeoutRef.current = null;
    }, 420);
  }, [
    cellSize,
    latestAction,
    state.height,
    state.players,
    state.turn,
    state.width,
  ]);

  useEffect(() => {
    if (!computedHighlight) return;
    if (!isPlayerId(computedHighlight.playerId)) return;

    setHighlightKeys(computedHighlight.keys);
    setHighlightKind(computedHighlight.kind);
    setHighlightPlayerId(computedHighlight.playerId);

    if (highlightTimeoutRef.current)
      window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightKeys([]);
      setHighlightKind(null);
      setHighlightPlayerId(null);
      highlightTimeoutRef.current = null;
    }, 420);
  }, [computedHighlight]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current)
        window.clearTimeout(highlightTimeoutRef.current);
      if (popTimeoutRef.current) window.clearTimeout(popTimeoutRef.current);
      if (putMarkerTimeoutRef.current)
        window.clearTimeout(putMarkerTimeoutRef.current);
      if (walkPulseTimeoutRef.current)
        window.clearTimeout(walkPulseTimeoutRef.current);
      if (gazeGuideTimeoutRef.current)
        window.clearTimeout(gazeGuideTimeoutRef.current);
      if (gameEndTimeoutRef.current)
        window.clearTimeout(gameEndTimeoutRef.current);
      if (mapRevealFrameRef.current)
        window.cancelAnimationFrame(mapRevealFrameRef.current);
      if (mapRevealTimeoutRef.current)
        window.clearTimeout(mapRevealTimeoutRef.current);
      if (walkTrailTimeoutRef.current)
        window.clearTimeout(walkTrailTimeoutRef.current);
      if (putTrailTimeoutRef.current)
        window.clearTimeout(putTrailTimeoutRef.current);
      if (victoryBurstTimeoutRef.current)
        window.clearTimeout(victoryBurstTimeoutRef.current);
      for (const timeoutId of sparkleRemovalTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      sparkleRemovalTimeoutsRef.current.clear();
      for (const timeoutId of floatRemovalTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      floatRemovalTimeoutsRef.current.clear();
      for (const timeoutId of spawnRemovalTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      spawnRemovalTimeoutsRef.current.clear();
    };
  }, []);

  const popSet = useMemo(() => new Set(poppingBlockKeys), [poppingBlockKeys]);

  const tiles = useMemo(() => {
    const out: Array<{
      x: number;
      y: number;
      key: string;
      normalized: 0 | 2 | 3;
      reveal: number;
      alt: boolean;
      rune: boolean;
    }> = [];

    const revealProgress = mapReveal.progress;
    const revealBase = 0.2;
    const denom = Math.max(1, state.width + state.height - 2);

    for (let y = 0; y < state.height; y++) {
      const row = state.map[y];
      for (let x = 0; x < state.width; x++) {
        const tile = row?.[x] ?? 0;
        const normalized = (tile === 1 ? 0 : tile) as 0 | 1 | 2 | 3;
        const wave = (x + y) / denom;
        const reveal =
          revealBase +
          (1 - revealBase) *
            easeOutCubic(clamp01((revealProgress - wave * 0.65) / 0.45));
        out.push({
          x,
          y,
          key: `${x}-${y}`,
          normalized: normalized === 1 ? 0 : normalized,
          reveal,
          alt: (x + y) % 2 === 0,
          rune: (x + y * 2) % 7 === 0,
        });
      }
    }

    return out;
  }, [mapReveal.progress, state.height, state.map, state.width]);

  const highlightRects = useMemo(() => {
    if (!highlightKind || !highlightPlayerId) return [];
    return highlightKeys.map((key) => {
      const [xStr, yStr] = key.split(",");
      return { x: Number(xStr), y: Number(yStr), key };
    });
  }, [highlightKeys, highlightKind, highlightPlayerId]);

  const lookCenterKey = useMemo(() => {
    if (highlightKind !== "look") return null;
    if (!latestPlayerId || !latestDir) return null;
    const pos = state.players[latestPlayerId]?.pos;
    if (!pos) return null;
    const { dx, dy } = directionToDelta(latestDir);
    const center = clampToBoard(
      state.width,
      state.height,
      pos.x + dx * 2,
      pos.y + dy * 2,
    );
    if (!center) return null;
    return toKey(center.x, center.y);
  }, [
    highlightKind,
    latestDir,
    latestPlayerId,
    state.height,
    state.players,
    state.width,
  ]);

  const gameEndRects = useMemo(() => {
    if (!gameEndEmphasis) return [];
    return gameEndEmphasis.targetKeys.map((key) => {
      const [xStr, yStr] = key.split(",");
      return { x: Number(xStr), y: Number(yStr), key };
    });
  }, [gameEndEmphasis]);

  const stageWidth = state.width * cellSize;
  const stageHeight = state.height * cellSize;
  const mapRevealProgress = mapReveal.progress;
  const mapRevealActive = mapRevealProgress < 1;
  const playerReveal = reducedMotion
    ? 1
    : easeOutCubic(clamp01((mapRevealProgress - 0.2) / 0.8));

  const blocks = useMemo(
    () => tiles.filter((t) => t.normalized === 2),
    [tiles],
  );
  const items = useMemo(() => tiles.filter((t) => t.normalized === 3), [tiles]);

  const blockRefs = useRef<Map<string, unknown>>(new Map());
  const blockPopGenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (poppingBlockKeys.length === 0) return;
    for (const key of poppingBlockKeys) {
      const node = blockRefs.current.get(key) as
        | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
        | undefined;
      if (!node) continue;

      const gen = (blockPopGenRef.current.get(key) ?? 0) + 1;
      blockPopGenRef.current.set(key, gen);

      node.scale({ x: 0.78, y: 0.78 });
      node.to({
        scaleX: 1,
        scaleY: 1,
        duration: 0.16,
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          if ((blockPopGenRef.current.get(key) ?? 0) !== gen) return;
          node.scale({ x: 1, y: 1 });
        },
      });
    }
  }, [poppingBlockKeys]);

  const putMarkerRef = useRef<unknown>(null);
  const lastPutMarkerAnimatedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!putMarker) return;
    const node = putMarkerRef.current as
      | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastPutMarkerAnimatedIdRef.current === putMarker.id) return;
    lastPutMarkerAnimatedIdRef.current = putMarker.id;

    const fadeOut = () => {
      node.to({
        opacity: 0,
        duration: 0.22,
        easing: Konva.Easings.EaseOut,
      });
    };

    node.opacity(1);
    node.scale({ x: 1, y: 1 });
    node.rotation(0);

    if (putMarker.outcome === "success") {
      node.scale({ x: 0.92, y: 0.92 });
      node.to({
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 0.12,
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          node.to({
            scaleX: 1,
            scaleY: 1,
            duration: 0.12,
            easing: Konva.Easings.EaseInOut,
            onFinish: () => fadeOut(),
          });
        },
      });
    } else {
      node.rotation(-10);
      node.to({
        rotation: 10,
        duration: 0.07,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          node.to({
            rotation: 0,
            duration: 0.07,
            easing: Konva.Easings.EaseInOut,
            onFinish: () => fadeOut(),
          });
        },
      });
    }
  }, [putMarker]);

  const walkPulseRef = useRef<unknown>(null);
  const lastWalkPulseAnimatedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!walkPulse) return;
    const node = walkPulseRef.current as
      | (Konva.Circle & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastWalkPulseAnimatedIdRef.current === walkPulse.id) return;
    lastWalkPulseAnimatedIdRef.current = walkPulse.id;

    node.opacity(0.9);
    node.scale({ x: 0.85, y: 0.85 });
    node.to({
      opacity: 0,
      scaleX: 1.22,
      scaleY: 1.22,
      duration: 0.24,
      easing: Konva.Easings.EaseOut,
    });
  }, [walkPulse]);

  const gazeGuideRef = useRef<unknown>(null);
  const lastGazeGuideAnimatedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gazeGuide) return;
    const node = gazeGuideRef.current as
      | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastGazeGuideAnimatedIdRef.current === gazeGuide.id) return;
    lastGazeGuideAnimatedIdRef.current = gazeGuide.id;

    node.opacity(1);
    node.to({
      opacity: 0,
      duration: 0.26,
      easing: Konva.Easings.EaseOut,
    });
  }, [gazeGuide]);

  useEffect(() => {
    if (!walkTrail) return;
    const node = walkTrailRef.current as
      | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastWalkTrailAnimatedIdRef.current === walkTrail.id) return;
    lastWalkTrailAnimatedIdRef.current = walkTrail.id;

    node.opacity(1);
    node.to({
      opacity: 0,
      duration: 0.4,
      easing: Konva.Easings.EaseOut,
    });
  }, [walkTrail]);

  useEffect(() => {
    if (!putTrail) return;
    const node = putTrailRef.current as
      | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastPutTrailAnimatedIdRef.current === putTrail.id) return;
    lastPutTrailAnimatedIdRef.current = putTrail.id;

    node.opacity(1);
    node.to({
      opacity: 0,
      duration: 0.32,
      easing: Konva.Easings.EaseOut,
    });
  }, [putTrail]);

  useEffect(() => {
    if (spawnBursts.length === 0) return;
    for (const burst of spawnBursts) {
      if (spawnAnimStartedRef.current.has(burst.id)) continue;
      const node = spawnRefs.current.get(burst.id) as
        | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
        | undefined;
      if (!node) continue;
      spawnAnimStartedRef.current.add(burst.id);

      node.opacity(0.9);
      node.scale({ x: 0.4, y: 0.4 });
      node.to({
        opacity: 0,
        scaleX: 1.35,
        scaleY: 1.35,
        duration: 0.9,
        easing: Konva.Easings.EaseOut,
      });
    }
  }, [spawnBursts]);

  useEffect(() => {
    if (!victoryBurst) return;
    const node = victoryBurstRef.current as
      | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
      | null;
    if (!node) return;
    if (lastVictoryBurstAnimatedIdRef.current === victoryBurst.id) return;
    lastVictoryBurstAnimatedIdRef.current = victoryBurst.id;

    node.opacity(0.95);
    node.scale({ x: 0.65, y: 0.65 });
    node.to({
      opacity: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 1.2,
      easing: Konva.Easings.EaseOut,
    });
  }, [victoryBurst]);

  useEffect(() => {
    if (itemSparkles.length === 0) return;
    for (const sparkle of itemSparkles) {
      if (sparkleAnimStartedRef.current.has(sparkle.id)) continue;
      const node = sparkleRefs.current.get(sparkle.id) as
        | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
        | undefined;
      if (!node) continue;
      sparkleAnimStartedRef.current.add(sparkle.id);

      node.opacity(0.9);
      node.scale({ x: 0.55, y: 0.55 });
      node.to({
        opacity: 0,
        scaleX: 1.25,
        scaleY: 1.25,
        duration: 0.45,
        easing: Konva.Easings.EaseOut,
      });
    }
  }, [itemSparkles]);

  useEffect(() => {
    if (itemFloats.length === 0) return;
    for (const float of itemFloats) {
      if (floatAnimStartedRef.current.has(float.id)) continue;
      const node = floatRefs.current.get(float.id) as
        | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
        | undefined;
      if (!node) continue;
      floatAnimStartedRef.current.add(float.id);

      node.opacity(1);
      node.to({
        y: float.y - Math.max(10, cellSize * 0.45),
        opacity: 0,
        duration: 0.55,
        easing: Konva.Easings.EaseOut,
      });
    }
  }, [cellSize, itemFloats]);

  const initialPlayerCenters = useMemo(() => {
    const toCenter = (x: number, y: number) => ({
      x: x * cellSize + cellSize / 2,
      y: y * cellSize + cellSize / 2,
    });
    return {
      Cool: toCenter(state.players.Cool.pos.x, state.players.Cool.pos.y),
      Hot: toCenter(state.players.Hot.pos.x, state.players.Hot.pos.y),
    } satisfies Record<PlayerId, { x: number; y: number }>;
  }, [
    cellSize,
    state.players.Cool.pos.x,
    state.players.Cool.pos.y,
    state.players.Hot.pos.x,
    state.players.Hot.pos.y,
  ]);

  const [playerRenderCenters, setPlayerRenderCenters] = useState<
    Record<PlayerId, { x: number; y: number }>
  >(() => initialPlayerCenters);

  const playerRefs = useRef<Record<PlayerId, unknown>>({
    Cool: null,
    Hot: null,
  });
  const playerMoveGenRef = useRef<Record<PlayerId, number>>({
    Cool: 0,
    Hot: 0,
  });

  useEffect(() => {
    for (const playerId of ["Cool", "Hot"] as const satisfies PlayerId[]) {
      const node = playerRefs.current[playerId] as
        | (Konva.Group & { to: (config: Record<string, unknown>) => unknown })
        | null;
      if (!node) continue;

      const target = initialPlayerCenters[playerId];
      const currentX = node.x();
      const currentY = node.y();
      if (currentX === target.x && currentY === target.y) continue;

      playerMoveGenRef.current[playerId] += 1;
      const gen = playerMoveGenRef.current[playerId];

      node.to({
        x: target.x,
        y: target.y,
        duration: 0.16,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          if (playerMoveGenRef.current[playerId] !== gen) return;
          setPlayerRenderCenters((prev) => ({
            ...prev,
            [playerId]: target,
          }));
        },
      });
    }
  }, [initialPlayerCenters]);

  const dataHighlightKeys =
    highlightKeys.length > 0 ? JSON.stringify(highlightKeys) : undefined;
  const dataPopKeys =
    poppingBlockKeys.length > 0 ? JSON.stringify(poppingBlockKeys) : undefined;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as {
      __e2eBoardEffects?: {
        look?: boolean;
        search?: boolean;
        put?: boolean;
        cool?: boolean;
        hot?: boolean;
        pop?: boolean;
      };
    };
    const effects = w.__e2eBoardEffects ?? {};
    if (highlightKind === "look") effects.look = true;
    if (highlightKind === "search") effects.search = true;
    if (highlightKind === "put") effects.put = true;
    if (highlightPlayerId === "Cool") effects.cool = true;
    if (highlightPlayerId === "Hot") effects.hot = true;
    if (poppingBlockKeys.length > 0) effects.pop = true;
    w.__e2eBoardEffects = effects;
  }, [highlightKind, highlightPlayerId, poppingBlockKeys.length]);

  return (
    <div
      className={`board-shell relative ${resolvedWinner ? "board--gameover" : ""} ${
        mapRevealActive ? "board--reveal" : ""
      }`}
      style={boardStyle}
      data-testid="board"
      data-status={state.status}
      data-width={state.width}
      data-height={state.height}
      data-turn={state.turn}
      data-highlight-kind={highlightKind ?? undefined}
      data-highlight-player={highlightPlayerId ?? undefined}
      data-highlight-count={highlightKeys.length || undefined}
      data-highlight-keys={dataHighlightKeys}
      data-pop-count={poppingBlockKeys.length || undefined}
      data-pop-keys={dataPopKeys}
    >
      {resultText ? (
        <div className="board-result" data-testid="board-result">
          <span data-testid="board-result-text">{resultText}</span>
        </div>
      ) : null}

      {/* E2E 用のメタデータ（描画は Konva が正） */}
      <div className="sr-only" aria-hidden>
        <div
          data-testid="player-cool"
          data-position={`${state.players.Cool.pos.x},${state.players.Cool.pos.y}`}
          data-player="Cool"
          data-dir={(facing.Cool ?? "Down") as string}
        />
        <div
          data-testid="player-hot"
          data-position={`${state.players.Hot.pos.x},${state.players.Hot.pos.y}`}
          data-player="Hot"
          data-dir={(facing.Hot ?? "Up") as string}
        />
      </div>

      <Stage width={stageWidth} height={stageHeight}>
        <Layer listening={false}>
          {/* Floor tiles + grid */}
          {tiles.map((cell) => (
            <Group
              key={`floor-${cell.key}`}
              x={cell.x * cellSize}
              y={cell.y * cellSize}
              opacity={cell.reveal}
            >
              <Rect
                width={cellSize}
                height={cellSize}
                fill={cell.alt ? BOARD_THEME.floor.alt : BOARD_THEME.floor.base}
                stroke={BOARD_THEME.floor.grid}
                strokeWidth={1}
                perfectDrawEnabled={false}
              />
              <Rect
                x={1}
                y={1}
                width={cellSize - 2}
                height={cellSize * 0.28}
                fill={BOARD_THEME.floor.bevel}
                opacity={0.5}
                perfectDrawEnabled={false}
              />
              {cell.rune ? (
                <Line
                  points={[
                    cellSize * 0.22,
                    cellSize * 0.7,
                    cellSize * 0.5,
                    cellSize * 0.42,
                    cellSize * 0.78,
                    cellSize * 0.7,
                  ]}
                  stroke={BOARD_THEME.floor.rune}
                  strokeWidth={Math.max(1, Math.floor(cellSize * 0.06))}
                  lineCap="round"
                  lineJoin="round"
                  opacity={0.55}
                  perfectDrawEnabled={false}
                />
              ) : null}
            </Group>
          ))}
        </Layer>

        {/* Blocks + Items */}
        <Layer listening={false}>
          {blocks.map((cell) => {
            const key = toKey(cell.x, cell.y);
            const isPopping = popSet.has(key);
            const half = cellSize / 2;
            return (
              <Group
                key={`block-${cell.key}`}
                x={cell.x * cellSize + half}
                y={cell.y * cellSize + half}
                opacity={cell.reveal}
                ref={(node) => {
                  if (node) {
                    blockRefs.current.set(key, node);
                    if (!isPopping) {
                      (node as unknown as Konva.Group).scale({ x: 1, y: 1 });
                    }
                  } else {
                    blockRefs.current.delete(key);
                  }
                }}
              >
                <Rect
                  x={-half + 1}
                  y={-half + 2}
                  width={cellSize - 2}
                  height={cellSize - 3}
                  fill={BOARD_THEME.block.base}
                  stroke={BOARD_THEME.block.edge}
                  strokeWidth={1}
                  cornerRadius={Math.max(2, Math.floor(cellSize * 0.08))}
                  shadowColor="rgba(27, 15, 9, 0.45)"
                  shadowBlur={4}
                  shadowOffset={{ x: 0, y: 2 }}
                  perfectDrawEnabled={false}
                />
                <Rect
                  x={-half + 3}
                  y={-half + 3}
                  width={cellSize - 6}
                  height={cellSize - 8}
                  fill={BOARD_THEME.block.top}
                  cornerRadius={Math.max(2, Math.floor(cellSize * 0.07))}
                  perfectDrawEnabled={false}
                />
                <Rect
                  x={-half + 4}
                  y={-half + 4}
                  width={cellSize * 0.45}
                  height={cellSize * 0.2}
                  fill={BOARD_THEME.block.highlight}
                  cornerRadius={Math.max(2, Math.floor(cellSize * 0.05))}
                  perfectDrawEnabled={false}
                />
                <Rect
                  x={-half + cellSize * 0.55}
                  y={-half + cellSize * 0.58}
                  width={cellSize * 0.28}
                  height={cellSize * 0.1}
                  fill="rgba(0, 0, 0, 0.18)"
                  cornerRadius={Math.max(2, Math.floor(cellSize * 0.05))}
                  perfectDrawEnabled={false}
                />
              </Group>
            );
          })}
          {items.map((cell) => {
            const half = cellSize / 2;
            return (
              <Group
                key={`item-${cell.key}`}
                x={cell.x * cellSize + half}
                y={cell.y * cellSize + half}
                opacity={cell.reveal}
              >
                <RegularPolygon
                  sides={4}
                  radius={Math.max(7, cellSize * 0.28)}
                  rotation={45}
                  fill={BOARD_THEME.item.core}
                  stroke={BOARD_THEME.item.edge}
                  strokeWidth={Math.max(1, Math.floor(cellSize * 0.05))}
                  shadowColor={BOARD_THEME.item.glow}
                  shadowBlur={8}
                  shadowOffset={{ x: 0, y: 2 }}
                  perfectDrawEnabled={false}
                />
                <RegularPolygon
                  sides={4}
                  radius={Math.max(4, cellSize * 0.18)}
                  rotation={45}
                  fill="rgba(255, 248, 234, 0.7)"
                  perfectDrawEnabled={false}
                />
                <Circle
                  x={-cellSize * 0.12}
                  y={-cellSize * 0.12}
                  radius={Math.max(2, cellSize * 0.06)}
                  fill={BOARD_THEME.item.sparkle}
                  perfectDrawEnabled={false}
                />
              </Group>
            );
          })}
        </Layer>

        {/* Highlights */}
        <Layer listening={false}>
          {highlightKind && highlightPlayerId
            ? highlightRects.map((cell) => (
                <Rect
                  key={`hl-${cell.key}`}
                  x={cell.x * cellSize}
                  y={cell.y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={
                    highlightKind === "look" && lookCenterKey
                      ? rgba(
                          playerRgb(highlightPlayerId),
                          cell.key === lookCenterKey ? 0.28 : 0.14,
                        )
                      : highlightFill({
                          playerId: highlightPlayerId,
                          kind: highlightKind,
                        })
                  }
                  perfectDrawEnabled={false}
                />
              ))
            : null}
        </Layer>

        {/* Guidance (short-lived) */}
        <Layer listening={false}>
          {walkTrail ? (
            <Group
              key={`walk-trail-${walkTrail.id}`}
              ref={(node) => {
                walkTrailRef.current = node;
              }}
            >
              <Line
                points={[
                  walkTrail.from.x,
                  walkTrail.from.y,
                  walkTrail.to.x,
                  walkTrail.to.y,
                ]}
                stroke={rgba(playerRgb(walkTrail.playerId), 0.75)}
                strokeWidth={Math.max(3, Math.round(cellSize * 0.12))}
                lineCap="round"
                shadowColor="rgba(0,0,0,0.2)"
                shadowBlur={4}
                shadowOffset={{ x: 0, y: 1 }}
                perfectDrawEnabled={false}
              />
              <Circle
                x={walkTrail.to.x}
                y={walkTrail.to.y}
                radius={Math.max(4, cellSize * 0.16)}
                fill={rgba(playerRgb(walkTrail.playerId), 0.25)}
                stroke={rgba(playerRgb(walkTrail.playerId), 0.95)}
                strokeWidth={2}
                perfectDrawEnabled={false}
              />
            </Group>
          ) : null}

          {putTrail ? (
            <Group
              key={`put-trail-${putTrail.id}`}
              ref={(node) => {
                putTrailRef.current = node;
              }}
            >
              <Line
                points={[
                  putTrail.from.x,
                  putTrail.from.y,
                  putTrail.to.x,
                  putTrail.to.y,
                ]}
                stroke={rgba(playerRgb(putTrail.playerId), 0.75)}
                strokeWidth={Math.max(2, Math.round(cellSize * 0.1))}
                dash={[cellSize * 0.25, cellSize * 0.2]}
                lineCap="round"
                shadowColor="rgba(0,0,0,0.2)"
                shadowBlur={3}
                shadowOffset={{ x: 0, y: 1 }}
                perfectDrawEnabled={false}
              />
              <RegularPolygon
                x={putTrail.to.x}
                y={putTrail.to.y}
                sides={4}
                radius={Math.max(4, cellSize * 0.14)}
                rotation={45}
                fill={rgba(playerRgb(putTrail.playerId), 0.95)}
                stroke="rgba(15,23,42,0.55)"
                strokeWidth={2}
                perfectDrawEnabled={false}
              />
            </Group>
          ) : null}

          {walkPulse ? (
            <Circle
              key={`walk-pulse-${walkPulse.id}`}
              x={playerRenderCenters[walkPulse.playerId].x}
              y={playerRenderCenters[walkPulse.playerId].y}
              radius={Math.max(cellSize * 0.42, 12)}
              fill={rgba(playerRgb(walkPulse.playerId), 0.06)}
              stroke={rgba(playerRgb(walkPulse.playerId), 0.9)}
              strokeWidth={3}
              perfectDrawEnabled={false}
              ref={(node) => {
                walkPulseRef.current = node;
              }}
            />
          ) : null}

          {gazeGuide ? (
            <Group
              key={`gaze-${gazeGuide.id}`}
              ref={(node) => {
                gazeGuideRef.current = node;
              }}
            >
              {gazeGuide.kind === "look" && gazeGuide.points.length >= 2 ? (
                <Line
                  points={[
                    gazeGuide.points[0].x,
                    gazeGuide.points[0].y,
                    gazeGuide.points[1].x,
                    gazeGuide.points[1].y,
                  ]}
                  stroke={rgba(playerRgb(gazeGuide.playerId), 0.7)}
                  strokeWidth={Math.max(2, Math.round(cellSize * 0.08))}
                  lineCap="round"
                  shadowColor="rgba(0,0,0,0.18)"
                  shadowBlur={2}
                  shadowOffset={{ x: 0, y: 1 }}
                  perfectDrawEnabled={false}
                />
              ) : null}

              {gazeGuide.kind === "search" && gazeGuide.points.length >= 2
                ? gazeGuide.points.slice(1).map((to, index) => {
                    const from = gazeGuide.points[index];
                    const segments = gazeGuide.points.length - 1;
                    const t = segments <= 1 ? 0 : index / (segments - 1);
                    const alpha = 0.8 - 0.75 * t;
                    return (
                      <Line
                        key={`${gazeGuide.id}:seg:${index}`}
                        points={[from.x, from.y, to.x, to.y]}
                        stroke={rgba(playerRgb(gazeGuide.playerId), alpha)}
                        strokeWidth={Math.max(2, Math.round(cellSize * 0.08))}
                        lineCap="round"
                        shadowColor="rgba(0,0,0,0.14)"
                        shadowBlur={2}
                        shadowOffset={{ x: 0, y: 1 }}
                        perfectDrawEnabled={false}
                      />
                    );
                  })
                : null}
              {gazeGuide.points.length >= 2
                ? (() => {
                    const end = gazeGuide.points[gazeGuide.points.length - 1];
                    const prev =
                      gazeGuide.points[gazeGuide.points.length - 2] ?? end;
                    const angle =
                      (Math.atan2(end.y - prev.y, end.x - prev.x) * 180) /
                      Math.PI;
                    return (
                      <RegularPolygon
                        x={end.x}
                        y={end.y}
                        sides={3}
                        radius={Math.max(4, cellSize * 0.14)}
                        rotation={angle + 90}
                        fill={rgba(playerRgb(gazeGuide.playerId), 0.92)}
                        stroke="rgba(15,23,42,0.4)"
                        strokeWidth={1}
                        perfectDrawEnabled={false}
                      />
                    );
                  })()
                : null}
            </Group>
          ) : null}
        </Layer>

        {/* Players */}
        <Layer listening={false}>
          {Object.values(state.players).map((player) => {
            const dir = facing[player.id] ?? "Down";
            const rotation = directionToRotation(dir);
            const isGameEndActor = gameEndEmphasis?.actorId === player.id;
            const actorRgb = playerRgb(player.id);
            const winnerId =
              resolvedWinner === "Cool" || resolvedWinner === "Hot"
                ? resolvedWinner
                : null;
            const isWinner = winnerId === player.id;
            const isLoser = !!winnerId && winnerId !== player.id;

            const center = playerRenderCenters[player.id] ?? {
              x: player.pos.x * cellSize + cellSize / 2,
              y: player.pos.y * cellSize + cellSize / 2,
            };
            const radius = Math.max(cellSize * 0.32, 10);
            const bodySize = Math.max(cellSize * 0.62, 18);
            const enterScale = 0.88 + 0.12 * playerReveal;
            const baseOpacity = isLoser ? 0.55 : 1;

            return (
              <Group
                key={player.id}
                x={center.x}
                y={center.y}
                scaleX={enterScale}
                scaleY={enterScale}
                opacity={baseOpacity}
                ref={(node) => {
                  playerRefs.current[player.id] = node;
                }}
              >
                {isGameEndActor ? (
                  <Circle
                    x={0}
                    y={0}
                    radius={radius * 1.25}
                    fill={rgba(actorRgb, 0.16)}
                    stroke={rgba(actorRgb, 0.9)}
                    strokeWidth={3}
                    perfectDrawEnabled={false}
                  />
                ) : null}
                {isWinner ? (
                  <Circle
                    x={0}
                    y={0}
                    radius={radius * 1.6}
                    fill={rgba(actorRgb, 0.12)}
                    stroke={rgba(actorRgb, 0.6)}
                    strokeWidth={2}
                    perfectDrawEnabled={false}
                  />
                ) : null}
                <Rect
                  x={-bodySize / 2}
                  y={-bodySize / 2}
                  width={bodySize}
                  height={bodySize}
                  fill={playerFill(player.id)}
                  stroke="rgba(20, 15, 12, 0.85)"
                  strokeWidth={Math.max(1, Math.floor(cellSize * 0.05))}
                  cornerRadius={Math.max(6, Math.floor(bodySize * 0.28))}
                  shadowColor={rgba(actorRgb, 0.45)}
                  shadowBlur={8}
                  shadowOffset={{ x: 0, y: 2 }}
                  perfectDrawEnabled={false}
                />
                <Rect
                  x={-bodySize / 2 + 3}
                  y={-bodySize / 2 + 3}
                  width={bodySize - 6}
                  height={bodySize * 0.28}
                  fill="rgba(255,255,255,0.35)"
                  cornerRadius={Math.max(4, Math.floor(bodySize * 0.2))}
                  perfectDrawEnabled={false}
                />
                <Rect
                  x={-bodySize * 0.28}
                  y={-bodySize * 0.04}
                  width={bodySize * 0.56}
                  height={bodySize * 0.22}
                  fill="rgba(15, 23, 42, 0.5)"
                  cornerRadius={Math.max(4, Math.floor(bodySize * 0.16))}
                  perfectDrawEnabled={false}
                />
                <RegularPolygon
                  x={0}
                  y={-bodySize * 0.58}
                  sides={3}
                  radius={Math.max(5, cellSize * 0.18)}
                  rotation={rotation}
                  fill={rgba(actorRgb, 0.95)}
                  stroke="rgba(15, 23, 42, 0.4)"
                  strokeWidth={1}
                  perfectDrawEnabled={false}
                />
                <Text
                  x={-radius}
                  y={radius * 0.1}
                  width={radius * 2}
                  height={radius * 1.2}
                  text={player.id === "Cool" ? "C" : "H"}
                  fill="rgba(255,255,255,0.88)"
                  fontStyle="bold"
                  fontSize={Math.max(10, Math.floor(cellSize * 0.26))}
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
              </Group>
            );
          })}
        </Layer>

        {/* Effects (diff-based, short-lived) */}
        <Layer listening={false}>
          {gameEndEmphasis
            ? gameEndRects.map((cell) => {
                const rgb = playerRgb(gameEndEmphasis.actorId);
                return (
                  <Rect
                    key={`ge-${gameEndEmphasis.id}-${cell.key}`}
                    x={cell.x * cellSize + 1}
                    y={cell.y * cellSize + 1}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    fill={rgba(rgb, 0.08)}
                    stroke={rgba(rgb, 0.9)}
                    strokeWidth={3}
                    cornerRadius={Math.max(2, Math.floor(cellSize * 0.08))}
                    perfectDrawEnabled={false}
                  />
                );
              })
            : null}

          {putMarker ? (
            <Group
              key={`put-marker-${putMarker.id}`}
              x={putMarker.x * cellSize + cellSize / 2}
              y={putMarker.y * cellSize + cellSize / 2}
              ref={(node) => {
                putMarkerRef.current = node;
              }}
            >
              <Rect
                x={-(cellSize / 2) + 2}
                y={-(cellSize / 2) + 2}
                width={cellSize - 4}
                height={cellSize - 4}
                fill={rgba(playerRgb(putMarker.playerId), 0.08)}
                stroke={rgba(playerRgb(putMarker.playerId), 0.92)}
                strokeWidth={putMarker.outcome === "success" ? 3 : 2}
                dash={putMarker.outcome === "miss" ? [6, 4] : undefined}
                cornerRadius={Math.max(2, Math.floor(cellSize * 0.08))}
                perfectDrawEnabled={false}
              />
              {putMarker.outcome === "miss" ? (
                <Text
                  x={-(cellSize / 2)}
                  y={-(cellSize / 2)}
                  width={cellSize}
                  height={cellSize}
                  text="×"
                  fill={rgba(playerRgb(putMarker.playerId), 0.95)}
                  stroke="rgba(15,23,42,0.65)"
                  strokeWidth={3}
                  fontStyle="bold"
                  fontSize={Math.max(14, Math.floor(cellSize * 0.78))}
                  align="center"
                  verticalAlign="middle"
                  perfectDrawEnabled={false}
                />
              ) : null}
            </Group>
          ) : null}

          {spawnBursts.map((burst) => {
            const rgb = playerRgb(burst.playerId);
            return (
              <Group
                key={`spawn-${burst.id}`}
                x={burst.x}
                y={burst.y}
                ref={(node) => {
                  if (node) spawnRefs.current.set(burst.id, node);
                  else spawnRefs.current.delete(burst.id);
                }}
              >
                <Circle
                  radius={Math.max(14, cellSize * 0.4)}
                  fill={rgba(rgb, 0.12)}
                  stroke={rgba(rgb, 0.7)}
                  strokeWidth={2}
                  perfectDrawEnabled={false}
                />
                <RegularPolygon
                  sides={6}
                  radius={Math.max(8, cellSize * 0.22)}
                  rotation={15}
                  fill={rgba(rgb, 0.22)}
                  stroke={rgba(rgb, 0.8)}
                  strokeWidth={1}
                  perfectDrawEnabled={false}
                />
              </Group>
            );
          })}

          {victoryBurst
            ? (() => {
                const rgb =
                  victoryBurst.winner === "draw"
                    ? { r: 148, g: 163, b: 184 }
                    : playerRgb(victoryBurst.winner);
                return (
                  <Group
                    key={`victory-${victoryBurst.id}`}
                    x={victoryBurst.x}
                    y={victoryBurst.y}
                    ref={(node) => {
                      victoryBurstRef.current = node;
                    }}
                  >
                    <Circle
                      radius={Math.max(18, cellSize * 0.6)}
                      fill={rgba(rgb, 0.14)}
                      stroke={rgba(rgb, 0.75)}
                      strokeWidth={2}
                      perfectDrawEnabled={false}
                    />
                    <RegularPolygon
                      sides={8}
                      radius={Math.max(12, cellSize * 0.42)}
                      rotation={22.5}
                      stroke={rgba(rgb, 0.85)}
                      strokeWidth={2}
                      lineJoin="round"
                      perfectDrawEnabled={false}
                    />
                    <Line
                      points={[-cellSize * 0.5, 0, cellSize * 0.5, 0]}
                      stroke={rgba(rgb, 0.6)}
                      strokeWidth={2}
                      lineCap="round"
                      perfectDrawEnabled={false}
                    />
                    <Line
                      points={[0, -cellSize * 0.5, 0, cellSize * 0.5]}
                      stroke={rgba(rgb, 0.6)}
                      strokeWidth={2}
                      lineCap="round"
                      perfectDrawEnabled={false}
                    />
                  </Group>
                );
              })()
            : null}

          {itemSparkles.map((sparkle) => {
            const half = cellSize / 2;
            return (
              <Group
                key={sparkle.id}
                x={sparkle.x * cellSize + half}
                y={sparkle.y * cellSize + half}
                ref={(node) => {
                  if (node) sparkleRefs.current.set(sparkle.id, node);
                  else sparkleRefs.current.delete(sparkle.id);
                }}
              >
                <RegularPolygon
                  x={0}
                  y={0}
                  sides={8}
                  radius={Math.max(6, cellSize * 0.22)}
                  rotation={22.5}
                  fill={BOARD_THEME.item.core}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2}
                  shadowColor="rgba(0,0,0,0.25)"
                  shadowBlur={3}
                  shadowOffset={{ x: 0, y: 1 }}
                  perfectDrawEnabled={false}
                />
              </Group>
            );
          })}

          {itemFloats.map((f) => (
            <Group
              key={f.id}
              x={f.x}
              y={f.y}
              ref={(node) => {
                if (node) floatRefs.current.set(f.id, node);
                else floatRefs.current.delete(f.id);
              }}
            >
              <Text
                x={-cellSize}
                y={-(cellSize * 0.5)}
                width={cellSize * 2}
                height={cellSize}
                text={f.label}
                fill="rgba(255, 199, 102, 0.98)"
                stroke="rgba(30, 18, 10, 0.8)"
                strokeWidth={4}
                fontStyle="bold"
                fontSize={Math.max(14, Math.floor(cellSize * 0.32))}
                align="center"
                verticalAlign="middle"
                perfectDrawEnabled={false}
              />
            </Group>
          ))}
        </Layer>

        {mapRevealActive ? (
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={stageWidth}
              height={stageHeight}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: stageWidth, y: stageHeight }}
              fillLinearGradientColorStops={[
                0,
                "rgba(35, 24, 18, 0.55)",
                0.5,
                "rgba(35, 24, 18, 0.35)",
                1,
                "rgba(35, 24, 18, 0.15)",
              ]}
              opacity={clamp01(1 - mapRevealProgress)}
              perfectDrawEnabled={false}
            />
          </Layer>
        ) : null}
      </Stage>
    </div>
  );
}

export default BoardView;
