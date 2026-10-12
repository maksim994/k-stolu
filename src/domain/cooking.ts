import type { Amount, Equipment, Ingredient, Recipe, Variant } from "./recipe";
import { amountSchema } from "./recipe";
import { z } from "zod";
export function scaledIngredients(
  variant: Variant,
  servings: number,
): Amount[] {
  return variant.ingredients.map((i) => ({
    ...i,
    quantity:
      i.quantity === null
        ? null
        : Math.round(((i.quantity * servings) / variant.servings) * 1000) /
          1000,
  }));
}
export function missingIngredients(variant: Variant, pantry: string[]) {
  return variant.ingredients.filter(
    (i) => !i.optional && !pantry.includes(i.ingredientId),
  );
}
export function bestVariant(
  recipe: Recipe,
  pantry: string[],
  devices: Equipment[] = [],
  maxMinutes = 0,
) {
  return recipe.variants
    .filter(
      (v) =>
        (!devices.length || v.equipment.every((e) => devices.includes(e))) &&
        (!maxMinutes || v.prepMinutes + v.cookMinutes <= maxMinutes),
    )
    .sort(
      (a, b) =>
        missingIngredients(a, pantry).length -
          missingIngredients(b, pantry).length ||
        a.prepMinutes + a.cookMinutes - (b.prepMinutes + b.cookMinutes),
    )[0];
}
export function quantityText(quantity: number | null, unit: string) {
  return quantity === null
    ? unit
    : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(quantity)} ${unit}`;
}
export function plural(n: number, forms: [string, string, string]) {
  const m = n % 100;
  return forms[
    m >= 11 && m <= 14
      ? 2
      : n % 10 === 1
        ? 0
        : n % 10 >= 2 && n % 10 <= 4
          ? 1
          : 2
  ];
}
export const shoppingSourceSchema = z.object({
  key: z.string(),
  planDate: z.iso.date().optional(),
  recipeId: z.string(),
  title: z.string(),
  variantId: z.string(),
  variantName: z.string(),
  servings: z.number().int().positive(),
  items: z.array(amountSchema),
  homeItems: z.array(amountSchema).optional(),
  image: z
    .string()
    .regex(/^\/(images\/recipes|media)\/[a-zA-Z0-9._-]+\.(webp|png|jpg|jpeg)$/)
    .optional(),
});
export type ShoppingSource = z.infer<typeof shoppingSourceSchema>;
export type ShoppingRow = {
  key: string;
  ingredientId: string;
  name: string;
  group: string;
  quantity: number | null;
  unit: string;
  sources: string[];
};
export type ShoppingOverride = { quantity: number | null; unit: string };
export type ShoppingState = {
  sources: ShoppingSource[];
  manual: ShoppingRow[];
  checked: string[];
  hidden: string[];
  overrides: Record<string, ShoppingOverride>;
};
export const emptyShopping: ShoppingState = {
  sources: [],
  manual: [],
  checked: [],
  hidden: [],
  overrides: {},
};
const normalized = (i: Amount) =>
  i.unit === "кг"
    ? {
        ...i,
        unit: "г",
        quantity: i.quantity === null ? null : i.quantity * 1000,
      }
    : i.unit === "л"
      ? {
          ...i,
          unit: "мл",
          quantity: i.quantity === null ? null : i.quantity * 1000,
        }
      : i;
export function shoppingRows(
  state: ShoppingState,
  ingredients: Ingredient[],
): ShoppingRow[] {
  const rows = new Map<string, ShoppingRow>();
  for (const s of state.sources)
    for (const raw of s.items) {
      const a = normalized(raw),
        key = `${a.ingredientId}:${a.unit}`,
        ingredient = ingredients.find((i) => i.id === a.ingredientId);
      const existing = rows.get(key);
      if (existing) {
        existing.quantity =
          existing.quantity === null || a.quantity === null
            ? null
            : Math.round((existing.quantity + a.quantity) * 1000) / 1000;
        if (!existing.sources.includes(s.title)) existing.sources.push(s.title);
      } else
        rows.set(key, {
          key,
          ingredientId: a.ingredientId,
          name: ingredient?.name ?? a.ingredientId,
          group: ingredient?.group ?? "Другое",
          quantity: a.quantity,
          unit: a.unit,
          sources: [s.title],
        });
    }
  for (const row of state.manual) rows.set(row.key, row);
  return [...rows.values()]
    .filter((r) => !state.hidden.includes(r.key))
    .map((r) => ({ ...r, ...state.overrides[r.key] }))
    .sort(
      (a, b) =>
        a.group.localeCompare(b.group, "ru") ||
        a.name.localeCompare(b.name, "ru"),
    );
}
export function addShoppingSource(
  state: ShoppingState,
  source: ShoppingSource,
): ShoppingState {
  const existing = state.sources.find((s) => s.key === source.key);
  if (
    existing &&
    JSON.stringify(shoppingSourceSchema.parse(existing)) ===
      JSON.stringify(shoppingSourceSchema.parse(source))
  )
    return state;
  const keys = new Set(
    source.items.map((i) => {
      const a = normalized(i);
      return `${a.ingredientId}:${a.unit}`;
    }),
  );
  const overrides = { ...state.overrides };
  for (const key of keys) delete overrides[key];
  return {
    ...state,
    sources: [...state.sources.filter((s) => s.key !== source.key), source],
    hidden: state.hidden.filter((k) => !keys.has(k)),
    checked: state.checked.filter((k) => !keys.has(k)),
    overrides,
  };
}

export function removeShoppingSource(
  state: ShoppingState,
  key: string,
): ShoppingState {
  const removed = state.sources.find((s) => s.key === key);
  if (!removed) return state;
  const affected = new Set(
    removed.items.map((i) => {
      const a = normalized(i);
      return `${a.ingredientId}:${a.unit}`;
    }),
  );
  const overrides = { ...state.overrides };
  for (const k of affected) delete overrides[k];
  return {
    ...state,
    sources: state.sources.filter((s) => s.key !== key),
    overrides,
    checked: state.checked.filter((k) => !affected.has(k)),
    hidden: state.hidden.filter((k) => !affected.has(k)),
  };
}
