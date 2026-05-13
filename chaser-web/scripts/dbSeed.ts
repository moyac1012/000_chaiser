import { createDb, DEFAULT_DB_PATH } from "../src/db/connection";
import { ensureSchema } from "../src/db/schema";
import { seed } from "../src/db/seed";

const dbPath = DEFAULT_DB_PATH;

const db = createDb(dbPath);
try {
  await ensureSchema(db);
  await seed(db);
  console.log(`[db:seed] applied seed: ${dbPath}`);
} finally {
  await db.destroy();
}
