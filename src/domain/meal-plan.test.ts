import { describe, expect, it } from "vitest";
import { seedIngredients, seedRecipes } from "../data/seed";
import {
  emptyShopping,
  shoppingRows,
  shoppingSourceSchema,
  type ShoppingState,
} from "./cooking";
import {
  mealPlanSchema,
  planShoppingSources,
  removePlanEntry,
  shiftDate,
  spareServings,
  storageWarning,
  syncPlanShopping,
  validatePlan,
  type CookingEntry,
  type PlanEntry,
} from "./meal-plan";

const cook: CookingEntry = {
  id: "batch",
  date: "2026-10-11",
  slot: "dinner",
  kind: "cook",
  recipeId: "chicken-soup",
  variantId: "stove",
  servings: 2,
  cookServings: 4,
};
const leftovers: PlanEntry = {
  id: "leftover",
  date: "2026-10-12",
  slot: "lunch",
  kind: "leftovers",
  sourceId: "batch",
  servings: 2,
};
const dates = ["2026-10-11", "2026-10-12", "2026-10-13"];

describe("План питания и остатки", () => {
  it("проверяет реальные даты и целые порции", () => {
    expect(mealPlanSchema.safeParse([cook, leftovers]).success).toBe(true);
    expect(
      mealPlanSchema.safeParse([{ ...cook, date: "2026-02-31" }]).success,
    ).toBe(false);
    expect(mealPlanSchema.safeParse([{ ...cook, servings: 1.5 }]).success).toBe(
      false,
    );
    expect(mealPlanSchema.safeParse([cook, cook]).success).toBe(false);
  });
  it("считает свободные порции без повторного приготовления", () => {
    expect(spareServings(cook, [cook])).toBe(2);
    expect(spareServings(cook, [cook, leftovers])).toBe(0);
    expect(spareServings(cook, [cook, leftovers], leftovers.id)).toBe(2);
    expect(validatePlan([cook, leftovers])).toEqual([]);
  });
  it("не даёт потратить одну порцию остатков дважды или уменьшить исходную партию", () => {
    expect(
      validatePlan([cook, leftovers, { ...leftovers, id: "extra" }])[0].id,
    ).toBe(cook.id);
    expect(validatePlan([{ ...cook, cookServings: 3 }, leftovers])[0].id).toBe(
      cook.id,
    );
    expect(validatePlan([{ ...cook, cookServings: 1 }])[0].id).toBe(cook.id);
  });
  it("разрешает остатки позже в тот же день, но не раньше готовки", () => {
    expect(
      validatePlan([
        { ...cook, slot: "lunch" },
        { ...leftovers, date: cook.date, slot: "dinner" },
      ]),
    ).toEqual([]);
    expect(
      validatePlan([cook, { ...leftovers, date: cook.date, slot: "lunch" }])[0]
        .id,
    ).toBe(leftovers.id);
    expect(
      validatePlan([
        cook,
        { ...leftovers, date: cook.date, slot: cook.slot },
      ])[0].id,
    ).toBe(leftovers.id);
    expect(validatePlan([{ ...leftovers, sourceId: "missing" }])[0].id).toBe(
      leftovers.id,
    );
  });
  it("удаляет связанные остатки только вместе с исходным приготовлением", () => {
    expect(removePlanEntry([cook, leftovers], cook.id)).toEqual([]);
    expect(removePlanEntry([cook, leftovers], leftovers.id)).toEqual([cook]);
  });
  it("считает календарные дни через границу года и високосный февраль", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("предупреждает о примерном сроке хранения, включая отсутствие сведений", () => {
    expect(storageWarning(leftovers, [cook, leftovers], seedRecipes)).toBe("");
    expect(
      storageWarning(
        { ...leftovers, date: "2026-10-13" },
        [cook, leftovers],
        seedRecipes,
      ),
    ).not.toBe("");
    expect(storageWarning(leftovers, [cook, leftovers], [])).toContain(
      "не указан",
    );
  });
});

describe("Покупки из плана", () => {
  it("рассчитывает всю партию, исключая остатки, необязательное и продукты дома", () => {
    const sources = planShoppingSources([cook, leftovers], seedRecipes, dates, [
      "potato",
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0].servings).toBe(4);
    expect(
      sources[0].items.find(
        (amount) => amount.ingredientId === "chicken-fillet",
      )?.quantity,
    ).toBe(400);
    expect(
      sources[0].items.some(
        (amount) => amount.ingredientId === "potato" || amount.optional,
      ),
    ).toBe(false);
    expect(
      sources[0].homeItems?.find((amount) => amount.ingredientId === "potato")
        ?.quantity,
    ).toBe(300);
  });
  it("складывает приготовления одного блюда в разные дни и повторно не удваивает покупки", () => {
    const entries = [
      cook,
      { ...cook, id: "second", date: "2026-10-12", cookServings: 2 },
    ];
    const sources = planShoppingSources(entries, seedRecipes, dates, []);
    const shopping = syncPlanShopping(emptyShopping, sources, entries, dates);
    const repeated = syncPlanShopping(shopping, sources, entries, dates);
    expect(repeated.sources).toHaveLength(2);
    expect(
      shoppingRows(repeated, seedIngredients).find(
        (row) => row.ingredientId === "chicken-fillet",
      )?.quantity,
    ).toBe(600);
  });
  it("сохраняет отметки покупок при обновлении неизменённого плана", () => {
    const sources = planShoppingSources([cook], seedRecipes, dates, []);
    const shopping = syncPlanShopping(emptyShopping, sources, [cook], dates);
    shopping.checked = ["chicken-fillet:г"];
    shopping.sources = shopping.sources.map((source) =>
      shoppingSourceSchema.parse(source),
    );
    expect(syncPlanShopping(shopping, sources, [cook], dates).checked).toEqual(
      shopping.checked,
    );
  });
  it("обновляет порции и удалённые блюда, сохраняя ручные покупки и другие периоды", () => {
    const outside = { ...cook, id: "outside", date: "2026-11-01" };
    const outsideSource = planShoppingSources(
      [outside],
      seedRecipes,
      [outside.date],
      [],
    )[0];
    const direct = {
      ...planShoppingSources([cook], seedRecipes, dates, [])[0],
      key: cook.recipeId,
      planDate: undefined,
    };
    const initial: ShoppingState = {
      ...emptyShopping,
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
      sources: [outsideSource, direct],
    };
    const added = syncPlanShopping(
      initial,
      planShoppingSources([cook], seedRecipes, dates, []),
      [cook, outside],
      dates,
    );
    const updated = { ...cook, cookServings: 6 };
    const next = syncPlanShopping(
      added,
      planShoppingSources([updated], seedRecipes, dates, []),
      [updated, outside],
      dates,
    );
    expect(
      next.sources.find((source) => source.key === "plan:batch")?.servings,
    ).toBe(6);
    const cleared = syncPlanShopping(next, [], [outside], dates);
    expect(cleared.sources).toEqual([outsideSource, direct]);
    expect(cleared.manual).toEqual(initial.manual);
  });
  it("не добавляет остатки из другого периода и не маскирует недоступные рецепты", () => {
    expect(
      planShoppingSources([cook, leftovers], seedRecipes, [leftovers.date], []),
    ).toEqual([]);
    expect(() => planShoppingSources([cook], [], dates, [])).toThrow(
      "недоступный",
    );
    expect(() =>
      planShoppingSources(
        [{ ...cook, variantId: "missing" }],
        seedRecipes,
        dates,
        [],
      ),
    ).toThrow("недоступный");
  });
});
