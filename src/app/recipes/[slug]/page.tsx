import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { getCatalog } from "@/server/db";
import { RecipeDetail } from "@/components/recipe-detail";
import { recipeShareUrl } from "@/domain/sharing";
import { relatedRecipes } from "@/domain/collections";
export const dynamic = "force-dynamic";
const catalogForPage = cache(() => getCatalog());
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string }>;
}): Promise<Metadata> {
  const [{ slug }, { variant }, catalog] = await Promise.all([
    params,
    searchParams,
    catalogForPage(),
  ]);
  const recipe = catalog.recipes.find((r) => r.slug === slug || r.id === slug);
  if (!recipe) return { title: "Рецепт не найден" };
  const selected =
    recipe.variants.find((v) => v.id === variant) ?? recipe.variants[0];
  const origin = process.env.APP_ORIGIN;
  return {
    title: recipe.title,
    description: recipe.description,
    ...(origin
      ? {
          openGraph: {
            type: "article",
            title: recipe.title,
            description: recipe.description,
            siteName: "К столу",
            locale: "ru_RU",
            url: recipeShareUrl(origin, recipe.slug, selected.id),
            images: [
              {
                url: new URL(recipe.image, origin).toString(),
                alt: recipe.title,
              },
            ],
          },
        }
      : {}),
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const [{ slug }, { variant }, catalog] = await Promise.all([
    params,
    searchParams,
    catalogForPage(),
  ]);
  const recipe = catalog.recipes.find((r) => r.slug === slug || r.id === slug);
  if (!recipe) notFound();
  return (
    <RecipeDetail
      recipe={recipe}
      ingredients={catalog.ingredients}
      initialVariant={variant}
      related={relatedRecipes(recipe, catalog.recipes)}
    />
  );
}
