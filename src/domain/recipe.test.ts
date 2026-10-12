import { describe, expect, it } from "vitest";
import { seedIngredients, seedRecipes } from "../data/seed";
import {
  bundleSchema,
  recipeSchema,
  storageSchema,
  nutritionSchema,
  equipment,
} from "./recipe";

describe("Техника приготовления", () => {
  it("предлагает вафельницу и мультиварку без дубликатов", () => {
    expect(equipment.find((device) => device.id === "wafflemaker")?.name).toBe(
      "Вафельница",
    );
    expect(equipment.find((device) => device.id === "multicooker")?.name).toBe(
      "Мультиварка",
    );
    expect(new Set(equipment.map((device) => device.id)).size).toBe(
      equipment.length,
    );
  });

  it("принимает вафельницу в рецепте и JSON-импорте", () => {
    const recipe = structuredClone(seedRecipes[0]);
    recipe.variants[0].equipment = ["wafflemaker"];
    const bundle = bundleSchema.parse({
      version: 1,
      ingredients: seedIngredients,
      recipes: [recipe],
    });
    expect(bundle.recipes[0].variants[0].equipment).toEqual(["wafflemaker"]);
    recipe.variants[0].equipment = ["none", "wafflemaker"];
    expect(recipeSchema.safeParse(recipe).success).toBe(false);
  });
});

describe("Питание и баланс", () => {
  it("принимает старые рецепты без рекомендаций, не назначая метки автоматически", () => {
    const { nutrition: _nutrition, ...legacy } = seedRecipes[0];
    expect(recipeSchema.parse(legacy).nutrition).toBeUndefined();
  });
  it("сохраняет рекомендации и метку в экспорте", () => {
    for (const recipe of seedRecipes) {
      expect(recipeSchema.parse(recipe).nutrition).toEqual(recipe.nutrition);
    }
    expect(
      seedRecipes.filter((r) => r.nutrition?.weightManagement),
    ).toHaveLength(4);
  });
  it("требует объяснение и ограничивает советы", () => {
    expect(
      nutritionSchema.safeParse({ weightManagement: true, rationale: " " })
        .success,
    ).toBe(false);
    expect(
      nutritionSchema.safeParse({
        rationale: "Состав",
        tips: Array(7).fill("Совет"),
      }).success,
    ).toBe(false);
    expect(
      nutritionSchema.safeParse({
        rationale: "Состав",
        tips: ["x".repeat(401)],
      }).success,
    ).toBe(false);
  });
});

describe("Хранение блюда", () => {
  it("принимает старый экспорт без сведений о хранении", () => {
    const { storage: _storage, ...legacy } = seedRecipes[0];
    const bundle = bundleSchema.parse({
      version: 1,
      ingredients: seedIngredients,
      recipes: [legacy],
    });
    expect(bundle.recipes[0].storage).toBeUndefined();
  });

  it("сохраняет оба ответа о заморозке и неизвестные значения при импорте", () => {
    for (const freezable of [true, false, null]) {
      const recipe = {
        ...seedRecipes[0],
        storage: { fridgeDays: null, freezable, note: "" },
      };
      const bundle = bundleSchema.parse({
        version: 1,
        ingredients: seedIngredients,
        recipes: [recipe],
      });
      expect(bundle.recipes[0].storage).toEqual(recipe.storage);
    }
  });

  it("не принимает неверный срок или текст вместо ответа о заморозке", () => {
    for (const fridgeDays of [0, -1, 1.5, 31, "3"]) {
      expect(storageSchema.safeParse({ fridgeDays }).success).toBe(false);
    }
    expect(storageSchema.safeParse({ freezable: "false" }).success).toBe(false);
    expect(storageSchema.safeParse({ note: "x".repeat(1001) }).success).toBe(
      false,
    );
  });

  it("все стартовые рецепты содержат срок и явный ответ о заморозке", () => {
    for (const recipe of seedRecipes) {
      const parsed = recipeSchema.parse(recipe);
      expect(parsed.storage?.fridgeDays).toBeGreaterThan(0);
      expect(typeof parsed.storage?.freezable).toBe("boolean");
    }
  });
});
