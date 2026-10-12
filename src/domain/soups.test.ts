import { describe, expect, it } from "vitest";
import { soupRecipes, soupCollections, soupIngredients } from "../data/soups";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { bundleSchema } from "./recipe";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";

describe("Первая партия супов", () => {
  it("добавляет 13 супов, 7 продуктов и 4 подборки без дублирования", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(soupRecipes).toHaveLength(13);
    expect(soupIngredients).toHaveLength(7);
    expect(soupCollections).toHaveLength(4);
    expect(bundle.recipes.filter((r) => r.category === "soup")).toHaveLength(
      15,
    );
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(new Set(bundle.recipes.map((r) => r.id)).size).toBe(
      bundle.recipes.length,
    );
    expect(new Set(bundle.ingredients.map((i) => i.id)).size).toBe(
      bundle.ingredients.length,
    );
    expect(new Set(bundle.collections!.map((c) => c.id)).size).toBe(
      bundle.collections!.length,
    );
  });

  it("не выдаёт новые рецепты за проверенные и не выдумывает калорийность", () => {
    for (const recipe of soupRecipes) {
      expect(recipe.tested).toBe(false);
      expect(recipe.origin).toBe("ai");
      expect(recipe.status).toBe("published");
      expect(recipe.nutrition).toBeUndefined();
      expect(recipe.storage?.fridgeDays).toBeGreaterThan(0);
      expect(typeof recipe.storage?.freezable).toBe("boolean");
      expect(recipe.storage?.note.length).toBeGreaterThan(30);
      expect(
        recipe.variants.every((v) => v.servings === 4 && v.steps.length >= 3),
      ).toBe(true);
    }
    expect(new Set(soupRecipes.map((r) => r.image)).size).toBe(13);
  });

  it("даёт три новых способа для обычной мультиварки", () => {
    const recipes = soupRecipes.filter((r) =>
      r.variants.some((v) => v.equipment.includes("multicooker")),
    );
    expect(recipes.map((r) => r.id)).toEqual([
      "chicken-borscht",
      "chicken-pea-soup",
      "pumpkin-carrot-soup",
    ]);
    for (const recipe of recipes) {
      const variant = recipe.variants.find((v) => v.id === "multicooker")!;
      expect(variant.note).toContain("без давления");
      expect(variant.note).toContain("инструкции");
      expect(variant.ingredients).toEqual(recipe.variants[0].ingredients);
    }
  });

  it("считает быстрыми только подходящие способы с подготовкой", () => {
    const collection = soupCollections.find((c) => c.id === "quick-soups")!;
    const selected = collectionRecipes(collection, seedRecipes);
    expect(selected.length).toBeGreaterThanOrEqual(6);
    for (const recipe of selected) {
      expect(recipe.category).toBe("soup");
      expect(
        collectionVariants(collection, recipe).every(
          (v) => v.prepMinutes + v.cookMinutes <= 40,
        ),
      ).toBe(true);
    }
    const pumpkin = soupRecipes.find((r) => r.id === "pumpkin-carrot-soup")!;
    expect(collectionVariants(collection, pumpkin).map((v) => v.id)).toEqual([
      "stove",
    ]);
    expect(selected.some((r) => r.id === "chicken-pea-soup")).toBe(false);
  });

  it("не включает сливочные, сырный и готовый макаронный суп в заморозку", () => {
    const collection = soupCollections.find((c) => c.id === "soups-freezer")!;
    const selected = collectionRecipes(collection, seedRecipes);
    expect(selected.some((r) => r.id === "chicken-borscht")).toBe(true);
    for (const recipe of selected) {
      expect(recipe.category).toBe("soup");
      expect(recipe.storage?.freezable).toBe(true);
    }
    for (const id of [
      "broccoli-cream-soup",
      "mushroom-cream-soup",
      "vegetable-pasta-soup",
      "chicken-cheese-soup",
    ]) {
      expect(selected.some((r) => r.id === id)).toBe(false);
    }
  });

  it("сохраняет порядок супов-пюре и предупреждает о блендере", () => {
    const collection = soupCollections.find((c) => c.id === "cream-soups")!;
    const selected = collectionRecipes(collection, seedRecipes);
    expect(selected.map((r) => r.id)).toEqual([
      "pumpkin-carrot-soup",
      "broccoli-cream-soup",
      "mushroom-cream-soup",
    ]);
    for (const recipe of selected) {
      expect(recipe.variants.every((v) => v.note.includes("блендер"))).toBe(
        true,
      );
    }
  });

  it("у каждого нового супа есть три других опубликованных супа в рекомендациях", () => {
    for (const recipe of soupRecipes) {
      const related = relatedRecipes(recipe, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (r) =>
            r.category === "soup" &&
            r.id !== recipe.id &&
            r.status === "published",
        ),
      ).toBe(true);
    }
  });
});
