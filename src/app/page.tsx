import { Suspense } from "react";
import { getCatalog } from "@/server/db";
import { CatalogView } from "@/components/catalog";
export const dynamic = "force-dynamic";
export default async function Page() {
  return (
    <Suspense fallback={<p>Собираем рецепты…</p>}>
      <CatalogView catalog={await getCatalog()} />
    </Suspense>
  );
}
