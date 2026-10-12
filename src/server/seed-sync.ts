import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";

type Table = "ingredients" | "recipes" | "collections";
type Entry = { id: string; slug?: string; status?: string };

export function seedAction(
  current: unknown,
  previous: unknown,
  incoming: unknown,
) {
  if (current === undefined)
    return previous === undefined ? "insert" : "preserve";
  if (isDeepStrictEqual(current, incoming)) return "adopt";
  if (previous !== undefined && isDeepStrictEqual(current, previous))
    return "update";
  return "preserve";
}

// Table names are restricted to the internal union, never supplied by a request.
export async function syncSeed<T extends Entry>(
  client: PoolClient,
  table: Table,
  entries: T[],
) {
  const current = new Map(
    (await client.query(`SELECT id, data FROM ${table}`)).rows.map((row) => [
      row.id,
      row.data,
    ]),
  );
  const previous = new Map(
    (
      await client.query(
        "SELECT id, data FROM seed_snapshots WHERE entity_type=$1",
        [table],
      )
    ).rows.map((row) => [row.id, row.data]),
  );
  const counts = { inserted: 0, updated: 0, preserved: 0 };
  for (const entry of entries) {
    const json = JSON.stringify(entry);
    const action = seedAction(
      current.get(entry.id),
      previous.get(entry.id),
      JSON.parse(json),
    );
    if (action === "preserve") {
      counts.preserved++;
      continue;
    }
    if (action === "insert") {
      const result =
        table === "ingredients"
          ? await client.query(
              "INSERT INTO ingredients(id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING id",
              [entry.id, json],
            )
          : await client.query(
              `INSERT INTO ${table}(id,slug,status,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
              [entry.id, entry.slug, entry.status, json],
            );
      if (!result.rowCount) {
        counts.preserved++;
        continue;
      }
      counts.inserted++;
    }
    if (action === "update") {
      const result =
        table === "ingredients"
          ? await client.query(
              "UPDATE ingredients SET data=$2::jsonb WHERE id=$1 AND data=$3::jsonb RETURNING id",
              [entry.id, json, JSON.stringify(current.get(entry.id))],
            )
          : await client.query(
              `UPDATE ${table} SET slug=$2,status=$3,data=$4::jsonb,updated_at=now() WHERE id=$1 AND data=$5::jsonb RETURNING id`,
              [
                entry.id,
                entry.slug,
                entry.status,
                json,
                JSON.stringify(current.get(entry.id)),
              ],
            );
      // A concurrent editor's write wins over a seed update.
      if (!result.rowCount) {
        counts.preserved++;
        continue;
      }
      counts.updated++;
    }
    await client.query(
      `INSERT INTO seed_snapshots(entity_type,id,data) VALUES($1,$2,$3::jsonb)
       ON CONFLICT(entity_type,id) DO UPDATE SET data=excluded.data`,
      [table, entry.id, json],
    );
  }
  return counts;
}
