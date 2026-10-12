import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { Pool } from "pg";
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const password = (await readFile(".local/admin-password.txt", "utf8")).trim();
let cookie = "";
const request = (path, method = "GET", body) =>
  fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
const id = `qa-${Date.now()}`;
let media;
try {
  assert.equal((await request("/api/admin/catalog")).status, 401);
  const login = await request("/api/admin/session", "POST", { password });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const catalog = await (await request("/api/admin/catalog")).json();
  const recipe = {
    ...structuredClone(catalog.recipes[0]),
    id,
    slug: id,
    status: "draft",
  };
  assert.equal(
    (await request("/api/admin/catalog", "PUT", recipe)).status,
    200,
  );
  assert.ok(
    !(await (await request("/api/catalog")).json()).recipes.some(
      (r) => r.id === id,
    ),
  );
  recipe.status = "published";
  assert.equal(
    (await request("/api/admin/catalog", "PUT", recipe)).status,
    200,
  );
  assert.ok(
    (await (await request("/api/catalog")).json()).recipes.some(
      (r) => r.id === id,
    ),
  );
  recipe.status = "archived";
  assert.equal(
    (await request("/api/admin/catalog", "PUT", recipe)).status,
    200,
  );
  assert.ok(
    !(await (await request("/api/catalog")).json()).recipes.some(
      (r) => r.id === id,
    ),
  );
  const invalid = structuredClone(recipe);
  invalid.variants[0].ingredients[0].ingredientId = "unknown-ingredient";
  assert.equal(
    (
      await request("/api/admin/catalog", "POST", {
        version: 1,
        ingredients: catalog.ingredients,
        recipes: [invalid],
      })
    ).status,
    400,
  );
  assert.equal(
    (await (await request("/api/admin/catalog")).json()).recipes.find(
      (r) => r.id === id,
    ).variants[0].ingredients[0].ingredientId,
    recipe.variants[0].ingredients[0].ingredientId,
  );
  const form = new FormData();
  const bytes = await readFile("public/images/recipes/omelet.webp");
  form.set("image", new Blob([bytes], { type: "image/webp" }), "test.webp");
  const upload = await request("/api/admin/upload", "POST", form);
  assert.equal(upload.status, 200);
  media = (await upload.json()).path;
  const image = await request(media);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal((await image.arrayBuffer()).byteLength, bytes.length);
  const bad = new FormData();
  bad.set(
    "image",
    new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
    "test.svg",
  );
  assert.equal((await request("/api/admin/upload", "POST", bad)).status, 400);
  assert.equal((await request("/api/admin/session", "DELETE")).status, 200);
  assert.equal((await request("/api/admin/catalog")).status, 401);
  console.log(
    "API checks passed: protected writes, draft/publish/archive, invalid import rollback, upload validation and media serving.",
  );
} finally {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DELETE FROM recipes WHERE id=$1", [id]);
  await pool.end();
  if (media && process.env.TEST_UPLOAD_DIR)
    await unlink(
      `${process.env.TEST_UPLOAD_DIR}/${media.split("/").pop()}`,
    ).catch(() => {});
}
