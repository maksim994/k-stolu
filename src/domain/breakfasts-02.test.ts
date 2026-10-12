import { describe, expect, it } from "vitest";
import {
  breakfastRecipes02,
  breakfastCollections02,
} from "../data/breakfasts-02";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { bundleSchema } from "./recipe";
import { bestVariant, scaledIngredients } from "./cooking";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import { planShoppingSources, type PlanEntry } from "./meal-plan";

describe("Вторая партия завтраков", () => {
  it("добавляет 10 рецептов и 12 способов, используя существующий справочник", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(breakfastRecipes02).toHaveLength(10);
    expect(breakfastRecipes02.flatMap((r) => r.variants)).toHaveLength(12);
    expect(breakfastCollections02).toHaveLength(3);
    expect(bundle.recipes).toHaveLength(121);
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.collections).toHaveLength(35);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(
      bundle.recipes.filter((r) => r.category === "breakfast"),
    ).toHaveLength(25);
    expect(
      new Set(
        breakfastRecipes02.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(10);
  });
  it("сохраняет честный статус и явные сведения о хранении", () => {
    for (const r of breakfastRecipes02) {
      expect(r.origin).toBe("ai");
      expect(r.tested).toBe(false);
      expect(r.nutrition).toBeUndefined();
      expect(r.status).toBe("published");
      expect([1, 2]).toContain(r.storage?.fridgeDays);
      expect(typeof r.storage?.freezable).toBe("boolean");
      expect(r.storage?.note).toContain("холодильнике");
      expect(
        r.variants.every(
          (v) => v.servings === 2 && v.steps.length >= 3 && v.note.length > 0,
        ),
      ).toBe(true);
    }
    expect(new Set(breakfastRecipes02.map((r) => r.image)).size).toBe(10);
  });
  it("не считает яичный сэндвич холодной сборкой или быстрым завтраком", () => {
    const sandwich = breakfastRecipes02.find(
      (r) => r.id === "egg-cucumber-sandwich",
    )!;
    expect(bestVariant(sandwich, [], ["none"])).toBeUndefined();
    expect(bestVariant(sandwich, [], ["stove"])?.id).toBe("stove");
    expect(
      sandwich.variants[0].prepMinutes + sandwich.variants[0].cookMinutes,
    ).toBe(30);
    const quick = seedCollections.find((c) => c.id === "quick-breakfast")!;
    expect(collectionVariants(quick, sandwich)).toEqual([]);
    expect(
      collectionVariants(
        quick,
        breakfastRecipes02.find((r) => r.id === "semolina-banana-porridge")!,
      ).map((v) => v.id),
    ).toEqual(["stove"]);
    expect(
      collectionVariants(
        quick,
        breakfastRecipes02.find((r) => r.id === "cottage-banana-walnut-bowl")!,
      ).map((v) => v.id),
    ).toEqual(["cold"]);
  });
  it("поддерживает самостоятельную мультиварку для двух каш без отсроченного старта", () => {
    for (const id of ["pumpkin-millet-porridge", "rice-raisin-porridge"]) {
      const recipe = breakfastRecipes02.find((r) => r.id === id)!;
      const multi = bestVariant(recipe, [], ["multicooker"])!;
      expect(multi.id).toBe("multicooker");
      expect(multi.equipment).toEqual(["multicooker"]);
      expect(multi.note).toContain("без давления");
      expect(multi.note).toContain("минимальное и максимальное");
      expect(multi.steps.map((s) => s.text).join(" ")).toMatch(
        /Не используйте отсроченный старт|Не оставляйте молоко на отсроченном старте/,
      );
      expect(multi.cookMinutes).toBe(60);
      expect(multi.ingredients).toEqual(recipe.variants[0].ingredients);
    }
  });
  it("учитывает две закладки вафель и два овсяноблина", () => {
    for (const recipe of breakfastRecipes02.filter(
      (r) => r.family === "waffle",
    )) {
      const variant = bestVariant(recipe, [], ["wafflemaker"])!;
      expect(variant.cookMinutes).toBeGreaterThanOrEqual(25);
      expect(variant.note).toContain("две последовательные закладки");
      expect(variant.note).toContain(
        "при одном отделении понадобится больше времени",
      );
      expect(bestVariant(recipe, [], ["stove"])).toBeUndefined();
    }
    const pancake = breakfastRecipes02.find(
      (r) => r.id === "oat-pancake-cottage-tomato",
    )!.variants[0];
    expect(pancake.note).toContain("две последовательные");
    expect(pancake.prepMinutes + pancake.cookMinutes).toBe(25);
  });
  it("не путает готовую фасоль с сухой и не предлагает сырые яйца без нагрева", () => {
    const shakshuka = breakfastRecipes02.find(
      (r) => r.id === "bean-pepper-shakshuka",
    )!.variants[0];
    expect(
      shakshuka.ingredients.some((a) => a.ingredientId === "canned-beans"),
    ).toBe(true);
    expect(
      shakshuka.ingredients.some((a) => a.ingredientId === "dry-beans"),
    ).toBe(false);
    const cold = breakfastRecipes02.find(
      (r) => r.id === "cottage-banana-walnut-bowl",
    )!.variants[0];
    expect(cold.equipment).toEqual(["none"]);
    expect(cold.ingredients.some((a) => a.ingredientId === "egg")).toBe(false);
    expect(cold.note).toContain("готовы к употреблению");
  });
  it("сохраняет ручной порядок и корректно расширяет автоматические подборки", () => {
    for (const c of breakfastCollections02)
      expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
        c.recipeIds,
      );
    const waffles = collectionRecipes(
      seedCollections.find((c) => c.id === "wafflemaker")!,
      seedRecipes,
    );
    expect(waffles).toHaveLength(5);
    const freezer = seedCollections.find((c) => c.id === "breakfast-freezer")!;
    expect(
      breakfastRecipes02
        .filter((r) => collectionVariants(freezer, r).length > 0)
        .map((r) => r.id),
    ).toEqual([
      "lavash-egg-cheese",
      "cabbage-cheese-waffles",
      "carrot-apple-waffles",
    ]);
  });
  it("масштабирует покупки для готовящейся партии, не учитывая остатки повторно", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "breakfast",
        recipeId: "pumpkin-millet-porridge",
        variantId: "multicooker",
        servings: 2,
        cookServings: 4,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-12",
        slot: "breakfast",
        sourceId: "cook",
        servings: 2,
      },
    ];
    const sources = planShoppingSources(
      entries,
      seedRecipes,
      ["2026-10-11", "2026-10-12"],
      ["water", "salt", "oil", "sugar"],
    );
    expect(sources).toHaveLength(1);
    for (const [id, quantity] of [
      ["millet", 200],
      ["pumpkin", 400],
      ["milk", 800],
    ] as const)
      expect(
        sources[0].items.find((a) => a.ingredientId === id)?.quantity,
      ).toBe(quantity);
    expect(
      sources[0].items.some((a) => ["water", "salt"].includes(a.ingredientId)),
    ).toBe(false);
    const waffle = breakfastRecipes02.find(
      (r) => r.id === "carrot-apple-waffles",
    )!.variants[0];
    expect(
      scaledIngredients(waffle, 4).find((a) => a.ingredientId === "cinnamon")
        ?.optional,
    ).toBe(true);
  });
  it("предлагает три других завтрака и отдаёт приоритет семейству", () => {
    for (const recipe of breakfastRecipes02) {
      const related = relatedRecipes(recipe, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every((r) => r.id !== recipe.id && r.category === "breakfast"),
      ).toBe(true);
      if (recipe.family) expect(related[0].family).toBe(recipe.family);
    }
  });
});
