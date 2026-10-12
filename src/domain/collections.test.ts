import { describe, expect, it } from "vitest";
import {
  seedRecipes,
  seedIngredients,
  seedCollections as allCollections,
} from "../data/seed";
import { breakfastRecipes, seedCollections } from "../data/breakfasts";
import { bundleSchema, collectionSchema } from "./recipe";
import {
  collectionRecipes,
  collectionVariants,
  relatedRecipes,
} from "./collections";

describe("Подборки и новая партия рецептов", () => {
  it("валидирует всю базу: 121 рецептов и 35 подборок", () => {
    const data = bundleSchema.parse({
      version: 1,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      collections: allCollections,
    });
    expect(data.recipes).toHaveLength(121);
    expect(data.recipes.filter((r) => r.category === "breakfast")).toHaveLength(
      25,
    );
    expect(data.collections).toHaveLength(35);
    expect(
      breakfastRecipes.every((r) => r.tested === false && r.origin === "ai"),
    ).toBe(true);
    expect(
      allCollections.every((c) => collectionRecipes(c, seedRecipes).length > 0),
    ).toBe(true);
  });
  it("сохраняет совместимость со старым JSON без подборок", () => {
    expect(
      bundleSchema.parse({
        version: 1,
        recipes: seedRecipes,
        ingredients: seedIngredients,
      }).collections,
    ).toBeUndefined();
  });
  it("ручная подборка сохраняет порядок и скрывает неопубликованные рецепты", () => {
    const collection = seedCollections[0];
    const recipes = seedRecipes.map((r) =>
      r.id === "milk-pancakes" ? { ...r, status: "draft" as const } : r,
    );
    expect(collectionRecipes(collection, recipes).map((r) => r.id)).toEqual(
      collection.recipeIds.filter((id) => id !== "milk-pancakes"),
    );
  });
  it("автоматическая подборка закрепляет только подходящие рецепты", () => {
    const collection = {
      ...seedCollections[1],
      recipeIds: ["belgian-waffles", "egg-cheese-toast"],
    };
    const recipes = collectionRecipes(collection, seedRecipes);
    expect(recipes[0].id).toBe("egg-cheese-toast");
    expect(recipes.some((r) => r.id === "belgian-waffles")).toBe(false);
    expect(recipes.some((r) => r.id === "overnight-oats")).toBe(false);
  });
  it("проверяет все ограничения на одном способе приготовления", () => {
    const recipe = structuredClone(
      seedRecipes.find((r) => r.id === "zucchini-omelet")!,
    );
    const collection = {
      ...seedCollections[1],
      rules: { equipment: "multicooker" as const, maxMinutes: 20 },
    };
    expect(collectionVariants(collection, recipe)).toEqual([]);
    collection.rules.maxMinutes = 40;
    expect(collectionVariants(collection, recipe).map((v) => v.id)).toEqual([
      "multicooker",
    ]);
  });
  it("не считает неизвестную заморозку разрешённой", () => {
    const recipe = { ...seedRecipes[0], storage: undefined };
    expect(collectionVariants(seedCollections[4], recipe)).toEqual([]);
  });
  it("предлагает вначале варианты того же семейства и исключает себя", () => {
    const omelet = seedRecipes.find((r) => r.id === "omelet")!;
    const related = relatedRecipes(omelet, seedRecipes);
    expect(
      related
        .slice(0, 2)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["mushroom-omelet", "zucchini-omelet"]);
    expect(related).toHaveLength(3);
    expect(
      related.every((r) => r.id !== omelet.id && r.category === "breakfast"),
    ).toBe(true);
  });
  it("не принимает дубли рецептов и некорректные правила", () => {
    expect(
      collectionSchema.safeParse({
        ...seedCollections[0],
        recipeIds: ["omelet", "omelet"],
      }).success,
    ).toBe(false);
    expect(
      collectionSchema.safeParse({
        ...seedCollections[0],
        rules: { maxMinutes: 0 },
      }).success,
    ).toBe(false);
    expect(
      bundleSchema.safeParse({
        version: 1,
        recipes: seedRecipes,
        ingredients: seedIngredients,
        collections: [seedCollections[0], seedCollections[0]],
      }).success,
    ).toBe(false);
  });
});
