# リプレイ仕様

リプレイは **再生用の状態ログ** と **解釈用イベント** を保存します。

## 保存形式

DB の `replays` テーブルに保存する主なフィールド:

- `log`: `ReplayLogEntry[]` の JSON
- `events_json`: `ReplayEvent[]` の JSON

`ReplayLogEntry` の型（`src/core/match/replay.ts`）:

```ts
export interface ReplayLogEntry {
  turn: number;
  state: GameState;
  actionCool: Action | null;
  actionHot: Action | null;
}
```

- `turn` は **アクション数**（Cool/Hot それぞれの手で +1）
- `actionCool` / `actionHot` はその手番の action

## ReplayEvent

`src/core/match/replayEvents.ts` が正です。

### ActionEvent

- 行動の確定情報
- 結果分類: `applied | noChange | invalid | timeout`
- `tileChanges` / `playerDelta` / `observation` などを持つ
- `noChangeReason` で理由を明示（推測しない）

### TurnEvent

- 1手単位の補助イベント
- `itemPicked` / `autoBlockByItem` などのフラグを保持

### GameEndEvent

- 勝敗確定情報
- `winner` と `reason`、決定ターンと座標を保持

## 生成ポイント

- `src/core/match/session.ts` で各ターンの `ReplayLogEntry` と `ReplayEvent` を生成
- `buildActionAndTurnEvents` がイベントを構築
- 試合終了時に `GameEndEvent` を追加

## UI 側の扱い

- `events_json` にあるイベントを **根拠**として表示する
- UI で「理由」を推測しない

参照実装:
- `src/app/replays/[id]/replayFacts.ts`
