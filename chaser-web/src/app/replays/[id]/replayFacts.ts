import type {
  ActionEvent,
  ActionEventResult,
  ActionNoChangeReason,
  GameEndEvent,
  GameEndReason,
  GameEndWinner,
  ObservationKind,
  ReplayEvent,
  TurnEvent,
} from "@/core/match/replayEvents";

export function findActionEventForTurn(
  events: ReplayEvent[],
  turnIndex: number,
): ActionEvent | null {
  for (const event of events) {
    if (event.type === "action" && event.turnIndex === turnIndex) return event;
  }
  return null;
}

export function findTurnEventForTurn(
  events: ReplayEvent[],
  turnIndex: number,
): TurnEvent | null {
  for (const event of events) {
    if (event.type === "turn" && event.turnIndex === turnIndex) return event;
  }
  return null;
}

export function findGameEndEvent(events: ReplayEvent[]): GameEndEvent | null {
  for (const event of events) {
    if (event.type === "gameEnd") return event;
  }
  return null;
}

export function formatActionEventResultJa(result: ActionEventResult): string {
  switch (result) {
    case "applied":
      return "適用";
    case "noChange":
      return "不発（状態変化なし）";
    case "invalid":
      return "不正（即敗）";
    case "timeout":
      return "タイムアウト";
  }
}

export function formatNoChangeReasonJa(reason: ActionNoChangeReason): string {
  switch (reason) {
    case "outOfBounds":
      return "盤外を指定した";
    case "targetIsBlock":
      return "既にブロックがある";
  }
}

export function formatObservationKindJa(kind: ObservationKind): string {
  switch (kind) {
    case "look3x3":
      return "look の 3×3";
    case "searchLine9":
      return "search の直線 9 マス";
  }
}

export function formatGameEndWinnerJa(winner: GameEndWinner): string {
  switch (winner) {
    case "cool":
      return "Cool の勝ち";
    case "hot":
      return "Hot の勝ち";
    case "draw":
      return "引き分け";
    case "none":
      return "勝敗なし";
  }
}

export function formatGameEndReasonJa(reason: GameEndReason): string {
  switch (reason) {
    case "putOnEnemy":
      return "相手の上にブロックを置いた";
    case "putOnEnemyMutualSurround":
      return "相手にブロックを置いたが相打ち（自分も囲まれた）";
    case "walkIntoBlock":
      return "ブロックへ歩いた（即敗）";
    case "walkOutOfBounds":
      return "盤外へ歩いた（即敗）";
    case "enemySurroundedByPut":
      return "相手がブロックに囲まれた（put）";
    case "selfSurroundedByPut":
      return "自分がブロックに囲まれた（put）";
    case "mutualSurroundedByPut":
      return "両者がブロックに囲まれた（put）";
    case "enemySurroundedAfterWalk":
      return "相手がブロックに囲まれた（walk）";
    case "selfSurroundedAfterWalk":
      return "自分がブロックに囲まれた（walk）";
    case "mutualSurroundedAfterWalk":
      return "両者がブロックに囲まれた（walk）";
    case "enemySurroundedAfterItem":
      return "相手がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "selfSurroundedAfterItem":
      return "自分がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "mutualSurroundedAfterItem":
      return "両者がブロックに囲まれた（アイテム取得の自動ブロック）";
    case "turnLimitItems":
      return "ターン上限（アイテム差）";
    case "turnLimitDraw":
      return "ターン上限（同点）";
    case "forfeitTimeout":
      return "タイムアウト";
    case "forfeitDisconnect":
      return "切断";
    case "forfeitLeaveSlot":
      return "離席";
    case "forfeitError":
      return "Bot エラー";
    case "serverError":
      return "サーバーエラー（無効試合）";
    case "manualEnd":
      return "運用上の終了";
  }
}

export type ReplayFacts = {
  actionSummary: string | null;
  noChangeReason: string | null;
  itemCausality: string | null;
  observation: null | {
    title: string;
    kind: ObservationKind;
    tiles: number[];
  };
};

export function buildReplayFacts(args: {
  actionEvent: ActionEvent | null;
  turnEvent: TurnEvent | null;
}): ReplayFacts {
  const actionSummary = args.actionEvent
    ? `${args.actionEvent.actor} / ${args.actionEvent.action.kind} ${args.actionEvent.action.dir} / ${formatActionEventResultJa(
        args.actionEvent.result,
      )}`
    : null;

  const noChangeReason =
    args.actionEvent?.result === "noChange" && args.actionEvent.noChangeReason
      ? formatNoChangeReasonJa(args.actionEvent.noChangeReason)
      : null;

  const itemCausality = (() => {
    const flags = args.turnEvent?.flags;
    if (!flags) return null;
    if (flags.itemPicked && flags.autoBlockByItem) {
      return "この手でアイテムを取得したため、取得直前のマスに自動ブロックが置かれた";
    }
    if (flags.itemPicked && !flags.autoBlockByItem) {
      return "この手でアイテムを取得した（自動ブロックは記録なし）";
    }
    if (!flags.itemPicked && flags.autoBlockByItem) {
      return "自動ブロック（アイテム由来）が記録されている";
    }
    return null;
  })();

  const observation = args.actionEvent?.observation
    ? {
        title: `取得結果（推測なし）: ${formatObservationKindJa(
          args.actionEvent.observation.kind,
        )}`,
        kind: args.actionEvent.observation.kind,
        tiles: args.actionEvent.observation.tiles,
      }
    : null;

  return { actionSummary, noChangeReason, itemCausality, observation };
}
