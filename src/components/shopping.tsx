"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Check,
  Plus,
  ShoppingBag,
  Trash2,
  Pencil,
  X,
  ArrowRight,
} from "lucide-react";
import type { Ingredient } from "@/domain/recipe";
import { units } from "@/domain/recipe";
import { dateLabel } from "@/domain/meal-plan";
import {
  emptyShopping,
  removeShoppingSource,
  shoppingRows,
  quantityText,
  plural,
  type ShoppingRow,
} from "@/domain/cooking";
import { useHousehold, useShopping } from "./household";
export function Shopping({ ingredients }: { ingredients: Ingredient[] }) {
  const { toast } = useHousehold();
  const [shopping, setShopping] = useShopping();
  const [adding, setAdding] = useState(false),
    [edit, setEdit] = useState<string | null>(null);
  const rows = shoppingRows(shopping, ingredients),
    remaining = rows.filter((r) => !shopping.checked.includes(r.key)).length;
  const groups = [...new Set(rows.map((r) => r.group))];
  const homeRows = shoppingRows(
    {
      ...emptyShopping,
      sources: shopping.sources.map((s) => ({
        ...s,
        items: s.homeItems ?? [],
      })),
    },
    ingredients,
  );
  const removeSource = (key: string) =>
    setShopping((s) => removeShoppingSource(s, key));
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Список покупок</h1>
          <p>
            {rows.length
              ? `Осталось купить ${remaining} ${plural(remaining, ["продукт", "продукта", "продуктов"])}. Всё под рукой в магазине.`
              : "Соберём всё, чего не хватает для вкусного."}
          </p>
        </div>
        <button className="button primary" onClick={() => setAdding(!adding)}>
          <Plus size={18} />
          Добавить продукт
        </button>
      </header>
      {shopping.sources.length > 0 && (
        <div className="shopping-sources">
          {shopping.sources.map((s) => (
            <div className="source-pill" key={s.key}>
              {s.image && <img src={s.image} alt="" width={88} height={88} />}
              <Link href={`/recipes/${s.recipeId}?variant=${s.variantId}`}>
                <strong>{s.title}</strong>
                <small>
                  {s.servings} порц. · {s.variantName}
                  {s.planDate &&
                    ` · ${dateLabel(s.planDate, { day: "numeric", month: "short" })}`}
                </small>
                <span className="source-open">
                  Открыть рецепт <ArrowRight size={14} />
                </span>
              </Link>
              <button
                aria-label={`Убрать покупки для ${s.title}`}
                onClick={() => removeSource(s.key)}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {adding && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const name = String(data.get("name")).trim(),
              unit = String(data.get("unit")),
              quantity =
                unit === "по вкусу" ? null : Number(data.get("quantity"));
            if (!name || (unit !== "по вкусу" && (!quantity || quantity < 0)))
              return;
            const known = ingredients.find(
              (i) =>
                i.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
            );
            const key = `manual:${crypto.randomUUID()}`;
            setShopping((s) => ({
              ...s,
              manual: [
                ...s.manual,
                {
                  key,
                  ingredientId: known?.id ?? key,
                  name,
                  quantity,
                  unit,
                  group: known?.group ?? "Другое",
                  sources: [],
                },
              ],
            }));
            setAdding(false);
            toast("Продукт добавлен");
          }}
        >
          <label className="field">
            Продукт
            <input
              name="name"
              required
              maxLength={100}
              list="known-ingredients"
              placeholder="Например, хлеб"
              autoFocus
            />
          </label>
          <datalist id="known-ingredients">
            {ingredients.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <label className="field">
            Количество
            <input
              type="number"
              name="quantity"
              min="0.001"
              step="any"
              defaultValue="1"
            />
          </label>
          <label className="field">
            Единица
            <select name="unit" defaultValue="шт.">
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <button className="button primary">Добавить</button>
          <button
            type="button"
            className="text-button"
            onClick={() => setAdding(false)}
          >
            Отмена
          </button>
        </form>
      )}
      {!rows.length ? (
        <div className="empty-state">
          <ShoppingBag size={48} strokeWidth={1.2} />
          <h2>Пока ничего покупать не нужно</h2>
          <p>
            Выберите рецепт и добавьте недостающие ингредиенты.
            <br />
            Или запишите что-нибудь вручную.
          </p>
          <Link className="button primary" href="/">
            Выбрать блюдо
          </Link>
        </div>
      ) : (
        <>
          <div className="shopping-groups">
            {groups.map((group) => (
              <section key={group}>
                <h2>{group}</h2>
                <ul className="shopping-list">
                  {rows
                    .filter((r) => r.group === group)
                    .map((row) => {
                      const checked = shopping.checked.includes(row.key);
                      return (
                        <li key={row.key} className={checked ? "checked" : ""}>
                          <div className="shopping-row">
                            <label className="shopping-label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setShopping((s) => ({
                                    ...s,
                                    checked: checked
                                      ? s.checked.filter((k) => k !== row.key)
                                      : [...s.checked, row.key],
                                  }))
                                }
                              />
                              <span>
                                <strong>{row.name}</strong>
                                {row.sources.length > 0 && (
                                  <small>{row.sources.join(" · ")}</small>
                                )}
                              </span>
                            </label>
                            <span className="amount">
                              {quantityText(row.quantity, row.unit)}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Изменить количество: ${row.name}`}
                              onClick={() =>
                                setEdit(edit === row.key ? null : row.key)
                              }
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Удалить: ${row.name}`}
                              onClick={() =>
                                setShopping((s) => ({
                                  ...s,
                                  hidden: [...s.hidden, row.key],
                                }))
                              }
                            >
                              <X size={17} />
                            </button>
                          </div>
                          {edit === row.key && (
                            <QuantityEditor
                              row={row}
                              onCancel={() => setEdit(null)}
                              onSave={(quantity, unit) => {
                                setShopping((s) => ({
                                  ...s,
                                  overrides: {
                                    ...s.overrides,
                                    [row.key]: { quantity, unit },
                                  },
                                }));
                                setEdit(null);
                              }}
                            />
                          )}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
          <div className="shopping-bottom">
            <span className="quiet">
              <Check size={16} />
              Отмечайте продукты по мере покупки
            </span>
            <div>
              {shopping.checked.length > 0 && (
                <button
                  className="text-button"
                  onClick={() =>
                    setShopping((s) => ({
                      ...s,
                      hidden: [...new Set([...s.hidden, ...s.checked])],
                      checked: [],
                    }))
                  }
                >
                  Убрать купленное
                </button>
              )}
              <button
                className="text-button danger"
                onClick={() => {
                  if (confirm("Очистить весь список покупок?"))
                    setShopping(emptyShopping);
                }}
              >
                <Trash2 size={15} />
                Очистить список
              </button>
            </div>
          </div>
        </>
      )}
      {homeRows.length > 0 && (
        <section className="home-summary">
          <h2>Уже есть дома</h2>
          <p className="field-hint">
            Отмечено при составлении списка. Эти продукты не добавлены в покупки
            из указанных блюд.
          </p>
          <ul className="shopping-list">
            {homeRows.map((row) => (
              <li key={row.key} className="home-row">
                <Check size={20} />
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.sources.join(" · ")}</small>
                </span>
                <span className="amount">
                  {quantityText(row.quantity, row.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="content-note">
        Список сохраняется на этом устройстве. На другом телефоне или компьютере
        будет свой список.
      </p>
    </>
  );
}
function QuantityEditor({
  row,
  onSave,
  onCancel,
}: {
  row: ShoppingRow;
  onSave: (q: number | null, u: string) => void;
  onCancel: () => void;
}) {
  const [unit, setUnit] = useState(row.unit);
  return (
    <form
      className="quantity-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const q = unit === "по вкусу" ? null : Number(form.get("quantity"));
        if (q !== null && q <= 0) return;
        onSave(q, unit);
      }}
    >
      <label className="field">
        Количество
        <input
          aria-label={`Новое количество: ${row.name}`}
          name="quantity"
          type="number"
          min="0.001"
          step="any"
          defaultValue={row.quantity ?? 1}
          disabled={unit === "по вкусу"}
        />
      </label>
      <label className="field">
        Единица
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <button className="button primary">Сохранить</button>
      <button className="text-button" type="button" onClick={onCancel}>
        Отмена
      </button>
      <p className="field-hint">
        При смене единицы укажите новое количество самостоятельно.
      </p>
    </form>
  );
}
