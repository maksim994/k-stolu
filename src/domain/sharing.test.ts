import { describe, expect, it } from "vitest";
import { seedIngredients, seedRecipes } from "../data/seed";
import {
  isLocalRecipeUrl,
  recipeShareLinks,
  recipeShareText,
  recipeShareUrl,
} from "./sharing";

describe("Отправка рецепта", () => {
  const recipe = seedRecipes.find((r) => r.id === "chicken-soup")!;
  const variant = recipe.variants[0];
  it("сохраняет выбранную технику без лишних параметров каталога", () => {
    expect(
      recipeShareUrl("https://example.com", recipe.slug, "multicooker"),
    ).toBe("https://example.com/recipes/chicken-soup?variant=multicooker");
  });
  it("пересчитывает продукты и включает все шаги выбранного варианта", () => {
    const text = recipeShareText(recipe, variant, seedIngredients, 8);
    expect(text).toContain("Куриное филе: 800 г");
    expect(text).toContain("8 порц.");
    for (const step of variant.steps) expect(text).toContain(step.text);
  });
  it("кодирует Unicode и специальные символы ссылки", () => {
    const url = recipeShareUrl("https://example.com", recipe.slug, variant.id);
    const links = recipeShareLinks(url, "Суп & овощи + рис", "Полный рецепт");
    const params = new URL(links.telegram).searchParams;
    expect(params.get("url")).toBe(url);
    expect(params.get("text")).toBe("Суп & овощи + рис");
    expect(new URL(links.email).searchParams.get("subject")).toBe(
      "Суп & овощи + рис",
    );
  });
  it("не отправляет недоступную локальную ссылку вместо рецепта", () => {
    for (const host of [
      "localhost:3037",
      "127.0.0.1:3037",
      "192.168.1.8",
      "10.0.0.1",
      "172.16.0.1",
      "[::1]:3037",
      "cooking.local",
    ]) {
      const url = recipeShareUrl(`http://${host}`, recipe.slug, variant.id);
      expect(isLocalRecipeUrl(url)).toBe(true);
      const links = recipeShareLinks(url, recipe.title, "Полный рецепт");
      expect(new URL(links.telegram).searchParams.get("text")).toBe(
        "Полный рецепт",
      );
      expect(new URL(links.whatsapp).searchParams.get("text")).not.toContain(
        host,
      );
    }
    expect(isLocalRecipeUrl("https://cooking.example.com")).toBe(false);
    expect(isLocalRecipeUrl("https://172.32.0.1")).toBe(false);
  });
});
