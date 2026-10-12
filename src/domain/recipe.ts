import { z } from "zod";

export const categories = [
  { id: "breakfast", name: "Завтраки" },
  { id: "soup", name: "Супы" },
  { id: "main", name: "Вторые блюда" },
  { id: "salad", name: "Салаты" },
  { id: "baking", name: "Выпечка" },
  { id: "snack", name: "Перекусы" },
] as const;
const categoryIds = categories.map((category) => category.id);
export const equipment = [
  { id: "stove", name: "Плита" },
  { id: "airfryer", name: "Аэрогриль" },
  { id: "oven", name: "Духовка" },
  { id: "multicooker", name: "Мультиварка" },
  { id: "wafflemaker", name: "Вафельница" },
  { id: "none", name: "Без нагрева" },
] as const;
export const units = [
  "г",
  "кг",
  "мл",
  "л",
  "шт.",
  "зубчик",
  "пучок",
  "ч. л.",
  "ст. л.",
  "по вкусу",
] as const;
export type Category = (typeof categories)[number]["id"];
export type Equipment = (typeof equipment)[number]["id"];
const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "Используйте латиницу, цифры и дефис");
export const ingredientSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  group: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().max(100)).max(30).default([]),
});
export const amountSchema = z
  .object({
    ingredientId: id,
    quantity: z.number().positive().max(100000).nullable(),
    unit: z.enum(units),
    optional: z.boolean().default(false),
    note: z.string().max(300).default(""),
  })
  .refine(
    (a) => (a.unit === "по вкусу" ? a.quantity === null : a.quantity !== null),
    "Укажите количество; для «по вкусу» используйте null",
  );
export const stepSchema = z.object({
  title: z.string().trim().min(1).max(150),
  text: z.string().trim().min(1).max(3000),
  minutes: z.number().int().min(0).max(1440).optional(),
});
export const variantSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    equipment: z
      .array(z.enum(equipment.map((device) => device.id)))
      .min(1)
      .max(4),
    servings: z.number().int().min(1).max(30),
    prepMinutes: z.number().int().min(0).max(1440),
    cookMinutes: z.number().int().min(0).max(1440),
    note: z.string().max(1500).default(""),
    ingredients: z.array(amountSchema).min(1).max(60),
    steps: z.array(stepSchema).min(1).max(40),
  })
  .refine(
    (v) =>
      new Set(v.ingredients.map((i) => i.ingredientId)).size ===
      v.ingredients.length,
    "Объедините повторяющиеся ингредиенты в варианте",
  )
  .refine(
    (v) => !v.equipment.includes("none") || v.equipment.length === 1,
    "«Без нагрева» используется отдельно",
  );
export const storageSchema = z.object({
  fridgeDays: z.number().int().min(1).max(30).nullable().default(null),
  freezable: z.boolean().nullable().default(null),
  note: z.string().trim().max(1000).default(""),
});
export const nutritionSchema = z.object({
  weightManagement: z.boolean().default(false),
  rationale: z.string().trim().min(1).max(600),
  tips: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
});
export const families = [
  "omelet",
  "sandwich",
  "waffle",
  "porridge",
  "pancake",
  "cottage-cheese",
] as const;
const localImage = z
  .string()
  .regex(/^\/(images\/recipes|media)\/[a-zA-Z0-9._-]+\.(webp|png|jpg|jpeg)$/);
export const collectionSchema = z
  .object({
    id,
    slug: id,
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().min(1).max(600),
    image: localImage,
    status: z.enum(["draft", "published", "archived"]),
    kind: z.enum(["manual", "automatic"]),
    recipeIds: z.array(id).max(500).default([]),
    rules: z
      .object({
        category: z.enum(categoryIds).optional(),
        family: z.enum(families).optional(),
        equipment: z.enum(equipment.map((device) => device.id)).optional(),
        maxMinutes: z.number().int().min(1).max(2880).optional(),
        freezable: z.boolean().optional(),
      })
      .default({}),
  })
  .refine(
    (c) => new Set(c.recipeIds).size === c.recipeIds.length,
    "Рецепты в подборке не должны повторяться",
  );
export type Collection = z.infer<typeof collectionSchema>;
export const recipeSchema = z
  .object({
    id,
    slug: id,
    title: z.string().trim().min(2).max(150),
    description: z.string().trim().min(1).max(1500),
    category: z.enum(categoryIds),
    image: z
      .string()
      .regex(
        /^\/(images\/recipes|media)\/[a-zA-Z0-9._-]+\.(webp|png|jpg|jpeg)$/,
        "Нужен локальный путь к изображению",
      ),
    status: z.enum(["draft", "published", "archived"]),
    origin: z.enum(["ai", "family"]).default("ai"),
    storage: storageSchema.optional(),
    nutrition: nutritionSchema.optional(),
    family: z.enum(families).optional(),
    tested: z.boolean().optional(),
    variants: z.array(variantSchema).min(1).max(8),
  })
  .refine(
    (r) => new Set(r.variants.map((v) => v.id)).size === r.variants.length,
    "Идентификаторы вариантов должны различаться",
  );
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Catalog = {
  recipes: Recipe[];
  ingredients: Ingredient[];
  collections?: Collection[];
};
export const bundleSchema = z
  .object({
    version: z.literal(1),
    ingredients: z.array(ingredientSchema).min(1).max(1000),
    recipes: z.array(recipeSchema).max(500),
    collections: z.array(collectionSchema).max(100).optional(),
  })
  .superRefine((b, ctx) => {
    for (const [key, list] of [
      ["ingredients", b.ingredients],
      ["recipes", b.recipes],
    ] as const)
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Повторяющиеся идентификаторы",
        });
    if (new Set(b.recipes.map((r) => r.slug)).size !== b.recipes.length)
      ctx.addIssue({
        code: "custom",
        path: ["recipes"],
        message: "Адреса рецептов должны различаться",
      });
    const known = new Set(b.ingredients.map((i) => i.id));
    const collections = b.collections ?? [];
    if (
      new Set(collections.map((c) => c.id)).size !== collections.length ||
      new Set(collections.map((c) => c.slug)).size !== collections.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["collections"],
        message: "Идентификаторы и адреса подборок должны различаться",
      });
    b.recipes.forEach((r, ri) =>
      r.variants.forEach((v, vi) =>
        v.ingredients.forEach((i, ii) => {
          if (!known.has(i.ingredientId))
            ctx.addIssue({
              code: "custom",
              path: ["recipes", ri, "variants", vi, "ingredients", ii],
              message: `Неизвестный ингредиент: ${i.ingredientId}`,
            });
        }),
      ),
    );
  });
