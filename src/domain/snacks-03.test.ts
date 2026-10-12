import { describe, expect, it } from "vitest";
import {
  snackRecipes03,
  snackIngredients03,
  snackCollections03,
} from "../data/snacks-03";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { bundleSchema } from "./recipe";
import { bestVariant, scaledIngredients } from "./cooking";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import { planShoppingSources, validatePlan, type PlanEntry } from "./meal-plan";

describe("Третья партия перекусов", () => {
  it("добавляет восемь блюд, девять способов, два продукта и две подборки", () => {
    const b = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(b.recipes).toHaveLength(121);
    expect(b.ingredients).toHaveLength(91);
    expect(b.collections).toHaveLength(35);
    expect(b.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(b.recipes.filter((r) => r.category === "snack")).toHaveLength(24);
    expect(snackRecipes03).toHaveLength(8);
    expect(snackRecipes03.flatMap((r) => r.variants)).toHaveLength(9);
    expect(snackIngredients03.map((i) => i.id)).toEqual([
      "corn-starch",
      "cocoa-powder",
    ]);
    for (const items of [b.recipes, b.ingredients, b.collections!])
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const ids = new Set(b.ingredients.map((i) => i.id));
    for (const r of snackRecipes03)
      for (const v of r.variants)
        for (const a of v.ingredients)
          expect(ids.has(a.ingredientId)).toBe(true);
  });
  it("публикует разные рецепты с честным статусом и хранением", () => {
    expect(new Set(snackRecipes03.map((r) => r.image)).size).toBe(8);
    expect(
      new Set(
        snackRecipes03.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(8);
    for (const r of snackRecipes03) {
      expect(r.origin).toBe("ai");
      expect(r.tested).toBe(false);
      expect(r.nutrition).toBeUndefined();
      expect(r.status).toBe("published");
      expect(r.storage?.fridgeDays).toBe(r.storage?.freezable ? 2 : 1);
      expect(r.storage?.note).toContain("+4 °C");
      expect(r.storage?.note).toContain("двумя аккумуляторами холода");
      for (const v of r.variants) {
        expect(v.servings).toBe(2);
        expect(v.steps.length).toBeGreaterThanOrEqual(3);
        expect(v.note.length).toBeGreaterThan(20);
      }
    }
  });
  it("отбирает для заморозки только четыре готовых перекуса", () => {
    const c = snackCollections03[0];
    expect(c.kind).toBe("automatic");
    expect(c.rules).toEqual({ category: "snack", freezable: true });
    expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
      snackRecipes03.slice(0, 4).map((r) => r.id),
    );
    for (const r of snackRecipes03.slice(0, 4)) {
      expect(r.storage?.note).toContain("-18 °C");
      expect(r.storage?.note).toContain("до 1 месяца");
      expect(r.storage?.note).toContain("Размораживайте в холодильнике");
    }
    for (const r of seedRecipes.filter((r) => r.category !== "snack"))
      expect(collectionVariants(c, r)).toEqual([]);
    expect(
      collectionVariants(c, { ...snackRecipes03[0], status: "draft" }),
    ).toEqual([]);
  });
  it("добавляет в быстрые только две холодные овощные закуски", () => {
    const c = seedCollections.find((c) => c.id === "quick-snacks")!;
    expect(collectionRecipes(c, seedRecipes)).toHaveLength(9);
    expect(
      snackRecipes03
        .filter((r) => collectionVariants(c, r).length)
        .map((r) => r.id),
    ).toEqual(["bean-corn-lettuce-cups", "pepper-crab-cheese-boats"]);
    for (const r of snackRecipes03.slice(5, 7)) {
      expect(r.variants[0].cookMinutes).toBe(0);
      expect(r.variants[0].equipment).toEqual(["none"]);
    }
    expect(
      snackRecipes03[5].variants[0].ingredients.some(
        (a) => a.ingredientId === "canned-beans",
      ),
    ).toBe(true);
    expect(snackRecipes03[6].variants[0].note).toContain("охлаждённые готовые");
  });
  it("не скрывает нагрев и охлаждение пудинга и кускуса", () => {
    for (const id of [
      "chocolate-milk-pudding",
      "couscous-chickpea-snack-cup",
    ]) {
      const r = snackRecipes03.find((r) => r.id === id)!;
      expect(bestVariant(r, [], ["none"])).toBeUndefined();
      expect(bestVariant(r, [], ["stove"])?.equipment).toEqual(["stove"]);
    }
    const pudding = snackRecipes03[4].variants[0];
    expect(pudding.prepMinutes + pudding.cookMinutes).toBe(70);
    expect(pudding.steps[2].text).toContain("минимум на 30 минут");
    expect(
      pudding.ingredients.some((a) => a.ingredientId === "corn-starch"),
    ).toBe(true);
    expect(pudding.ingredients.some((a) => a.ingredientId === "egg")).toBe(
      false,
    );
    const couscous = snackRecipes03[7].variants[0];
    expect(couscous.prepMinutes + couscous.cookMinutes).toBe(40);
    expect(couscous.steps[1].text).toContain("около 20 минут");
    expect(couscous.steps[0].text).toContain("жемчужный кускус");
  });
  it("даёт самостоятельный аэрогриль и проверку готовности курицы", () => {
    const r = snackRecipes03[0];
    for (const device of ["oven", "airfryer"] as const) {
      const v = bestVariant(r, [], [device])!;
      expect(v.equipment).toEqual([device]);
      expect(v.steps[2].text).toContain("74 °C");
      expect(v.steps[0].text).toContain("10 минут в холодильнике");
    }
    expect(bestVariant(r, [], ["none"])).toBeUndefined();
    expect(bestVariant(r, [], ["stove"])).toBeUndefined();
    expect(r.variants[1].note).toContain("Несколько партий займут дольше");
    expect(snackRecipes03[1].variants[0].steps[2].text).toContain("74 °C");
    expect(snackRecipes03[2].variants[0].steps[0].text).toContain(
      "Сырое тесто не пробуйте",
    );
  });
  it("сохраняет порядок контейнерной подборки и связанные рецепты", () => {
    const c = snackCollections03[1];
    expect(c.recipeIds).toHaveLength(5);
    expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
      c.recipeIds,
    );
    for (const r of snackRecipes03) {
      const related = relatedRecipes(r, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (other) => other.category === "snack" && other.id !== r.id,
        ),
      ).toBe(true);
    }
  });
  it("масштабирует новые продукты и не дублирует покупки для остатков", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-12",
        slot: "snack",
        recipeId: "chocolate-milk-pudding",
        variantId: "stove",
        servings: 2,
        cookServings: 4,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-13",
        slot: "snack",
        sourceId: "cook",
        servings: 2,
      },
    ];
    expect(validatePlan(entries)).toEqual([]);
    const sources = planShoppingSources(
      entries,
      seedRecipes,
      ["2026-10-12", "2026-10-13"],
      ["water", "salt", "oil", "sugar"],
    );
    expect(sources).toHaveLength(1);
    for (const [id, quantity] of [
      ["milk", 800],
      ["corn-starch", 40],
      ["cocoa-powder", 20],
    ] as const)
      expect(
        sources[0].items.find((a) => a.ingredientId === id)?.quantity,
      ).toBe(quantity);
    expect(sources[0].items.some((a) => a.ingredientId === "sugar")).toBe(
      false,
    );
    expect(
      scaledIngredients(snackRecipes03[3].variants[0], 4).find(
        (a) => a.ingredientId === "peanut-butter",
      )?.quantity,
    ).toBe(60);
    expect(snackRecipes03[3].variants[0].note).toContain("арахис");
  });
});
