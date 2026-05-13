# SPEC.md — Chaiser チュートリアル ステージ仕様書

更新日: 2026-05-12（v0.3 確定版）

---

## 1. 何を作るのか

Chaiser（1v1ロボットプログラミングゲーム）向けの**Blocklyチュートリアル ステージ仕様書**。

- 既存ステップ（01〜24）の棚卸し・一覧整理
- **新規ステップ（25〜）の詳細設計**（50ステージ以上になるよう拡張）
- 新規ステージで必要な**新しいBlocklyブロックの提案・定義**
- 敵が動くステージのための**新システム要件の定義**（実装は別途）

## 2. 誰に向けたものか

**一次対象：** Chaiserシステム開発者（田森本人 + チームメンバー）  
→ 仕様書をもとにステージ実装・新ブロック実装・新システム実装を行う

**二次対象：** 釧路市内の中学校技術科教員  
→ 免外の先生でも使えるカリキュラムとして配布

## 3. どの形式で出すのか

本プロジェクトディレクトリ（`000_chaiser/`）以下に以下のMarkdownファイルを作成する：

| ファイル | 内容 |
|---|---|
| `SPEC.md`（本ファイル） | プロジェクト仕様の確定版 |
| `STAGE_LIST.md` | 全ステージ一覧表（01〜50+） |
| `STAGE_DETAIL_A.md` | ステップ01〜24の既存ステージ棚卸し |
| `STAGE_DETAIL_B.md` | ステップ25〜50の新規ステージ詳細設計 |
| `BLOCK_SPEC.md` | 新規ブロックの定義書 |

## 4. 何をやるのか

### 4-1. 既存ステージ（01〜24）の確認・整理
- 既存コード（`chaser-web/src/lib/tutorial/definitions.ts`）から情報を読み取り整理
- 一覧表に落とす（番号・タイトル・学習目標・使用ブロックセット・バリアント数・クリア条件）

### 4-2. 新規ステージ（25〜50+）の設計
- 各ステージに以下を定義する：
  - ステージ番号・ID（`step-25-xxx` 形式）・タイトル
  - 学習目標（この概念を習得する）
  - フェーズ分類
  - マップ（ASCII形式 `# . I C H G`、5×5〜9×9）
  - 使用ブロックセット（既存の7段階 + 新規ブロックが必要な場合は定義）
  - 許可アクション（`allowedActions`）
  - クリア条件（`validation` の種別と引数）
  - バリアント数（複数マップを同コードでクリアする場合は複数）
  - 正解プログラム例（JavaScriptロジック）

### 4-3. 新規ブロックの定義
- 既存ブロックでは実現できないステージで必要なブロックを提案・定義する
- 定義には：ブロック名（type）・日本語ラベル・入出力型・生成するJSコード・用途を含める

### 4-4. 敵が動くステージの新システム要件定義
- 現状の `runner.ts` は Hot（敵）のボットを動かさない（静止）
- 敵が動くステージのために必要なシステム変更を仕様書に明記する（実装はチームに委ねる）

## 5. 何をやらないのか

- Chaiserゲーム本体・チュートリアルランナーの実装コード変更
- Blocklyブロックの実装コード（仕様書で「何が必要か」を定義するのみ）
- 教師向け授業指導案・ワークシートの作成
- 英語版対応

## 6. 品質基準は何か

- 各ステージのマップは**実際にクリア可能であること**（正解プログラム例を必ず1つ書く）
- 難易度の階段が滑らか（隣接ステージ間で概念的な急飛びがない）
- ブロック導入スケジュールに矛盾がない
- 複数バリアント型ステージは、同一コードで全バリアントをクリアできる構成になっている
- 敵が動くステージの仕様は「要実装フラグ」を明記した上で設計する

## 7. 完了条件は何か

- [ ] `STAGE_LIST.md`：50ステージ以上の一覧表が完成
- [ ] `STAGE_DETAIL_A.md`：既存01〜24の棚卸しが完成
- [ ] `STAGE_DETAIL_B.md`：新規25〜50+の詳細設計が完成（各ステージに正解例あり）
- [ ] `BLOCK_SPEC.md`：新規ブロック定義書が完成
- [ ] 敵が動くステージのシステム要件が `STAGE_DETAIL_B.md` に記載されている

## 8. 人間が判断すべき箇所はどこか

- 各フェーズのステージ数配分の最終承認
- 新規ブロックの設計（提案→承認フロー）
- 敵AIの具体的な動作仕様（「常に追いかける」「ランダム歩行」など何種類必要か）
- 難易度感のレビュー（特にフェーズEFの難しさが中学生に合っているか）

---

## 確定事項

- 成果物はMarkdownによるステージ仕様書群
- **既存ステップは01〜24の24段階**（コードから確認済み）
- 50ステージ以上になるよう**step-25以降を新規設計**する
- Blocklyチュートリアル形式、既存Chaiserに組み込む
- ブロック制限仕組みは実装済み（`blocklyBlocks?: readonly string[]` で制御）
- マップサイズ：5×5〜9×9
- マップ記法：ASCII（`#` 壁、`.` 床、`I` アイテム、`C` 自分、`H` 敵、`G` ゴール）
- 敵が動くステージを仕様に含める（実装は後で）
- 必要な新ブロックを仕様書で定義する

## 仮置き事項（設計時に決定）

- step-25以降のフェーズ区切りとステージ数配分
- 新規ブロックの具体的な名前・仕様（BLOCK_SPEC.mdで決定）
- 敵AIの動作パターンの種類・数

---

## 参考：既存ブロック一覧（コードから確認済み）

### 既存ブロックセット（7段階）

| セット名 | 追加されるブロック |
|---|---|
| `BLOCKS_WALK_BASIC` | `chaser_on_turn`, `chaser_turn_end`, `chaser_action_walk` |
| `BLOCKS_WALK_SEQUENCE` | + `controls_if`, `logic_compare`, `math_number`, `chaser_turn_number` |
| `BLOCKS_WALK_PATTERN` | + `math_modulo` |
| `BLOCKS_WALK_BRANCH` | + `chaser_get_tile`, `chaser_is_tile`, `chaser_tile_value` |
| `BLOCKS_WALK_MEMORY` | + `chaser_action_walk_last`, `chaser_get_around`, `chaser_last_direction`, `chaser_state_*`, `chaser_direction_value` |
| `BLOCKS_LOOK` | + `chaser_action_look_store`, `chaser_view_get_around`, `chaser_view_has_tile` |
| `BLOCKS_SEARCH` | + `chaser_action_search_store` |

### 既存ブロック全一覧（type名）

**イベント・ターン制御**
- `chaser_on_start` — 最初に1回だけ
- `chaser_on_turn` — 毎ターン
- `chaser_turn_end` — ターンを終える

**移動アクション**
- `chaser_action_walk` — 歩く（方向指定）
- `chaser_action_walk_last` — 前に進んだ向きで歩く
- `chaser_action_walk_random` — どこかに歩く（ブロック回避ランダム）

**PUT アクション**
- `chaser_action_put` — ブロックを置く（方向指定）

**観測アクション（式ブロック）**
- `chaser_action_look` — 見る（3×3配列を返す）
- `chaser_action_search` — まっすぐ見る（9マス配列を返す）

**観測アクション（変数格納ブロック）**
- `chaser_action_look_store` — 広く見た結果を変数に入れる
- `chaser_action_search_store` — まっすぐ見た結果を変数に入れる

**視野解析**
- `chaser_get_tile` — 方向のマス（0〜3の数値）
- `chaser_is_tile` — 方向のマスは～？（boolean）
- `chaser_get_around` — まわりの～番（0〜8のインデックス指定）
- `chaser_view_get_around` — 見た結果の～番
- `chaser_view_has_tile` — 見た結果に～がある（boolean）
- `chaser_discard_value` — 結果を使わない
- `chaser_tile_value` — マスの種類（定数値）

**状態・変数**
- `chaser_state_create` — 変数を作る
- `chaser_state_set` — 変数に入れる
- `chaser_state_get` — 変数を読む
- `chaser_state_change` — 変数を増減
- `chaser_turn_number` — 現在のターン数
- `chaser_last_direction` — 前に進んだ向き
- `chaser_direction_value` — 向きを選ぶ

**標準Blocklyブロック**
- `controls_if`, `logic_compare`, `logic_operation`, `logic_boolean`, `logic_negate`
- `math_number`, `math_arithmetic`, `math_modulo`, `math_number_property`, `math_random_int`, `math_random_float`

### チュートリアルで未使用（ツールボックスには存在する）
- `chaser_on_start`、`chaser_action_walk_random`（step25以降で解禁候補）
- `chaser_action_look`、`chaser_action_search`（reporter版、store版のみ使用中）
- `logic_operation`、`logic_boolean`、`logic_negate`、`math_arithmetic`など

---

## 参考：現在の TutorialGoal（クリア条件の型）

```typescript
type TutorialGoal =
  | { kind: "reachGoal"; maxActions?: number; requireAllItems?: boolean }
  | { kind: "winByPut"; maxActions?: number }
```

**敵が動くステージで必要になる可能性のある新 Goal 種別（要実装）：**
- `kind: "survive"` — N ターン生き延びる
- `kind: "reachGoalAvoidingEnemy"` — 敵に触れずゴールに到達する
- `kind: "collectItems"` — N 個以上のアイテムを集める（ゴール不要）

---

## フェーズ構成（確定版・全50ステージ）

| フェーズ | 範囲 | テーマ | ブロックセット | 状態 |
|---|---|---|---|---|
| A | 01〜03 | 条件なし・基本移動 | BASIC | 再設計済 |
| B | 04〜07 | 壁判定・1条件（is_tile） | CHECK | 再設計済 |
| C | 08〜12 | 複数マップ・変数・詰み体験 | CHECK→STATE | 再設計済 |
| D | 13〜20 | アイテム収集（LOOK/SEARCH不使用） | STATE | 再設計済 |
| E | 21〜28 | LOOK / SEARCH 観測 | LOOK→SEARCH | 既存移動＋新規 |
| F | 29〜32 | PUT・静止敵 | SEARCH | 既存移動 |
| G | 33〜42 | 動く敵（逃げる・倒す・避けてゴール） | ENEMY | 新規設計 |
| H | 43〜50 | SEARCH×アイテム効率・総合 | COUNT | 新規設計 |

※ 既存実装（旧Step 01〜24）は以下に対応:
- 旧 01〜11 → 新 01〜12（フェーズA〜C、再設計）
- 旧 12〜16（look/search） → 新 21〜25（フェーズE）
- 旧 17〜20（items） → 新 13〜20（フェーズD、前移動）
- 旧 21〜24（PUT） → 新 29〜32（フェーズF）
