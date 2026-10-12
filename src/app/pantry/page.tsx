import { getCatalog } from "@/server/db";
import { Pantry } from "@/components/pantry";
export const dynamic = "force-dynamic";
export const metadata = { title: "Мои продукты" };
export default async function Page() {
  return <Pantry ingredients={(await getCatalog()).ingredients} />;
}
