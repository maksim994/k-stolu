"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CookingPot,
  Pencil,
  Plus,
  Refrigerator,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import type { Catalog, Recipe } from "@/domain/recipe";
import {
  emptyShopping,
  plural,
  quantityText,
  shoppingRows,
  type ShoppingSource,
} from "@/domain/cooking";
import {
  cookingSource,
  dateLabel,
  localDateKey,
  mealOrder,
  mealPlanSchema,
  mealSlots,
  planEntrySchema,
  planShoppingSources,
  removePlanEntry,
  shiftDate,
  spareServings,
  storageWarning,
  syncPlanShopping,
  validatePlan,
  type CookingEntry,
  type PlanEntry,
} from "@/domain/meal-plan";
import { useHousehold } from "./household";

function newEntry(
  date: string,
  recipe: Recipe,
  variantId?: string,
): CookingEntry {
  const variant =
    recipe.variants.find((variant) => variant.id === variantId) ??
    recipe.variants[0];
  return {
    id: crypto.randomUUID(),
    date,
    slot: recipe.category === "snack" ? "snack" : "dinner",
    kind: "cook",
    recipeId: recipe.id,
    variantId: variant.id,
    servings: variant.servings,
    cookServings: variant.servings,
  };
}

export function MealPlan({
  catalog,
  initialRecipe,
  initialVariant,
}: {
  catalog: Catalog;
  initialRecipe?: string;
  initialVariant?: string;
}) {
  const { state, pantry, setState, hydrated, toast } = useHousehold();
  const [startDate, setStartDate] = useState("");
  const [dayCount, setDayCount] = useState(7);
  const [editing, setEditing] = useState<PlanEntry | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ShoppingSource[] | null>(null);
  const openedInitial = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => setStartDate(localDateKey()), []);
  useEffect(() => {
    if (!hydrated || !startDate || openedInitial.current) return;
    openedInitial.current = true;
    const recipe = catalog.recipes.find(
      (recipe) => recipe.id === initialRecipe,
    );
    if (recipe) setEditing(newEntry(startDate, recipe, initialVariant));
  }, [hydrated, startDate, catalog.recipes, initialRecipe, initialVariant]);
  useEffect(() => {
    if (editing) {
      editorRef.current?.scrollIntoView({ block: "nearest" });
      editorRef.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
    }
  }, [editing?.id]);

  if (!hydrated || !startDate)
    return (
      <div className="empty-state">
        <CalendarDays size={32} />
        <p>Открываем план…</p>
      </div>
    );
  const dates = Array.from({ length: dayCount }, (_, index) =>
    shiftDate(startDate, index),
  );
  const visible = state.plan.filter((entry) => dates.includes(entry.date));
  const cookingCount = visible.filter((entry) => entry.kind === "cook").length;
  const hasPurchases = state.shopping.sources.some((source) =>
    dates.includes(source.planDate ?? ""),
  );
  const open = (entry: PlanEntry) => {
    setEditing(entry);
    setError("");
    setPreview(null);
  };
  const changeRange = (date: string) => {
    setStartDate(date);
    setPreview(null);
    setError("");
  };
  const save = (entry: PlanEntry) => {
    const next = [...state.plan.filter((item) => item.id !== entry.id), entry];
    if (!mealPlanSchema.safeParse(next).success) {
      setError(
        "Не удалось сохранить план. Проверьте даты и порции; в плане может быть не более 1000 блюд.",
      );
      return;
    }
    const issues = validatePlan(next);
    if (issues.length) {
      setError(issues[0].message);
      return;
    }
    setState((current) => ({ ...current, plan: next }));
    setEditing(null);
    setPreview(null);
    setError("");
    toast("План сохранён");
  };
  const remove = (entry: PlanEntry) => {
    const dependents = state.plan.filter(
      (item) => item.kind === "leftovers" && item.sourceId === entry.id,
    ).length;
    if (
      dependents &&
      !confirm(
        `Удалить приготовление и связанные с ним приёмы пищи из остатков (${dependents})?`,
      )
    )
      return;
    setState((current) => ({
      ...current,
      plan: removePlanEntry(current.plan, entry.id),
    }));
    if (editing?.id === entry.id) setEditing(null);
    setPreview(null);
    setError("");
    toast("Блюдо убрано из плана");
  };
  const prepareShopping = () => {
    setError("");
    const issues = validatePlan(state.plan);
    if (issues.length) {
      setError(issues[0].message);
      return;
    }
    try {
      setPreview(
        planShoppingSources(state.plan, catalog.recipes, dates, pantry),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось собрать покупки",
      );
    }
  };

  return (
    <div className="meal-plan">
      <header className="page-heading plan-heading">
        <div>
          <h1>План питания</h1>
          <p>
            {visible.length}{" "}
            {plural(visible.length, [
              "приём пищи",
              "приёма пищи",
              "приёмов пищи",
            ])}{" "}
            · {cookingCount}{" "}
            {plural(cookingCount, [
              "приготовление",
              "приготовления",
              "приготовлений",
            ])}
          </p>
        </div>
        <button
          className="button primary"
          disabled={!!editing || (!cookingCount && !hasPurchases)}
          onClick={prepareShopping}
        >
          <ShoppingBag size={18} />
          {hasPurchases ? "Обновить покупки" : "Собрать покупки"}
        </button>
      </header>
      <div className="plan-toolbar">
        <div className="plan-range">
          <button
            className="icon-button"
            aria-label="Предыдущие дни"
            title="Предыдущие дни"
            onClick={() => changeRange(shiftDate(startDate, -dayCount))}
          >
            <ArrowLeft size={18} />
          </button>
          <label className="field">
            <span className="sr-only">Начало плана</span>
            <input
              type="date"
              aria-label="Начало плана"
              value={startDate}
              min="2000-01-01"
              max="2100-12-01"
              onChange={(event) => {
                if (event.target.validity.valid && event.target.value)
                  changeRange(event.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="Следующие дни"
            title="Следующие дни"
            onClick={() => changeRange(shiftDate(startDate, dayCount))}
          >
            <ArrowRight size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => changeRange(localDateKey())}
          >
            Сегодня
          </button>
        </div>
        <label className="field plan-length">
          <span className="sr-only">Период плана</span>
          <select
            aria-label="Период плана"
            value={dayCount}
            onChange={(event) => {
              setDayCount(Number(event.target.value));
              setPreview(null);
            }}
          >
            <option value={3}>3 дня</option>
            <option value={5}>5 дней</option>
            <option value={7}>7 дней</option>
          </select>
        </label>
      </div>
      {error && !editing && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <div ref={editorRef}>
          <MealEditor
            key={editing.id}
            entry={editing}
            entries={state.plan}
            catalog={catalog}
            onSave={save}
            validationError={error}
            onCancel={() => {
              setEditing(null);
              setError("");
            }}
          />
        </div>
      )}
      {preview && (
        <PlanShoppingPreview
          sources={preview}
          catalog={catalog}
          pantry={pantry}
          updating={hasPurchases}
          onCancel={() => setPreview(null)}
          onSave={(sources) => {
            setState((current) => ({
              ...current,
              shopping: syncPlanShopping(
                current.shopping,
                sources,
                current.plan,
                dates,
              ),
            }));
            setPreview(null);
            toast("Покупки из плана обновлены");
          }}
        />
      )}
      <div className="plan-agenda">
        {dates.map((date) => {
          const entries = visible
            .filter((entry) => entry.date === date)
            .sort((a, b) => mealOrder(a).localeCompare(mealOrder(b)));
          return (
            <section
              className={`plan-day ${date === localDateKey() ? "is-today" : ""}`}
              key={date}
              aria-label={dateLabel(date)}
            >
              <header className="plan-day-heading">
                <h2>
                  {dateLabel(date, { weekday: "long" })}
                  <span>{dateLabel(date)}</span>
                </h2>
                {date === localDateKey() && (
                  <span className="plan-today">Сегодня</span>
                )}
              </header>
              <div className="plan-day-meals">
                {entries.map((entry) => {
                  const source = cookingSource(entry, state.plan);
                  const recipe = catalog.recipes.find(
                    (recipe) => recipe.id === source?.recipeId,
                  );
                  const variant = recipe?.variants.find(
                    (variant) => variant.id === source?.variantId,
                  );
                  const warning = storageWarning(
                    entry,
                    state.plan,
                    catalog.recipes,
                  );
                  return (
                    <article className="plan-meal" key={entry.id}>
                      {recipe && (
                        <Link
                          href={`/recipes/${recipe.slug}?variant=${variant?.id ?? ""}`}
                          className="plan-meal-photo"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <img
                            src={recipe.image}
                            alt=""
                            width={88}
                            height={72}
                            loading="lazy"
                          />
                        </Link>
                      )}
                      <div className="plan-meal-copy">
                        <span className="plan-meal-slot">
                          {
                            mealSlots.find((slot) => slot.id === entry.slot)
                              ?.name
                          }{" "}
                          · {entry.servings} порц.
                        </span>
                        <h3>
                          {recipe ? (
                            <Link
                              href={`/recipes/${recipe.slug}?variant=${variant?.id ?? ""}`}
                            >
                              {recipe.title}
                            </Link>
                          ) : (
                            "Рецепт недоступен"
                          )}
                        </h3>
                        <p className="plan-meal-method">
                          {entry.kind === "cook" ? (
                            <>
                              <CookingPot size={15} />
                              Готовим {entry.cookServings} порц. ·{" "}
                              {variant?.name ?? "Способ недоступен"}
                            </>
                          ) : (
                            <>
                              <Refrigerator size={15} />
                              Остатки от{" "}
                              {source
                                ? dateLabel(source.date, {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "удалённого блюда"}
                            </>
                          )}
                        </p>
                        {entry.kind === "cook" &&
                          spareServings(entry, state.plan) > 0 && (
                            <p className="plan-spare">
                              В запасе {spareServings(entry, state.plan)} порц.
                            </p>
                          )}
                        {warning && <p className="plan-warning">{warning}</p>}
                      </div>
                      <div className="plan-meal-actions">
                        <button
                          className="icon-button"
                          title="Изменить блюдо"
                          aria-label={`Изменить ${recipe?.title ?? "блюдо"} на ${dateLabel(date)}`}
                          onClick={() => open(entry)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Убрать из плана"
                          aria-label={`Убрать ${recipe?.title ?? "блюдо"} на ${dateLabel(date)}`}
                          onClick={() => remove(entry)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!entries.length && (
                  <p className="plan-day-empty">Пока без планов</p>
                )}
                <button
                  className="text-button plan-add"
                  disabled={!catalog.recipes.length || !!editing}
                  aria-label={`Добавить блюдо на ${dateLabel(date)}`}
                  onClick={() => open(newEntry(date, catalog.recipes[0]))}
                >
                  <Plus size={17} />
                  Добавить блюдо
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {!catalog.recipes.length && (
        <p className="content-note">
          Пока нет опубликованных рецептов для плана.
        </p>
      )}
      <div className="plan-footer">
        <Link className="text-button" href="/">
          Выбрать рецепт <ArrowRight size={16} />
        </Link>
        <Link className="text-button" href="/shopping">
          К покупкам <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function MealEditor({
  entry,
  entries,
  catalog,
  onSave,
  validationError,
  onCancel,
}: {
  entry: PlanEntry;
  entries: PlanEntry[];
  catalog: Catalog;
  onSave: (entry: PlanEntry) => void;
  validationError: string;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const [error, setError] = useState("");
  const source = cookingSource(draft, entries);
  const recipe = catalog.recipes.find(
    (recipe) => recipe.id === source?.recipeId,
  );
  const available = entries.filter(
    (item): item is CookingEntry =>
      item.kind === "cook" &&
      item.id !== entry.id &&
      mealOrder(item) < mealOrder(draft) &&
      (spareServings(item, entries, entry.id) > 0 ||
        (draft.kind === "leftovers" && draft.sourceId === item.id)),
  );
  const patch = (
    values: Partial<Pick<PlanEntry, "date" | "slot" | "servings">>,
  ) => setDraft((draft) => ({ ...draft, ...values }));
  const changeKind = (kind: PlanEntry["kind"]) => {
    if (kind === draft.kind) return;
    if (kind === "cook" && !recipe && !catalog.recipes.length) return;
    if (kind === "cook")
      setDraft({
        ...newEntry(draft.date, recipe ?? catalog.recipes[0]),
        id: draft.id,
        slot: draft.slot,
        servings: draft.servings,
        cookServings: Math.max(
          draft.servings,
          recipe?.variants[0].servings ?? draft.servings,
        ),
      });
    else
      setDraft({
        id: draft.id,
        date: draft.date,
        slot: draft.slot,
        servings: draft.servings,
        kind: "leftovers",
        sourceId: available[0]?.id ?? "",
      });
    setError("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = planEntrySchema.safeParse(draft);
    if (!result.success) {
      setError("Выберите блюдо и укажите целое количество порций от 1 до 30.");
      return;
    }
    if (
      draft.kind === "cook" &&
      (!recipe ||
        !recipe.variants.some((variant) => variant.id === draft.variantId))
    ) {
      setError("Выберите доступный рецепт и способ приготовления.");
      return;
    }
    setError("");
    onSave(result.data);
  };
  return (
    <form className="plan-editor" onSubmit={submit} aria-label="Блюдо в плане">
      <div className="section-heading">
        <h2>
          {entries.some((item) => item.id === entry.id)
            ? "Изменить блюдо"
            : "Добавить блюдо"}
        </h2>
        <button
          type="button"
          className="icon-button"
          title="Закрыть"
          aria-label="Закрыть редактор плана"
          onClick={onCancel}
        >
          <X size={19} />
        </button>
      </div>
      <div className="plan-form-grid">
        <label className="field">
          Дата
          <input
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            value={draft.date}
            onChange={(event) => patch({ date: event.target.value })}
          />
        </label>
        <label className="field">
          Приём пищи
          <select
            aria-label="Приём пищи"
            value={draft.slot}
            onChange={(event) =>
              patch({ slot: event.target.value as PlanEntry["slot"] })
            }
          >
            {mealSlots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="plan-kind wide">
          <legend className="sr-only">Источник блюда</legend>
          <label className={draft.kind === "cook" ? "selected" : ""}>
            <input
              type="radio"
              name="meal-kind"
              checked={draft.kind === "cook"}
              onChange={() => changeKind("cook")}
            />
            <CookingPot size={17} />
            Приготовить
          </label>
          <label className={draft.kind === "leftovers" ? "selected" : ""}>
            <input
              type="radio"
              name="meal-kind"
              checked={draft.kind === "leftovers"}
              onChange={() => changeKind("leftovers")}
            />
            <Refrigerator size={17} />
            Остатки
          </label>
        </fieldset>
        {draft.kind === "cook" ? (
          <>
            <label className="field wide">
              Блюдо
              <select
                aria-label="Блюдо"
                required
                value={draft.recipeId}
                onChange={(event) => {
                  const recipe = catalog.recipes.find(
                    (recipe) => recipe.id === event.target.value,
                  )!;
                  setDraft({
                    ...draft,
                    recipeId: recipe.id,
                    variantId: recipe.variants[0].id,
                  });
                }}
              >
                <option value="" disabled>
                  Выберите рецепт
                </option>
                {!recipe && (
                  <option value={draft.recipeId} disabled>
                    Рецепт недоступен
                  </option>
                )}
                {catalog.recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field wide">
              Способ приготовления
              <select
                aria-label="Способ приготовления"
                required
                value={draft.variantId}
                onChange={(event) =>
                  setDraft({ ...draft, variantId: event.target.value })
                }
              >
                {!recipe?.variants.some(
                  (variant) => variant.id === draft.variantId,
                ) && (
                  <option value={draft.variantId} disabled>
                    Выберите способ приготовления
                  </option>
                )}
                {recipe?.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="field wide">
            От какого приготовления
            <select
              aria-label="От какого приготовления"
              required
              value={draft.sourceId}
              onChange={(event) =>
                setDraft({ ...draft, sourceId: event.target.value })
              }
            >
              <option value="">Выберите готовку с запасом</option>
              {available.map((source) => (
                <option key={source.id} value={source.id}>
                  {catalog.recipes.find(
                    (recipe) => recipe.id === source.recipeId,
                  )?.title ?? "Недоступный рецепт"}{" "}
                  · {dateLabel(source.date, { day: "numeric", month: "short" })}{" "}
                  · {spareServings(source, entries, entry.id)} порц.
                </option>
              ))}
            </select>
            {!available.length && (
              <span className="field-hint">
                Нет свободных порций от более ранних приготовлений.
              </span>
            )}
          </label>
        )}
        <label className="field">
          Порций на этот приём
          <input
            type="number"
            required
            min={1}
            max={30}
            step={1}
            value={draft.servings || ""}
            onChange={(event) =>
              patch({ servings: Number(event.target.value) })
            }
          />
        </label>
        {draft.kind === "cook" && (
          <label className="field">
            Приготовить порций
            <input
              type="number"
              required
              min={draft.servings || 1}
              max={30}
              step={1}
              value={draft.cookServings || ""}
              onChange={(event) =>
                setDraft({ ...draft, cookServings: Number(event.target.value) })
              }
            />
          </label>
        )}
      </div>
      {recipe && (
        <div className="plan-selected-recipe">
          <img src={recipe.image} alt="" width={72} height={56} />
          <div>
            <strong>{recipe.title}</strong>
            <Link className="text-button" href={`/recipes/${recipe.slug}`}>
              Открыть рецепт <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
      {draft.kind === "leftovers" &&
        storageWarning(draft, entries, catalog.recipes) && (
          <p className="plan-warning">
            {storageWarning(draft, entries, catalog.recipes)}
          </p>
        )}
      {(error || validationError) && (
        <p className="form-error" role="alert">
          {error || validationError}
        </p>
      )}
      <div className="plan-editor-actions">
        <button className="button primary">
          <Check size={17} />
          Сохранить в план
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

const amountKey = (amount: { ingredientId: string; unit: string }) =>
  `${amount.ingredientId}:${amount.unit === "кг" ? "г" : amount.unit === "л" ? "мл" : amount.unit}`;
function PlanShoppingPreview({
  sources,
  catalog,
  pantry,
  updating,
  onCancel,
  onSave,
}: {
  sources: ShoppingSource[];
  catalog: Catalog;
  pantry: string[];
  updating: boolean;
  onCancel: () => void;
  onSave: (sources: ShoppingSource[]) => void;
}) {
  const rows = shoppingRows(
    {
      ...emptyShopping,
      sources: sources.map((source) => ({
        ...source,
        items: [...source.items, ...(source.homeItems ?? [])],
      })),
    },
    catalog.ingredients,
  );
  const [selection, setSelection] = useState(
    () => new Set(sources.flatMap((source) => source.items.map(amountKey))),
  );
  const selectedCount = rows.filter((row) => selection.has(row.key)).length;
  return (
    <section className="plan-shopping-preview" aria-label="Покупки из плана">
      <div className="section-heading">
        <h2>
          Покупки на{" "}
          {sources.length
            ? `${dateLabel(sources.map((source) => source.planDate!).sort()[0], { day: "numeric", month: "short" })}${sources.length > 1 ? " и следующие дни" : ""}`
            : "выбранные дни"}
        </h2>
        <button
          className="icon-button"
          title="Закрыть"
          aria-label="Закрыть покупки из плана"
          onClick={onCancel}
        >
          <X size={19} />
        </button>
      </div>
      {rows.length ? (
        <ul className="plan-shopping-list">
          {rows.map((row) => (
            <li key={row.key}>
              <label>
                <input
                  type="checkbox"
                  checked={selection.has(row.key)}
                  onChange={() =>
                    setSelection((current) => {
                      const next = new Set(current);
                      if (next.has(row.key)) next.delete(row.key);
                      else next.add(row.key);
                      return next;
                    })
                  }
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {pantry.includes(row.ingredientId)
                      ? "Есть дома"
                      : row.sources.join(" · ")}
                  </small>
                </span>
                <span className="amount">
                  {quantityText(row.quantity, row.unit)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">
          На выбранные дни новые приготовления не запланированы.
        </p>
      )}
      <div className="plan-editor-actions">
        <button
          className="button primary"
          onClick={() =>
            onSave(
              sources.map((source) => {
                const amounts = [...source.items, ...(source.homeItems ?? [])];
                return {
                  ...source,
                  items: amounts.filter((amount) =>
                    selection.has(amountKey(amount)),
                  ),
                  homeItems: amounts.filter(
                    (amount) =>
                      pantry.includes(amount.ingredientId) &&
                      !selection.has(amountKey(amount)),
                  ),
                };
              }),
            )
          }
        >
          <ShoppingBag size={17} />
          {updating ? "Обновить покупки" : "Добавить в покупки"}
          {selectedCount > 0 ? ` · ${selectedCount}` : ""}
        </button>
        <button className="text-button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </section>
  );
}
