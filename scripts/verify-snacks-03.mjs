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
  await readFile("docs/snack-image-prompts-03.json", "utf8"),
);
assert.equal(prompts.images.length, 8);
const ingredients = new Set(catalog.ingredients.map((i) => i.id));
for (const id of ["corn-starch", "cocoa-powder"])
  assert.ok(ingredients.has(id));
for (const items of [catalog.recipes, catalog.ingredients, catalog.collections])
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
let variants = 0;
for (const { id } of prompts.images) {
  const r = catalog.recipes.find((r) => r.id === id);
  assert.ok(r, id);
  assert.equal(r.category, "snack");
  assert.equal(r.origin, "ai");
  assert.equal(r.tested, false);
  assert.equal(r.storage.fridgeDays, r.storage.freezable ? 2 : 1);
  assert.match(r.storage.note, /\+4 °C/);
  assert.equal(r.image, `/images/recipes/${id}.webp`);
  variants += r.variants.length;
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
assert.equal(variants, 9);
const freeze = catalog.collections.find((c) => c.id === "freezable-snacks");
assert.equal(freeze?.kind, "automatic");
assert.deepEqual(freeze.rules, { category: "snack", freezable: true });
assert.deepEqual(
  catalog.recipes
    .filter((r) => r.category === "snack" && r.storage?.freezable)
    .map((r) => r.id),
  prompts.images.slice(0, 4).map((i) => i.id),
);
const containers = catalog.collections.find(
  (c) => c.id === "snacks-in-containers",
);
assert.equal(containers?.kind, "manual");
assert.equal(containers.recipeIds.length, 5);
assert.ok(
  containers.recipeIds.every((id) =>
    catalog.recipes.some((r) => r.id === id && r.category === "snack"),
  ),
);
assert.equal(
  catalog.recipes.filter(
    (r) =>
      r.category === "snack" &&
      r.variants.some(
        (v) =>
          v.equipment.includes("none") && v.prepMinutes + v.cookMinutes <= 15,
      ),
  ).length,
  9,
);
if (process.env.SNACK_03_BASELINE_PATH) {
  const baseline = JSON.parse(
    await readFile(process.env.SNACK_03_BASELINE_PATH, "utf8"),
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
  "Snack batch 03 verified: 121 recipes, 91 ingredients, 150 variants, 35 collections; 8 new snacks and images, 4 freezable snacks; existing data unchanged when baseline supplied.",
);
