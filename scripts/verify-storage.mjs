import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
const id = `qa-storage-${Date.now()}`;
const password = (await readFile(".local/admin-password.txt", "utf8")).trim();
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const errors = [];
const storageRegion = page.getByRole("region", { name: "Хранение блюда" });
page.on("pageerror", (error) => errors.push(error.message));
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
  const login = await page.request.post(`${origin}/api/admin/session`, {
    headers: { Origin: origin },
    data: { password },
  });
  assert.equal(login.status(), 200);
  const catalog = await request("GET");
  const { storage: _storage, ...legacy } = catalog.recipes.find(
    (r) => r.id === "chicken-soup",
  );
  const recipe = {
    ...legacy,
    id,
    slug: id,
    title: "Проверка хранения блюда",
    status: "published",
  };
  await request("POST", {
    version: 1,
    ingredients: catalog.ingredients,
    recipes: [recipe],
  });
  await page.goto(`${origin}/recipes/${id}`);
  await expect(storageRegion).toContainText("Срок не указан");
  await expect(storageRegion).toContainText("Не указано");
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: /Проверка хранения блюда/ }).click();
  await page
    .getByLabel("В холодильнике, дней (примерно)", { exact: true })
    .fill("3");
  await page
    .getByRole("combobox", { name: /^Можно замораживать/ })
    .selectOption("true");
  await page
    .getByLabel("Примечание о хранении (необязательно)")
    .fill("Замораживать порциями.");
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await expect(page.locator(".admin-preview .recipe-storage")).toContainText(
    "Примерно 3 дня",
  );
  await page
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await page.getByText("Рецепт сохранён", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /Проверка хранения блюда/ }).click();
  await expect(
    page.getByLabel("В холодильнике, дней (примерно)", { exact: true }),
  ).toHaveValue("3");
  await expect(
    page.getByRole("combobox", { name: /^Можно замораживать/ }),
  ).toHaveValue("true");
  await page
    .locator(".editor-storage")
    .screenshot({ path: ".local/qa/storage-editor-desktop.png" });
  const saved = (await request("GET")).recipes.find((r) => r.id === id);
  assert.deepEqual(saved.storage, {
    fridgeDays: 3,
    freezable: true,
    note: "Замораживать порциями.",
  });
  await page.goto(`${origin}/recipes/${id}`);
  await expect(storageRegion).toContainText("Можно замораживать");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".recipe-storage")).toHaveCount(1);
  await expect(page.locator(".app-shell")).toHaveCount(1);
  await page.screenshot({
    path: ".local/qa/storage-desktop.png",
    fullPage: true,
  });
  const phone = await context.browser().newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const mobilePage = await phone.newPage();
    await mobilePage.goto(`${origin}/recipes/${id}`);
    await expect(mobilePage.locator(".recipe-storage")).toHaveCount(1);
    await mobilePage.evaluate(() => document.fonts.ready);
    await mobilePage
      .getByRole("region", { name: "Хранение блюда" })
      .scrollIntoViewIfNeeded();
    await mobilePage.screenshot({ path: ".local/qa/storage-mobile.png" });
    assert.ok(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  } finally {
    await phone.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/admin`);
  await page.getByRole("button", { name: /Проверка хранения блюда/ }).click();
  await page
    .getByLabel("В холодильнике, дней (примерно)", { exact: true })
    .fill("");
  await page
    .getByRole("combobox", { name: /^Можно замораживать/ })
    .selectOption("false");
  await page
    .locator(".editor-storage")
    .screenshot({ path: ".local/qa/storage-editor-mobile.png" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await page.getByText("Рецепт сохранён", { exact: true }).waitFor();
  await page.goto(`${origin}/recipes/${id}`);
  await expect(storageRegion).toContainText("Не рекомендуется");
  await expect(storageRegion).toContainText("Срок не указан");
  await request("PUT", {
    ...saved,
    storage: { fridgeDays: null, freezable: null, note: "" },
  });
  await page.reload();
  await expect(storageRegion).toContainText("Не указано");
  const invalid = await page.request.put(`${origin}/api/admin/catalog`, {
    headers: { Origin: origin },
    data: { ...saved, storage: { ...saved.storage, fridgeDays: 0 } },
  });
  assert.equal(invalid.status(), 400);
  assert.equal(
    (await request("GET")).recipes.find((r) => r.id === id).storage.fridgeDays,
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Storage checks passed: legacy import, preview, save/reload, export, all freezing states, validation and desktop/mobile layout.",
  );
} catch (error) {
  console.log(
    "Storage check failed",
    page.url(),
    errors,
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM recipes WHERE id=$1", [id]);
  } finally {
    await pool.end();
    await context.close();
    await browser.close();
  }
}
