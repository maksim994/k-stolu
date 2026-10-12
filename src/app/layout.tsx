import type { Metadata, Viewport } from "next";
import { HouseholdProvider } from "@/components/household";
import { Shell } from "@/components/shell";
import "./globals.css";
import "@fontsource/golos-text/cyrillic-400.css";
import "@fontsource/golos-text/cyrillic-500.css";
import "@fontsource/golos-text/cyrillic-600.css";
import "@fontsource/golos-text/cyrillic-700.css";
import "@fontsource/golos-text/latin-400.css";
export const metadata: Metadata = {
  title: {
    default: "К столу — что приготовим сегодня?",
    template: "%s · К столу",
  },
  description:
    "Домашние рецепты, выбор по продуктам и технике, удобный список покупок.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f5ef",
};
const contract =
  "<!-- THESIS: Start with the dish wanted; pantry is an optional aid. OWN-WORLD: warm ivory, olive selection, dark brown serif headings and calm sans controls. STORY: choose category, refine, cook, shop. FIRST VIEWPORT: desktop side navigation, category tiles, compact filters, three photo recipe columns; mobile stacked controls and one readable photo column. FORM: user-pinned warm family Operate interface, no random concept roll; category-first catalog approved in mocks/04-category-catalog.png; recipe and shopping from mocks/05 and 06. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <div dangerouslySetInnerHTML={{ __html: contract }} />
        <a className="skip-link" href="#main-content">
          К содержимому
        </a>
        <HouseholdProvider>
          <Shell>{children}</Shell>
        </HouseholdProvider>
      </body>
    </html>
  );
}
