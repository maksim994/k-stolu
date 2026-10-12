import { describe, expect, it } from "vitest";
import { snackRecipes02, snackCollections02 } from "../data/snacks-02";
import { seedRecipes, seedIngredients, seedCollections } from "../data/seed";
import { bundleSchema } from "./recipe";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";
import { bestVariant, scaledIngredients } from "./cooking";

describe("Вторая партия перекусов", () => {
  it("добавляет восемь блюд, девять способов и две подборки без новых продуктов", () => {
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
    expect(snackRecipes02).toHaveLength(8);
    expect(snackRecipes02.flatMap((r) => r.variants)).toHaveLength(9);
    for (const items of [b.recipes, b.ingredients, b.collections!])
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const ids = new Set(b.ingredients.map((i) => i.id));
    for (const r of snackRecipes02)
      for (const v of r.variants)
        for (const a of v.ingredients)
          expect(ids.has(a.ingredientId)).toBe(true);
  });
  it("сохраняет разнообразие, статус и сведения о хранении", () => {
    expect(new Set(snackRecipes02.map((r) => r.image)).size).toBe(8);
    expect(
      new Set(
        snackRecipes02.map((r) =>
          r.variants[0].ingredients
            .map((a) => a.ingredientId)
            .sort()
            .join(","),
        ),
      ).size,
    ).toBe(8);
    for (const r of snackRecipes02) {
      expect(r.origin).toBe("ai");
      expect(r.tested).toBe(false);
      expect(r.nutrition).toBeUndefined();
      expect(r.storage?.fridgeDays).toBe(1);
      expect(r.storage?.freezable).toBe(false);
      expect(r.storage?.note).toContain("+4 °C");
      expect(r.storage?.note).toContain("двумя аккумуляторами холода");
      for (const v of r.variants) {
        expect(v.servings).toBe(2);
        expect(v.steps.length).toBeGreaterThanOrEqual(3);
        expect(v.note.length).toBeGreaterThan(20);
      }
    }
  });
  it("добавляет в быстрые только готовые холодные блюда", () => {
    const quick = seedCollections.find((c) => c.id === "quick-snacks")!;
    expect(collectionRecipes(quick, seedRecipes)).toHaveLength(9);
    expect(
      snackRecipes02
        .filter((r) => collectionVariants(quick, r).length)
        .map((r) => r.id),
    ).toEqual(["pea-feta-spread-bread", "cherry-feta-skewers"]);
    expect(
      snackRecipes02.find((r) => r.id === "prune-walnut-cottage-bites")!
        .variants[0].cookMinutes,
    ).toBe(20);
    const pea = snackRecipes02[1].variants[0];
    expect(pea.ingredients.some((a) => a.ingredientId === "canned-peas")).toBe(
      true,
    );
    expect(pea.steps[0].text).toContain("Замороженный");
  });
  it("учитывает полную варку и охлаждение яиц", () => {
    const r = snackRecipes02[0];
    const v = r.variants[0];
    expect(bestVariant(r, [], ["none"])).toBeUndefined();
    expect(v.prepMinutes + v.cookMinutes).toBe(45);
    expect(v.steps[0].text).toContain("полностью затвердели");
    expect(v.steps[1].text).toContain("Не смешивайте горячие яйца");
  });
  it("даёт независимый аэрогриль для яблок с учётом формы и партий", () => {
    const r = snackRecipes02.find(
      (r) => r.id === "baked-apples-raisins-walnuts",
    )!;
    for (const equipment of ["oven", "airfryer"] as const)
      expect(bestVariant(r, [], [equipment])?.equipment).toEqual([equipment]);
    expect(bestVariant(r, [], ["none"])).toBeUndefined();
    const air = r.variants[1];
    expect(air.steps[1].text).toContain("не в прибор");
    expect(air.steps[2].text).toContain("свободную фольгу");
    expect(air.note).toContain("партиями");
  });
  it("сохраняет ручной порядок подборок и три связанных перекуса", () => {
    expect(snackCollections02).toHaveLength(2);
    for (const c of snackCollections02) {
      expect(c.recipeIds).toHaveLength(5);
      expect(collectionRecipes(c, seedRecipes).map((r) => r.id)).toEqual(
        c.recipeIds,
      );
    }
    for (const r of snackRecipes02) {
      const related = relatedRecipes(r, seedRecipes);
      expect(related).toHaveLength(3);
      expect(
        related.every(
          (other) => other.category === "snack" && other.id !== r.id,
        ),
      ).toBe(true);
    }
  });
  it("масштабирует продукты и не требует сырой муки для шариков", () => {
    const r = snackRecipes02.find(
      (r) => r.id === "prune-walnut-cottage-bites",
    )!;
    expect(
      scaledIngredients(r.variants[0], 4).find(
        (a) => a.ingredientId === "cottage-cheese",
      )?.quantity,
    ).toBe(400);
    expect(
      r.variants[0].ingredients.some((a) =>
        ["flour", "egg"].includes(a.ingredientId),
      ),
    ).toBe(false);
    expect(r.variants[0].steps[1].text).toContain("не добавляйте сырую муку");
    expect(r.variants[0].note).toContain("грецкие орехи");
  });
});
