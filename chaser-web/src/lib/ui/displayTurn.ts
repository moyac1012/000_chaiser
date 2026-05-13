import type { Action, GameState } from "@/core/engine";

/**
 * displayTurn: UI 表示再生制御層（presentation/playback layer）。
 *
 * - 目的: Action kind に応じて「人が理解できる速度」で盤面表示を進めるための表示用ディレイを定義する
 * - 非責務: ゲームロジック（state 遷移）・勝敗判定・Bot 実行・通信などには一切関与しない
 *
 * Room / Replay 共通で使える理由:
 * - Room と Replay は「状態の供給元が異なるだけで、表示再生モデルは同一」である
 *   - Room: WS などのリアルタイム更新
 *   - Replay: ログ（棋譜）からの順次供給
 * - どちらも UI は「渡された state と latest action を、見やすい速度で再生する」だけに統一できる
 *
 * 将来拡張（Replay v2 / 演出拡張）では、この層に ActionMeta などの「表示再生に必要な情報」を集約する。
 */

// Room と Replay で共通の「再生用ディレイ」。
// - 1手=片側1アクションのリプレイ再生でも、見やすい速度になるように kind ごとに変える。
export const DISPLAY_TURN_DELAY_MS = {
  walk: 380,
  look: 820,
  search: 920,
  put: 720,
  gameEnd: 1800,
} as const satisfies Record<Action["kind"] | "gameEnd", number>;

/**
 * 表示用の「1ターンあたりの待ち時間（ms）」を返す。
 *
 * 注意:
 * - ゲーム内時間や Bot 実行速度（TURN_TIMEOUT_MS など）とは無関係な、UI 表示再生のためのディレイ。
 * - state が gameEnd の場合のみ、終了演出用のディレイを返す。
 */
export function getDisplayTurnDelayMs(args: {
  state?: GameState;
  action?: Action | null;
}): number {
  if (args.state && args.state.status !== "running") {
    return DISPLAY_TURN_DELAY_MS.gameEnd;
  }

  switch (args.action?.kind) {
    case "walk":
      return DISPLAY_TURN_DELAY_MS.walk;
    case "look":
      return DISPLAY_TURN_DELAY_MS.look;
    case "search":
      return DISPLAY_TURN_DELAY_MS.search;
    case "put":
      return DISPLAY_TURN_DELAY_MS.put;
    default:
      return DISPLAY_TURN_DELAY_MS.walk;
  }
}
