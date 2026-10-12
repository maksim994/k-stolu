import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { seedIngredients, seedRecipes, seedCollections } from "../data/seed";
import { HttpError } from "./http";
import { syncSeed } from "./seed-sync";
import {
  bundleSchema,
  type Catalog,
  type Recipe,
  type Ingredient,
  type Collection,
  collectionSchema,
} from "../domain/recipe";

const recipesTable = pgTable("recipes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull(),
  data: jsonb("data").$type<Recipe>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
const ingredientsTable = pgTable("ingredients", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Ingredient>().notNull(),
});
const collectionsTable = pgTable("collections", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull(),
  data: jsonb("data").$type<Collection>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
let pool: Pool | undefined;
let ready: Promise<void> | undefined;
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
  }));
}
export async function initialize() {
  if (!ready)
    ready = (async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(873622)");
        await client.query(
          "SELECT version FROM schema_migrations WHERE version=1",
        );
        const enrichCatalog = !(
          await client.query(
            "SELECT version FROM schema_migrations WHERE version=2",
          )
        ).rowCount;
        for (const i of seedIngredients) {
          if (
            enrichCatalog &&
            [
              "pepper",
              "cinnamon",
              "paprika",
              "passata",
              "olives",
              "oregano",
            ].includes(i.id)
          ) {
            await client.query(
              "UPDATE ingredients SET data = $2::jsonb WHERE id = $1 AND data = $3::jsonb",
              [
                i.id,
                JSON.stringify(i),
                JSON.stringify({ ...i, group: "Бакалея" }),
              ],
            );
          }
        }
        for (const r of seedRecipes) {
          const { storage, nutrition, ...original } = r;
          if (storage) {
            // Enrich only untouched starter recipes; edited recipes need their own guidance.
            await client.query(
              `UPDATE recipes SET data = jsonb_set(data, '{storage}', $2::jsonb), updated_at = now()
               WHERE id = $1 AND NOT (data ? 'storage') AND data - 'nutrition' = $3::jsonb`,
              [r.id, JSON.stringify(storage), JSON.stringify(original)],
            );
          }
          if (enrichCatalog && nutrition) {
            await client.query(
              `UPDATE recipes SET data = jsonb_set(data, '{nutrition}', $2::jsonb), updated_at = now()
               WHERE id = $1 AND NOT (data ? 'nutrition') AND data - 'storage' = $3::jsonb`,
              [r.id, JSON.stringify(nutrition), JSON.stringify(original)],
            );
          }
        }
        if (enrichCatalog)
          await client.query(
            "INSERT INTO schema_migrations(version) VALUES (2)",
          );
        const changes = {
          ingredients: await syncSeed(client, "ingredients", seedIngredients),
          recipes: await syncSeed(client, "recipes", seedRecipes),
          collections: await syncSeed(client, "collections", seedCollections),
        };
        await client.query("COMMIT");
        console.info("Catalog seed sync:", JSON.stringify(changes));
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  return ready;
}
export async function getCatalog(admin = false): Promise<Catalog> {
  await initialize();
  const db = drizzle(getPool());
  const [recipes, ingredients] = await Promise.all([
    admin
      ? db.select().from(recipesTable)
      : db
          .select()
          .from(recipesTable)
          .where(eq(recipesTable.status, "published")),
    db.select().from(ingredientsTable),
  ]);
  const collections = admin
    ? await db.select().from(collectionsTable)
    : await db
        .select()
        .from(collectionsTable)
        .where(eq(collectionsTable.status, "published"));
  return {
    recipes: recipes.map((r) => r.data),
    ingredients: ingredients.map((i) => i.data),
    collections: collections.map((c) => c.data),
  };
}
export async function importCatalog(input: unknown) {
  const bundle = bundleSchema.parse(input);
  await initialize();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(873622)");
    const db = drizzle(client);
    for (const i of bundle.ingredients)
      await db
        .insert(ingredientsTable)
        .values({ id: i.id, data: i })
        .onConflictDoUpdate({ target: ingredientsTable.id, set: { data: i } });
    for (const r of bundle.recipes)
      await db
        .insert(recipesTable)
        .values({ id: r.id, slug: r.slug, status: r.status, data: r })
        .onConflictDoUpdate({
          target: recipesTable.id,
          set: {
            slug: r.slug,
            status: r.status,
            data: r,
            updatedAt: new Date(),
          },
        });
    for (const c of bundle.collections ?? []) {
      const known = await client.query(
        "SELECT id FROM recipes WHERE id = ANY($1::text[])",
        [c.recipeIds],
      );
      if (known.rowCount !== c.recipeIds.length)
        throw new HttpError(400, "В подборке есть неизвестные рецепты");
      await db
        .insert(collectionsTable)
        .values({ id: c.id, slug: c.slug, status: c.status, data: c })
        .onConflictDoUpdate({
          target: collectionsTable.id,
          set: {
            slug: c.slug,
            status: c.status,
            data: c,
            updatedAt: new Date(),
          },
        });
    }
    await client.query("COMMIT");
    return bundle;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function saveCollection(input: unknown) {
  const collection = collectionSchema.parse(input);
  const catalog = await getCatalog(true);
  if (
    collection.recipeIds.some((id) => !catalog.recipes.some((r) => r.id === id))
  )
    throw new HttpError(400, "В подборке есть неизвестные рецепты");
  await drizzle(getPool())
    .insert(collectionsTable)
    .values({
      id: collection.id,
      slug: collection.slug,
      status: collection.status,
      data: collection,
    })
    .onConflictDoUpdate({
      target: collectionsTable.id,
      set: {
        slug: collection.slug,
        status: collection.status,
        data: collection,
        updatedAt: new Date(),
      },
    });
  return collection;
}
export async function saveRecipe(recipe: unknown) {
  const catalog = await getCatalog(true);
  const parsed = bundleSchema.parse({
    version: 1,
    ingredients: catalog.ingredients,
    recipes: [recipe],
  }).recipes[0];
  await importCatalog({
    version: 1,
    ingredients: catalog.ingredients,
    recipes: [parsed],
  });
  return parsed;
}
