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
const snacks = catalog.recipes.filter((r) => r.category === "snack");
assert.equal(snacks.length, 24);
const prompts = JSON.parse(
  await readFile("docs/snack-image-prompts.json", "utf8"),
);
assert.equal(prompts.images.length, 8);
const ingredients = new Set(catalog.ingredients.map((i) => i.id));
assert.equal(ingredients.size, 91);
assert.equal(new Set(catalog.recipes.map((r) => r.id)).size, 121);
assert.equal(new Set(catalog.collections.map((c) => c.id)).size, 35);
for (const r of catalog.recipes)
  for (const v of r.variants)
    for (const a of v.ingredients)
      assert.ok(ingredients.has(a.ingredientId), r.id);
for (const { id } of prompts.images) {
  const r = snacks.find((r) => r.id === id);
  assert.ok(r, id);
  assert.equal(r.origin, "ai");
  assert.equal(r.tested, false);
  assert.equal(r.storage.fridgeDays, 1);
  assert.equal(r.storage.freezable, false);
  assert.equal(r.image, `/images/recipes/${id}.webp`);
  const image = await fetch(`${origin}${r.image}`);
  assert.equal(image.status, 200, id);
  assert.match(image.headers.get("content-type"), /image\/webp/);
  const m = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(m.format, "webp");
  assert.ok(m.width >= 1024 && m.height >= 768, id);
}
const quick = catalog.collections.find((c) => c.id === "quick-snacks");
assert.equal(quick.rules.category, "snack");
assert.equal(quick.rules.maxMinutes, 15);
assert.equal(quick.rules.equipment, "none");
assert.equal(
  snacks.filter((r) =>
    r.variants.some(
      (v) =>
        v.equipment.includes("none") && v.prepMinutes + v.cookMinutes <= 15,
    ),
  ).length,
  9,
);
for (const [id, count] of [
  ["snacks-to-go", 4],
  ["warm-snacks", 3],
])
  assert.equal(
    catalog.collections.find((c) => c.id === id)?.recipeIds.length,
    count,
  );
if (process.env.SNACK_BASELINE_PATH) {
  const baseline = JSON.parse(
    await readFile(process.env.SNACK_BASELINE_PATH, "utf8"),
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
  "Snacks verified: 121 recipes, 91 ingredients, 150 variants, 35 collections; 8 new snacks and images; existing data unchanged when baseline supplied.",
);
