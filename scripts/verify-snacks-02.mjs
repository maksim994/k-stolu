import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import sharp from "sharp";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const response = await fetch(`${origin}/api/catalog`);
assert.equal(response.status, 200);
const catalog = await response.json();
assert.equal(catalog.recipes.length, 121);
assert.equal(catalog.ingredients.length, 91);
assert.equal(catalog.collections.length, 35);
assert.equal(catalog.recipes.flatMap((r) => r.variants).length, 150);
assert.equal(catalog.recipes.filter((r) => r.category === "snack").length, 24);
const prompts = JSON.parse(
  await readFile("docs/snack-image-prompts-02.json", "utf8"),
);
assert.equal(prompts.images.length, 8);
const ingredients = new Set(catalog.ingredients.map((i) => i.id));
for (const items of [catalog.recipes, catalog.ingredients, catalog.collections])
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
for (const { id } of prompts.images) {
  const r = catalog.recipes.find((r) => r.id === id);
  assert.ok(r, id);
  assert.equal(r.category, "snack");
  assert.equal(r.origin, "ai");
  assert.equal(r.tested, false);
  assert.equal(r.storage.fridgeDays, 1);
  assert.equal(r.storage.freezable, false);
  assert.match(r.storage.note, /\+4 °C/);
  assert.equal(r.image, `/images/recipes/${id}.webp`);
  for (const v of r.variants) {
    assert.equal(v.servings, 2);
    assert.ok(v.steps.length >= 3);
    for (const a of v.ingredients)
      assert.ok(ingredients.has(a.ingredientId), id);
  }
  const image = await fetch(`${origin}${r.image}`);
  assert.equal(image.status, 200, id);
  assert.match(image.headers.get("content-type"), /image\/webp/);
  const m = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(m.format, "webp");
  assert.ok(m.width >= 1024 && m.height >= 768, id);
}
for (const id of ["sweet-snacks", "snacks-for-table"]) {
  const c = catalog.collections.find((c) => c.id === id);
  assert.equal(c?.kind, "manual");
  assert.equal(c.recipeIds.length, 5);
  assert.ok(
    c.recipeIds.every((id) =>
      catalog.recipes.some((r) => r.id === id && r.category === "snack"),
    ),
  );
}
if (process.env.SNACK_02_BASELINE_PATH) {
  const baseline = JSON.parse(
    await readFile(process.env.SNACK_02_BASELINE_PATH, "utf8"),
  );
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of ["recipes", "ingredients", "collections"]) {
      const { rows } = await p.query(
        `SELECT id,data FROM ${table} ORDER BY id`,
      );
      for (const old of baseline[table])
        assert.deepEqual(
          rows.find((r) => r.id === old.id)?.data,
          old.data,
          `Existing ${table}/${old.id} changed`,
        );
    }
  } finally {
    await p.end();
  }
}
console.log(
  "Snack batch 02 verified: 121 recipes, 91 ingredients, 150 variants, 35 collections; 8 new snacks and images; existing data unchanged when baseline supplied.",
);
