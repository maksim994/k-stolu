import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const id = `qa-collection-${Date.now()}`;
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
const overflow = async (target) =>
  assert.ok(
    await target.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "Horizontal overflow",
  );
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
  await overflow(target);
  await target.screenshot({ path: `.local/qa/${name}.png`, fullPage });
};
const adminRequest = async (path, method, data) =>
  page.request.fetch(`${origin}${path}`, {
    method,
    headers: { Origin: origin },
    data,
  });
try {
  const catalog = await (
    await page.request.get(`${origin}/api/catalog`)
  ).json();
  assert.equal(catalog.recipes.length, 121);
  assert.equal(
    catalog.recipes.filter((r) => r.category === "breakfast").length,
    25,
  );
  assert.equal(catalog.collections.length, 35);
  for (const recipe of catalog.recipes) {
    const image = await page.request.get(`${origin}${recipe.image}`);
    assert.equal(image.status(), 200, recipe.image);
    assert.match(image.headers()["content-type"], /image/);
  }
  await page.goto(origin);
  await expect(page.locator(".recipe-card:visible")).toHaveCount(121, {
    timeout: 15000,
  });
  await capture(page, "recipes-desktop");
  await page.getByRole("link", { name: "Подборки", exact: true }).click();
  await expect(page.locator(".collection-card:visible")).toHaveCount(35);
  await capture(page, "collections-desktop", true);
  await page.getByRole("link", { name: /Не только сладкие вафли/ }).click();
  await expect(page.locator(".recipe-card:visible")).toHaveCount(3);
  assert.deepEqual(
    await page.locator(".recipe-card:visible h3").allTextContents(),
    [
      "Картофельные вафли с сыром",
      "Кабачковые вафли с зеленью",
      "Бельгийские вафли",
    ],
  );
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.getByLabel("Время вместе с подготовкой").selectOption("30");
  await expect(page.locator(".recipe-card:visible")).toHaveCount(1);
  assert.ok(page.url().includes("collection=wafflemaker"));
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await expect(page.locator(".recipe-card:visible")).toHaveCount(3);
  await page.goto(`${origin}/?collection=multicooker`);
  await expect(page.locator(".recipe-card:visible").first()).toBeVisible();
  assert.ok(
    (
      await page
        .locator(".recipe-card:visible h3 a")
        .evaluateAll((links) => links.map((a) => a.href))
    ).every((href) => href.includes("variant=multicooker")),
  );
  await page.goto(`${origin}/?category=breakfast`);
  await expect(page.locator(".recipe-card:visible")).toHaveCount(25);
  await capture(page, "breakfasts-desktop", true);
  await page.goto(`${origin}/recipes/omelet`);
  await expect(
    page.locator(".related-recipes .recipe-card:visible"),
  ).toHaveCount(3);
  const related = await page
    .locator(".related-recipes:visible h3")
    .allTextContents();
  assert.ok(related.slice(0, 2).every((title) => /Омлет с/.test(title)));
  await page
    .locator(".related-recipes:visible")
    .evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await capture(page, "related-desktop");
  await page.goto(`${origin}/recipes/potato-waffles?variant=wafflemaker`);
  await expect(page.locator(".recipe-quality:visible")).toContainText(
    "Ещё не проверен",
  );
  await page
    .getByRole("button", { name: "Составить список покупок", exact: true })
    .click();
  await page.getByRole("button", { name: /Добавить в покупки ·/ }).click();
  await page.goto(`${origin}/shopping`);
  await expect(page.locator(".shopping-list").first()).toContainText(
    "Картофель",
  );
  await expect(page.locator(".shopping-groups")).not.toContainText(
    "Растительное масло",
  );

  const password = (await readFile(".local/admin-password.txt", "utf8")).trim();
  assert.equal(
    (await adminRequest("/api/admin/session", "POST", { password })).status(),
    200,
  );
  const baseline = await (
    await page.request.get(`${origin}/api/admin/catalog`)
  ).json();
  const collection = {
    ...baseline.collections[0],
    id,
    slug: id,
    title: "Проверочная подборка",
    status: "draft",
    recipeIds: ["omelet", "tuna-sandwich"],
  };
  assert.equal(
    (await adminRequest("/api/admin/collections", "PUT", collection)).status(),
    200,
  );
  assert.equal(
    (
      await adminRequest("/api/admin/collections", "PUT", {
        ...collection,
        id: `${id}-invalid`,
        recipeIds: ["unknown"],
      })
    ).status(),
    400,
  );
  await page.goto(`${origin}/admin`);
  await page.getByText(/Подборки ·/).click();
  await page.getByRole("button", { name: /Проверочная подборка/ }).click();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    collection.title,
  );
  await page.getByRole("button", { name: "Поднять рецепт 2" }).click();
  await page.getByLabel("Статус").selectOption("published");
  await page
    .locator(".collection-manager")
    .evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await capture(page, "collection-editor-desktop");
  await page
    .getByRole("button", { name: "Сохранить подборку", exact: true })
    .click();
  await expect(page.locator(".collection-manager [role=status]")).toContainText(
    "Подборка сохранена",
  );
  await page.goto(`${origin}/?collection=${id}`);
  await expect(page.locator(".recipe-card:visible")).toHaveCount(2);
  await expect(page.locator(".recipe-card:visible h3").first()).toHaveText(
    "Сэндвич с тунцом и огурцом",
  );
  const exported = await (
    await page.request.get(`${origin}/api/admin/catalog`)
  ).json();
  assert.equal(
    exported.collections.find((c) => c.id === id).recipeIds[0],
    "tuna-sandwich",
  );
  const legacy = {
    version: 1,
    ingredients: [baseline.ingredients[0]],
    recipes: [],
  };
  assert.equal(
    (await adminRequest("/api/admin/catalog", "POST", legacy)).status(),
    200,
  );
  assert.equal(
    (await (await page.request.get(`${origin}/api/admin/catalog`)).json())
      .collections.length,
    36,
  );
  assert.equal(
    (
      await adminRequest("/api/admin/collections", "PUT", {
        ...collection,
        status: "archived",
      })
    ).status(),
    200,
  );
  await page.goto(`${origin}/?collection=${id}`);
  await expect(
    page.getByRole("heading", { name: "Подборка недоступна" }),
  ).toBeVisible();
  await expect(page.locator(".recipe-card:visible")).toHaveCount(0);

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(`${origin}/?view=collections`);
  await expect(phone.locator(".collection-card:visible")).toHaveCount(35);
  await capture(phone, "collections-mobile");
  await phone.goto(`${origin}/?collection=wafflemaker`);
  await expect(phone.locator(".recipe-card:visible")).toHaveCount(3);
  await capture(phone, "waffles-mobile");
  await phone.goto(`${origin}/recipes/zucchini-omelet?variant=multicooker`);
  await expect(
    phone.getByRole("button", { name: "В мультиварке", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await capture(phone, "breakfast-detail-mobile");
  await phone
    .locator(".related-recipes:visible")
    .evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await capture(phone, "related-mobile");
  await mobile.addCookies(await context.cookies());
  await phone.goto(`${origin}/admin`);
  await phone.getByText(/Подборки ·/).click();
  await phone.getByRole("button", { name: /Завтрак без спешки/ }).click();
  await phone
    .locator(".collection-manager")
    .evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await capture(phone, "collection-editor-mobile");
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "Collections QA passed: 121 recipes, 25 breakfasts, 35 collections; variants, filters, related recipes, shopping, admin, import compatibility and mobile layout.",
  );
} finally {
  await browser.close();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM collections WHERE id = $1", [id]);
  } finally {
    await pool.end();
  }
}
