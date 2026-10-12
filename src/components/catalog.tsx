"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Heart,
  Clock,
  ArrowUpRight,
  Check,
  Carrot,
  Utensils,
  Soup,
  CookingPot,
  Salad,
  Croissant,
  EggFried,
  X,
  BookOpen,
  Leaf,
  Library,
  Sandwich,
} from "lucide-react";
import {
  categories,
  equipment,
  type Catalog,
  type Equipment,
  type Recipe,
  type Variant,
} from "@/domain/recipe";
import { bestVariant, missingIngredients, plural } from "@/domain/cooking";
import { useHousehold } from "./household";
import { isBasicIngredient } from "@/domain/pantry";
import { collectionRecipes, collectionVariants } from "@/domain/collections";
function CatalogTabs({
  collections = false,
  compact = false,
}: {
  collections?: boolean;
  compact?: boolean;
}) {
  return (
    <nav
      className={`catalog-tabs ${compact ? "catalog-tabs-recipe-view" : ""}`}
      aria-label="Каталог"
    >
      <Link href="/" aria-current={!collections ? "page" : undefined}>
        Рецепты
      </Link>
      <Link
        href="/?view=collections"
        aria-current={collections ? "page" : undefined}
      >
        Подборки
      </Link>
    </nav>
  );
}
const categoryIcons = {
  breakfast: EggFried,
  soup: Soup,
  main: Utensils,
  salad: Salad,
  baking: Croissant,
  snack: Sandwich,
};
export function RecipeCard({
  recipe,
  catalog,
  devices = [],
  selectedVariant,
}: {
  recipe: Recipe;
  catalog: Catalog;
  devices?: Equipment[];
  selectedVariant?: Variant;
}) {
  const { state, pantry, setState } = useHousehold();
  const variant = selectedVariant ?? bestVariant(recipe, pantry, devices);
  if (!variant) return null;
  const missing = missingIngredients(variant, pantry).length;
  const favorite = state.favorites.includes(recipe.id);
  return (
    <article className="recipe-card">
      <div className="recipe-photo">
        <Link
          href={`/recipes/${recipe.slug}?variant=${variant.id}`}
          aria-label={`Открыть рецепт: ${recipe.title}`}
        >
          <img
            src={recipe.image}
            alt={recipe.title}
            loading="lazy"
            width="600"
            height="400"
          />
        </Link>
        <button
          className={`favorite-button ${favorite ? "saved" : ""}`}
          aria-pressed={favorite}
          aria-label={
            favorite
              ? `Убрать ${recipe.title} из избранного`
              : `Сохранить ${recipe.title}`
          }
          onClick={() =>
            setState((s) => ({
              ...s,
              favorites: favorite
                ? s.favorites.filter((id) => id !== recipe.id)
                : [...s.favorites, recipe.id],
            }))
          }
        >
          <Heart size={20} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="recipe-copy">
        <h3>
          <Link href={`/recipes/${recipe.slug}?variant=${variant.id}`}>
            {recipe.title}
          </Link>
        </h3>
        <p className="recipe-description">{recipe.description}</p>
        {recipe.nutrition?.weightManagement && (
          <span className="nutrition-tag">
            <Leaf size={14} />
            Для контроля веса
          </span>
        )}
        <div className="recipe-meta">
          <span>
            <Clock size={15} />
            {variant.prepMinutes + variant.cookMinutes} мин
          </span>
          <span>
            <CookingPot size={15} />
            {variant.equipment
              .map((e) => equipment.find((d) => d.id === e)?.name)
              .join(", ")}
          </span>
        </div>
        <div className="recipe-footer">
          {state.pantry.some((id) => !isBasicIngredient(id)) ? (
            <span
              className={`availability ${missing ? "missing" : "complete"}`}
            >
              {missing ? <ShoppingIcon /> : <Check size={13} />}{" "}
              {missing
                ? `Докупить ${missing} ${plural(missing, ["продукт", "продукта", "продуктов"])}`
                : "Всё отмечено дома"}
            </span>
          ) : (
            <span className="ingredient-count">
              {
                variant.ingredients.filter(
                  (i) => !i.optional && !isBasicIngredient(i.ingredientId),
                ).length
              }{" "}
              ингредиентов
            </span>
          )}
          <Link
            href={`/recipes/${recipe.slug}?variant=${variant.id}`}
            className="recipe-arrow"
            aria-label={`Готовить: ${recipe.title}`}
          >
            <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
    </article>
  );
}
function ShoppingIcon() {
  return <Carrot size={13} />;
}
export function CatalogView({
  catalog,
  favorites = false,
}: {
  catalog: Catalog;
  favorites?: boolean;
}) {
  const { state, pantry } = useHousehold();
  const pantryCount = state.pantry.filter(
    (id) => !isBasicIngredient(id),
  ).length;
  const params = useSearchParams(),
    router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const collectionSlug = favorites ? null : params.get("collection");
  const collection = catalog.collections?.find(
    (c) => c.slug === collectionSlug && c.status === "published",
  );
  const collectionList =
    !favorites && params.get("view") === "collections" && !collectionSlug;
  const category = params.get("category") ?? "all",
    query = params.get("q") ?? "",
    time = Number(params.get("time")) || 0,
    sort = params.get("sort") ?? (pantryCount ? "match" : "default"),
    strict = params.get("strict") === "1",
    healthy = params.get("healthy") === "1";
  const devices = (params.get("equipment") ?? "")
    .split(",")
    .filter((e) => equipment.some((d) => d.id === e)) as Equipment[];
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, value] of Object.entries(values))
      if (value) next.set(k, value);
      else next.delete(k);
    window.history.replaceState(
      null,
      "",
      `${favorites ? "/favorites" : "/"}${next.size ? "?" + next : ""}`,
    );
  };
  const sourceRecipes = collectionSlug
    ? collection
      ? collectionRecipes(collection, catalog.recipes)
      : []
    : catalog.recipes;
  let recipes = sourceRecipes
    .filter(
      (r) =>
        (!favorites || state.favorites.includes(r.id)) &&
        (!healthy || r.nutrition?.weightManagement === true) &&
        (category === "all" || r.category === category) &&
        `${r.title} ${r.description}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
    )
    .map((recipe) => ({
      recipe,
      variant: bestVariant(
        collection
          ? { ...recipe, variants: collectionVariants(collection, recipe) }
          : recipe,
        pantry,
        devices,
        time,
      ),
    }))
    .filter(
      (x): x is { recipe: Recipe; variant: NonNullable<typeof x.variant> } =>
        !!x.variant,
    )
    .filter(
      ({ variant }) =>
        (!time || variant.prepMinutes + variant.cookMinutes <= time) &&
        (!strict || missingIngredients(variant, pantry).length === 0),
    );
  if (sort === "time")
    recipes = recipes.sort(
      (a, b) =>
        a.variant.prepMinutes +
        a.variant.cookMinutes -
        b.variant.prepMinutes -
        b.variant.cookMinutes,
    );
  if (sort === "match")
    recipes = recipes.sort(
      (a, b) =>
        missingIngredients(a.variant, pantry).length -
        missingIngredients(b.variant, pantry).length,
    );
  const activeCount = devices.length + Number(!!time) + Number(strict);
  if (collectionList)
    return (
      <>
        <CatalogTabs collections />
        <header className="page-heading">
          <div>
            <h1>Подборки к столу</h1>
            <p>На каждый день и для особенного утра.</p>
          </div>
        </header>
        <div className="collection-grid">
          {(catalog.collections ?? [])
            .filter((c) => c.status === "published")
            .map((c) => {
              const count = collectionRecipes(c, catalog.recipes).length;
              return (
                <Link
                  key={c.id}
                  href={`/?collection=${c.slug}`}
                  className="collection-card"
                >
                  <img
                    src={c.image}
                    alt=""
                    width="600"
                    height="400"
                    loading="lazy"
                  />
                  <div>
                    <span className="quiet">
                      {count} {plural(count, ["рецепт", "рецепта", "рецептов"])}
                    </span>
                    <h2>{c.title}</h2>
                    <p>{c.description}</p>
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
        </div>
        {!catalog.collections?.some((c) => c.status === "published") && (
          <p>Подборки скоро появятся.</p>
        )}
      </>
    );
  return (
    <>
      {!favorites && (
        <CatalogTabs collections={!!collectionSlug} compact={!collectionSlug} />
      )}
      {collectionSlug && (
        <Link className="text-button collection-back" href="/?view=collections">
          Все подборки
        </Link>
      )}
      <header className="page-heading">
        <div
          className={
            !favorites && !collectionSlug ? "catalog-title" : undefined
          }
        >
          <h1>
            {favorites
              ? "Любимое всегда рядом"
              : collectionSlug
                ? (collection?.title ?? "Подборка недоступна")
                : "Чего хочется сегодня?"}
          </h1>
          {!favorites && !collectionSlug && (
            <Link
              href="/?view=collections"
              className="catalog-collections-shortcut"
              aria-label="Подборки"
              title="Подборки"
            >
              <Library size={22} />
            </Link>
          )}
          <p>
            {favorites
              ? "Рецепты, к которым хочется возвращаться."
              : collectionSlug
                ? (collection?.description ??
                  "Возможно, она ещё не опубликована или была убрана.")
                : "Выберите блюдо, а мы поможем с остальным."}
          </p>
        </div>
        <label className="search-field">
          <Search size={19} />
          <input
            aria-label="Найти рецепт"
            placeholder="Найти рецепт"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
          />
          {query && (
            <button
              aria-label="Очистить поиск"
              onClick={() => update({ q: "" })}
            >
              <X size={16} />
            </button>
          )}
        </label>
      </header>
      <div className="category-grid" aria-label="Категории блюд">
        <button
          className={category === "all" ? "selected" : ""}
          aria-pressed={category === "all"}
          onClick={() => update({ category: "" })}
        >
          <BookOpen size={27} />
          <span>Все рецепты</span>
        </button>
        {categories
          .filter((c) => catalog.recipes.some((r) => r.category === c.id))
          .map((c) => {
            const Icon = categoryIcons[c.id];
            return (
              <button
                key={c.id}
                aria-pressed={category === c.id}
                className={`${category === c.id ? "selected" : ""} ${c.id === "snack" ? "category-snack" : ""}`}
                onClick={() => update({ category: c.id })}
              >
                <Icon size={27} />
                <span>{c.name}</span>
              </button>
            );
          })}
      </div>
      <div className="filter-toolbar">
        <div className="toolbar-actions">
          <Link className="button light catalog-pantry-link" href="/pantry">
            <Carrot size={18} />
            Мои продукты
            {pantryCount > 0 && (
              <span className="count-dot">{pantryCount}</span>
            )}
          </Link>
          <button
            className={`button light ${filtersOpen ? "pressed" : ""}`}
            aria-expanded={filtersOpen}
            aria-controls="catalog-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={18} />
            Фильтры
            {activeCount > 0 && (
              <span className="count-dot">{activeCount}</span>
            )}
          </button>
          <label className={`nutrition-filter ${healthy ? "selected" : ""}`}>
            <input
              type="checkbox"
              checked={healthy}
              onChange={(e) => update({ healthy: e.target.checked ? "1" : "" })}
            />
            <Leaf size={17} />
            Контроль веса
          </label>
        </div>
        <span className="quiet toolbar-note">
          Вкусное найдётся для каждого дня
        </span>
      </div>
      {healthy && (
        <details className="nutrition-filter-note">
          <summary>О подборке</summary>
          <p>
            Подборка по составу, а не по калориям. Для снижения веса важны весь
            рацион и размер порций.
          </p>
        </details>
      )}
      {filtersOpen && (
        <section className="filter-panel" id="catalog-filters">
          <div>
            <h2 className="small-heading">На чём готовим?</h2>
            <div className="chips">
              {equipment.map((d) => (
                <button
                  key={d.id}
                  className={`chip ${devices.includes(d.id) ? "selected" : ""}`}
                  aria-pressed={devices.includes(d.id)}
                  onClick={() =>
                    update({
                      equipment: (devices.includes(d.id)
                        ? devices.filter((e) => e !== d.id)
                        : [...devices, d.id]
                      ).join(","),
                    })
                  }
                >
                  {devices.includes(d.id) && <Check size={14} />} {d.name}
                </button>
              ))}
            </div>
            <p className="field-hint">
              Покажем варианты, для которых достаточно выбранной техники.
            </p>
          </div>
          <label className="field">
            Время вместе с подготовкой
            <select
              value={time}
              onChange={(e) =>
                update({ time: e.target.value === "0" ? "" : e.target.value })
              }
            >
              <option value="0">Без ограничений</option>
              <option value="20">До 20 минут</option>
              <option value="30">До 30 минут</option>
              <option value="45">До 45 минут</option>
              <option value="60">До часа</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => update({ strict: e.target.checked ? "1" : "" })}
            />
            Только из того, что есть дома
          </label>
          <button
            className="text-button"
            onClick={() =>
              update({ equipment: "", time: "", strict: "", healthy: "" })
            }
          >
            Сбросить фильтры
          </button>
        </section>
      )}
      {activeCount > 0 && !filtersOpen && (
        <div className="active-filters">
          {devices.map((d) => (
            <button
              className="chip selected"
              key={d}
              onClick={() =>
                update({ equipment: devices.filter((e) => e !== d).join(",") })
              }
            >
              {equipment.find((e) => e.id === d)?.name}
              <X size={13} />
            </button>
          ))}
          {time > 0 && (
            <button className="chip" onClick={() => update({ time: "" })}>
              До {time} мин
              <X size={13} />
            </button>
          )}
          {strict && (
            <button className="chip" onClick={() => update({ strict: "" })}>
              Всё есть дома
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <section>
        <div className="section-heading">
          <div>
            <h2>
              {favorites
                ? "Ваши сохранённые рецепты"
                : collection && category === "all"
                  ? "В этой подборке"
                  : healthy && category === "all"
                    ? "Контроль веса"
                    : category === "all"
                      ? "Домашние рецепты"
                      : categories.find((c) => c.id === category)?.name}
            </h2>
            <span className="quiet">
              {recipes.length}{" "}
              {plural(recipes.length, ["рецепт", "рецепта", "рецептов"])}
            </span>
          </div>
          <label className="sort-field">
            <span className="sr-only">Сортировка</span>
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="default">Наш выбор</option>
              <option value="time">Сначала быстрые</option>
              <option value="match">Меньше покупать</option>
            </select>
          </label>
        </div>
        {recipes.length ? (
          <div className="recipe-grid">
            {recipes.map(({ recipe, variant }) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                catalog={catalog}
                devices={devices}
                selectedVariant={variant}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <CookingPot size={44} strokeWidth={1.2} />
            <h2>
              {favorites && !state.favorites.length
                ? "Сохраните что-нибудь вкусное"
                : "Пока ничего не нашлось"}
            </h2>
            <p>
              {favorites && !state.favorites.length
                ? "Нажмите на сердечко у рецепта — он появится здесь."
                : "Попробуйте выбрать другую категорию или снять ограничения."}
            </p>
            {favorites && !state.favorites.length ? (
              <Link href="/" className="button primary">
                Посмотреть рецепты
              </Link>
            ) : (
              <button
                className="button primary"
                onClick={() =>
                  router.replace(
                    favorites
                      ? "/favorites"
                      : collectionSlug
                        ? `/?collection=${collectionSlug}`
                        : "/",
                    {
                      scroll: false,
                    },
                  )
                }
              >
                Сбросить поиск и фильтры
              </button>
            )}
          </div>
        )}
      </section>
      <footer className="page-footer">
        <span>Готовьте с удовольствием.</span>
        <span>
          {catalog.recipes.length} домашних идей — и это только начало
        </span>
      </footer>
    </>
  );
}
