# AGENTS for chaser-web

## 基本方針
- まず実際の入口ファイル、呼び出し経路、影響範囲を確認する
- 無関係なファイルは編集しない
- 差分はできるだけ小さくする
- 変更理由を事実と推測に分けて説明する
- 変更後は対象挙動に必要な最小限の検証を行う

## Multi-agent
- 調査は explorer
- リスク洗い出しは reviewer
- 実装は worker
- いきなり実装に入らず、先に影響範囲を固める

## Conversation Guidelines

- 常に日本語で会話する（思考は英語で問題ない）

## Context7

Always use context7 when I need code generation, setup or
configuration steps, or library/API documentation. This means
you should automatically use the Context7 MCP tools to resolve
library id and get library docs without me having to
explicitly ask.

## このリポジトリについて

- プロダクト名: **chaser-web**
- 目的:
  - 競技プログラミングゲーム **CHaser** をブラウザで楽しめる Web プラットフォームを作る。
  - ブラウザ上で CHaser Bot を開発（JavaScript / Blockly）し、その Bot 同士を対戦させて観戦・リプレイできるようにする。
  - 大会運営向けに、Docker Compose でローカルネットワーク内の CHaser 対戦環境としても利用できるようにする。


## CHaser とは何か（Codex 向けドメイン解説）

CHaser の仕様は `chaser-server-client.md` に詳細があります。このセクションは、コードを書くのに必要な最低限の要約です。

### 1. 盤面・マップ

- 二次元グリッドのマップ（幅 `width`, 高さ `height`）。
- 各セルは次のいずれか:
  - 床（何もない）
  - キャラクタ（プレイヤー）
  - ブロック
  - アイテム
- プレイヤーは **Cool (先攻)** と **Hot (後攻)** の 2 体。

### 2. クライアント（Bot）ができる行動

1 ターンに 1 回、次の 16 コマンドのいずれかを選ぶ。

- **walk 系**（自分を 1 マス移動）
  - `walkRight` / `walkLeft` / `walkUp` / `walkDown`
- **look 系**（指定方向の 3×3 周囲情報を取得）
  - `lookRight` / `lookLeft` / `lookUp` / `lookDown`
- **search 系**（指定方向の直線 9 マスを取得）
  - `searchRight` / `searchLeft` / `searchUp` / `searchDown`
- **put 系**（指定方向の隣接マスにブロックを置く）
  - `putRight` / `putLeft` / `putUp` / `putDown`

chaser-web では、これらを JSON ベースの `Action` 型にマッピングして扱います。

```ts
type Direction = 'Right' | 'Left' | 'Up' | 'Down'
type CommandKind = 'walk' | 'look' | 'search' | 'put'

interface Action {
  kind: CommandKind
  dir: Direction
}
````

### 3. 情報の受け取り（周囲情報）

* サーバ（ゲームエンジン）は、コマンド実行後に **9 マス分の整数配列** を返す。
* これは「自分の上下左右を含む 3×3 の視界」を数値 (0〜3) で表したもの。
* chaser-web ではこれを `TurnView.around` や `TurnView.around3x3` として扱います。

```ts
interface TurnView {
  turn: number
  maxTurns: number
  items: number        // 自分の取得アイテム数
  enemyItems: number   // 相手の取得アイテム数
  around: number[]     // 長さ 9, 0..3
}
```

### 4. 勝敗条件（重要）

詳細は `chaser-server-client.md` / ルールブック参照。ここでは実装上重要なポイントのみ。

**勝ち**

1. `put` によって **相手のいるマス**にブロックを置いた場合 → その時点で勝ち。
2. 上記 1 が一度も起きないままターン制限に達した場合:

   * 取得アイテム数が多い方が勝ち。
   * アイテム数が同じなら引き分け。

**即負け（アイテム数に依らず負け）**

次の状態になった側は即負けになる：

3. 相手にブロックを置かれた結果、自分の上下左右 4 方向すべてがブロックになった。
4. 自分でブロックを置いた結果、自分の上下左右 4 方向すべてがブロックになった。
5. **walk 系コマンドでブロックのあるマスに移動した**。

※ chaser-web では、「ブロックに向かって walk したとき」は常に負け扱いにする。

**アイテム取得時の自動ブロック**

* アイテムを取得すると、「取得直前にいたマス」に自動的にブロックが置かれる。
* この自動ブロックで、上記 1〜5 の条件を満たした場合も勝敗が決まる。

**引き分け**

* `put` で相手にブロックを置くことに成功したが、その結果自分もブロックに囲まれたケース（相打ち）。
* または、ターン終了時にアイテム数が同数のケース（条件 1 による勝ちが一度も発生していない場合）。

---

## chaser-web のアーキテクチャ（Codex が前提にすべきこと）

### 実行モデル（重要）

* **Bot の実行はすべてブラウザ側で行う。**

  * JavaScript Bot: Web Worker or iframe でサンドボックス実行。
  * Blockly Bot: Blockly から JS コードを生成し、JS Bot と同じランタイムで実行。
* **サーバ側はゲームエンジンと審判のみを担当。**

  * GameState の更新
  * 勝敗判定
  * 対戦ルーム管理
  * ログ（棋譜）保存
  * 観戦用状態配信（WebSocket）

### 通信パターン（オンライン対戦）

1. サーバ → クライアント(Bot)：`turnStart` + `view`（TurnView）
2. クライアント：

   * `action = await onTurn(view)` を計算（JS / Blockly 生成 JS）
3. クライアント → サーバ：`action` を WebSocket で送信
4. サーバ：

   * `step(state, player, action)` を実行
   * GameState 更新・ログ記録
   * 観戦者に `stateUpdate` を配信

### ゲームエンジン API（サーバ側）

`app/core/engine.ts` の想定インターフェイス：

```ts
export type Tile = 0 | 1 | 2 | 3 // 床 / キャラ / ブロック / アイテム
export type PlayerId = 'Cool' | 'Hot'

export interface Position {
  x: number
  y: number
}

export interface PlayerState {
  id: PlayerId
  pos: Position
  items: number
}

export type GameStatus = 'running' | 'winCool' | 'winHot' | 'draw'

export interface GameState {
  width: number
  height: number
  map: Tile[][]  // [y][x]
  players: Record<PlayerId, PlayerState>
  turn: number
  maxTurns: number
  status: GameStatus
}

export interface EngineStepResult {
  state: GameState
  view: TurnView // 行動したプレイヤー視点
}

export function initGame(mapId: string): GameState

export function step(
  state: GameState,
  player: PlayerId,
  action: Action
): EngineStepResult
```

実装上の重要なルール：

* 不正コマンド:

  * ブロックに向かう `walk` → 即負け。
  * `put` で既にブロックがあるマスを指定 → 何も起こらない（状態不変）。
* タイムアウト:

  * `TURN_TIMEOUT_MS` は設定可能。デフォルト 500ms。
  * タイムアウトした場合の扱いは「即負け」とする。


## Bot 実行環境（ブラウザ側）

### JavaScript Bot

* Bot 実装者が書くのは以下の関数：

```ts
declare function onTurn(view: TurnView): Action | Promise<Action>
```

* ランタイム側（ブラウザ）では：

```ts
const promise = Promise.resolve(onTurn(view))
const action = await Promise.race([
  promise,
  timeout(TURN_TIMEOUT_MS)
])
```

* 1 マッチにつき 1 サンドボックスを使いまわし、グローバル変数で状態を保持できるようにする。

### Blockly Bot

* Blockly ワークスペースから JS コードを生成し、「JS Bot」と同じ形式で実行する。
* ブロック構成（予定）：
  * CHaser / 観測系:
    * `[位置] のマス`
    * `自分のアイテム数`
    * `相手のアイテム数`
    * `現在のターン数`
  * CHaser / 行動系:
    * 「歩く」ブロック：`[歩く] [上/下/左/右]`
    * 「見る」ブロック
    * 「ブロックを置く」ブロック
    * 「探索する」ブロック
* 生成される JS の形（イメージ）：

```js
// Blockly 生成コード（例）
let memory = 0

function onTurn(view) {
  // ここに Blockly のロジックが展開される
  return walkRight()
}
```


## ディレクトリ構成（予定）

* `src/core` : CHaser のゲームエンジン / マップ / ログ（ドメインロジック）
* `src/db` : Kysely の Database 型・SQLite クライアント
* `src/app` : Next.js のルーティング (App Router)
  * ページルート（ホーム、ルーム一覧、対戦ルーム、マイページ、管理画面）
  * API ルート（/api/bots, /api/rooms, /api/matches 等）
  * WebSocket ルート（/ws/matches/[id] 等）
  * 対戦ルームクライアント
  * JS Bot エディタ（Monaco）
  * Blockly Bot エディタ
* `src/app/globals.css` : Tailwind エントリ


## 技術スタック

* ランタイム: **Bun**
* フレームワーク: **Next.js (v16)**
* UI: **HeadlessUI + TailwindCSS**
* DB: **SQLite**
* ORM / Query: **Kysely**
* 認証: **Clerk**
* DevContainer: Bun ベース（`oven/bun`）のコンテナ環境あり


## コーディング方針

* TypeScript は `strict` を前提にする。
* ドメインロジック（CHaser のルール）は `src/core` 以外に漏らさない。
* DB アクセスは必ず Kysely 経由で行う。生 SQL を書く場合は最低限にし、型定義を更新する。
* 仕様が曖昧な部分・未実装部分には `TODO` コメントを残す。
* 外部の CHaser 実装との互換性（TCP プロトコルなど）は「プロキシコンポーネント」で扱う（コアには混ぜない）。
* 作業ごとに `bun test`, `bun run lint`, `bun run format`, `bun run typecheck` を実施すること。


## アシスタント（Codex など）へのお願い

* まず **この AGENTS.md と `chaser-server-client.md` をざっと読む** ところから始めてください。
* タスクはなるべく **1 ファイル〜数ファイル程度の小さな単位** で扱ってください。
* 既存ファイルを変更する際は、変更の意図・理由をコメントまたは説明文に含めてください。
* 新しい型・関数を追加するときは：
  * どのレイヤ（core / db / routes / islands）に属するのかを意識してください。
  * 型定義から先に書き、その後ロジックを実装してください。
* CHaser のルールで迷ったら：
  * まず `chaser-server-client.md` を確認してください。
  * それでも不明瞭な場合は、コメントで「ルール解釈の前提」を明示してから実装してください。

## chaser-server-client.md を読むときの注意（レガシー TCP について）

`chaser-server-client.md` には、CHaser のゲームルールとあわせて **レガシーな TCP 通信仕様**（ポート番号、2文字コマンド、10文字レスポンスなど）が含まれています。

chaser-web では方針として：

- **ゲームルール／行動仕様／勝敗条件の部分だけ** をコア実装に取り込む
- TCP 通信仕様（第3章「通信仕様（TCP）」など）は **レガシー互換の参考情報にとどめる**

とします。

### 重要:

- `src/core` や Web API / WebSocket の設計に、**レガシー TCP のプロトコル形式を持ち込まないでください**。
  - 例: `wr\r\n` や `"1000000000"` 形式の 10文字レスポンスを新プロトコルに採用しない。
- TCP 互換を実装する場合は、**別コンポーネント（ローカル用のプロキシ）** として設計してください。
  - 例: `proxy/tcp-gateway` のようなディレクトリで、既存の TCP クライアントと Web プロトコルの橋渡しをする。

まとめると：

- ゲームロジック（コマンド仕様・勝敗条件）は `chaser-server-client.md` を **信頼して参照してよい**。
- TCP 仕様は「参考資料」であり、**コアの API / 通信プロトコルには採用しない**。

### Codex / アシスタントへの指示

- `chaser-server-client.md` を参照するときは、
  - **2章: コマンド仕様・勝敗条件** を主に参照してください。
  - **3章以降の TCP 通信仕様は、基本的に「読んで理解するだけ」で、コアコードには持ち込まないでください。**
- もし TCP 互換機能が必要なタスクであれば、その時点で「TCP プロキシ用のコード」であることを明記します。

