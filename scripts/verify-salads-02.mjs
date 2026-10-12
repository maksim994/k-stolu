import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import sharp from "sharp";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const prompts = JSON.parse(
  await readFile("docs/salad-image-prompts-02.json", "utf8"),
);
const response = await fetch(`${origin}/api/catalog`);
assert.equal(response.status, 200);
const catalog = await response.json();
assert.equal(catalog.recipes.length, 121);
assert.equal(catalog.ingredients.length, 91);
assert.equal(catalog.collections.length, 35);
assert.equal(catalog.recipes.flatMap((r) => r.variants).length, 150);
assert.equal(catalog.recipes.filter((r) => r.category === "salad").length, 27);
assert.equal(prompts.images.length, 12);
const ingredientIds = new Set(catalog.ingredients.map((i) => i.id));
const recipeIds = new Set(catalog.recipes.map((r) => r.id));
assert.equal(ingredientIds.size, 91);
assert.equal(recipeIds.size, 121);
for (const recipe of catalog.recipes)
  for (const variant of recipe.variants)
    for (const amount of variant.ingredients)
      assert.ok(
        ingredientIds.has(amount.ingredientId),
        `${recipe.id}: unknown ingredient`,
      );
for (const collection of catalog.collections)
  assert.ok(
    collection.recipeIds.every((id) => recipeIds.has(id)),
    collection.id,
  );
let variants = 0;
for (const { id } of prompts.images) {
  const recipe = catalog.recipes.find((r) => r.id === id);
  assert.ok(recipe, id);
  assert.equal(recipe.category, "salad");
  assert.equal(recipe.origin, "ai");
  assert.equal(recipe.tested, false);
  assert.equal(recipe.storage.fridgeDays, 1);
  assert.equal(recipe.storage.freezable, false);
  assert.equal(recipe.image, `/images/recipes/${id}.webp`);
  variants += recipe.variants.length;
  const image = await fetch(`${origin}${recipe.image}`);
  assert.equal(image.status, 200, id);
  assert.match(image.headers.get("content-type"), /image\/webp/);
  const metadata = await sharp(
    Buffer.from(await image.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width >= 1024 && metadata.height >= 768, id);
}
assert.equal(variants, 13);
for (const [id, count] of [
  ["dinner-salads", 8],
  ["shared-table-salads", 6],
  ["warm-salads", 5],
]) {
  const collection = catalog.collections.find((c) => c.id === id);
  assert.ok(collection, id);
  assert.equal(collection.kind, "manual");
  assert.equal(collection.recipeIds.length, count);
}
if (process.env.SALAD_02_BASELINE_PATH) {
  const baseline = JSON.parse(
    await readFile(process.env.SALAD_02_BASELINE_PATH, "utf8"),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of ["recipes", "ingredients", "collections"]) {
      const { rows } = await pool.query(
        `SELECT id,data FROM ${table} ORDER BY id`,
      );
      for (const old of baseline[table])
        assert.deepEqual(
          rows.find((row) => row.id === old.id)?.data,
          old.data,
          `Existing ${table}/${old.id} changed`,
        );
    }
  } finally {
    await pool.end();
  }
}
console.log(
  "Salad batch 02 verified: 121 recipes, 91 ingredients, 150 variants, 35 collections; 12 new images; previous data unchanged when baseline supplied.",
);
