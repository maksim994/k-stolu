import { z } from "zod";
import type { Recipe } from "./recipe";
import {
  addShoppingSource,
  removeShoppingSource,
  scaledIngredients,
  type ShoppingSource,
  type ShoppingState,
} from "./cooking";

export const mealSlots = [
  { id: "breakfast", name: "Завтрак" },
  { id: "lunch", name: "Обед" },
  { id: "snack", name: "Перекус" },
  { id: "dinner", name: "Ужин" },
] as const;
const base = {
  id: z.string().min(1).max(100),
  date: z.iso.date(),
  slot: z.enum(mealSlots.map((slot) => slot.id)),
  servings: z.number().int().min(1).max(30),
};
export const planEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("cook"),
    recipeId: z.string().min(1).max(80),
    variantId: z.string().min(1).max(80),
    cookServings: z.number().int().min(1).max(30),
  }),
  z.object({
    ...base,
    kind: z.literal("leftovers"),
    sourceId: z.string().min(1).max(100),
  }),
]);
export const mealPlanSchema = z
  .array(planEntrySchema)
  .max(1000)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.id)).size === entries.length,
    "В плане повторяются идентификаторы блюд",
  );
export type PlanEntry = z.infer<typeof planEntrySchema>;
export type CookingEntry = Extract<PlanEntry, { kind: "cook" }>;

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
export function mealOrder(entry: Pick<PlanEntry, "date" | "slot">) {
  return `${entry.date}:${mealSlots.findIndex((slot) => slot.id === entry.slot)}`;
}
export function cookingSource(entry: PlanEntry, entries: PlanEntry[]) {
  return entry.kind === "cook"
    ? entry
    : entries.find(
        (source): source is CookingEntry =>
          source.id === entry.sourceId && source.kind === "cook",
      );
}
export function spareServings(
  source: CookingEntry,
  entries: PlanEntry[],
  excludingId?: string,
) {
  return (
    source.cookServings -
    source.servings -
    entries.reduce(
      (sum, entry) =>
        sum +
        (entry.kind === "leftovers" &&
        entry.sourceId === source.id &&
        entry.id !== excludingId
          ? entry.servings
          : 0),
      0,
    )
  );
}
export function validatePlan(entries: PlanEntry[]) {
  const issues: { id: string; message: string }[] = [];
  for (const entry of entries) {
    if (entry.kind === "cook") {
      if (spareServings(entry, entries) < 0)
        issues.push({
          id: entry.id,
          message:
            "Приготовленных порций не хватает на этот приём пищи и запланированные остатки.",
        });
    } else {
      const source = cookingSource(entry, entries);
      if (!source)
        issues.push({
          id: entry.id,
          message:
            "Для остатков нужно выбрать блюдо, которое запланировано приготовить.",
        });
      else if (mealOrder(source) >= mealOrder(entry))
        issues.push({
          id: entry.id,
          message:
            "Остатки можно запланировать только после приготовления блюда.",
        });
    }
  }
  return issues;
}
export function storageWarning(
  entry: PlanEntry,
  entries: PlanEntry[],
  recipes: Recipe[],
) {
  if (entry.kind !== "leftovers") return "";
  const source = cookingSource(entry, entries);
  const days = recipes.find((recipe) => recipe.id === source?.recipeId)?.storage
    ?.fridgeDays;
  if (!source || days == null)
    return "Срок хранения не указан: проверьте, подходит ли блюдо для этого дня.";
  if (entry.date >= shiftDate(source.date, days))
    return "На этот день примерный срок хранения в холодильнике уже может закончиться.";
  return "";
}
export function removePlanEntry(entries: PlanEntry[], id: string) {
  return entries.filter(
    (entry) =>
      entry.id !== id && !(entry.kind === "leftovers" && entry.sourceId === id),
  );
}

export function planShoppingSources(
  entries: PlanEntry[],
  recipes: Recipe[],
  dates: string[],
  pantry: string[],
): ShoppingSource[] {
  return entries
    .filter(
      (entry): entry is CookingEntry =>
        entry.kind === "cook" && dates.includes(entry.date),
    )
    .map((entry) => {
      const recipe = recipes.find((recipe) => recipe.id === entry.recipeId);
      const variant = recipe?.variants.find(
        (variant) => variant.id === entry.variantId,
      );
      if (!recipe || !variant)
        throw new Error(
          "В плане есть недоступный рецепт или способ приготовления. Замените его перед составлением покупок.",
        );
      const amounts = scaledIngredients(variant, entry.cookServings).filter(
        (amount) => amount.ingredientId !== "water",
      );
      return {
        key: `plan:${entry.id}`,
        planDate: entry.date,
        recipeId: recipe.id,
        title: recipe.title,
        variantId: variant.id,
        variantName: variant.name,
        servings: entry.cookServings,
        image: recipe.image,
        items: amounts.filter(
          (amount) => !amount.optional && !pantry.includes(amount.ingredientId),
        ),
        homeItems: amounts.filter((amount) =>
          pantry.includes(amount.ingredientId),
        ),
      };
    });
}

export function syncPlanShopping(
  shopping: ShoppingState,
  sources: ShoppingSource[],
  entries: PlanEntry[],
  dates: string[],
) {
  const nextKeys = new Set(sources.map((source) => source.key));
  const cookingIds = new Set(
    entries
      .filter((entry) => entry.kind === "cook")
      .map((entry) => `plan:${entry.id}`),
  );
  let next = shopping;
  for (const source of shopping.sources) {
    if (
      source.key.startsWith("plan:") &&
      !nextKeys.has(source.key) &&
      (dates.includes(source.planDate ?? "") || !cookingIds.has(source.key))
    ) {
      next = removeShoppingSource(next, source.key);
    }
  }
  for (const source of sources) next = addShoppingSource(next, source);
  return next;
}
