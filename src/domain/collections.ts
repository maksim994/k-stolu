import type { Collection, Recipe, Variant } from "./recipe";

const starterFamilies: Record<string, Recipe["family"]> = {
  omelet: "omelet",
  syrniki: "cottage-cheese",
  oatmeal: "porridge",
};
export const recipeFamily = (recipe: Recipe) =>
  recipe.family ?? starterFamilies[recipe.id];

export function collectionVariants(
  collection: Collection,
  recipe: Recipe,
): Variant[] {
  if (recipe.status !== "published") return [];
  if (collection.kind === "manual")
    return collection.recipeIds.includes(recipe.id) ? recipe.variants : [];
  const rules = collection.rules;
  if (rules.category && recipe.category !== rules.category) return [];
  if (rules.family && recipeFamily(recipe) !== rules.family) return [];
  if (
    rules.freezable !== undefined &&
    recipe.storage?.freezable !== rules.freezable
  )
    return [];
  return recipe.variants.filter(
    (v) =>
      (!rules.equipment || v.equipment.includes(rules.equipment)) &&
      (!rules.maxMinutes || v.prepMinutes + v.cookMinutes <= rules.maxMinutes),
  );
}

export function collectionRecipes(
  collection: Collection,
  recipes: Recipe[],
): Recipe[] {
  const eligible = recipes.filter(
    (r) => collectionVariants(collection, r).length > 0,
  );
  const position = (id: string) => {
    const index = collection.recipeIds.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return eligible.sort((a, b) => position(a.id) - position(b.id));
}

export function relatedRecipes(
  recipe: Recipe,
  recipes: Recipe[],
  limit = 3,
): Recipe[] {
  const family = recipeFamily(recipe);
  const ingredients = new Set(
    recipe.variants
      .flatMap((v) => v.ingredients.map((i) => i.ingredientId))
      .filter(
        (id) => !["salt", "water", "oil", "sugar", "pepper"].includes(id),
      ),
  );
  const score = (candidate: Recipe) => {
    const sameFamily = family && recipeFamily(candidate) === family;
    const shared = new Set(
      candidate.variants
        .flatMap((v) => v.ingredients.map((i) => i.ingredientId))
        .filter((id) => ingredients.has(id)),
    ).size;
    return (
      (sameFamily ? 100 : 0) +
      (candidate.category === recipe.category ? 20 : 0) +
      shared
    );
  };
  return recipes
    .filter(
      (r) =>
        r.id !== recipe.id &&
        r.status === "published" &&
        (r.category === recipe.category ||
          (family && recipeFamily(r) === family)),
    )
    .sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title, "ru"))
    .slice(0, limit);
}
