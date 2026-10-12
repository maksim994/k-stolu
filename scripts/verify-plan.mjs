import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const oldState = {
  version: 1,
  pantry: ["salt"],
  favorites: ["chicken-soup"],
  shopping: { sources: [], manual: [], checked: [], hidden: [], overrides: {} },
};
await context.addInitScript((state) => {
  if (!localStorage.getItem("k-stolu:v1"))
    localStorage.setItem("k-stolu:v1", JSON.stringify(state));
}, oldState);
const editor = page.getByRole("form", { name: "Блюдо в плане" });
const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("k-stolu:v1")));
const save = async () => {
  await page
    .getByRole("button", { name: "Сохранить в план", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
};
const range = async (target) => {
  await target
    .getByRole("heading", { name: "План питания", exact: true })
    .waitFor();
  await target.getByLabel("Начало плана", { exact: true }).fill("2026-10-11");
  await target.getByLabel("Период плана", { exact: true }).selectOption("3");
};

try {
  await page.goto(`${origin}/plan`);
  await range(page);
  assert.deepEqual((await state()).favorites, oldState.favorites);
  assert.deepEqual((await state()).pantry, oldState.pantry);
  await expect(page.locator(".plan-day")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Добавить блюдо на 11 октября", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Блюдо", exact: true })
    .selectOption("chicken-soup");
  await page
    .getByRole("combobox", { name: "Способ приготовления", exact: true })
    .selectOption("stove");
  await page.getByLabel("Порций на этот приём", { exact: true }).fill("2");
  await page.getByLabel("Приготовить порций", { exact: true }).fill("4");
  await save();
  await expect(page.locator(".plan-meal")).toHaveCount(1);
  await expect(page.locator(".plan-meal")).toContainText("В запасе 2 порц.");
  const sourceId = (await state()).plan[0].id;
  await page
    .getByRole("button", { name: "Добавить блюдо на 12 октября", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Приём пищи", exact: true })
    .selectOption("lunch");
  await page.getByRole("radio", { name: "Остатки", exact: true }).check();
  await page
    .getByRole("combobox", { name: "От какого приготовления", exact: true })
    .selectOption(sourceId);
  await page.getByLabel("Порций на этот приём", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Сохранить в план", exact: true })
    .click();
  await expect(page.locator(".meal-plan [role=alert]")).toContainText(
    "порций не хватает",
  );
  await page.getByLabel("Порций на этот приём", { exact: true }).fill("2");
  await save();
  await expect(page.locator(".plan-meal")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Добавить блюдо на 13 октября", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Блюдо", exact: true })
    .selectOption("chicken-soup");
  await page.getByLabel("Порций на этот приём", { exact: true }).fill("2");
  await page.getByLabel("Приготовить порций", { exact: true }).fill("2");
  await save();
  await page.reload();
  await range(page);
  await expect(page.locator(".plan-meal")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: ".local/qa/plan-desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "Собрать покупки", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Покупки из плана",
    exact: true,
  });
  await expect(preview).toContainText("600 г");
  await expect(
    preview.getByRole("checkbox", { name: /Соль/ }),
  ).not.toBeChecked();
  await preview.getByRole("button", { name: /Добавить в покупки/ }).click();
  let saved = await state();
  assert.equal(saved.shopping.sources.length, 2);
  assert.equal(
    saved.shopping.sources.every((source) => source.key.startsWith("plan:")),
    true,
  );
  assert.equal(
    saved.shopping.sources.some((source) =>
      source.items.some((amount) => amount.ingredientId === "salt"),
    ),
    false,
  );
  await page.goto(`${origin}/shopping`);
  const chicken = page
    .locator(".shopping-row")
    .filter({ hasText: "Куриное филе" });
  await expect(chicken).toContainText("600 г");
  await chicken.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Добавить продукт", exact: true })
    .click();
  await page.getByLabel("Продукт", { exact: true }).fill("Хлеб к ужину");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.goto(`${origin}/plan`);
  await range(page);
  await page
    .getByRole("button", { name: "Обновить покупки", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Покупки из плана" })
    .getByRole("button", { name: /Обновить покупки/ })
    .click();
  saved = await state();
  assert.equal(saved.shopping.sources.length, 2);
  assert.ok(saved.shopping.checked.includes("chicken-fillet:г"));
  assert.equal(saved.shopping.manual[0].name, "Хлеб к ужину");
  await page
    .getByRole("button", {
      name: "Изменить Куриный суп с рисом на 11 октября",
      exact: true,
    })
    .click();
  await page.getByLabel("Приготовить порций", { exact: true }).fill("6");
  await editor.screenshot({ path: ".local/qa/plan-editor-desktop.png" });
  await save();
  await expect(page.locator(".plan-meal").first()).toContainText(
    "В запасе 2 порц.",
  );
  await page
    .getByRole("button", { name: "Обновить покупки", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Покупки из плана" })
    .getByRole("button", { name: /Обновить покупки/ })
    .click();
  await page.goto(`${origin}/shopping`);
  await expect(
    page.locator(".shopping-row").filter({ hasText: "Куриное филе" }),
  ).toContainText("800 г");
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const data = await state();
    await phone.addInitScript(
      (state) => localStorage.setItem("k-stolu:v1", JSON.stringify(state)),
      data,
    );
    const mobile = await phone.newPage();
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(`${origin}/plan`);
    await range(mobile);
    await mobile.evaluate(() => document.fonts.ready);
    await mobile.screenshot({ path: ".local/qa/plan-mobile.png" });
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile
      .getByRole("button", {
        name: "Изменить Куриный суп с рисом на 11 октября",
        exact: true,
      })
      .click();
    await mobile
      .getByRole("form", { name: "Блюдо в плане" })
      .screenshot({ path: ".local/qa/plan-editor-mobile.png" });
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile.getByLabel("Приготовить порций", { exact: true }).fill("3");
    await mobile
      .getByRole("button", { name: "Сохранить в план", exact: true })
      .click();
    const mobileEditor = mobile.getByRole("form", { name: "Блюдо в плане" });
    await expect(mobileEditor.getByRole("alert")).toContainText(
      "порций не хватает",
    );
    await mobileEditor
      .getByRole("alert")
      .evaluate((node) =>
        node.scrollIntoView({ block: "center", behavior: "instant" }),
      );
    await mobile.screenshot({ path: ".local/qa/plan-validation-mobile.png" });
    await mobile.getByLabel("Приготовить порций", { exact: true }).fill("6");
    await mobile
      .getByRole("button", { name: "Сохранить в план", exact: true })
      .click();
    await expect(mobileEditor).toHaveCount(0);
    await mobile
      .getByRole("button", { name: "Обновить покупки", exact: true })
      .click();
    await mobile
      .getByRole("region", { name: "Покупки из плана" })
      .screenshot({ path: ".local/qa/plan-shopping-mobile.png" });
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile
      .getByRole("button", { name: "Закрыть покупки из плана" })
      .click();
    await mobile.getByRole("button", { name: "Следующие дни" }).click();
    await expect(mobile.locator(".plan-meal")).toHaveCount(0);
    await mobile.setViewportSize({ width: 320, height: 740 });
    assert.ok(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  } finally {
    await phone.close();
  }
  await page.goto(`${origin}/plan`);
  await range(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", {
      name: "Убрать Куриный суп с рисом на 11 октября",
      exact: true,
    })
    .click();
  await expect(page.locator(".plan-meal")).toHaveCount(3);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Убрать Куриный суп с рисом на 11 октября",
      exact: true,
    })
    .click();
  await expect(page.locator(".plan-meal")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Убрать Куриный суп с рисом на 13 октября",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Обновить покупки", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Покупки из плана" })
    .getByRole("button", { name: /Обновить покупки/ })
    .click();
  assert.equal((await state()).shopping.sources.length, 0);
  assert.equal((await state()).shopping.manual[0].name, "Хлеб к ужину");
  await page.goto(`${origin}/recipes/chicken-soup?variant=multicooker`);
  await page.getByRole("link", { name: "В план", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Блюдо", exact: true }),
  ).toHaveValue("chicken-soup");
  await expect(
    page.getByRole("combobox", { name: "Способ приготовления", exact: true }),
  ).toHaveValue("multicooker");
  assert.deepEqual(errors, []);
  console.log(
    "Meal plan checks passed: legacy state, scheduling, portions, leftovers validation, save/reload, shopping aggregation and updates, deletion, recipe entry point, desktop/mobile and 320px overflow.",
  );
} catch (error) {
  console.log(
    "Meal plan check failed",
    page.url(),
    errors,
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: ".local/qa/plan-failure.png", fullPage: true });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
