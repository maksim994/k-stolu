"use client";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Save, X } from "lucide-react";
import {
  categories,
  collectionSchema,
  equipment,
  families,
  type Catalog,
  type Collection,
} from "@/domain/recipe";
import { collectionRecipes } from "@/domain/collections";

export function CollectionManager({
  catalog,
  onChanged,
}: {
  catalog: Catalog;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const patch = (values: Partial<Collection>) =>
    setDraft((d) => (d ? { ...d, ...values } : d));
  const start = (collection?: Collection) => {
    const id = `collection-${Date.now()}`;
    setError("");
    setMessage("");
    setDraft(
      collection
        ? structuredClone(collection)
        : {
            id,
            slug: id,
            title: "",
            description: "",
            image: catalog.recipes[0]?.image ?? "/images/recipes/omelet.webp",
            status: "draft",
            kind: "manual",
            recipeIds: [],
            rules: {},
          },
    );
  };
  const move = (index: number, direction: number) => {
    if (!draft) return;
    const ids = [...draft.recipeIds];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    patch({ recipeIds: ids });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = collectionSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const response = await fetch("/api/admin/collections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Не удалось сохранить подборку");
      await onChanged();
      setDraft(null);
      setMessage("Подборка сохранена");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить подборку",
      );
    } finally {
      setBusy(false);
    }
  };
  const preview = draft ? collectionRecipes(draft, catalog.recipes) : [];
  return (
    <details className="collection-manager admin-import">
      <summary>Подборки · {catalog.collections?.length ?? 0}</summary>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
      {draft ? (
        <form onSubmit={(e) => void save(e)} className="collection-editor">
          <fieldset disabled={busy}>
            <div className="editor-basics">
              <label className="field">
                Название
                <input
                  required
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </label>
              <label className="field">
                Адрес подборки
                <input
                  required
                  pattern="[a-z0-9][a-z0-9-]{0,79}"
                  value={draft.slug}
                  onChange={(e) => patch({ slug: e.target.value })}
                />
              </label>
              <label className="field wide">
                Описание
                <textarea
                  required
                  maxLength={600}
                  value={draft.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="field">
                Тип
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    patch({ kind: e.target.value as Collection["kind"] })
                  }
                >
                  <option value="manual">Ручная</option>
                  <option value="automatic">Автоматическая</option>
                </select>
              </label>
              <label className="field">
                Статус
                <select
                  value={draft.status}
                  onChange={(e) =>
                    patch({ status: e.target.value as Collection["status"] })
                  }
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликована</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label className="field wide">
                Обложка
                <select
                  value={draft.image}
                  onChange={(e) => patch({ image: e.target.value })}
                >
                  {!catalog.recipes.some((r) => r.image === draft.image) && (
                    <option value={draft.image}>Текущая обложка</option>
                  )}
                  {catalog.recipes.map((r) => (
                    <option key={r.id} value={r.image}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.kind === "automatic" && (
              <div className="editor-basics">
                <label className="field">
                  Семейство
                  <select
                    value={draft.rules.family ?? ""}
                    onChange={(e) =>
                      patch({
                        rules: {
                          ...draft.rules,
                          family:
                            (e.target.value as Collection["rules"]["family"]) ||
                            undefined,
                        },
                      })
                    }
                  >
                    <option value="">Любое</option>
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
                  Категория
                  <select
                    value={draft.rules.category ?? ""}
                    onChange={(e) =>
                      patch({
                        rules: {
                          ...draft.rules,
                          category:
                            (e.target
                              .value as Collection["rules"]["category"]) ||
                            undefined,
                        },
                      })
                    }
                  >
                    <option value="">Любая</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Техника
                  <select
                    value={draft.rules.equipment ?? ""}
                    onChange={(e) =>
                      patch({
                        rules: {
                          ...draft.rules,
                          equipment:
                            (e.target
                              .value as Collection["rules"]["equipment"]) ||
                            undefined,
                        },
                      })
                    }
                  >
                    <option value="">Любая</option>
                    {equipment.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Не дольше, минут
                  <input
                    type="number"
                    min="1"
                    max="2880"
                    value={draft.rules.maxMinutes ?? ""}
                    onChange={(e) =>
                      patch({
                        rules: {
                          ...draft.rules,
                          maxMinutes: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  Заморозка
                  <select
                    value={
                      draft.rules.freezable === undefined
                        ? "any"
                        : String(draft.rules.freezable)
                    }
                    onChange={(e) =>
                      patch({
                        rules: {
                          ...draft.rules,
                          freezable:
                            e.target.value === "any"
                              ? undefined
                              : e.target.value === "true",
                        },
                      })
                    }
                  >
                    <option value="any">Неважно</option>
                    <option value="true">Можно замораживать</option>
                    <option value="false">Не рекомендуется</option>
                  </select>
                </label>
              </div>
            )}
            <h3>
              {draft.kind === "manual"
                ? "Рецепты по порядку"
                : "Закреплённые рецепты"}
            </h3>
            <ol className="collection-order">
              {draft.recipeIds.map((id, index) => (
                <li key={id}>
                  <span>
                    {catalog.recipes.find((r) => r.id === id)?.title ?? id}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Поднять рецепт ${index + 1}`}
                    title="Поднять"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Опустить рецепт ${index + 1}`}
                    title="Опустить"
                    disabled={index === draft.recipeIds.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Убрать рецепт ${index + 1}`}
                    title="Убрать"
                    onClick={() =>
                      patch({
                        recipeIds: draft.recipeIds.filter((r) => r !== id),
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ol>
            <label className="field">
              Добавить рецепт
              <select
                value=""
                onChange={(e) =>
                  e.target.value &&
                  patch({ recipeIds: [...draft.recipeIds, e.target.value] })
                }
              >
                <option value="">Выберите рецепт</option>
                {catalog.recipes
                  .filter((r) => !draft.recipeIds.includes(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.status !== "published" ? " (не опубликован)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <p className="field-hint">
              На сайте: {preview.length} рецептов.{" "}
              {preview.map((r) => r.title).join(" · ") || "Пока пусто."}
            </p>
            <div className="admin-toolbar">
              <button className="button primary" disabled={busy}>
                <Save size={17} />
                {busy ? "Сохраняем…" : "Сохранить подборку"}
              </button>
              <button
                type="button"
                className="button light"
                onClick={() => setDraft(null)}
              >
                Отмена
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="admin-toolbar">
            <button className="button primary" onClick={() => start()}>
              <Plus size={17} />
              Новая подборка
            </button>
          </div>
          <div className="admin-recipes">
            {(catalog.collections ?? []).map((c) => (
              <button key={c.id} onClick={() => start(c)}>
                <img src={c.image} alt="" width="72" height="48" />
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {collectionRecipes(c, catalog.recipes).length} рецептов ·{" "}
                    {c.kind === "manual" ? "Ручная" : "Автоматическая"}
                  </small>
                </span>
                <span className={`status-badge ${c.status}`}>
                  {c.status === "published"
                    ? "Опубликована"
                    : c.status === "draft"
                      ? "Черновик"
                      : "Архив"}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
