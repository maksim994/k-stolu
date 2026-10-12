import { Suspense } from "react";
import { getCatalog } from "@/server/db";
import { CatalogView } from "@/components/catalog";
export const dynamic = "force-dynamic";
export const metadata = { title: "Избранное" };
export default async function Page() {
  return (
    <Suspense fallback={<p>Открываем избранное…</p>}>
      <CatalogView catalog={await getCatalog()} favorites />
    </Suspense>
  );
}
