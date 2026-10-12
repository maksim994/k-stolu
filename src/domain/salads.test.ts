import { describe, expect, it } from "vitest";
import {
  saladCollections,
  saladIngredients,
  saladRecipes,
} from "../data/salads";
import { seedCollections, seedIngredients, seedRecipes } from "../data/seed";
import { bundleSchema } from "./recipe";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import { bestVariant } from "./cooking";
import {
  planShoppingSources,
  storageWarning,
  type PlanEntry,
} from "./meal-plan";

describe("Первая партия салатов", () => {
  it("добавляет 14 рецептов, 7 продуктов и 4 подборки без повторов", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      ingredients: seedIngredients,
      recipes: seedRecipes,
      collections: seedCollections,
    });
    expect(saladRecipes).toHaveLength(14);
    expect(saladIngredients).toHaveLength(7);
    expect(saladCollections).toHaveLength(4);
    expect(bundle.recipes).toHaveLength(121);
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.collections).toHaveLength(35);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(bundle.recipes.filter((r) => r.category === "salad")).toHaveLength(
      27,
    );
    expect(new Set(bundle.recipes.map((r) => r.id)).size).toBe(121);
    expect(new Set(bundle.ingredients.map((i) => i.id)).size).toBe(91);
    expect(new Set(bundle.collections!.map((c) => c.id)).size).toBe(35);
    expect(
      new Set(
        saladRecipes.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(14);
  });
  it("сохраняет честные отметки и короткий ориентир хранения", () => {
    for (const recipe of saladRecipes) {
      expect(recipe.origin).toBe("ai");
      expect(recipe.tested).toBe(false);
      expect(recipe.status).toBe("published");
      expect(recipe.nutrition).toBeUndefined();
      expect(recipe.storage?.fridgeDays).toBe(1);
      expect(recipe.storage?.freezable).toBe(false);
      expect(recipe.storage?.note).toContain("Заморозка");
      expect(
        recipe.variants.every((v) => v.servings === 4 && v.steps.length >= 3),
      ).toBe(true);
    }
    expect(new Set(saladRecipes.map((r) => r.image)).size).toBe(14);
  });
  it("не выдаёт варку и охлаждение за быструю сборку", () => {
    const collection = saladCollections.find((c) => c.id === "quick-salads")!;
    const recipes = collectionRecipes(collection, seedRecipes);
    expect(recipes).toHaveLength(6);
    expect(recipes.map((r) => r.id)).toEqual([
      "tuna-bean-salad",
      "chickpea-pepper-salad",
      "cabbage-carrot-apple-salad",
      "carrot-cheese-garlic-salad",
      "greek-salad",
      "cabbage-corn-cucumber-salad",
    ]);
    for (const recipe of recipes) {
      expect(
        collectionVariants(collection, recipe).every(
          (v) =>
            v.equipment.length === 1 &&
            v.equipment[0] === "none" &&
            v.prepMinutes + v.cookMinutes <= 20,
        ),
      ).toBe(true);
    }
    for (const id of [
      "beet-feta-walnut-salad",
      "vinaigrette",
      "chicken-olivier",
      "radish-cucumber-egg-salad",
      "mimosa-tuna-salad",
      "lentil-cucumber-salad",
    ]) {
      const recipe = saladRecipes.find((r) => r.id === id)!;
      expect(
        recipe.variants.every((v) => v.prepMinutes + v.cookMinutes > 20),
      ).toBe(true);
      expect(
        recipe.variants.every((v) =>
          v.steps.some((s) => /охлад|охлажд|Охлад/.test(s.text)),
        ),
      ).toBe(true);
      expect(recipes.some((r) => r.id === id)).toBe(false);
    }
  });
  it("требует оба прибора для булгура и даёт два самостоятельных способа свёклы", () => {
    const bulgur = saladRecipes.find(
      (r) => r.id === "bulgur-roasted-vegetable-salad",
    )!;
    expect(bestVariant(bulgur, [], ["oven"])).toBeUndefined();
    expect(bestVariant(bulgur, [], ["stove"])).toBeUndefined();
    expect(bestVariant(bulgur, [], ["stove", "oven"])?.id).toBe("oven");
    const beet = saladRecipes.find((r) => r.id === "beet-feta-walnut-salad")!;
    expect(bestVariant(beet, [], ["oven"])?.id).toBe("oven");
    expect(bestVariant(beet, [], ["stove"])?.id).toBe("stove");
    expect(
      beet.variants
        .find((v) => v.id === "oven")
        ?.ingredients.some((a) => a.ingredientId === "water"),
    ).toBe(false);
  });
  it("различает готовые бобовые, сухую чечевицу и два вида горошка", () => {
    const ids = new Set(
      saladRecipes.flatMap((r) =>
        r.variants.flatMap((v) => v.ingredients.map((a) => a.ingredientId)),
      ),
    );
    expect(ids.has("chickpeas")).toBe(false);
    expect(ids.has("dry-beans")).toBe(false);
    expect(ids.has("lentils")).toBe(false);
    expect(ids.has("frozen-peas")).toBe(false);
    expect(ids.has("green-lentils")).toBe(true);
    expect(ids.has("canned-peas")).toBe(true);
    expect(
      saladRecipes
        .find((r) => r.id === "crab-corn-salad")!
        .variants[0].ingredients.some((a) => a.ingredientId === "rice"),
    ).toBe(false);
  });
  it("сохраняет порядок ручных подборок и не добавляет салаты в заморозку", () => {
    for (const collection of saladCollections.filter(
      (c) => c.kind === "manual",
    )) {
      expect(
        collectionRecipes(collection, seedRecipes).map((r) => r.id),
      ).toEqual(collection.recipeIds);
    }
    for (const collection of seedCollections.filter((c) => c.rules.freezable)) {
      expect(
        collectionRecipes(collection, seedRecipes).every(
          (r) => r.category !== "salad",
        ),
      ).toBe(true);
    }
  });
  it("масштабирует покупки и не считает повторную порцию остатков", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "lunch",
        recipeId: "tuna-bean-salad",
        variantId: "fresh",
        servings: 2,
        cookServings: 8,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-11",
        slot: "dinner",
        sourceId: "cook",
        servings: 2,
      },
    ];
    const sources = planShoppingSources(
      entries,
      seedRecipes,
      ["2026-10-11"],
      ["salt", "oil"],
    );
    expect(sources).toHaveLength(1);
    expect(
      sources[0].items.find((a) => a.ingredientId === "canned-tuna")?.quantity,
    ).toBe(400);
    expect(
      sources[0].items.find((a) => a.ingredientId === "canned-beans")?.quantity,
    ).toBe(600);
    expect(
      sources[0].items.some((a) =>
        ["salt", "oil", "water"].includes(a.ingredientId),
      ),
    ).toBe(false);
    const nextDay: PlanEntry = { ...entries[1], date: "2026-10-12" };
    expect(
      storageWarning(nextDay, [entries[0], nextDay], seedRecipes),
    ).toContain("срок хранения");
  });
  it("предлагает к каждому салату три других салата", () => {
    for (const recipe of saladRecipes) {
      const related = relatedRecipes(recipe, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (r) =>
            r.id !== recipe.id &&
            r.category === "salad" &&
            r.status === "published",
        ),
      ).toBe(true);
    }
  });
});
