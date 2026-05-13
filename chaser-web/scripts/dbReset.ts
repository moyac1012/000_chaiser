import { createDb, DEFAULT_DB_PATH } from "../src/db/connection";
import { ensureSchema } from "../src/db/schema";
import { seed } from "../src/db/seed";

async function removeSqliteFiles(dbPath: string): Promise<void> {
  await Bun.file(dbPath)
    .delete()
    .catch(() => {});
  await Bun.file(`${dbPath}-wal`)
    .delete()
    .catch(() => {});
  await Bun.file(`${dbPath}-shm`)
    .delete()
    .catch(() => {});
}

const dbPath = DEFAULT_DB_PATH;

await removeSqliteFiles(dbPath);

const db = createDb(dbPath);
try {
  await ensureSchema(db);
  await seed(db);
  console.log(`[db:reset] initialized: ${dbPath}`);
} finally {
  await db.destroy();
}
