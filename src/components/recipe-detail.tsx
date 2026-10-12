"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Heart,
  Clock,
  Check,
  Minus,
  Plus,
  ShoppingBag,
  ChefHat,
  ArrowRight,
  X,
  CalendarDays,
} from "lucide-react";
import type { Ingredient, Recipe } from "@/domain/recipe";
import {
  addShoppingSource,
  missingIngredients,
  quantityText,
  scaledIngredients,
} from "@/domain/cooking";
import { useHousehold, useShopping } from "./household";
import { IngredientPhoto } from "./ingredient-photo";
import { RecipeStorage } from "./recipe-storage";
import { RecipeNutrition } from "./recipe-nutrition";
import { RecipeShare } from "./recipe-share";
import { isBasicIngredient, togglePantryItem } from "@/domain/pantry";
import { RecipeCard } from "./catalog";
export function RecipeDetail({
  recipe,
  ingredients,
  initialVariant,
  related = [],
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  initialVariant?: string;
  related?: Recipe[];
}) {
  const { state, pantry, setState, toast } = useHousehold();
  const [shopping, setShopping] = useShopping();
  const [variantId, setVariantId] = useState(
    initialVariant ?? recipe.variants[0].id,
  );
  const variant =
    recipe.variants.find((v) => v.id === variantId) ?? recipe.variants[0];
  const [servings, setServings] = useState(variant.servings),
    [preview, setPreview] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [cooking, setCooking] = useState(false),
    [step, setStep] = useState(0);
  const amounts = scaledIngredients(variant, servings),
    favorite = state.favorites.includes(recipe.id),
    existing = shopping.sources.find((s) => s.key === recipe.id);
  useEffect(() => {
    setSelection(
      missingIngredients(variant, pantry).map((i) => i.ingredientId),
    );
    setPreview(false);
    setStep(0);
  }, [variant, pantry]);
  useEffect(() => {
    if (!cooking || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (!active) await next.release();
        else lock = next;
      } catch {}
    };
    const visible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visible);
      void lock?.release();
    };
  }, [cooking]);
  const changeVariant = (id: string) => {
    const next = recipe.variants.find((v) => v.id === id)!;
    setVariantId(id);
    setServings(next.servings);
    setCooking(false);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", id);
    window.history.replaceState(null, "", url);
  };
  const add = () => {
    setShopping((s) =>
      addShoppingSource(s, {
        key: recipe.id,
        recipeId: recipe.id,
        title: recipe.title,
        variantId: variant.id,
        variantName: variant.name,
        servings,
        items: amounts.filter((a) => selection.includes(a.ingredientId)),
        homeItems: amounts.filter(
          (a) =>
            pantry.includes(a.ingredientId) &&
            a.ingredientId !== "water" &&
            !selection.includes(a.ingredientId),
        ),
        image: recipe.image,
      }),
    );
    setPreview(false);
    toast(
      existing
        ? "Покупки для этого блюда обновлены"
        : "Продукты добавлены в покупки",
    );
  };
  return (
    <>
      <div className="detail-navigation">
        <button
          className="text-button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign("/");
          }}
        >
          <ArrowLeft size={18} />К рецептам
        </button>
        <div className="detail-actions">
          <RecipeShare
            recipe={recipe}
            variant={variant}
            ingredients={ingredients}
            servings={servings}
          />
          <Link
            className="button light"
            href={`/plan?recipe=${recipe.id}&variant=${variant.id}`}
          >
            <CalendarDays size={18} />В план
          </Link>
          <button
            className={`button light ${favorite ? "saved" : ""}`}
            aria-pressed={favorite}
            onClick={() =>
              setState((s) => ({
                ...s,
                favorites: favorite
                  ? s.favorites.filter((id) => id !== recipe.id)
                  : [...s.favorites, recipe.id],
              }))
            }
          >
            <Heart size={18} fill={favorite ? "currentColor" : "none"} />
            {favorite ? "Сохранено" : "Сохранить"}
          </button>
        </div>
      </div>
      <div className="detail-layout">
        <div className="recipe-main">
          <div className="detail-photo">
            <img
              src={recipe.image}
              alt={recipe.title}
              width="900"
              height="600"
            />
            <span>Иллюстрация блюда</span>
          </div>
          <header className="detail-heading">
            <h1>{recipe.title}</h1>
            <p>{recipe.description}</p>
            {recipe.tested !== undefined && (
              <p className="recipe-quality">
                {recipe.tested
                  ? "Проверен приготовлением"
                  : "Ещё не проверен приготовлением"}
              </p>
            )}
            <div className="recipe-meta">
              <span>
                <Clock size={17} />
                {variant.prepMinutes + variant.cookMinutes} мин
              </span>
              <span>
                Подготовка {variant.prepMinutes} мин ·{" "}
                {variant.equipment.includes("none") ? "ожидание" : "готовка"}{" "}
                {variant.cookMinutes} мин
              </span>
            </div>
            <RecipeStorage storage={recipe.storage} />
            <RecipeNutrition nutrition={recipe.nutrition} />
          </header>
          <section className="method-section">
            <h2>Как будем готовить?</h2>
            <div className="chips">
              {recipe.variants.map((v) => (
                <button
                  key={v.id}
                  className={`chip ${variant.id === v.id ? "selected" : ""}`}
                  aria-pressed={variant.id === v.id}
                  onClick={() => changeVariant(v.id)}
                >
                  {variant.id === v.id && <Check size={15} />} {v.name}
                </button>
              ))}
            </div>
            {variant.note && <p className="method-note">{variant.note}</p>}
          </section>
          <section className="steps-section">
            <div className="section-heading">
              <h2>Готовим по шагам</h2>
              <button
                className={`button light ${cooking ? "pressed" : ""}`}
                onClick={() => {
                  setCooking(!cooking);
                  setStep(0);
                }}
              >
                {cooking ? <X size={17} /> : <ChefHat size={17} />}{" "}
                {cooking ? "Все шаги" : "Режим готовки"}
              </button>
            </div>
            {cooking ? (
              <div className="cook-mode">
                <span className="quiet">
                  Шаг {step + 1} из {variant.steps.length}
                </span>
                <h3>{variant.steps[step].title}</h3>
                <p>{variant.steps[step].text}</p>
                {variant.steps[step].minutes && (
                  <span className="recipe-meta">
                    <Clock size={16} />
                    {variant.steps[step].minutes} мин
                  </span>
                )}
                <div className="cook-actions">
                  <button
                    className="button light"
                    disabled={step === 0}
                    onClick={() => setStep(step - 1)}
                  >
                    Назад
                  </button>
                  {step < variant.steps.length - 1 ? (
                    <button
                      className="button primary"
                      onClick={() => setStep(step + 1)}
                    >
                      Следующий шаг
                      <ArrowRight size={17} />
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => {
                        setCooking(false);
                        toast("Приятного аппетита!");
                      }}
                    >
                      Готово
                      <Check size={17} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <ol className="step-list">
                {variant.steps.map((s, i) => (
                  <li key={`${variant.id}-${i}`}>
                    <span className="step-number">{i + 1}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                      {s.minutes && (
                        <span className="step-time">
                          <Clock size={14} />
                          {s.minutes} мин
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="content-note">
            {recipe.origin === "ai"
              ? "Рецепт подготовлен с помощью ИИ. Семейные замечания после приготовления помогут его уточнить."
              : "Рецепт из семейной коллекции."}{" "}
            Изображение — иллюстрация. При изменении порций время приготовления
            остаётся ориентировочным.
          </p>
        </div>
        <aside className="ingredients-panel">
          <div className="ingredients-title">
            <h2>Ингредиенты</h2>
            <div className="serving-stepper">
              <button
                aria-label="Уменьшить порции"
                disabled={servings <= 1}
                onClick={() => setServings(servings - 1)}
              >
                <Minus size={15} />
              </button>
              <span>{servings} порц.</span>
              <button
                aria-label="Увеличить порции"
                disabled={servings >= 12}
                onClick={() => setServings(servings + 1)}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <p className="field-hint">Отмечайте продукты, которые есть дома.</p>
          <ul className="ingredient-list">
            {amounts.map((a) => {
              const ingredient = ingredients.find(
                (i) => i.id === a.ingredientId,
              );
              const have = pantry.includes(a.ingredientId);
              return (
                <li key={a.ingredientId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={have}
                      disabled={a.ingredientId === "water"}
                      onChange={() =>
                        setState((s) => togglePantryItem(s, a.ingredientId))
                      }
                    />
                    <IngredientPhoto id={a.ingredientId} />
                    <span className="ingredient-name">
                      <strong>{ingredient?.name ?? a.ingredientId}</strong>
                      <small
                        className={`ingredient-state ${have ? "at-home" : "to-buy"}`}
                      >
                        {have
                          ? isBasicIngredient(a.ingredientId)
                            ? "Базовый продукт"
                            : "Есть дома"
                          : a.optional
                            ? "По желанию"
                            : "Купить"}
                      </small>
                      {a.note && <small>{a.note}</small>}
                    </span>
                    <span className="amount">
                      {quantityText(a.quantity, a.unit)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {preview ? (
            <div className="shopping-preview">
              <h3>Что добавим в покупки?</h3>
              <p className="field-hint">
                Проверьте количество: отметка «дома» не учитывает остаток.
              </p>
              {amounts
                .filter((a) => a.ingredientId !== "water")
                .map((a) => (
                  <label key={a.ingredientId} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selection.includes(a.ingredientId)}
                      onChange={() =>
                        setSelection((s) =>
                          s.includes(a.ingredientId)
                            ? s.filter((id) => id !== a.ingredientId)
                            : [...s, a.ingredientId],
                        )
                      }
                    />
                    <span>
                      {ingredients.find((i) => i.id === a.ingredientId)?.name}
                      <small>{quantityText(a.quantity, a.unit)}</small>
                    </span>
                  </label>
                ))}
              {existing && (
                <p className="field-hint">
                  Это блюдо уже в списке. Его ингредиенты будут обновлены.
                </p>
              )}
              <button
                className="button primary full"
                disabled={!selection.length}
                onClick={add}
              >
                <ShoppingBag size={18} />
                {existing
                  ? "Обновить покупки"
                  : `Добавить в покупки · ${selection.length}`}
              </button>
              <button
                className="text-button full"
                onClick={() => setPreview(false)}
              >
                Отмена
              </button>
            </div>
          ) : (
            <>
              <button
                className="button primary full"
                onClick={() => setPreview(true)}
              >
                <ShoppingBag size={18} />
                {existing ? "Проверить покупки" : "Составить список покупок"}
              </button>
              <Link className="text-button full" href="/shopping">
                Открыть покупки
                <ArrowRight size={15} />
              </Link>
            </>
          )}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="related-recipes" aria-labelledby="related-heading">
          <div className="section-heading">
            <h2 id="related-heading">Попробуйте ещё</h2>
          </div>
          <div className="recipe-grid">
            {related.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                catalog={{ recipes: related, ingredients }}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
