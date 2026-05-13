import { CompiledQuery, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";

import type { Database } from "./types";

export const DEFAULT_DB_PATH = process.env.DATABASE_PATH ?? "chaser.sqlite";

export function createDb(
  filename: string | URL = DEFAULT_DB_PATH,
): Kysely<Database> {
  const url =
    typeof filename === "string"
      ? filename
      : (filename.pathname ?? filename.toString());
  return new Kysely<Database>({
    dialect: new BunSqliteDialect({
      url,
      // PRAGMA は接続確立時にまとめて実行
      onCreateConnection: async (conn) => {
        await conn.executeQuery(CompiledQuery.raw("PRAGMA journal_mode = WAL"));
        await conn.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = ON"));
        await conn.executeQuery(
          CompiledQuery.raw("PRAGMA busy_timeout = 20000"),
        );
      },
    }),
  });
}
