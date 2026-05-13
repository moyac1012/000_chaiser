# BLOCK_SPEC.md — 新規ブロック定義書

作成日: 2026-05-12  
根拠: PLAN.md「サーチをした時に得られる情報とかをリストで取るのはやっぱ大変すぎるので、その中のアイテムの個数とかそういうのを取得できるようなブロックを用意しないといけない」

---

## 1. 新規 Blockly ブロック

### 1-1. `chaser_view_count_tile` — 見た結果の中のタイル数

| 項目 | 内容 |
|---|---|
| type | `chaser_view_count_tile` |
| カテゴリ | まわりを見る（COLOR_VIEW） |
| 日本語ラベル | `見た結果 [VIEW] の中の [TILE] の数` |
| 入力 | VIEW: Array（look/search の結果配列）、TILE: dropdown（0〜3） |
| 出力 | Number |
| 生成JS | `(VIEW).filter(t => t === TILE).length` |

**用途：** `chaser_action_search_store` で取得した配列の中に、アイテム(3)がいくつあるかを数える。PLAN.md で「アイテムの数を数えて一番多いところに進む」ステージに必要。

**導入ステージ：** Step 36（フェーズG 最初）

---

### 1-2. `chaser_around_count_tile` — まわりの特定タイル数

| 項目 | 内容 |
|---|---|
| type | `chaser_around_count_tile` |
| カテゴリ | まわりを見る（COLOR_VIEW） |
| 日本語ラベル | `まわりの [TILE] の数` |
| 入力 | TILE: dropdown（0〜3） |
| 出力 | Number |
| 生成JS | `api.around.filter(t => t === TILE).length` |

**用途：** 周囲8マスの中に壁(2)がいくつあるかなどを数える。罠アイテムの危険判定や、敵ステージでの包囲状況確認に使う。

**導入ステージ：** Step 36

---

## 2. 新規 TutorialGoal 種別

現在の `TutorialGoal` は `reachGoal` と `winByPut` の2種類。以下を追加する。

### 2-1. `survive` — N ターン生き延びる

```typescript
{ kind: "survive"; minTurns: number }
```

**判定：** Cool が `minTurns` ターン以上ゲームが続いている（敵に触れず、壁に突っ込まず）なら成功。  
**根拠：** PLAN.md「Nターン敵から逃げるのが目的のステージ」

---

### 2-2. `collectItems` — N 個以上アイテムを集める

```typescript
{ kind: "collectItems"; minItems: number; maxActions: number }
```

**判定：** `maxActions` 以内に `minItems` 個以上アイテムを取得していれば成功（ゴール不要）。  
**根拠：** PLAN.md「何パターンかあるマップで毎回そのアイテムを何ターン以内に何個取らなきゃいけない」

---

## 3. TutorialStepDefinition の追加フィールド

敵が動くステージのために `enemyAi` フィールドを追加する。

```typescript
export type EnemyAiKind =
  | "random"     // ランダム歩行（プレイヤー位置を知らない）
  | "proximity"  // 近接追跡（プレイヤーが隣接8マスに入ったときだけ追跡）
  | "patrol";    // パトロール（定義済みのルートを繰り返す、プレイヤー位置を知らない）

export interface TutorialStepDefinition {
  // ...既存フィールド...
  enemyAi?: EnemyAiKind;  // 未指定なら敵は静止（現状と同じ）
}
```

**根拠：** PLAN.md「20〜25ステージ目ぐらいから敵も動き始める」

### 各 AI の動作仕様

| AI | 動作 | プレイヤー情報 | 難易度 |
|---|---|---|---|
| `random` | 毎ターン、ブロック(2)でないマスの中からランダムに1マス移動 | 知らない | 低 |
| `proximity` | 敵の `around[]`（隣接8マス）にプレイヤーが入ったときだけ追跡。それ以外はランダム移動 | 隣接のみ（プレイヤーと同等） | 中 |
| `patrol` | マップ定義に含まれる座標リストを順番に移動（到達したら折り返す） | 知らない | 中（予測可能） |

### `chase` AI を採用しない理由

`chase` は敵がプレイヤーの**グローバル座標**を常に知っている前提の AI。チュートリアルでは：
- プレイヤーが SEARCH/LOOK を使うと1ターン消費する
- 敵が完全情報で追ってくる場合、探索中に確実に近づかれる → 情報非対称で不利
- 実際の Chaiser 対戦でも、相手は `around[]` / `look()` / `search()` でしか観測できない

**設計原則：** チュートリアルの敵も、プレイヤーと同じ情報制約（隣接範囲内でのみ相手を知る）に従う。

### `proximity` AI の動作詳細

1. 毎ターン、Hot の `around[]`（隣接8マス）を参照
2. その中に Cool が含まれている（tile = 1）→ Cool に近づく方向に1マス移動
3. 含まれていない → ランダムに1マス移動

これにより：
- 近くにいれば追いかける（脅威になる）
- 遠くにいれば位置を知らない（プレイヤーと対等）
- プレイヤーが SEARCH している間、敵はランダムに動く（不利にならない）

### ランナーへの変更要件

- Cool の行動後、`enemyAi` が指定されていれば Hot の行動も実行する
- Cool の新位置 == Hot の新位置 → Cool の負け（`reason: "enemyCollision"`）
- Hot の新位置 == Cool の前位置（Cool が移動してきた先に Hot がいた場合も同様）

---

## 4. 新規ブロックセット

既存セット（BLOCKS_SEARCH）に追加する形で以下を定義する。

```typescript
const BLOCKS_ENEMY = [
  ...BLOCKS_SEARCH,
  "chaser_action_walk_random",  // 敵から逃げるランダム移動
] as const;

const BLOCKS_COUNT = [
  ...BLOCKS_ENEMY,
  "chaser_view_count_tile",
  "chaser_around_count_tile",
  "logic_operation",
  "math_arithmetic",
] as const;
```

| セット名 | 追加ブロック | 導入ステージ |
|---|---|---|
| `BLOCKS_ENEMY` | `chaser_action_walk_random` | Step 25 |
| `BLOCKS_COUNT` | `chaser_view_count_tile`, `chaser_around_count_tile`, `logic_operation`, `math_arithmetic` | Step 36 |
