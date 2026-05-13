import type { GameEndEvent, GameEndReason } from "@/core/match/replayEvents";
import type { ActionMeta } from "@/core/match/wsTypes";

export type BotIssueCategory =
  | "init"
  | "runtime"
  | "timeout"
  | "rule"
  | "forfeit";

export type BotIssue = {
  category: BotIssueCategory;
  title: string;
  summary: string;
  detail?: string;
  turn?: number;
};

export function issueFromActionMeta(args: {
  meta?: ActionMeta;
  turn?: number;
}): BotIssue | null {
  const meta = args.meta;
  if (!meta?.fallbackReason) return null;

  if (meta.fallbackReason === "timeout") {
    return {
      category: "timeout",
      title: "タイムアウト",
      summary: "制限時間内に行動が返りませんでした。",
      detail: meta.note?.trim() || undefined,
      turn: args.turn,
    };
  }

  const message =
    meta.errorMessage?.trim() || meta.note?.trim() || "Bot エラー";
  const detail = meta.errorStack?.trim() || undefined;

  if (meta.errorPhase === "init") {
    return {
      category: "init",
      title: "構文 / 初期化エラー",
      summary: message,
      detail,
      turn: args.turn,
    };
  }

  // runtime, or unknown phase but confirmed as an "error" fallback.
  return {
    category: "runtime",
    title: "実行時エラー",
    summary: message,
    detail,
    turn: args.turn,
  };
}

export function issueFromGameEndEvent(event: GameEndEvent): BotIssue | null {
  const reason = event.reason;
  const turn = event.turnIndex;

  const forfeit = isForfeitReason(reason);
  if (forfeit) {
    return {
      category: "forfeit",
      title: reason === "serverError" ? "無効試合" : "失格 / 運用",
      summary: formatGameEndReasonJa(reason),
      detail: event.point
        ? `point: (${event.point.x}, ${event.point.y})`
        : undefined,
      turn,
    };
  }

  const rule = isRuleDefeatReason(reason);
  if (rule && event.winner !== "draw") {
    return {
      category: "rule",
      title: "ルール即敗",
      summary: formatGameEndReasonJa(reason),
      detail: event.point
        ? `point: (${event.point.x}, ${event.point.y})`
        : undefined,
      turn,
    };
  }

  return null;
}

export function formatGameEndReasonJa(reason: GameEndReason): string {
  switch (reason) {
    case "enemySurroundedByPut":
      return "相手がブロックに囲まれた（put）";
    case "walkIntoBlock":
      return "ブロックへ歩いた（即敗）";
    case "walkOutOfBounds":
      return "盤外へ歩いた（即敗）";
    case "enemySurroundedAfterWalk":
      return "相手がブロックに囲まれた（walk）";
    case "enemySurroundedAfterItem":
      return "相手がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "selfSurroundedByPut":
      return "自分がブロックに囲まれた（put）";
    case "selfSurroundedAfterWalk":
      return "自分がブロックに囲まれた（walk）";
    case "selfSurroundedAfterItem":
      return "自分がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "mutualSurroundedByPut":
      return "両者がブロックに囲まれた（put）";
    case "mutualSurroundedAfterWalk":
      return "両者がブロックに囲まれた（walk）";
    case "mutualSurroundedAfterItem":
      return "両者がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "forfeitTimeout":
      return "タイムアウト（失格）";
    case "forfeitDisconnect":
      return "切断（失格）";
    case "forfeitLeaveSlot":
      return "離席（失格）";
    case "forfeitError":
      return "内部エラー（失格）";
    case "serverError":
      return "サーバーエラー（無効試合）";
    case "manualEnd":
      return "運用上の終了";
    default:
      // v1: 失敗分類のための最小対応。詳細な勝敗理由表示は Replay 側で扱う。
      return reason;
  }
}

export function formatEndReasonJa(reason: string): string {
  return formatGameEndReasonJa(reason as GameEndReason);
}

export function findGameEndEvent(events: unknown[]): GameEndEvent | null {
  for (const event of events) {
    if (
      event &&
      typeof event === "object" &&
      (event as { type?: unknown }).type === "gameEnd"
    ) {
      return event as GameEndEvent;
    }
  }
  return null;
}

function isForfeitReason(reason: GameEndReason): boolean {
  return (
    reason === "forfeitTimeout" ||
    reason === "forfeitDisconnect" ||
    reason === "forfeitLeaveSlot" ||
    reason === "forfeitError" ||
    reason === "serverError" ||
    reason === "manualEnd"
  );
}

function isRuleDefeatReason(reason: GameEndReason): boolean {
  return (
    reason === "walkIntoBlock" ||
    reason === "walkOutOfBounds" ||
    reason === "enemySurroundedByPut" ||
    reason === "selfSurroundedByPut" ||
    reason === "mutualSurroundedByPut" ||
    reason === "enemySurroundedAfterWalk" ||
    reason === "selfSurroundedAfterWalk" ||
    reason === "mutualSurroundedAfterWalk" ||
    reason === "enemySurroundedAfterItem" ||
    reason === "selfSurroundedAfterItem" ||
    reason === "mutualSurroundedAfterItem"
  );
}
