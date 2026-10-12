import { describe, expect, it } from "vitest";
import {
  snackRecipes,
  snackIngredients,
  snackCollections,
} from "../data/snacks";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { snackRecipes02 } from "../data/snacks-02";
import { snackRecipes03 } from "../data/snacks-03";
import { bundleSchema, categories, collectionSchema } from "./recipe";
import { bestVariant, scaledIngredients } from "./cooking";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import {
  mealPlanSchema,
  mealSlots,
  mealOrder,
  validatePlan,
  planShoppingSources,
  type PlanEntry,
} from "./meal-plan";

describe("Рубрика перекусов", () => {
  it("принимает новую категорию в рецептах, подборках и старом JSON-формате", () => {
    expect(categories.find((c) => c.id === "snack")?.name).toBe("Перекусы");
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(bundle.recipes).toHaveLength(121);
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.collections).toHaveLength(35);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(bundle.recipes.filter((r) => r.category === "snack")).toHaveLength(
      24,
    );
    expect(snackIngredients).toHaveLength(1);
    expect(snackCollections).toHaveLength(3);
    expect(collectionSchema.parse(snackCollections[0]).rules.category).toBe(
      "snack",
    );
    for (const items of [seedRecipes, seedIngredients, seedCollections])
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const old = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes.filter((r) => r.category !== "snack"),
      ingredients: seedIngredients,
    });
    expect(old.recipes).toHaveLength(97);
  });
  it("даёт восемь разных блюд с честным статусом и сведениями о хранении", () => {
    expect(snackRecipes).toHaveLength(8);
    expect(snackRecipes.flatMap((r) => r.variants)).toHaveLength(9);
    expect(new Set(snackRecipes.map((r) => r.image)).size).toBe(8);
    expect(
      new Set(
        snackRecipes.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(8);
    for (const r of snackRecipes) {
      expect(r.origin).toBe("ai");
      expect(r.tested).toBe(false);
      expect(r.status).toBe("published");
      expect(r.nutrition).toBeUndefined();
      expect(r.storage?.fridgeDays).toBe(1);
      expect(r.storage?.freezable).toBe(false);
      expect(r.storage?.note).toContain("холодильнике");
      expect(r.storage?.note).toContain("термосумку");
      expect(r.storage?.note).toContain("двумя аккумуляторами холода");
      expect(
        r.variants.every(
          (v) => v.servings === 2 && v.steps.length >= 3 && v.note.length > 0,
        ),
      ).toBe(true);
    }
  });
  it("не включает нагрев в быстрые перекусы без техники", () => {
    const quick = snackCollections[0];
    expect(collectionRecipes(quick, seedRecipes).map((r) => r.id)).toEqual(
      [
        ...snackRecipes.slice(0, 5),
        ...snackRecipes02.slice(1, 3),
        ...snackRecipes03.slice(5, 7),
      ].map((r) => r.id),
    );
    for (const r of snackRecipes.slice(0, 5)) {
      expect(bestVariant(r, [], ["none"])?.equipment).toEqual(["none"]);
      expect(r.variants[0].cookMinutes).toBe(0);
      expect(
        r.variants[0].ingredients.some((a) => a.ingredientId === "egg"),
      ).toBe(false);
    }
    for (const r of snackRecipes.slice(5))
      expect(collectionVariants(quick, r)).toEqual([]);
  });
  it("поддерживает духовку и самостоятельный аэрогриль для готового нута", () => {
    const chickpeas = snackRecipes.find(
      (r) => r.id === "roasted-paprika-chickpeas",
    )!;
    expect(bestVariant(chickpeas, [], ["none"])).toBeUndefined();
    expect(bestVariant(chickpeas, [], ["stove"])).toBeUndefined();
    for (const device of ["oven", "airfryer"] as const) {
      const v = bestVariant(chickpeas, [], [device])!;
      expect(v.equipment).toEqual([device]);
      expect(
        v.ingredients.some((a) => a.ingredientId === "canned-chickpeas"),
      ).toBe(true);
      expect(v.ingredients.some((a) => a.ingredientId === "chickpeas")).toBe(
        false,
      );
      expect(v.note).toMatch(/одну|одна/);
    }
    const pockets = snackRecipes.find(
      (r) => r.id === "bean-pepper-lavash-pockets",
    )!.variants[0];
    expect(pockets.note).toContain("две последовательные партии");
    expect(
      pockets.ingredients.some((a) => a.ingredientId === "canned-beans"),
    ).toBe(true);
  });
  it("сохраняет порядок подборок и предлагает другие перекусы", () => {
    for (const c of snackCollections.filter((c) => c.kind === "manual"))
      expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
        c.recipeIds,
      );
    for (const r of snackRecipes) {
      const related = relatedRecipes(r, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (other) => other.category === "snack" && other.id !== r.id,
        ),
      ).toBe(true);
    }
  });
  it("принимает перекус между обедом и ужином, сохраняя старые приёмы пищи", () => {
    expect(mealSlots.map((s) => s.id)).toEqual([
      "breakfast",
      "lunch",
      "snack",
      "dinner",
    ]);
    const cook: PlanEntry = {
      id: "cook",
      kind: "cook",
      date: "2026-10-11",
      slot: "lunch",
      recipeId: "white-bean-lemon-spread",
      variantId: "fresh",
      servings: 2,
      cookServings: 4,
    };
    const leftover: PlanEntry = {
      id: "left",
      kind: "leftovers",
      date: cook.date,
      slot: "snack",
      sourceId: cook.id,
      servings: 2,
    };
    expect(mealPlanSchema.parse([cook, leftover])).toHaveLength(2);
    expect(validatePlan([cook, leftover])).toEqual([]);
    expect(mealOrder(cook) < mealOrder(leftover)).toBe(true);
    expect(mealOrder(leftover) < mealOrder({ ...cook, slot: "dinner" })).toBe(
      true,
    );
    expect(validatePlan([{ ...cook, slot: "dinner" }, leftover])[0]?.id).toBe(
      leftover.id,
    );
    for (const slot of ["breakfast", "lunch", "dinner"] as const)
      expect(mealPlanSchema.safeParse([{ ...cook, slot }]).success).toBe(true);
  });
  it("масштабирует перекусы и считает остатки в покупках только один раз", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "snack",
        recipeId: "white-bean-lemon-spread",
        variantId: "fresh",
        servings: 2,
        cookServings: 4,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-12",
        slot: "snack",
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
    expect(
      sources[0].items.find((a) => a.ingredientId === "canned-beans")?.quantity,
    ).toBe(440);
    expect(
      sources[0].items.find((a) => a.ingredientId === "bread")?.quantity,
    ).toBe(160);
    expect(
      sources[0].items.some((a) =>
        ["water", "salt", "oil"].includes(a.ingredientId),
      ),
    ).toBe(false);
    const sandwich = snackRecipes.find(
      (r) => r.id === "banana-peanut-sandwich",
    )!.variants[0];
    expect(
      scaledIngredients(sandwich, 4).find(
        (a) => a.ingredientId === "peanut-butter",
      )?.quantity,
    ).toBe(60);
    expect(sandwich.note).toContain("арахис");
  });
});
