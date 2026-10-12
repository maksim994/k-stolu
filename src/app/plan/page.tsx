import { getCatalog } from "@/server/db";
import { MealPlan } from "@/components/meal-plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "План питания" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string; variant?: string }>;
}) {
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  return (
    <MealPlan
      catalog={catalog}
      initialRecipe={params.recipe}
      initialVariant={params.variant}
    />
  );
}
