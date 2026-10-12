import { describe, expect, it } from "vitest";
import { mainRecipes, mainCollections, mainIngredients } from "../data/mains";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
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

describe("Первая партия вторых блюд", () => {
  it("добавляет 12 разных рецептов, 5 продуктов и 4 подборки", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(mainRecipes).toHaveLength(12);
    expect(mainIngredients).toHaveLength(5);
    expect(mainCollections).toHaveLength(4);
    expect(bundle.recipes.filter((r) => r.category === "main")).toHaveLength(
      15,
    );
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(new Set(bundle.recipes.map((r) => r.id)).size).toBe(121);
    expect(new Set(bundle.ingredients.map((i) => i.id)).size).toBe(91);
    expect(new Set(bundle.collections!.map((c) => c.id)).size).toBe(35);
    expect(
      new Set(
        mainRecipes.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(12);
  });
  it("сохраняет честные отметки, хранение и четыре порции", () => {
    for (const recipe of mainRecipes) {
      expect(recipe.origin).toBe("ai");
      expect(recipe.tested).toBe(false);
      expect(recipe.nutrition).toBeUndefined();
      expect(recipe.status).toBe("published");
      expect(recipe.storage?.fridgeDays).toBeGreaterThan(0);
      expect(typeof recipe.storage?.freezable).toBe("boolean");
      expect(recipe.storage?.note.length).toBeGreaterThan(30);
      expect(
        recipe.variants.every((v) => v.servings === 4 && v.steps.length >= 3),
      ).toBe(true);
    }
    expect(new Set(mainRecipes.map((r) => r.image)).size).toBe(12);
  });
  it("не скрывает дополнительную технику для перцев, запеканки и баклажанов", () => {
    const peppers = mainRecipes.find((r) => r.id === "stuffed-peppers")!;
    expect(bestVariant(peppers, [], ["multicooker"])).toBeUndefined();
    expect(bestVariant(peppers, [], ["stove", "multicooker"])?.id).toBe(
      "stove",
    );
    expect(
      peppers.variants.find((v) => v.id === "multicooker")?.equipment,
    ).toEqual(["multicooker", "stove"]);
    for (const id of ["potato-beef-casserole", "eggplant-bean-boats"]) {
      const recipe = mainRecipes.find((r) => r.id === id)!;
      expect(bestVariant(recipe, [], ["oven"])).toBeUndefined();
      expect(bestVariant(recipe, [], ["stove", "oven"])?.id).toBe("oven");
    }
    const multicooker = mainRecipes.flatMap((r) =>
      r.variants.filter((v) => v.equipment.includes("multicooker")),
    );
    expect(multicooker).toHaveLength(3);
    expect(multicooker.every((v) => v.note.includes("без давления"))).toBe(
      true,
    );
  });
  it("учитывает две партии котлет в аэрогриле", () => {
    const recipe = mainRecipes.find((r) => r.id === "turkey-oat-cutlets")!;
    const variant = recipe.variants.find((v) => v.id === "airfryer")!;
    expect(variant.cookMinutes).toBeGreaterThanOrEqual(2 * 22);
    expect(variant.note).toContain("две последовательные партии");
    expect(variant.steps.some((s) => s.text.includes("74 °C"))).toBe(true);
    expect(variant.ingredients).toEqual(recipe.variants[0].ingredients);
  });
  it("в быстрый ужин пропускает только способы до 40 минут", () => {
    const collection = mainCollections.find((c) => c.id === "quick-dinners")!;
    const recipes = collectionRecipes(collection, seedRecipes);
    for (const id of [
      "tuna-tomato-pasta",
      "chicken-mushroom-pasta",
      "fish-tomato-stew",
      "lentil-pumpkin-curry",
      "chickpea-zucchini-stew",
    ])
      expect(recipes.some((r) => r.id === id)).toBe(true);
    expect(recipes.some((r) => r.id === "turkey-oat-cutlets")).toBe(false);
    expect(
      collectionVariants(
        collection,
        seedRecipes.find((r) => r.id === "chicken-potatoes")!,
      ).map((v) => v.id),
    ).toEqual(["airfryer"]);
    expect(
      recipes.every(
        (r) =>
          r.category === "main" &&
          collectionVariants(collection, r).every(
            (v) => v.prepMinutes + v.cookMinutes <= 40,
          ),
      ),
    ).toBe(true);
  });
  it("подборка без мяса не содержит птицу, рыбу или фарш", () => {
    const collection = mainCollections.find((c) => c.id === "meatless-mains")!;
    const recipes = collectionRecipes(collection, seedRecipes);
    expect(recipes.map((r) => r.id)).toEqual([
      "lentil-pumpkin-curry",
      "chickpea-zucchini-stew",
      "eggplant-bean-boats",
    ]);
    const meat = new Set([
      "chicken-fillet",
      "chicken-thigh",
      "turkey-mince",
      "ground-meat",
      "white-fish",
      "canned-tuna",
    ]);
    expect(
      recipes.every((r) =>
        r.variants.every((v) =>
          v.ingredients.every((a) => !meat.has(a.ingredientId)),
        ),
      ),
    ).toBe(true);
    expect(
      recipes
        .flatMap((r) => r.variants.flatMap((v) => v.ingredients))
        .some((a) => ["dry-beans", "chickpeas"].includes(a.ingredientId)),
    ).toBe(false);
  });
  it("подборка заморозки не включает пасту и баклажаны под сыром", () => {
    const collection = mainCollections.find((c) => c.id === "mains-freezer")!;
    const recipes = collectionRecipes(collection, seedRecipes);
    expect(
      recipes.every(
        (r) => r.category === "main" && r.storage?.freezable === true,
      ),
    ).toBe(true);
    for (const id of [
      "chicken-mushroom-pasta",
      "tuna-tomato-pasta",
      "eggplant-bean-boats",
    ])
      expect(recipes.some((r) => r.id === id)).toBe(false);
  });
  it("покупки масштабируются по приготовлению, а не по повторному приёму остатков", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "lunch",
        recipeId: "chicken-bulgur",
        variantId: "multicooker",
        servings: 2,
        cookServings: 8,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-12",
        slot: "lunch",
        sourceId: "cook",
        servings: 2,
      },
    ];
    const sources = planShoppingSources(
      entries,
      seedRecipes,
      ["2026-10-11", "2026-10-12"],
      ["salt", "oil"],
    );
    expect(sources).toHaveLength(1);
    expect(
      sources[0].items.find((a) => a.ingredientId === "chicken-fillet")
        ?.quantity,
    ).toBe(800);
    expect(
      sources[0].items.find((a) => a.ingredientId === "bulgur")?.quantity,
    ).toBe(400);
    expect(
      sources[0].items.every(
        (a) => !["water", "salt", "oil"].includes(a.ingredientId),
      ),
    ).toBe(true);
  });
  it("для блюд с рисом предупреждает об остатках на следующий день", () => {
    for (const id of ["stuffed-peppers", "lazy-cabbage-beef"]) {
      const recipe = mainRecipes.find((r) => r.id === id)!;
      expect(recipe.storage?.fridgeDays).toBe(1);
      expect(recipe.storage?.note).toContain("24 часов");
      const entries: PlanEntry[] = [
        {
          id: "cook",
          kind: "cook",
          date: "2026-10-11",
          slot: "dinner",
          recipeId: id,
          variantId: "stove",
          servings: 2,
          cookServings: 4,
        },
        {
          id: "left",
          kind: "leftovers",
          date: "2026-10-12",
          slot: "lunch",
          sourceId: "cook",
          servings: 2,
        },
      ];
      expect(storageWarning(entries[1], entries, seedRecipes)).toContain(
        "срок хранения",
      );
    }
  });
  it("предлагает к каждому новому блюду три других вторых блюда", () => {
    for (const recipe of mainRecipes) {
      const related = relatedRecipes(recipe, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (r) =>
            r.id !== recipe.id &&
            r.category === "main" &&
            r.status === "published",
        ),
      ).toBe(true);
    }
  });
});
