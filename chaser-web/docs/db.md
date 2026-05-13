# DB 方針（運用・移行）

背景: リリース後の運用フェーズに入ったため、**必要に応じて migrations を行う**方針に更新する。

## 方針

- DB は永続データとして扱い、破壊的変更は最小限に抑える
- schema の正史は `src/db/schema.ts` と migrations（段階的な変更手順）
- 破壊的変更が必要な場合は、**段階的な移行**（追加 → 互換 → 置き換え → 削除）で対応する
- 開発環境では `db:reset` で作り直してよい

## 現在の実装（事実）

- 起動時に `ensureSchema(db)` が実行される（`src/db/client.ts`）
  - `CREATE TABLE IF NOT EXISTS` と、必要に応じた `ALTER TABLE` で不足カラムを補完する
- 起動時に `seed(db)` は実行しない
  - seed は `bun run db:seed` / `bun run db:reset` で明示的に実行する

## 開発フロー

### 1) スキーマを変える

- `src/db/schema.ts` を更新する
- 追加・変更がある場合は migrations を用意する

### 2) 開発用 DB を作り直す

- `bun run db:reset`
  - `DATABASE_PATH`（未指定なら `chaser.sqlite`）を削除して、`schema + seed` を適用する

### 3) seed だけ反映したい場合

- `bun run db:seed`
  - `schema` を適用してから `seed` を実行する
  - `maps` のサンプルデータは **id 一致時に上書き**される

## 本番運用の考え方

- 起動時の migration（`ensureSchema`）で整合性を確保する
- `db:migrate` は現時点では未実装（必要になったら導入する）
