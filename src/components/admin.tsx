"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  ArrowLeft,
  Save,
  LogOut,
  Upload,
  Download,
  Trash2,
  Eye,
  LockKeyhole,
} from "lucide-react";
import {
  categories,
  equipment,
  units,
  families,
  type Recipe,
  type Catalog,
  type Variant,
} from "@/domain/recipe";
import { RecipeStorage } from "./recipe-storage";
import { RecipeNutrition } from "./recipe-nutrition";
import { CollectionManager } from "./collection-manager";
type AdminCatalog = Catalog & { version: 1 };
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Не удалось выполнить действие");
  return data;
}
export function Admin() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [catalog, setCatalog] = useState<AdminCatalog | null>(null),
    [editing, setEditing] = useState<Recipe | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [importText, setImportText] = useState("");
  const load = async () => {
    const data = await request("/api/admin/catalog");
    setCatalog(data);
  };
  useEffect(() => {
    void request("/api/admin/session")
      .then(async (s) => {
        setAuthenticated(s.authenticated);
        if (s.authenticated) await load();
      })
      .catch((e) => setError(e.message));
  }, []);
  const execute = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  };
  const login = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password");
    void execute(async () => {
      await request("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setAuthenticated(true);
      await load();
    });
  };
  if (authenticated === null)
    return (
      <div className="empty-state">
        <h1>Управление рецептами</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Попробовать снова
            </button>
          </>
        ) : (
          <p>Проверяем вход…</p>
        )}
      </div>
    );
  if (!authenticated)
    return (
      <div className="login-panel">
        <LockKeyhole size={32} strokeWidth={1.4} />
        <h1>Вход в админку</h1>
        <p>Здесь живут ваши рецепты и новые идеи.</p>
        <form onSubmit={login}>
          <label className="field">
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
        <Link className="text-button" href="/">
          Вернуться к рецептам
        </Link>
      </div>
    );
  const save = (recipe: Recipe) =>
    void execute(async () => {
      await request("/api/admin/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      await load();
      setEditing(null);
      setMessage("Рецепт сохранён");
    });
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Ваша книга рецептов</h1>
          <p>Добавляйте, уточняйте, сохраняйте любимое.</p>
        </div>
        <button
          className="button light"
          onClick={() =>
            void execute(async () => {
              await request("/api/admin/session", { method: "DELETE" });
              setAuthenticated(false);
              setCatalog(null);
            })
          }
        >
          <LogOut size={17} />
          Выйти
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {!catalog ? (
        <button className="button primary" onClick={() => void execute(load)}>
          Загрузить рецепты
        </button>
      ) : editing ? (
        <RecipeEditor
          key={editing.id}
          recipe={editing}
          catalog={catalog}
          busy={busy}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <CollectionManager catalog={catalog} onChanged={load} />
          <div className="admin-toolbar">
            <button
              className="button primary"
              onClick={() => setEditing(newRecipe(catalog))}
            >
              <Plus size={18} />
              Новый рецепт
            </button>
            <a className="button light" href="/api/admin/catalog?download=1">
              <Download size={17} />
              Экспорт JSON
            </a>
          </div>
          <div className="admin-recipes">
            {catalog.recipes.map((r) => (
              <button key={r.id} onClick={() => setEditing(structuredClone(r))}>
                <img src={r.image} alt="" width="72" height="48" />
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {categories.find((c) => c.id === r.category)?.name} ·{" "}
                    {r.variants.length} вар.
                  </small>
                </span>
                <span className={`status-badge ${r.status}`}>
                  {r.status === "published"
                    ? "Опубликован"
                    : r.status === "draft"
                      ? "Черновик"
                      : "Архив"}
                </span>
              </button>
            ))}
          </div>
          <details className="admin-import">
            <summary>Импорт рецептов, подборок и справочника</summary>
            <p className="field-hint">
              Формат version: 1. Экспортируйте текущую базу как пример. Импорт
              обновляет совпадающие id и не удаляет остальные записи.
            </p>
            <label className="field">
              Файл JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000) {
                    setError("Файл должен быть меньше 2 МБ");
                    return;
                  }
                  setImportText(await file.text());
                }}
              />
            </label>
            <label className="field">
              Или вставьте JSON
              <textarea
                rows={8}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !importText.trim()}
              onClick={() =>
                void execute(async () => {
                  let payload;
                  try {
                    payload = JSON.parse(importText);
                  } catch {
                    throw new Error("Проверьте синтаксис JSON");
                  }
                  const result = await request("/api/admin/catalog", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  await load();
                  setImportText("");
                  setMessage(`Импортировано рецептов: ${result.count}`);
                })
              }
            >
              <Upload size={16} />
              {busy ? "Импортируем…" : "Проверить и импортировать"}
            </button>
          </details>
        </>
      )}
    </>
  );
}
function newVariant(catalog: Catalog): Variant {
  return {
    id: `variant-${crypto.randomUUID().slice(0, 8)}`,
    name: "На плите",
    equipment: ["stove"],
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 20,
    note: "",
    ingredients: [
      {
        ingredientId: catalog.ingredients[0].id,
        quantity: 100,
        unit: "г",
        optional: false,
        note: "",
      },
    ],
    steps: [
      { title: "Подготовьте продукты", text: "Опишите, что нужно сделать." },
    ],
  };
}
function newRecipe(catalog: Catalog): Recipe {
  const id = `recipe-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    slug: id,
    title: "Новый рецепт",
    description: "",
    category: "main",
    image: "/images/recipes/chicken-potatoes.webp",
    status: "draft",
    origin: "family",
    variants: [newVariant(catalog)],
  };
}
function RecipeEditor({
  recipe,
  catalog,
  busy,
  onSave,
  onCancel,
}: {
  recipe: Recipe;
  catalog: Catalog;
  busy: boolean;
  onSave: (r: Recipe) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(recipe),
    [variantIndex, setVariantIndex] = useState(0),
    [uploadError, setUploadError] = useState(""),
    [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState(false);
  const variant = draft.variants[variantIndex];
  const patch = (values: Partial<Recipe>) =>
    setDraft((d) => ({ ...d, ...values }));
  const patchStorage = (values: Partial<NonNullable<Recipe["storage"]>>) =>
    setDraft((d) => ({
      ...d,
      storage: {
        fridgeDays: null,
        freezable: null,
        note: "",
        ...d.storage,
        ...values,
      },
    }));
  const patchNutrition = (values: Partial<NonNullable<Recipe["nutrition"]>>) =>
    setDraft((d) => ({
      ...d,
      nutrition: {
        weightManagement: false,
        rationale: "",
        tips: [],
        ...d.nutrition,
        ...values,
      },
    }));
  const patchVariant = (values: Partial<Variant>) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, i) =>
        i === variantIndex ? { ...v, ...values } : v,
      ),
    }));
  return (
    <form
      className="recipe-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...draft,
          nutrition: draft.nutrition
            ? {
                ...draft.nutrition,
                tips: draft.nutrition.tips
                  .map((tip) => tip.trim())
                  .filter(Boolean),
              }
            : undefined,
        });
      }}
    >
      <button type="button" className="text-button" onClick={onCancel}>
        <ArrowLeft size={16} />
        Все рецепты
      </button>
      <div className="editor-basics">
        <label className="field wide">
          Название
          <input
            required
            maxLength={150}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className="field">
          Категория
          <select
            value={draft.category}
            onChange={(e) =>
              patch({ category: e.target.value as Recipe["category"] })
            }
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Статус
          <select
            value={draft.status}
            onChange={(e) =>
              patch({ status: e.target.value as Recipe["status"] })
            }
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
            <option value="archived">Архив</option>
          </select>
        </label>
        <label className="field wide">
          Описание
          <textarea
            required
            maxLength={1500}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={3}
          />
        </label>
        <label className="field">
          Адрес рецепта (slug)
          <input
            required
            pattern="[a-z0-9][a-z0-9-]{0,79}"
            value={draft.slug}
            onChange={(e) => patch({ slug: e.target.value })}
          />
        </label>
        <label className="field">
          Происхождение
          <select
            value={draft.origin}
            onChange={(e) =>
              patch({ origin: e.target.value as Recipe["origin"] })
            }
          >
            <option value="family">Семейный рецепт</option>
            <option value="ai">Подготовлен с ИИ</option>
          </select>
        </label>
        <label className="field">
          Семейство блюд
          <select
            value={draft.family ?? ""}
            onChange={(e) =>
              patch({
                family: (e.target.value as Recipe["family"]) || undefined,
              })
            }
          >
            <option value="">Не указано</option>
            {families.map((family, index) => (
              <option key={family} value={family}>
                {
                  [
                    "Омлеты",
                    "Сэндвичи",
                    "Вафли",
                    "Каши",
                    "Блины и оладьи",
                    "Творожные блюда",
                  ][index]
                }
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Проверка приготовлением
          <select
            value={
              draft.tested === undefined ? "unknown" : String(draft.tested)
            }
            onChange={(e) =>
              patch({
                tested:
                  e.target.value === "unknown"
                    ? undefined
                    : e.target.value === "true",
              })
            }
          >
            <option value="unknown">Не указано</option>
            <option value="false">Ещё не проверен</option>
            <option value="true">Проверен приготовлением</option>
          </select>
        </label>
        <label className="field wide">
          Изображение
          <input
            value={draft.image}
            onChange={(e) => patch({ image: e.target.value })}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setUploadError("");
              try {
                const form = new FormData();
                form.set("image", file);
                const result = await request("/api/admin/upload", {
                  method: "POST",
                  body: form,
                });
                patch({ image: result.path });
              } catch (error) {
                setUploadError(
                  error instanceof Error
                    ? error.message
                    : "Не удалось загрузить",
                );
              } finally {
                setUploading(false);
              }
            }}
          />
          {uploadError && <span role="alert">{uploadError}</span>}
          {uploading && <span>Загружаем…</span>}
        </label>
      </div>
      <section
        className="editor-storage"
        aria-labelledby="editor-storage-heading"
      >
        <h2 id="editor-storage-heading">Хранение готового блюда</h2>
        <div className="editor-basics">
          <label className="field">
            В холодильнике, дней (примерно)
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={draft.storage?.fridgeDays ?? ""}
              onChange={(e) =>
                patchStorage({
                  fridgeDays:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="field">
            Можно замораживать
            <select
              value={
                draft.storage?.freezable == null
                  ? "unknown"
                  : String(draft.storage.freezable)
              }
              onChange={(e) =>
                patchStorage({
                  freezable:
                    e.target.value === "unknown"
                      ? null
                      : e.target.value === "true",
                })
              }
            >
              <option value="unknown">Не указано</option>
              <option value="true">Да</option>
              <option value="false">Не рекомендуется</option>
            </select>
          </label>
          <label className="field wide">
            Примечание о хранении (необязательно)
            <textarea
              rows={3}
              maxLength={1000}
              value={draft.storage?.note ?? ""}
              onChange={(e) => patchStorage({ note: e.target.value })}
            />
          </label>
        </div>
      </section>
      <section
        className="editor-nutrition"
        aria-labelledby="editor-nutrition-heading"
      >
        <h2 id="editor-nutrition-heading">Питание и баланс</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.nutrition?.weightManagement ?? false}
            onChange={(e) =>
              patchNutrition({ weightManagement: e.target.checked })
            }
          />
          В подборку «Контроль веса»
        </label>
        <label className="field">
          Особенности состава (обязательно для рекомендаций)
          <textarea
            rows={3}
            required={!!draft.nutrition}
            maxLength={600}
            value={draft.nutrition?.rationale ?? ""}
            onChange={(e) => patchNutrition({ rationale: e.target.value })}
          />
        </label>
        <label className="field">
          Советы к блюду (по одному на строку, до 6)
          <textarea
            rows={4}
            maxLength={2400}
            value={draft.nutrition?.tips.join("\n") ?? ""}
            onChange={(e) =>
              patchNutrition({ tips: e.target.value.split("\n") })
            }
          />
        </label>
        {draft.nutrition && (
          <button
            type="button"
            className="text-button"
            onClick={() => patch({ nutrition: undefined })}
          >
            Удалить рекомендации
          </button>
        )}
      </section>
      <section className="editor-variants">
        <h2>Варианты приготовления</h2>
        <div className="chips">
          {draft.variants.map((v, i) => (
            <button
              type="button"
              className={`chip ${i === variantIndex ? "selected" : ""}`}
              key={v.id}
              onClick={() => setVariantIndex(i)}
            >
              {v.name || `Вариант ${i + 1}`}
            </button>
          ))}
          <button
            type="button"
            className="chip"
            disabled={draft.variants.length >= 8}
            onClick={() => {
              setDraft((d) => ({
                ...d,
                variants: [...d.variants, newVariant(catalog)],
              }));
              setVariantIndex(draft.variants.length);
            }}
          >
            <Plus size={15} />
            Добавить
          </button>
        </div>
        <div className="editor-basics">
          <label className="field">
            Название варианта
            <input
              value={variant.name}
              required
              onChange={(e) => patchVariant({ name: e.target.value })}
            />
          </label>
          <label className="field">
            Базовые порции
            <input
              type="number"
              min={1}
              max={30}
              value={variant.servings}
              required
              onChange={(e) =>
                patchVariant({ servings: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Подготовка, мин
            <input
              type="number"
              min={0}
              max={1440}
              value={variant.prepMinutes}
              required
              onChange={(e) =>
                patchVariant({ prepMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            Приготовление, мин
            <input
              type="number"
              min={0}
              max={1440}
              value={variant.cookMinutes}
              required
              onChange={(e) =>
                patchVariant({ cookMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <fieldset>
          <legend>Необходимая техника</legend>
          <div className="chips">
            {equipment.map((d) => (
              <label key={d.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={variant.equipment.includes(d.id)}
                  onChange={() =>
                    patchVariant({
                      equipment: variant.equipment.includes(d.id)
                        ? variant.equipment.filter((x) => x !== d.id)
                        : [...variant.equipment, d.id],
                    })
                  }
                />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          Важные примечания: режим, посуда, партии
          <textarea
            rows={2}
            value={variant.note}
            onChange={(e) => patchVariant({ note: e.target.value })}
          />
        </label>
        <h3>Ингредиенты</h3>
        {variant.ingredients.map((a, index) => (
          <div className="editor-ingredient" key={index}>
            <label className="field">
              Продукт
              <select
                value={a.ingredientId}
                onChange={(e) =>
                  patchVariant({
                    ingredients: variant.ingredients.map((x, i) =>
                      i === index ? { ...x, ingredientId: e.target.value } : x,
                    ),
                  })
                }
              >
                {[...catalog.ingredients]
                  .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Количество
              <input
                type="number"
                min="0.001"
                step="any"
                disabled={a.unit === "по вкусу"}
                required={a.unit !== "по вкусу"}
                value={a.quantity ?? ""}
                onChange={(e) =>
                  patchVariant({
                    ingredients: variant.ingredients.map((x, i) =>
                      i === index
                        ? { ...x, quantity: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              Мера
              <select
                value={a.unit}
                onChange={(e) =>
                  patchVariant({
                    ingredients: variant.ingredients.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            unit: e.target.value as typeof a.unit,
                            quantity:
                              e.target.value === "по вкусу"
                                ? null
                                : (x.quantity ?? 1),
                          }
                        : x,
                    ),
                  })
                }
              >
                {units.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={a.optional}
                onChange={() =>
                  patchVariant({
                    ingredients: variant.ingredients.map((x, i) =>
                      i === index ? { ...x, optional: !x.optional } : x,
                    ),
                  })
                }
              />
              По желанию
            </label>
            <button
              className="icon-button"
              type="button"
              disabled={variant.ingredients.length <= 1}
              aria-label="Удалить ингредиент"
              onClick={() =>
                patchVariant({
                  ingredients: variant.ingredients.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              <Trash2 size={17} />
            </button>
            <label className="field ingredient-note">
              Примечание
              <input
                value={a.note}
                maxLength={300}
                onChange={(e) =>
                  patchVariant({
                    ingredients: variant.ingredients.map((x, i) =>
                      i === index ? { ...x, note: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="button light"
          onClick={() =>
            patchVariant({
              ingredients: [
                ...variant.ingredients,
                {
                  ingredientId:
                    catalog.ingredients.find(
                      (i) =>
                        !variant.ingredients.some(
                          (a) => a.ingredientId === i.id,
                        ),
                    )?.id ?? catalog.ingredients[0].id,
                  quantity: 100,
                  unit: "г",
                  optional: false,
                  note: "",
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Ингредиент
        </button>
        <h3>Шаги</h3>
        {variant.steps.map((s, index) => (
          <div className="editor-step" key={index}>
            <div className="editor-step-heading">
              <strong>Шаг {index + 1}</strong>
              <div>
                <button
                  type="button"
                  className="text-button"
                  disabled={!index}
                  onClick={() => {
                    const steps = [...variant.steps];
                    [steps[index - 1], steps[index]] = [
                      steps[index],
                      steps[index - 1],
                    ];
                    patchVariant({ steps });
                  }}
                >
                  Выше
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={variant.steps.length <= 1}
                  aria-label="Удалить шаг"
                  onClick={() =>
                    patchVariant({
                      steps: variant.steps.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <label className="field">
              Заголовок
              <input
                required
                value={s.title}
                onChange={(e) =>
                  patchVariant({
                    steps: variant.steps.map((x, i) =>
                      i === index ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              Что сделать
              <textarea
                required
                rows={3}
                value={s.text}
                onChange={(e) =>
                  patchVariant({
                    steps: variant.steps.map((x, i) =>
                      i === index ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
            <label className="field">
              Длительность шага, мин (необязательно)
              <input
                type="number"
                min={0}
                max={1440}
                value={s.minutes ?? ""}
                onChange={(e) =>
                  patchVariant({
                    steps: variant.steps.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            minutes:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                          }
                        : x,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        <div className="editor-actions">
          <button
            type="button"
            className="button light"
            onClick={() =>
              patchVariant({
                steps: [...variant.steps, { title: "", text: "" }],
              })
            }
          >
            <Plus size={16} />
            Шаг
          </button>
          {draft.variants.length > 1 && (
            <button
              type="button"
              className="text-button danger"
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  variants: d.variants.filter((_, i) => i !== variantIndex),
                }));
                setVariantIndex(0);
              }}
            >
              Удалить вариант
            </button>
          )}
        </div>
      </section>
      <div className="editor-save">
        <button
          type="submit"
          className="button primary"
          disabled={busy || uploading}
        >
          <Save size={17} />
          {busy ? "Сохраняем…" : "Сохранить рецепт"}
        </button>
        <button
          type="button"
          className="button light"
          onClick={() => setPreview(!preview)}
        >
          <Eye size={17} />
          Предпросмотр
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Отмена
        </button>
      </div>
      {preview && (
        <section className="admin-preview">
          <h2>{draft.title}</h2>
          <p>{draft.description}</p>
          <RecipeStorage storage={draft.storage} />
          <RecipeNutrition nutrition={draft.nutrition} />
          <h3>
            {variant.name} · {variant.servings} порц.
          </h3>
          <ul>
            {variant.ingredients.map((a, i) => (
              <li key={i}>
                {catalog.ingredients.find((x) => x.id === a.ingredientId)?.name}{" "}
                — {a.quantity ?? ""} {a.unit}
                {a.optional ? " (по желанию)" : ""}
              </li>
            ))}
          </ul>
          <ol>
            {variant.steps.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </form>
  );
}
