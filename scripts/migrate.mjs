import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(873622)");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort())
    await client.query(await readFile(new URL(file, directory), "utf8"));
  await client.query("COMMIT");
  console.log("Миграции применены.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Не удалось применить миграцию:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
