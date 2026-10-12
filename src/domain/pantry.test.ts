import { describe, expect, it } from "vitest";
import { availablePantry, togglePantryItem } from "./pantry";
import { missingIngredients } from "./cooking";
import { planShoppingSources } from "./meal-plan";
import { seedIngredients, seedRecipes } from "../data/seed";

describe("Базовые продукты", () => {
  it("добавляет базовые продукты без повторов в старых списках", () => {
    expect(availablePantry(["salt", "potato", "salt"])).toEqual([
      "potato",
      "water",
      "salt",
      "sugar",
      "oil",
    ]);
    expect(availablePantry([], ["salt"])).not.toContain("salt");
  });
  it("отметка закончившегося продукта имеет приоритет над старой отметкой", () => {
    expect(availablePantry(["oil"], ["oil"])).not.toContain("oil");
    expect(availablePantry([], ["water"])).toContain("water");
  });
  it("переключает базовые и обычные продукты независимо", () => {
    const initial = {
      pantry: ["salt", "potato"],
      unavailableBasics: [] as string[],
      favorites: ["fish"],
    };
    const absent = togglePantryItem(initial, "salt");
    expect(
      availablePantry(absent.pantry, absent.unavailableBasics),
    ).not.toContain("salt");
    expect(togglePantryItem(absent, "salt").unavailableBasics).toEqual([]);
    expect(togglePantryItem(absent, "potato").pantry).toEqual([]);
    expect(togglePantryItem(initial, "water")).toBe(initial);
    expect(absent.favorites).toEqual(["fish"]);
  });
  it("подбор и покупки из плана учитывают базовые продукты", () => {
    const recipe = seedRecipes.find((r) => r.id === "chicken-soup")!;
    const pantry = availablePantry([]);
    const missing = missingIngredients(recipe.variants[0], pantry).map(
      (i) => i.ingredientId,
    );
    expect(missing).not.toContain("salt");
    expect(missing).not.toContain("water");
    const entry = {
      id: "test",
      kind: "cook" as const,
      date: "2026-10-11",
      slot: "lunch" as const,
      servings: 2,
      cookServings: 4,
      recipeId: recipe.id,
      variantId: recipe.variants[0].id,
    };
    const [source] = planShoppingSources(
      [entry],
      [recipe],
      [entry.date],
      pantry,
    );
    expect(source.items.map((i) => i.ingredientId)).not.toContain("salt");
    expect(
      [...(source.homeItems ?? []), ...source.items].map((i) => i.ingredientId),
    ).not.toContain("water");
    const [missingSalt] = planShoppingSources(
      [entry],
      [recipe],
      [entry.date],
      availablePantry([], ["salt"]),
    );
    expect(missingSalt.items.map((i) => i.ingredientId)).toContain("salt");
  });
  it("содержит макароны, крупы и отдельные группы специй и консервов", () => {
    const ingredient = (id: string) =>
      seedIngredients.find((i) => i.id === id)!;
    expect(ingredient("pasta").aliases).toContain("спагетти");
    expect(ingredient("buckwheat").group).toBe("Бакалея");
    expect(ingredient("cinnamon").group).toBe("Специи и приправы");
    expect(ingredient("passata").group).toBe("Консервы и соусы");
  });
});
