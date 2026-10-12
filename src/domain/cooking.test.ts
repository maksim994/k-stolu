import { describe, it, expect } from "vitest";
import { seedIngredients, seedRecipes } from "../data/seed";
import { bundleSchema, recipeSchema, type Amount } from "./recipe";
import {
  scaledIngredients,
  bestVariant,
  missingIngredients,
  shoppingRows,
  emptyShopping,
  addShoppingSource,
  removeShoppingSource,
  type ShoppingSource,
} from "./cooking";
const amount = (
  quantity: number | null,
  unit: Amount["unit"] = "г",
  ingredientId = "potato",
): Amount => ({ ingredientId, quantity, unit, optional: false, note: "" });
const source = (key: string, items: Amount[]): ShoppingSource => ({
  key,
  recipeId: key,
  title: key,
  variantId: "stove",
  variantName: "На плите",
  servings: 4,
  items,
});
describe("Стартовый контент", () => {
  it("121 рецептов проходят схему, все ссылки на ингредиенты корректны", () => {
    expect(
      bundleSchema.parse({
        version: 1,
        ingredients: seedIngredients,
        recipes: seedRecipes,
      }).recipes,
    ).toHaveLength(121);
  });
  it("представлены все способы и категории", () => {
    expect(
      new Set(
        seedRecipes.flatMap((r) => r.variants.flatMap((v) => v.equipment)),
      ).size,
    ).toBe(6);
    expect(new Set(seedRecipes.map((r) => r.category)).size).toBe(6);
  });
  it("не принимает дубликаты ингредиентов", () => {
    const r = structuredClone(seedRecipes[0]);
    r.variants[0].ingredients.push(r.variants[0].ingredients[0]);
    expect(recipeSchema.safeParse(r).success).toBe(false);
  });
  it("не принимает неизвестный ингредиент в импорте", () => {
    const r = structuredClone(seedRecipes[0]);
    r.variants[0].ingredients[0].ingredientId = "unknown";
    expect(
      bundleSchema.safeParse({
        version: 1,
        ingredients: seedIngredients,
        recipes: [r],
      }).success,
    ).toBe(false);
  });
  it("не принимает дублирующиеся адреса рецептов", () => {
    const b = structuredClone(seedRecipes);
    b[1].slug = b[0].slug;
    expect(
      bundleSchema.safeParse({
        version: 1,
        ingredients: seedIngredients,
        recipes: b,
      }).success,
    ).toBe(false);
  });
});
describe("Подбор и порции", () => {
  it("различает вафельницу, плиту и мультиварку при подборе", () => {
    const recipe = structuredClone(seedRecipes[0]);
    recipe.variants = [recipe.variants[0]];
    recipe.variants[0].equipment = ["wafflemaker"];
    expect(bestVariant(recipe, [], ["wafflemaker"])?.id).toBe(
      recipe.variants[0].id,
    );
    expect(bestVariant(recipe, [], ["stove"])).toBeUndefined();
    expect(bestVariant(recipe, [], ["multicooker"])).toBeUndefined();
    const soup = seedRecipes.find((r) => r.id === "chicken-soup")!;
    expect(bestVariant(soup, [], ["multicooker"])?.id).toBe("multicooker");
  });
  it("пересчитывает продукты, не меняя исходное время или рецепт", () => {
    const variant = seedRecipes[3].variants[0];
    const amounts = scaledIngredients(variant, 8);
    expect(
      amounts.find((i) => i.ingredientId === "chicken-fillet")?.quantity,
    ).toBe(800);
    expect(variant.ingredients[0].quantity).toBe(400);
    expect(variant.cookMinutes).toBe(30);
    expect(amounts.find((i) => i.unit === "по вкусу")?.quantity).toBeNull();
  });
  it("не учитывает необязательные продукты как недостающие", () => {
    const v = seedRecipes[0].variants[0];
    expect(
      missingIngredients(
        v,
        v.ingredients.filter((i) => !i.optional).map((i) => i.ingredientId),
      ),
    ).toEqual([]);
  });
  it("не подбирает духовку при наличии только плиты", () => {
    expect(bestVariant(seedRecipes[5], [], ["stove"])).toBeUndefined();
  });
  it("выбирает вариант, который проходит ограничение времени", () => {
    const r = structuredClone(seedRecipes[0]);
    r.variants[0].cookMinutes = 100;
    expect(bestVariant(r, [], [], 35)?.id).toBe("oven");
  });
  it("для комбинированной техники нужны все устройства", () => {
    const r = structuredClone(seedRecipes[0]);
    r.variants[0].equipment = ["stove", "oven"];
    r.variants = r.variants.slice(0, 1);
    expect(bestVariant(r, [], ["oven"])).toBeUndefined();
    expect(bestVariant(r, [], ["oven", "stove"])).toBeDefined();
  });
});
describe("Покупки", () => {
  it("объединяет граммы и килограммы", () => {
    const state = {
      ...emptyShopping,
      sources: [source("a", [amount(200)]), source("b", [amount(1, "кг")])],
    };
    expect(shoppingRows(state, seedIngredients)[0].quantity).toBe(1200);
  });
  it("не складывает штуки и граммы", () => {
    const state = {
      ...emptyShopping,
      sources: [source("a", [amount(200)]), source("b", [amount(2, "шт.")])],
    };
    expect(shoppingRows(state, seedIngredients)).toHaveLength(2);
  });
  it("объединяет литры и миллилитры", () => {
    const state = {
      ...emptyShopping,
      sources: [
        source("a", [amount(1, "л", "milk")]),
        source("b", [amount(200, "мл", "milk")]),
      ],
    };
    expect(shoppingRows(state, seedIngredients)[0].quantity).toBe(1200);
  });
  it("повторное добавление не удваивает и не снимает отметки купленного", () => {
    const s = source("a", [amount(200)]);
    const first = addShoppingSource(emptyShopping, s);
    first.checked = ["potato:г"];
    const again = addShoppingSource(first, s);
    expect(again.sources).toHaveLength(1);
    expect(again.checked).toEqual(["potato:г"]);
    expect(shoppingRows(again, seedIngredients)[0].quantity).toBe(200);
  });
  it("обновляет вклад одного рецепта при смене порций", () => {
    const first = addShoppingSource(emptyShopping, source("a", [amount(200)]));
    const second = addShoppingSource(first, {
      ...source("a", [amount(400)]),
      servings: 8,
    });
    expect(second.sources).toHaveLength(1);
    expect(shoppingRows(second, seedIngredients)[0].quantity).toBe(400);
  });
  it("удаление блюда сохраняет независимые ручные отметки и правки", () => {
    const state = {
      ...emptyShopping,
      sources: [source("a", [amount(200)])],
      manual: [
        {
          key: "manual:bread",
          ingredientId: "bread",
          name: "Хлеб",
          group: "Другое",
          quantity: 1,
          unit: "шт.",
          sources: [],
        },
      ],
      checked: ["manual:bread"],
      overrides: { "manual:bread": { quantity: 2, unit: "шт." } },
    };
    const result = removeShoppingSource(state, "a");
    expect(result.checked).toEqual(["manual:bread"]);
    expect(shoppingRows(result, seedIngredients)[0].quantity).toBe(2);
  });
});
