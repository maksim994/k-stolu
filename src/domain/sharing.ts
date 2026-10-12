import type { Ingredient, Recipe, Variant } from "./recipe";
import { quantityText, scaledIngredients } from "./cooking";

export function recipeShareUrl(
  origin: string,
  slug: string,
  variantId: string,
) {
  const url = new URL(`/recipes/${slug}`, origin);
  url.searchParams.set("variant", variantId);
  return url.toString();
}

export function isLocalRecipeUrl(value: string) {
  const host = new URL(value).hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  );
}

export function recipeShareText(
  recipe: Recipe,
  variant: Variant,
  ingredients: Ingredient[],
  servings: number,
) {
  const amounts = scaledIngredients(variant, servings).map((amount) => {
    const name =
      ingredients.find((ingredient) => ingredient.id === amount.ingredientId)
        ?.name ?? amount.ingredientId;
    return `- ${name}: ${quantityText(amount.quantity, amount.unit)}${amount.optional ? " (по желанию)" : ""}${amount.note ? `; ${amount.note}` : ""}`;
  });
  const steps = variant.steps.map(
    (step, i) => `${i + 1}. ${step.title}\n${step.text}`,
  );
  return [
    recipe.title,
    `${variant.name} · ${servings} порц. · ${variant.prepMinutes + variant.cookMinutes} мин`,
    recipe.description,
    variant.note,
    "Ингредиенты",
    amounts.join("\n"),
    "Приготовление",
    steps.join("\n\n"),
    "Рецепт из «К столу»",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function recipeShareLinks(url: string, title: string, text: string) {
  const local = isLocalRecipeUrl(url);
  const message = local ? text : `${title}\n${url}`;
  return {
    telegram: `https://t.me/share/url?${new URLSearchParams({ url: local ? "" : url, text: local ? text : title })}`,
    whatsapp: `https://wa.me/?${new URLSearchParams({ text: message })}`,
    email: `mailto:?${new URLSearchParams({ subject: title, body: message }).toString().replaceAll("+", "%20")}`,
  };
}
