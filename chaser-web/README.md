# chaser-web

競技プログラミングゲーム **CHaser** をブラウザで遊び、Bot を作って対戦・観戦できる Web プラットフォームです。
Bot はブラウザ側で実行し、Next.js (App Router) + Bun で構築しています。

## 目的

- CHaser を Web 上で楽しめる場を提供する
- JavaScript / Blockly で Bot を開発し、対戦・観戦・リプレイできるようにする
- 大会運営向けに、Docker Compose でローカルネットワーク内の対戦環境としても利用できるようにする

## 現時点の機能（抜粋）

- Bot エディタ（JavaScript / Blockly）
- 対戦ルーム（WebSocket）と観戦 UI
- リプレイ閲覧
- ローカル対戦/訓練用 UI

## 技術スタック

- Runtime: Bun
- Framework: Next.js (App Router)
- UI: Tailwind CSS + Headless UI
- DB: SQLite + Kysely
- Auth: Clerk

## クイックスタート

### 1) 依存関係のインストール

```bash
bun install
```

### 2) 環境変数

```bash
cp .env.example .env.local
```

最低限、Clerk のキーを設定してください。

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

ローカル開発の WebSocket は既定で `ws://localhost:8080/ws/match` を使用します。
必要に応じて `NEXT_PUBLIC_WS_URL` を上書きしてください。

### 3) 開発サーバ起動

```bash
bun run dev
```

このコマンドは **Next.js (3000)** と **WS サーバ (8080)** を同時に起動します。

## よく使うコマンド

```bash
bun run dev         # Next.js + WS サーバ
bun run build       # Next.js build
bun run start       # Next.js start
bun run db:reset    # SQLite を作り直し (schema + seed)
bun run db:seed     # seed を再投入
bun test            # unit tests
bun run test:e2e    # Playwright e2e
bun run lint        # biome check
bun run format      # biome format
bun run typecheck   # TypeScript check
```

## GitHub Actions

- `.github/workflows/ci.yml` で `lint` / `typecheck` / `test` / `build` を実行します
- E2E は Clerk secrets が設定されている場合のみ実行します

E2E を GitHub Actions で動かす場合は、少なくとも次の secrets を設定してください。

- `E2E_CLERK_SECRET_KEY`
- `E2E_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `E2E_CLERK_OWNER_EMAIL`
- `E2E_CLERK_PLAYER_EMAIL`
- `E2E_CLERK_SPECTATOR_EMAIL`

必要に応じて次も設定できます。

- `E2E_NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `E2E_NEXT_PUBLIC_CLERK_SIGN_UP_URL`

## 環境変数（代表的なもの）

- `DATABASE_PATH` (default: `chaser.sqlite`)
- `NEXT_PUBLIC_WS_URL` (client 用 WS URL)
- `WS_SERVER_BASE_URL` (server → WS API 呼び出し用。default: `http://localhost:8080`)
- `WS_SERVER_PORT` (WS サーバの listen ポート)
- `TURN_TIMEOUT_MS` / `TURN_TIMEOUT_FIRST_MS` / `ROOM_WAITING_TIMEOUT_MS`
- `E2E_CLERK_*` (Playwright E2E 用のテストユーザー)

詳細は `.env.example` を参照してください。

## ディレクトリ構成

- `src/core` : CHaser のゲームエンジン / ルール
- `src/app` : Next.js App Router
- `src/db` : Kysely + SQLite
- `server/wsServer.ts` : WebSocket マッチサーバ

## ルール・仕様

- ゲームルール: `chaser-server-client.md` (主に 2 章を参照)

## 開発方針

- ドメインロジックは `src/core` 以外に漏らさない
- DB 操作は Kysely 経由のみ
