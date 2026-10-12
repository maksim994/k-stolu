"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Check, ArrowRight, Carrot } from "lucide-react";
import type { Ingredient } from "@/domain/recipe";
import { useHousehold } from "./household";
import { isBasicIngredient, togglePantryItem } from "@/domain/pantry";
export function Pantry({ ingredients }: { ingredients: Ingredient[] }) {
  const { state, pantry, setState } = useHousehold();
  const [query, setQuery] = useState("");
  const regular = ingredients.filter((i) => !isBasicIngredient(i.id));
  const selectedCount = regular.filter((i) =>
    state.pantry.includes(i.id),
  ).length;
  const groups = [...new Set(regular.map((i) => i.group))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const filtered = regular.filter((i) =>
    [i.name, ...i.aliases].some((n) =>
      n.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")),
    ),
  );
  const toggle = (id: string) => setState((s) => togglePantryItem(s, id));
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Что есть дома?</h1>
          <p>Отметьте продукты — подскажем, что из них приготовить.</p>
        </div>
        <Link className="button primary" href="/?sort=match">
          Подобрать рецепты
          <ArrowRight size={18} />
        </Link>
      </header>
      <div className="pantry-intro">
        <Carrot size={22} />
        <p>
          Пока учитываем наличие, а не количество. Покупки и продукты
          сохраняются только в этом браузере.
        </p>
      </div>
      <div className="pantry-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Найти продукт"
            placeholder="Например, картофель"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="quiet">Отмечено: {selectedCount}</span>
        {selectedCount > 0 && (
          <button
            className="text-button"
            onClick={() => setState((s) => ({ ...s, pantry: [] }))}
          >
            Снять все отметки
          </button>
        )}
      </div>
      <details className="pantry-basics">
        <summary>
          Базовые продукты
          {state.unavailableBasics.length > 0
            ? ` · закончились: ${state.unavailableBasics.length}`
            : " · есть по умолчанию"}
        </summary>
        <p className="field-hint">
          Вода не входит в покупки. Соль, сахар и масло считаем имеющимися дома;
          снимите отметку, если что-то закончилось.
        </p>
        <div className="pantry-grid">
          {ingredients
            .filter((i) => isBasicIngredient(i.id) && i.id !== "water")
            .map((i) => (
              <label className="checkbox-label" key={i.id}>
                <input
                  type="checkbox"
                  checked={pantry.includes(i.id)}
                  onChange={() => toggle(i.id)}
                />
                {i.name}
              </label>
            ))}
        </div>
      </details>
      {groups.map((group) => {
        const items = filtered.filter((i) => i.group === group);
        if (!items.length) return null;
        return (
          <section className="pantry-group" key={group}>
            <h2>{group}</h2>
            <div className="pantry-grid">
              {items.map((i) => {
                const selected = state.pantry.includes(i.id);
                return (
                  <button
                    key={i.id}
                    className={`pantry-item ${selected ? "selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => toggle(i.id)}
                  >
                    <span>{i.name}</span>
                    <span className="check-square">
                      {selected && <Check size={16} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!filtered.length && (
        <div className="empty-state">
          <h2>Такого продукта пока нет</h2>
          <p>
            Попробуйте другое название. Новые продукты можно добавить через
            импорт в админке.
          </p>
        </div>
      )}
    </>
  );
}
