import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const prompts = JSON.parse(
  await readFile("docs/soup-image-prompts.json", "utf8"),
);
const newIds = prompts.images.map((image) => image.id);
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const capture = async (target, name, fullPage = false) => {
  await target.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => {
        img.loading = "eager";
        return img.decode().catch(() => {});
      }),
    );
  });
  assert.ok(
    await target.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    `Overflow: ${name}`,
  );
  assert.ok(
    await target
      .locator("img")
      .evaluateAll((images) => images.every((img) => img.naturalWidth > 0)),
    `Broken image: ${name}`,
  );
  await target.screenshot({ path: `.local/qa/${name}.png`, fullPage });
};
const cardIds = async (target) =>
  target
    .locator(".recipe-card:visible h3 a")
    .evaluateAll((links) =>
      links.map((a) => new URL(a.href).pathname.split("/").pop()),
    );
const checkBaseline = async () => {
  if (!process.env.SOUP_BASELINE_PATH) return;
  const baseline = JSON.parse(
    await readFile(process.env.SOUP_BASELINE_PATH, "utf8"),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of ["recipes", "ingredients", "collections"]) {
      const rows = (
        await pool.query(`SELECT id,data FROM ${table} ORDER BY id`)
      ).rows;
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
};

try {
  const catalog = await (
    await page.request.get(`${origin}/api/catalog`)
  ).json();
  assert.equal(catalog.recipes.length, 121);
  assert.equal(catalog.ingredients.length, 91);
  assert.equal(catalog.collections.length, 35);
  assert.equal(catalog.recipes.flatMap((r) => r.variants).length, 150);
  const soups = catalog.recipes.filter((r) => r.category === "soup");
  assert.equal(soups.length, 15);
  assert.ok(newIds.every((id) => soups.some((r) => r.id === id)));
  await checkBaseline();
  await page.goto(`${origin}/?category=soup`);
  await expect(page.locator(".recipe-card:visible")).toHaveCount(15);
  await capture(page, "soups-desktop", true);

  for (const id of [
    "everyday-soups",
    "cream-soups",
    "quick-soups",
    "soups-freezer",
  ]) {
    const collection = catalog.collections.find((c) => c.id === id);
    assert.ok(collection);
    let expected;
    if (collection.kind === "manual") expected = collection.recipeIds;
    else {
      const eligible = soups.filter(
        (r) =>
          (!collection.rules.freezable || r.storage?.freezable === true) &&
          r.variants.some(
            (v) =>
              !collection.rules.maxMinutes ||
              v.prepMinutes + v.cookMinutes <= collection.rules.maxMinutes,
          ),
      );
      expected = [
        ...collection.recipeIds.filter((id) =>
          eligible.some((r) => r.id === id),
        ),
        ...eligible
          .filter((r) => !collection.recipeIds.includes(r.id))
          .map((r) => r.id),
      ];
    }
    await page.goto(`${origin}/?collection=${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      collection.title,
    );
    await expect(page.locator(".recipe-card:visible")).toHaveCount(
      expected.length,
    );
    assert.deepEqual(await cardIds(page), expected);
    if (id === "quick-soups") {
      const href = await page
        .locator('.recipe-card:visible h3 a[href*="pumpkin-carrot-soup"]')
        .getAttribute("href");
      assert.ok(href.includes("variant=stove"));
    }
    await capture(page, `collection-${id}`, true);
  }

  await page.goto(`${origin}/?collection=multicooker`);
  for (const id of [
    "chicken-borscht",
    "chicken-pea-soup",
    "pumpkin-carrot-soup",
  ]) {
    await expect(
      page.locator(`.recipe-card:visible h3 a[href*="${id}"]`),
    ).toHaveAttribute("href", new RegExp(`${id}\\?variant=multicooker`));
  }
  for (const id of newIds) {
    const recipe = soups.find((r) => r.id === id);
    assert.equal(recipe.tested, false);
    for (const variant of recipe.variants) {
      await page.goto(`${origin}/recipes/${id}?variant=${variant.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        recipe.title,
      );
      await expect(page.locator(".recipe-quality:visible")).toContainText(
        "Ещё не проверен приготовлением",
      );
      await expect(
        page.getByRole("button", { name: variant.name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".step-list > li:visible")).toHaveCount(
        variant.steps.length,
      );
      await expect(page.locator(".recipe-storage:visible")).toContainText(
        recipe.storage.freezable ? "Можно замораживать" : "Не рекомендуется",
      );
      await expect(
        page.locator(".related-recipes .recipe-card:visible"),
      ).toHaveCount(3);
      const related = await cardIds(page.locator(".related-recipes"));
      assert.ok(
        related.every(
          (relatedId) =>
            relatedId !== id && soups.some((r) => r.id === relatedId),
        ),
      );
    }
  }

  await page.goto(`${origin}/recipes/chicken-borscht?variant=multicooker`);
  await page.getByRole("link", { name: "В план", exact: true }).click();
  const editor = page.getByRole("form", { name: "Блюдо в плане" });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Блюдо", exact: true }),
  ).toHaveValue("chicken-borscht");
  await expect(
    page.getByRole("combobox", { name: "Способ приготовления", exact: true }),
  ).toHaveValue("multicooker");
  await page.getByLabel("Порций на этот приём", { exact: true }).fill("2");
  await page.getByLabel("Приготовить порций", { exact: true }).fill("8");
  await page
    .getByRole("button", { name: "Сохранить в план", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".plan-meal")).toContainText("В запасе 6 порц.");
  await page
    .getByRole("button", { name: "Собрать покупки", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Покупки из плана",
    exact: true,
  });
  await expect(preview).toContainText("Свёкла");
  await preview.getByRole("button", { name: /Добавить в покупки/ }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("k-stolu:v1")),
  );
  const source = saved.shopping.sources.find(
    (s) => s.recipeId === "chicken-borscht",
  );
  assert.ok(source);
  assert.equal(
    source.items.find((a) => a.ingredientId === "beet").quantity,
    600,
  );
  assert.equal(
    source.items.find((a) => a.ingredientId === "chicken-fillet").quantity,
    600,
  );
  assert.ok(
    source.items.every(
      (a) => !["water", "salt", "oil"].includes(a.ingredientId),
    ),
  );
  await page.goto(`${origin}/shopping`);
  await expect(
    page.locator(".shopping-row").filter({ hasText: "Свёкла" }),
  ).toContainText("600 г");
  await capture(page, "soup-shopping-desktop");

  for (const width of [390, 320]) {
    const phoneContext = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await phoneContext.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(`${origin}/?category=soup`);
    await expect(phone.locator(".recipe-card:visible")).toHaveCount(15);
    await capture(phone, `soups-mobile-${width}`);
    await phone.goto(`${origin}/?collection=cream-soups`);
    await expect(phone.locator(".recipe-card:visible")).toHaveCount(3);
    await capture(phone, `cream-soups-mobile-${width}`);
    await phone.goto(
      `${origin}/recipes/pumpkin-carrot-soup?variant=multicooker`,
    );
    await phone
      .getByRole("button", { name: "Увеличить порции", exact: true })
      .click();
    await expect(phone.locator(".serving-stepper:visible")).toContainText(
      "5 порц.",
    );
    await phone
      .getByRole("button", { name: "Уменьшить порции", exact: true })
      .click();
    await expect(phone.locator(".serving-stepper:visible")).toContainText(
      "4 порц.",
    );
    assert.ok(
      await phone.locator(".serving-stepper:visible").evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const parent = el.closest(".ingredients-panel").getBoundingClientRect();
        return bounds.left >= parent.left && bounds.right <= parent.right;
      }),
      "Portion stepper must fit inside the ingredient panel",
    );
    await expect(phone.locator(".method-note:visible")).toContainText(
      "блендер",
    );
    await capture(phone, `pumpkin-soup-mobile-${width}`);
    await phone
      .locator(".method-section:visible")
      .evaluate((el) =>
        el.scrollIntoView({ behavior: "instant", block: "start" }),
      );
    await capture(phone, `pumpkin-method-mobile-${width}`);
    await phoneContext.close();
  }
  await checkBaseline();
  assert.deepEqual(errors, []);
  console.log(
    "Soup QA passed: 13 new recipes, 15 soups, 4 new collections, 3 multicooker variants; all images, related recipes, plan, scaled shopping, desktop and 390/320 mobile.",
  );
  if (process.env.SOUP_BASELINE_PATH)
    console.log(
      "All previous recipes, ingredients and collections are unchanged.",
    );
} finally {
  await browser.close();
}
