# BoardView / 表示再生

`BoardView` は **盤面描画と短命演出のみ**を担当し、ゲームロジックや再生制御は行いません。

## 責務

- **入力**: `state` と `latestAction` のみ
- **非責務**: 勝敗判定 / 通信 / Bot 実行 / ログ解釈
- **時間制御**: `displayTurn`（`src/lib/ui/displayTurn.ts`）が担当

## 入力

```ts
<BoardView
  state={displayState}
  latestAction={{ playerId, action, turn }}
  tileSize={32}
/>
```

- `state`: 表示すべき `GameState`
- `latestAction`: 直近のアクション（演出専用）
- `tileSize`: 盤面のセルサイズ（px）

## 実装済みの演出

`state` と `latestAction` の **事実だけ**を根拠に表現する。

- **マップ出現**: 波状の reveal
- **プレイヤー出現**: spawn burst
- **ブロック pop**: 新規ブロック出現時
- **アイテム取得**: 消滅 sparkle + `+1` フロート（増加分を最大 3 まで）
- **行動強調**
  - walk: 移動トレイル + 足元リング
  - look: 3×3 ハイライト（中心セル強め）+ 視線ライン
  - search: 直線ハイライト + ビーム
  - put: 対象ハイライト + 投射トレイル
- **put 成否**
  - 成功: 強調リング
  - 不発: 破線リング（理由は推測しない）
- **終局**
  - 最後の actor 強調
  - 対象セル群の強調
  - 勝者の burst

## displayTurn

再生速度は `getDisplayTurnDelayMs` で決める。
BoardView 内でタイムライン制御を持たない。

- `src/lib/ui/displayTurn.ts`
- `DISPLAY_TURN_DELAY_MS` で kind ごとの遅延を管理

## reduced-motion

`prefers-reduced-motion` を検知し、演出の一部を抑制する。

## E2E 用 data-* 属性

BoardView は Canvas 描画だが、E2E のために `data-*` を付与する。
詳しくは `src/components/BoardView.tsx` の `data-` 属性を参照。
