"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Heart,
  ShoppingBag,
  Carrot,
  Leaf,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import { useHousehold } from "./household";
const navigation = [
  { href: "/", label: "Рецепты", icon: BookOpen },
  { href: "/plan", label: "План", icon: CalendarDays },
  { href: "/favorites", label: "Избранное", icon: Heart },
  { href: "/pantry", label: "Мои продукты", icon: Carrot },
  { href: "/shopping", label: "Покупки", icon: ShoppingBag },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated } = useHousehold();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          К столу
          <Leaf size={25} strokeWidth={1.5} />
        </Link>
        <p className="brand-note">Вкусное начинается дома</p>
        <nav aria-label="Главная навигация">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname.startsWith("/recipes")
                : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={21} />
                <span>{label}</span>
                {href === "/favorites" &&
                  hydrated &&
                  state.favorites.length > 0 && (
                    <small>{state.favorites.length}</small>
                  )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Leaf size={31} strokeWidth={1} />
          <p>
            Немного вдохновения.
            <br />И все за стол.
          </p>
          <Link href="/admin">
            Управление рецептами <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      <div className="mobile-header">
        <Link href="/" className="brand">
          К столу
          <Leaf size={20} />
        </Link>
        <Link
          href="/shopping"
          className="icon-button"
          aria-label="Список покупок"
        >
          <ShoppingBag size={22} />
        </Link>
      </div>
      <main id="main-content" className="main-content">
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={
              (
                href === "/"
                  ? pathname === "/" || pathname.startsWith("/recipes")
                  : pathname === href
              )
                ? "active"
                : ""
            }
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
