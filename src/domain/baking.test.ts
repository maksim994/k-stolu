import { describe, expect, it } from "vitest";
import {
  bakingCollections,
  bakingIngredients,
  bakingRecipes,
} from "../data/baking";
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

describe("Первая партия выпечки", () => {
  it("добавляет 14 разных рецептов, 4 продукта и 4 подборки", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(bakingRecipes).toHaveLength(14);
    expect(bakingIngredients).toHaveLength(4);
    expect(bakingCollections).toHaveLength(4);
    expect(bakingRecipes.flatMap((r) => r.variants)).toHaveLength(17);
    expect(bundle.recipes).toHaveLength(121);
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.collections).toHaveLength(35);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(bundle.recipes.filter((r) => r.category === "baking")).toHaveLength(
      15,
    );
    expect(new Set(bundle.recipes.map((r) => r.id)).size).toBe(121);
    expect(new Set(bundle.ingredients.map((i) => i.id)).size).toBe(91);
    expect(new Set(bundle.collections!.map((c) => c.id)).size).toBe(35);
    expect(
      new Set(
        bakingRecipes.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(14);
  });
  it("не выдаёт ИИ-рецепты за проверенные или диетические", () => {
    for (const recipe of bakingRecipes) {
      expect(recipe.origin).toBe("ai");
      expect(recipe.tested).toBe(false);
      expect(recipe.status).toBe("published");
      expect(recipe.nutrition).toBeUndefined();
      expect([2, 3]).toContain(recipe.storage?.fridgeDays);
      expect(typeof recipe.storage?.freezable).toBe("boolean");
      expect(recipe.storage?.note).toContain("холодильнике");
      expect(
        recipe.variants.every(
          (v) => v.servings === 4 && v.steps.length >= 3 && v.note.length > 0,
        ),
      ).toBe(true);
    }
    expect(new Set(bakingRecipes.map((r) => r.image)).size).toBe(14);
  });
  it("учитывает плиту при подготовке начинки для трёх пирогов", () => {
    for (const id of [
      "cabbage-pour-pie",
      "tuna-potato-puff-pie",
      "chicken-mushroom-puff-pie",
    ]) {
      const recipe = bakingRecipes.find((r) => r.id === id)!;
      expect(bestVariant(recipe, [], ["oven"])).toBeUndefined();
      expect(bestVariant(recipe, [], ["stove"])).toBeUndefined();
      expect(bestVariant(recipe, [], ["stove", "oven"])?.id).toBe("oven");
      expect(recipe.variants[0].cookMinutes).toBeGreaterThanOrEqual(75);
      expect(
        recipe.variants[0].steps.some((s) => s.text.includes("74 °C")),
      ).toBe(true);
    }
  });
  it("даёт самостоятельную мультиварку и честное время двух партий аэрогриля", () => {
    const apple = bakingRecipes.find((r) => r.id === "apple-kefir-cake")!;
    expect(bestVariant(apple, [], ["multicooker"])?.id).toBe("multicooker");
    expect(apple.variants.find((v) => v.id === "multicooker")?.note).toContain(
      "без давления",
    );
    const banana = bakingRecipes.find((r) => r.id === "banana-oat-muffins")!;
    const cookies = bakingRecipes.find(
      (r) => r.id === "cottage-cheese-cookies",
    )!;
    for (const recipe of [banana, cookies]) {
      const air = bestVariant(recipe, [], ["airfryer"])!;
      expect(air.id).toBe("airfryer");
      expect(air.cookMinutes).toBeGreaterThanOrEqual(45);
      expect(air.note).toMatch(/две|двух/);
      expect(air.prepMinutes + air.cookMinutes).toBeGreaterThan(45);
    }
    expect(
      banana.variants
        .find((v) => v.id === "airfryer")!
        .steps.map((s) => s.text)
        .join(" "),
    ).toContain("Замесите оставшуюся половину только перед второй выпечкой");
  });
  it("быстрая подборка не включает подъём теста и медленные способы", () => {
    const quick = bakingCollections.find((c) => c.id === "quick-baking")!;
    const recipes = collectionRecipes(quick, seedRecipes);
    expect(recipes.map((r) => r.id)).toEqual(quick.recipeIds);
    expect(recipes).toHaveLength(5);
    expect(quick.description).toContain("заранее размороженное");
    for (const recipe of recipes) {
      expect(collectionVariants(quick, recipe).map((v) => v.id)).toEqual([
        "oven",
      ]);
    }
    const pizza = bakingRecipes.find((r) => r.id === "simple-cheese-pizza")!;
    expect(pizza.variants[0].prepMinutes + pizza.variants[0].cookMinutes).toBe(
      135,
    );
    expect(pizza.variants[0].steps.some((s) => /60–90/.test(s.text))).toBe(
      true,
    );
    expect(recipes.some((r) => r.id === pizza.id)).toBe(false);
    for (const recipe of bakingRecipes.filter((r) =>
      r.variants[0].ingredients.some((a) => a.ingredientId === "puff-pastry"),
    )) {
      expect(recipe.variants[0].note).toContain(
        "Время размораживания не включено",
      );
    }
  });
  it("сохраняет порядок ручных подборок и отбирает только разрешённую заморозку", () => {
    for (const collection of bakingCollections.filter(
      (c) => c.kind === "manual",
    )) {
      expect(
        collectionRecipes(collection, seedRecipes).map((r) => r.id),
      ).toEqual(collection.recipeIds);
    }
    const freezer = bakingCollections.find((c) => c.id === "baking-freezer")!;
    const recipes = collectionRecipes(freezer, seedRecipes);
    expect(recipes).toHaveLength(13);
    expect(
      recipes.every(
        (r) => r.category === "baking" && r.storage?.freezable === true,
      ),
    ).toBe(true);
    for (const id of ["tomato-cheese-puff-tarts", "berry-oat-crumble"]) {
      expect(recipes.some((r) => r.id === id)).toBe(false);
      expect(bakingRecipes.find((r) => r.id === id)!.storage!.note).toMatch(
        /текстур/,
      );
    }
  });
  it("масштабирует партию и не закупает повторно остатки", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "breakfast",
        recipeId: "banana-oat-muffins",
        variantId: "airfryer",
        servings: 4,
        cookServings: 8,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-12",
        slot: "breakfast",
        sourceId: "cook",
        servings: 4,
      },
    ];
    const sources = planShoppingSources(
      entries,
      seedRecipes,
      ["2026-10-11", "2026-10-12"],
      ["salt", "oil", "sugar", "water"],
    );
    expect(sources).toHaveLength(1);
    for (const [id, quantity] of [
      ["banana", 400],
      ["flour", 160],
      ["egg", 4],
    ] as const) {
      expect(
        sources[0].items.find((a) => a.ingredientId === id)?.quantity,
      ).toBe(quantity);
    }
    expect(
      sources[0].items.some((a) =>
        ["salt", "oil", "sugar", "water"].includes(a.ingredientId),
      ),
    ).toBe(false);
    expect(storageWarning(entries[1], entries, seedRecipes)).toBe("");
    const late = { ...entries[1], date: "2026-10-14" };
    expect(storageWarning(late, [entries[0], late], seedRecipes)).toContain(
      "срок хранения",
    );
  });
  it("предлагает три других рецепта выпечки для каждого нового блюда", () => {
    for (const recipe of bakingRecipes) {
      const related = relatedRecipes(recipe, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (r) =>
            r.id !== recipe.id &&
            r.category === "baking" &&
            r.status === "published",
        ),
      ).toBe(true);
    }
  });
});
