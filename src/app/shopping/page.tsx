import { getCatalog } from "@/server/db";
import { Shopping } from "@/components/shopping";
export const dynamic = "force-dynamic";
export const metadata = { title: "Покупки" };
export default async function Page() {
  return <Shopping ingredients={(await getCatalog()).ingredients} />;
}
