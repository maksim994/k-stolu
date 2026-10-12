import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const id = `qa-nutrition-${Date.now()}`;
const password = (await readFile(".local/admin-password.txt", "utf8")).trim();
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (window.__denyClipboard) throw new Error("denied");
        window.__copied = text;
      },
    },
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (data) => {
      window.__shared = data;
    },
  });
  if (!localStorage.getItem("k-stolu:v1"))
    localStorage.setItem(
      "k-stolu:v1",
      JSON.stringify({
        version: 1,
        pantry: ["salt"],
        favorites: ["fish"],
        shopping: {
          sources: [],
          manual: [],
          checked: [],
          hidden: [],
          overrides: {},
        },
      }),
    );
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
const overflow = async (target) =>
  assert.ok(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Horizontal overflow",
  );
const request = async (method, data) => {
  const response = await page.request.fetch(`${origin}/api/admin/catalog`, {
    method,
    headers: { Origin: origin },
    data,
  });
  assert.equal(response.status(), 200, await response.text());
  return response.json();
};
try {
  await page.goto(origin);
  await expect(page.locator(".recipe-card:visible")).toHaveCount(121);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("k-stolu:v1")).unavailableBasics,
      ),
    )
    .toEqual([]);
  await page
    .getByRole("checkbox", { name: "Контроль веса", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(4);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Контроль веса", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".recipe-card")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: ".local/qa/nutrition-catalog-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/pantry`);
  await expect(
    page.getByRole("button", { name: "Макароны", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Вода", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Соль", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".pantry-group").filter({
      has: page.getByRole("heading", {
        name: "Специи и приправы",
        exact: true,
      }),
    }),
  ).toContainText("Корица");
  await expect(
    page.locator(".pantry-group").filter({
      has: page.getByRole("heading", {
        name: "Консервы и соусы",
        exact: true,
      }),
    }),
  ).toContainText("Протёртые томаты");
  await page.locator(".pantry-basics:visible summary").click();
  await expect(
    page.getByRole("checkbox", { name: "Растительное масло", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Растительное масло", exact: true })
    .uncheck();
  await page.reload();
  await page.locator(".pantry-basics:visible summary").click();
  await expect(
    page.getByRole("checkbox", { name: "Растительное масло", exact: true }),
  ).not.toBeChecked();
  const legacy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("k-stolu:v1")),
  );
  assert.deepEqual(legacy.favorites, ["fish"]);
  assert.deepEqual(legacy.plan, []);
  assert.deepEqual(legacy.unavailableBasics, ["oil"]);
  await page.screenshot({
    path: ".local/qa/pantry-basics-desktop.png",
    fullPage: true,
  });
  await page.goto(`${origin}/recipes/chicken-potatoes?variant=airfryer`);
  await expect(page.locator(".method-section .selected")).toContainText(
    /аэрогриле/i,
  );
  await expect(
    page.getByRole("region", { name: "Питание и баланс" }),
  ).toContainText("Аэрогриль сам по себе");
  await page
    .getByRole("button", { name: "Составить список покупок", exact: true })
    .click();
  await expect(
    page
      .locator(".shopping-preview")
      .getByRole("checkbox", { name: /Растительное масло/ }),
  ).toBeChecked();
  await expect(
    page.locator(".shopping-preview").getByRole("checkbox", { name: /^Соль/ }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Поделиться", exact: true }).click();
  const share = page.getByRole("region", { name: "Поделиться рецептом" });
  await expect(share).toContainText("Сайт открыт локально");
  const telegram = new URL(
    await share
      .getByRole("link", { name: "Telegram", exact: true })
      .getAttribute("href"),
  );
  assert.equal(telegram.hostname, "t.me");
  assert.equal(telegram.searchParams.get("url"), "");
  assert.match(telegram.searchParams.get("text"), /аэрогриле/i);
  assert.match(telegram.searchParams.get("text"), /Приготовление/);
  await share
    .getByRole("button", { name: "Скопировать ссылку", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.__copied),
    `${origin}/recipes/chicken-potatoes?variant=airfryer`,
  );
  await share
    .getByRole("button", { name: "Скопировать рецепт", exact: true })
    .click();
  assert.match(await page.evaluate(() => window.__copied), /Приготовление/);
  await share
    .getByRole("button", { name: "Другие приложения", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__shared.url), undefined);
  assert.match(
    await page.evaluate(() => window.__shared.text),
    /Приготовление/,
  );
  await page.screenshot({ path: ".local/qa/recipe-share-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Поделиться", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Поделиться", exact: true }).click();
  await page.evaluate(() => {
    window.__denyClipboard = true;
  });
  await share
    .getByRole("button", { name: "Скопировать рецепт", exact: true })
    .click();
  await expect(share.getByRole("textbox")).toHaveValue(/Приготовление/);
  await page.keyboard.press("Escape");
  await page.goto(`${origin}/recipes/chicken-soup`);
  await expect(
    page.locator(".ingredient-list").getByRole("checkbox", { name: /^Вода/ }),
  ).toBeChecked();
  await expect(
    page.locator(".ingredient-list").getByRole("checkbox", { name: /^Вода/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Составить список покупок", exact: true })
    .click();
  await expect(
    page.locator(".shopping-preview").getByRole("checkbox", { name: /^Вода/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Добавить в покупки/ }).click();
  const shopping = await page.evaluate(
    () => JSON.parse(localStorage.getItem("k-stolu:v1")).shopping,
  );
  assert.ok(
    shopping.sources[0].items.every(
      (i) => !["salt", "water"].includes(i.ingredientId),
    ),
  );
  await page
    .getByRole("region", { name: "Питание и баланс" })
    .evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  await page.screenshot({ path: ".local/qa/nutrition-detail-desktop.png" });

  const login = await page.request.post(`${origin}/api/admin/session`, {
    headers: { Origin: origin },
    data: { password },
  });
  assert.equal(login.status(), 200);
  const catalog = await request("GET");
  const { nutrition: _nutrition, ...original } = catalog.recipes.find(
    (r) => r.id === "chicken-soup",
  );
  await request("POST", {
    version: 1,
    ingredients: catalog.ingredients,
    recipes: [
      { ...original, id, slug: id, title: "Проверка советов по питанию" },
    ],
  });
  await page.goto(`${origin}/recipes/${id}`);
  await expect(
    page.getByRole("region", { name: "Питание и баланс" }),
  ).toHaveCount(0);
  await page.goto(`${origin}/admin`);
  await page
    .getByRole("button", { name: /Проверка советов по питанию/ })
    .click();
  await page.getByLabel("В подборку «Контроль веса»", { exact: true }).check();
  await page
    .getByLabel("Особенности состава (обязательно для рекомендаций)")
    .fill("Курица и овощи без обжарки.");
  await page
    .getByLabel("Советы к блюду (по одному на строку, до 6)")
    .fill("Не добавляйте масло.\nПодавайте с овощами.\n");
  await page
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await page.getByText("Рецепт сохранён", { exact: true }).waitFor();
  const saved = (await request("GET")).recipes.find((r) => r.id === id);
  assert.deepEqual(saved.nutrition, {
    weightManagement: true,
    rationale: "Курица и овощи без обжарки.",
    tips: ["Не добавляйте масло.", "Подавайте с овощами."],
  });
  await page.reload();
  await page
    .getByRole("button", { name: /Проверка советов по питанию/ })
    .click();
  await expect(
    page.getByLabel("В подборку «Контроль веса»", { exact: true }),
  ).toBeChecked();
  await page
    .locator(".editor-nutrition")
    .screenshot({ path: ".local/qa/nutrition-editor-desktop.png" });
  await page
    .getByRole("button", { name: "Удалить рекомендации", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await page.getByText("Рецепт сохранён", { exact: true }).waitFor();
  assert.equal(
    (await request("GET")).recipes.find((r) => r.id === id).nutrition,
    undefined,
  );

  for (const width of [390, 320]) {
    const mobile = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const phone = await mobile.newPage();
    phone.on("pageerror", (error) => errors.push(error.message));
    await phone.goto(`${origin}/?healthy=1`);
    await expect(phone.locator(".recipe-card")).toHaveCount(4);
    await phone.evaluate(() => document.fonts.ready);
    await overflow(phone);
    if (width === 390) {
      const heading = await phone
        .locator(".recipe-card h3")
        .first()
        .boundingBox();
      const nav = await phone.locator(".bottom-nav").boundingBox();
      assert.ok(
        heading && nav && heading.y + heading.height <= nav.y,
        "First recipe name must fit above navigation",
      );
    }
    await phone.screenshot({
      path: `.local/qa/nutrition-catalog-mobile-${width}.png`,
    });
    await phone.goto(`${origin}/recipes/chicken-potatoes?variant=airfryer`);
    await expect(phone.locator(".detail-actions:visible")).toHaveCount(1);
    await phone
      .getByRole("button", { name: "Поделиться", exact: true })
      .click();
    await expect(
      phone.getByRole("link", { name: "Telegram", exact: true }),
    ).toBeVisible();
    await overflow(phone);
    const bounds = await phone.locator(".share-panel").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await phone.screenshot({
      path: `.local/qa/recipe-share-mobile-${width}.png`,
    });
    await phone
      .getByRole("button", { name: "Закрыть отправку рецепта" })
      .click();
    await phone
      .getByRole("region", { name: "Питание и баланс" })
      .evaluate((el) =>
        el.scrollIntoView({ block: "center", behavior: "instant" }),
      );
    await phone.screenshot({
      path: `.local/qa/nutrition-detail-mobile-${width}.png`,
    });
    await phone.goto(`${origin}/pantry`);
    await phone.locator(".pantry-basics:visible summary").click();
    await phone
      .locator(".pantry-basics")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await overflow(phone);
    await phone.screenshot({
      path: `.local/qa/pantry-basics-mobile-${width}.png`,
    });
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "OK: nutrition discovery/editor/legacy export, pantry basics/taxonomy/persistence/shopping, sharing/native/clipboard fallback, desktop/mobile 390/320",
  );
} finally {
  await browser.close();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM recipes WHERE id=$1", [id]);
  } finally {
    await pool.end();
  }
}
