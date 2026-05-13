import type { Kysely } from "kysely";

import { createDb } from "./connection";
import { ensureSchema } from "./schema";
import { seed } from "./seed";
import type { Database } from "./types";

export { createDb } from "./connection";

async function prepareDb(customDb: Kysely<Database>): Promise<void> {
  await ensureSchema(customDb);
  await seed(customDb);
}

export let db = createDb();
export let dbReady: Promise<void> = prepareDb(db);

// Allow tests to override db instance
export function setDbForTests(custom: Kysely<Database>): void {
  db = custom;
  dbReady = prepareDb(db);
}
