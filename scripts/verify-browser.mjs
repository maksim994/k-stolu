import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3037";
await mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(origin);
  await page.getByRole("heading", { name: "Чего хочется сегодня?" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".recipe-card img").first().waitFor();
  await expect(page.locator(".recipe-card:visible")).toHaveCount(121);
  await page.screenshot({
    path: ".local/qa/catalog-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Супы", exact: true }).click();
  await page.waitForURL("**category=soup");
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.getByRole("button", { name: "Аэрогриль", exact: true }).click();
  await page.getByRole("heading", { name: "Пока ничего не нашлось" }).waitFor();
  await page.getByRole("button", { name: "Сбросить поиск и фильтры" }).click();
  await page
    .getByRole("button", { name: "Сохранить Куриный суп с рисом", exact: true })
    .click();
  await page.goto(`${origin}/favorites`);
  await page
    .getByRole("heading", { name: "Ваши сохранённые рецепты" })
    .waitFor();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.goto(`${origin}/pantry`);
  await page.getByRole("button", { name: "Куриное филе", exact: true }).click();
  await page.getByRole("button", { name: "Картофель", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Картофель", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto(`${origin}/recipes/chicken-soup`);
  await page.getByRole("button", { name: "Увеличить порции" }).click();
  await expect(page.locator(".serving-stepper:visible")).toContainText(
    "5 порц.",
  );
  await page
    .getByRole("button", { name: "Режим готовки", exact: true })
    .click();
  await page.getByRole("button", { name: "Следующий шаг" }).click();
  await expect(page.locator(".cook-mode")).toContainText("Шаг 2");
  await page.getByRole("button", { name: "Все шаги" }).click();
  await page.getByRole("button", { name: "Составить список покупок" }).click();
  await page.getByRole("button", { name: /Добавить в покупки/ }).click();
  await page.goto(`${origin}/shopping`);
  await page.locator(".shopping-row").first().waitFor();
  await page.reload();
  await page.locator(".shopping-row").first().waitFor();
  await page
    .getByRole("button", { name: "Добавить продукт", exact: true })
    .click();
  await page.getByLabel("Продукт", { exact: true }).fill("Хлеб для завтрака");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByText("Хлеб для завтрака", { exact: true }).waitFor();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  await phone.goto(origin);
  await phone.getByRole("heading", { name: "Чего хочется сегодня?" }).waitFor();
  await phone.evaluate(() => document.fonts.ready);
  await phone.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) {
      img.loading = "eager";
    }
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    );
  });
  await phone.screenshot({
    path: ".local/qa/catalog-mobile.png",
    fullPage: true,
  });
  await phone.screenshot({ path: ".local/qa/catalog-mobile-viewport.png" });
  assert.ok(
    await phone
      .locator(".recipe-card img")
      .evaluateAll((imgs) => imgs.every((img) => img.naturalWidth > 0)),
  );
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phone.evaluate(
    (value) => localStorage.setItem("k-stolu:v1", value),
    await page.evaluate(() => localStorage.getItem("k-stolu:v1")),
  );
  await phone.goto(`${origin}/recipes/chicken-soup`);
  await phone.getByRole("heading", { name: "Куриный суп с рисом" }).waitFor();
  await expect(phone.locator(".ingredients-panel")).toHaveCount(1);
  await phone.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) {
      img.loading = "eager";
    }
    await Promise.all(
      [...document.images].map((img) => img.decode().catch(() => {})),
    );
  });
  await phone.screenshot({
    path: ".local/qa/recipe-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await phone
    .locator(".ingredients-panel:visible")
    .screenshot({ path: ".local/qa/ingredients-mobile.png" });
  await phone.goto(`${origin}/shopping`);
  await phone.getByRole("heading", { name: "Уже есть дома" }).waitFor();
  await phone.screenshot({
    path: ".local/qa/shopping-mobile.png",
    fullPage: true,
  });
  await mobile.close();
  await page.screenshot({
    path: ".local/qa/shopping-desktop.png",
    fullPage: true,
  });
  const unauthorized = await page.request.get(`${origin}/api/admin/catalog`);
  assert.equal(unauthorized.status(), 401);
  const cross = await page.request.post(`${origin}/api/admin/session`, {
    headers: { Origin: "https://wrong.example" },
    data: { password: "wrong" },
  });
  assert.equal(cross.status(), 403);
  const password = (await readFile(".local/admin-password.txt", "utf8")).trim();
  const login = await page.request.post(`${origin}/api/admin/session`, {
    headers: { Origin: origin },
    data: { password },
  });
  assert.equal(login.status(), 200);
  const exported = await page.request.get(`${origin}/api/admin/catalog`);
  assert.equal(exported.status(), 200);
  assert.equal(
    (await exported.json()).recipes.filter((r) => r.status === "published")
      .length,
    121,
  );
  await page.goto(`${origin}/admin`);
  await page.getByRole("heading", { name: "Ваша книга рецептов" }).waitFor();
  await page.getByRole("button", { name: /Куриный суп с рисом/ }).click();
  await page.getByLabel("Название", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Предпросмотр", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить рецепт", exact: true })
    .click();
  await page.getByText("Рецепт сохранён", { exact: true }).waitFor();
  await page.request.delete(`${origin}/api/admin/session`, {
    headers: { Origin: origin },
  });
  assert.equal(
    (await page.request.get(`${origin}/api/admin/catalog`)).status(),
    401,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: catalog, filters, favorites, pantry, servings, cooking, shopping, persistence, mobile overflow, admin and origin checks. Screenshots: .local/qa/",
  );
} catch (error) {
  await page.screenshot({ path: ".local/qa/failure.png", fullPage: true });
  console.log("Failed at", page.url(), await page.locator("body").innerText());
  throw error;
} finally {
  await context.close();
  await browser.close();
}
