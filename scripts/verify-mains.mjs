import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import sharp from "sharp";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const prompts = JSON.parse(
  await readFile("docs/main-image-prompts.json", "utf8"),
);
const response = await fetch(`${origin}/api/catalog`);
assert.equal(response.status, 200);
const catalog = await response.json();
assert.equal(catalog.recipes.length, 121);
assert.equal(catalog.ingredients.length, 91);
assert.equal(catalog.collections.length, 35);
assert.equal(catalog.recipes.flatMap((recipe) => recipe.variants).length, 150);
assert.equal(
  catalog.recipes.filter((recipe) => recipe.category === "main").length,
  15,
);

const ingredientIds = new Set(
  catalog.ingredients.map((ingredient) => ingredient.id),
);
const recipeIds = new Set(catalog.recipes.map((recipe) => recipe.id));
for (const recipe of catalog.recipes) {
  for (const variant of recipe.variants) {
    for (const ingredient of variant.ingredients) {
      assert.ok(
        ingredientIds.has(ingredient.ingredientId),
        `${recipe.id}: unknown ingredient`,
      );
    }
  }
}
for (const collection of catalog.collections) {
  assert.ok(
    collection.recipeIds.every((id) => recipeIds.has(id)),
    collection.id,
  );
}
for (const { id } of prompts.images) {
  const recipe = catalog.recipes.find((item) => item.id === id);
  assert.ok(recipe, id);
  assert.equal(recipe.category, "main");
  assert.equal(recipe.tested, false);
  assert.equal(recipe.origin, "ai");
  assert.equal(recipe.image, `/images/recipes/${id}.webp`);
  const imageResponse = await fetch(`${origin}${recipe.image}`);
  assert.equal(imageResponse.status, 200, id);
  assert.match(imageResponse.headers.get("content-type"), /image\/webp/);
  const metadata = await sharp(
    Buffer.from(await imageResponse.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.width >= 1024 && metadata.height >= 768, id);
}
for (const id of [
  "weekday-dinners",
  "quick-dinners",
  "meatless-mains",
  "mains-freezer",
]) {
  assert.ok(
    catalog.collections.some((collection) => collection.id === id),
    id,
  );
}

if (process.env.MAIN_BASELINE_PATH) {
  const baseline = JSON.parse(
    await readFile(process.env.MAIN_BASELINE_PATH, "utf8"),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of ["recipes", "ingredients", "collections"]) {
      const { rows } = await pool.query(
        `SELECT id,data FROM ${table} ORDER BY id`,
      );
      for (const old of baseline[table]) {
        assert.deepEqual(
          rows.find((row) => row.id === old.id)?.data,
          old.data,
          `Existing ${table}/${old.id} changed`,
        );
      }
    }
  } finally {
    await pool.end();
  }
}
console.log(
  "Mains verified: 121 recipes, 91 ingredients, 150 variants, 35 collections; 12 new images; previous data unchanged when baseline supplied.",
);
