import { describe, expect, it } from "vitest";
import {
  saladRecipes02,
  saladIngredients02,
  saladCollections02,
} from "../data/salads-02";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { bundleSchema } from "./recipe";
import { bestVariant, scaledIngredients } from "./cooking";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import {
  planShoppingSources,
  storageWarning,
  type PlanEntry,
} from "./meal-plan";

const recipe = (id: string) => saladRecipes02.find((r) => r.id === id)!;

describe("Вторая партия салатов", () => {
  it("добавляет 12 разных салатов, 13 способов, 4 продукта и 3 подборки", () => {
    const bundle = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: seedCollections,
    });
    expect(saladRecipes02).toHaveLength(12);
    expect(saladRecipes02.flatMap((r) => r.variants)).toHaveLength(13);
    expect(saladIngredients02).toHaveLength(4);
    expect(saladCollections02).toHaveLength(3);
    expect(bundle.recipes).toHaveLength(121);
    expect(bundle.ingredients).toHaveLength(91);
    expect(bundle.collections).toHaveLength(35);
    expect(bundle.recipes.flatMap((r) => r.variants)).toHaveLength(150);
    expect(bundle.recipes.filter((r) => r.category === "salad")).toHaveLength(
      27,
    );
    for (const items of [seedRecipes, seedIngredients, seedCollections])
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(
      new Set(
        saladRecipes02.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(12);
  });
  it("сохраняет честный статус, иллюстрации и короткий ориентир хранения", () => {
    for (const r of saladRecipes02) {
      expect(r.origin).toBe("ai");
      expect(r.tested).toBe(false);
      expect(r.status).toBe("published");
      expect(r.nutrition).toBeUndefined();
      expect(r.storage?.fridgeDays).toBe(1);
      expect(r.storage?.freezable).toBe(false);
      expect(r.storage?.note).toContain("холодильнике");
      expect(r.image).toBe(`/images/recipes/${r.id}.webp`);
      expect(
        r.variants.every(
          (v) => v.servings === 4 && v.steps.length >= 3 && v.note.length > 0,
        ),
      ).toBe(true);
    }
    expect(new Set(saladRecipes02.map((r) => r.image)).size).toBe(12);
  });
  it("требует оба прибора для чечевицы и самостоятельную духовку для баклажанов и сухариков", () => {
    const lentil = recipe("warm-lentil-pumpkin-salad");
    expect(bestVariant(lentil, [], ["stove"])).toBeUndefined();
    expect(bestVariant(lentil, [], ["oven"])).toBeUndefined();
    expect(bestVariant(lentil, [], ["stove", "oven"])?.equipment).toEqual([
      "stove",
      "oven",
    ]);
    for (const id of [
      "warm-eggplant-chickpea-salad",
      "bean-cheese-crouton-salad",
    ]) {
      expect(bestVariant(recipe(id), [], ["none"])).toBeUndefined();
      expect(bestVariant(recipe(id), [], ["oven"])?.equipment).toEqual([
        "oven",
      ]);
    }
    const chicken = recipe("chicken-bean-tomato-salad");
    expect(bestVariant(chicken, [], ["stove"])?.id).toBe("stove");
    const air = bestVariant(chicken, [], ["airfryer"])!;
    expect(air.equipment).toEqual(["airfryer"]);
    expect(air.ingredients.some((a) => a.ingredientId === "water")).toBe(false);
    expect(
      scaledIngredients(air, 8).find((a) => a.ingredientId === "oil")?.quantity,
    ).toBe(40);
    expect(
      air.ingredients.find((a) => a.ingredientId === "oil")?.note,
    ).not.toContain("мл");
    expect(air.note).toContain("несколькими партиями");
    expect(air.steps.map((s) => s.text).join(" ")).toContain("74 °C");
  });
  it("учитывает варку и охлаждение, не выдавая их за быструю сборку", () => {
    for (const id of [
      "chicken-bean-tomato-salad",
      "tuna-potato-egg-salad",
      "pasta-tuna-corn-salad",
      "peking-chicken-corn-salad",
      "chicken-prune-walnut-salad",
      "herring-beet-potato-salad",
      "chicken-pineapple-cheese-salad",
    ]) {
      for (const v of recipe(id).variants) {
        expect(v.prepMinutes + v.cookMinutes).toBeGreaterThan(40);
        expect(v.steps.some((s) => /охлад|охлажд/i.test(s.text))).toBe(true);
      }
    }
    const herring = recipe("herring-beet-potato-salad").variants[0];
    expect(herring.prepMinutes + herring.cookMinutes).toBe(135);
    expect(herring.note).toContain("варку сырых овощей");
    const quick = seedCollections.find((c) => c.id === "quick-salads")!;
    expect(
      saladRecipes02
        .filter((r) => collectionVariants(quick, r).length)
        .map((r) => r.id),
    ).toEqual(["cabbage-corn-cucumber-salad"]);
    expect(collectionRecipes(quick, seedRecipes)).toHaveLength(6);
  });
  it("различает готовые и сырые продукты, не предлагает сырую сельдь или яйца", () => {
    const ids = new Set(
      saladRecipes02.flatMap((r) =>
        r.variants.flatMap((v) => v.ingredients.map((a) => a.ingredientId)),
      ),
    );
    for (const id of [
      "canned-beans",
      "canned-chickpeas",
      "green-lentils",
      "ready-salted-herring",
    ])
      expect(ids.has(id)).toBe(true);
    for (const id of ["dry-beans", "chickpeas", "lentils"])
      expect(ids.has(id)).toBe(false);
    const herring = recipe("herring-beet-potato-salad");
    expect(herring.variants[0].steps.map((s) => s.text).join(" ")).toContain(
      "филе промышленного изготовления готово к употреблению",
    );
    expect(herring.storage?.note).toContain("после вскрытия");
    expect(
      recipe("tuna-potato-egg-salad")
        .variants[0].steps.map((s) => s.text)
        .join(" "),
    ).toContain("плотного белка и желтка");
    expect(
      recipe("bean-cheese-crouton-salad").variants[0].ingredients.find(
        (a) => a.ingredientId === "bread",
      )?.unit,
    ).toBe("г");
  });
  it("сохраняет порядок и состав подборок для ужина и общего стола", () => {
    expect(saladCollections02.map((c) => [c.id, c.recipeIds.length])).toEqual([
      ["dinner-salads", 8],
      ["shared-table-salads", 6],
      ["warm-salads", 5],
    ]);
    for (const c of saladCollections02)
      expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
        c.recipeIds,
      );
  });
  it("не добавляет новые салаты в подборки для заморозки", () => {
    for (const c of seedCollections.filter((c) => c.rules.freezable))
      expect(
        saladRecipes02.filter((r) => collectionVariants(c, r).length),
      ).toEqual([]);
  });
  it("масштабирует покупки без повторного учёта остатков и предупреждает о сроке", () => {
    const entries: PlanEntry[] = [
      {
        id: "cook",
        kind: "cook",
        date: "2026-10-11",
        slot: "dinner",
        recipeId: "chicken-bean-tomato-salad",
        variantId: "airfryer",
        servings: 4,
        cookServings: 8,
      },
      {
        id: "left",
        kind: "leftovers",
        date: "2026-10-12",
        slot: "dinner",
        sourceId: "cook",
        servings: 4,
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
      sources[0].items.find((a) => a.ingredientId === "chicken-fillet")
        ?.quantity,
    ).toBe(800);
    expect(
      sources[0].items.find((a) => a.ingredientId === "canned-beans")?.quantity,
    ).toBe(600);
    expect(
      sources[0].items.some((a) =>
        ["water", "salt", "oil"].includes(a.ingredientId),
      ),
    ).toBe(false);
    expect(storageWarning(entries[1], entries, seedRecipes)).toContain(
      "срок хранения",
    );
  });
  it("показывает три других салата для каждого нового рецепта", () => {
    for (const r of saladRecipes02) {
      const related = relatedRecipes(r, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (other) => other.id !== r.id && other.category === "salad",
        ),
      ).toBe(true);
    }
  });
});
