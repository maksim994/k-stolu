import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { Pool, type PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { enrichLegacyRecipe, seedAction, syncSeed } from "./seed-sync";

describe("seed update decisions", () => {
  const original = { id: "omelet", name: "Original" };
  const next = { ...original, name: "Improved" };
  it("inserts new content", () => {
    expect(seedAction(undefined, undefined, original)).toBe("insert");
  });
  it("adopts an identical legacy record regardless of object key order", () => {
    expect(
      seedAction({ name: "Original", id: "omelet" }, undefined, original),
    ).toBe("adopt");
  });
  it("does not overwrite untracked legacy edits", () => {
    expect(seedAction(original, undefined, next)).toBe("preserve");
  });
  it("updates an unchanged seeded record", () => {
    expect(seedAction(original, original, next)).toBe("update");
  });
  it("preserves editor changes and archives", () => {
    expect(seedAction({ ...original, name: "Family" }, original, next)).toBe(
      "preserve",
    );
    expect(
      seedAction({ ...original, status: "archived" }, original, next),
    ).toBe("preserve");
  });
  it("does not resurrect a deleted tracked record", () => {
    expect(seedAction(undefined, original, next)).toBe("preserve");
  });
  it("adopts content manually reconciled with the new seed", () => {
    expect(seedAction(next, original, next)).toBe("adopt");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "PostgreSQL seed synchronization",
  () => {
    let pool: Pool;
    let client: PoolClient;
    const recipe = {
      id: "test-omelet",
      slug: "test-omelet",
      status: "published",
      title: "Original",
    };
    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    });
    afterAll(async () => {
      await pool.end();
    });
    beforeEach(async () => {
      client = await pool.connect();
      await client.query("BEGIN");
      // Temporary tables shadow any real tables; every test is rolled back.
      await client.query(`
      CREATE TEMP TABLE schema_migrations(version integer PRIMARY KEY);
      CREATE TEMP TABLE ingredients(id text PRIMARY KEY, data jsonb NOT NULL);
      CREATE TEMP TABLE recipes(id text PRIMARY KEY, slug text UNIQUE NOT NULL, status text NOT NULL, data jsonb NOT NULL, updated_at timestamptz DEFAULT now());
      CREATE TEMP TABLE collections(LIKE recipes INCLUDING ALL);
      SET LOCAL search_path TO pg_temp;
    `);
      await client.query(
        await readFile(
          new URL("../../migrations/004_seed_snapshots.sql", import.meta.url),
          "utf8",
        ),
      );
    });
    afterEach(async () => {
      await client.query("ROLLBACK");
      client.release();
    });
    const getRecipe = async () =>
      (await client.query("SELECT data FROM recipes WHERE id=$1", [recipe.id]))
        .rows[0]?.data;

    it("seeds, updates, preserves admin edits, and is idempotent", async () => {
      expect((await syncSeed(client, "recipes", [recipe])).inserted).toBe(1);
      const improved = { ...recipe, title: "Improved", optional: undefined };
      expect((await syncSeed(client, "recipes", [improved])).updated).toBe(1);
      expect((await getRecipe()).title).toBe("Improved");
      expect((await syncSeed(client, "recipes", [improved])).updated).toBe(0);
      const edited = { ...recipe, title: "Family recipe", status: "archived" };
      await client.query(
        "UPDATE recipes SET data=$1, status='archived' WHERE id=$2",
        [JSON.stringify(edited), recipe.id],
      );
      expect(
        (
          await syncSeed(client, "recipes", [
            { ...recipe, title: "Next release" },
          ])
        ).preserved,
      ).toBe(1);
      expect(await getRecipe()).toEqual(edited);
    });
    it("adopts identical legacy records but preserves unknown legacy changes", async () => {
      await client.query(
        "INSERT INTO recipes(id,slug,status,data) VALUES($1,$2,$3,$4)",
        [recipe.id, recipe.slug, recipe.status, JSON.stringify(recipe)],
      );
      expect(
        (await syncSeed(client, "recipes", [{ ...recipe, title: "Next" }]))
          .preserved,
      ).toBe(1);
      expect(
        (await client.query("SELECT * FROM seed_snapshots")).rowCount,
      ).toBe(0);
      await syncSeed(client, "recipes", [recipe]);
      expect(
        (await client.query("SELECT * FROM seed_snapshots")).rowCount,
      ).toBe(1);
      expect(
        (await syncSeed(client, "recipes", [{ ...recipe, title: "Next" }]))
          .updated,
      ).toBe(1);
    });
    it("does not recreate deleted records or delete content absent from seeds", async () => {
      await syncSeed(client, "recipes", [recipe]);
      await syncSeed(client, "recipes", []);
      expect(await getRecipe()).toEqual(recipe);
      await client.query("DELETE FROM recipes WHERE id=$1", [recipe.id]);
      expect((await syncSeed(client, "recipes", [recipe])).preserved).toBe(1);
      expect(await getRecipe()).toBeUndefined();
    });
    it("synchronizes ingredients and collections using the same policy", async () => {
      const ingredient = { id: "test-egg", name: "Egg" };
      await syncSeed(client, "ingredients", [ingredient]);
      expect(
        (
          await syncSeed(client, "ingredients", [
            { ...ingredient, name: "Eggs" },
          ])
        ).updated,
      ).toBe(1);
      const collection = {
        ...recipe,
        id: "test-collection",
        slug: "test-collection",
      };
      await syncSeed(client, "collections", [collection]);
      expect(
        (
          await syncSeed(client, "collections", [
            { ...collection, title: "Next" },
          ])
        ).updated,
      ).toBe(1);
    });
    it("preserves a pre-existing record with a colliding slug", async () => {
      await syncSeed(client, "recipes", [recipe]);
      expect(
        (await syncSeed(client, "recipes", [{ ...recipe, id: "other" }]))
          .preserved,
      ).toBe(1);
      expect(
        (await client.query("SELECT * FROM seed_snapshots WHERE id='other'"))
          .rowCount,
      ).toBe(0);
      expect(await getRecipe()).toEqual(recipe);
    });
    it("enriches untouched untracked legacy records before adopting them", async () => {
      await client.query(
        "INSERT INTO recipes(id,slug,status,data) VALUES($1,$2,$3,$4)",
        [recipe.id, recipe.slug, recipe.status, JSON.stringify(recipe)],
      );
      const enriched = {
        ...recipe,
        storage: { fridgeDays: 2 },
        nutrition: { kcal: 200 },
      };
      await enrichLegacyRecipe(client, enriched, true);
      expect(await getRecipe()).toEqual(enriched);
      expect((await syncSeed(client, "recipes", [enriched])).preserved).toBe(0);
    });
    it("does not reintroduce storage or nutrition deliberately removed by an editor", async () => {
      const enriched = {
        ...recipe,
        storage: { fridgeDays: 2 },
        nutrition: { kcal: 200 },
      };
      await syncSeed(client, "recipes", [enriched]);
      await client.query(
        "UPDATE recipes SET data=data-'storage'-'nutrition' WHERE id=$1",
        [recipe.id],
      );
      await enrichLegacyRecipe(client, enriched, true);
      expect(await getRecipe()).toEqual(recipe);
      expect((await syncSeed(client, "recipes", [enriched])).preserved).toBe(1);
    });
  },
);
