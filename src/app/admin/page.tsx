import { Admin } from "@/components/admin";
export const metadata = {
  title: "Управление рецептами",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <Admin />;
}
