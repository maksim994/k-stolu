"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  Copy,
  FileText,
  Mail,
  MessageCircle,
  Send,
  Share2,
  X,
} from "lucide-react";
import type { Ingredient, Recipe, Variant } from "@/domain/recipe";
import {
  isLocalRecipeUrl,
  recipeShareLinks,
  recipeShareText,
  recipeShareUrl,
} from "@/domain/sharing";
import { useHousehold } from "./household";

export function RecipeShare({
  recipe,
  variant,
  ingredients,
  servings,
}: {
  recipe: Recipe;
  variant: Variant;
  ingredients: Ingredient[];
  servings: number;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [nativeShare, setNativeShare] = useState(false),
    [fallback, setFallback] = useState("");
  const { toast } = useHousehold();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const text = recipeShareText(recipe, variant, ingredients, servings);
  useEffect(() => {
    setUrl(recipeShareUrl(window.location.origin, recipe.slug, variant.id));
    setNativeShare(typeof navigator.share === "function");
    setFallback("");
  }, [recipe.slug, variant.id, servings]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch {
      setFallback(value);
    }
  }
  const local = !!url && isLocalRecipeUrl(url);
  const oversized = local && text.length > 3500;
  const links = url ? recipeShareLinks(url, recipe.title, text) : null;
  return (
    <div className="recipe-share" ref={root}>
      <button
        className="button light"
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Share2 size={17} />
        Поделиться
      </button>
      {open && (
        <section
          className="share-panel"
          id={id}
          aria-label="Поделиться рецептом"
        >
          <div className="share-heading">
            <h2>Поделиться рецептом</h2>
            <button
              className="icon-button"
              title="Закрыть"
              aria-label="Закрыть отправку рецепта"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          {local && (
            <p className="field-hint">
              Сайт открыт локально: другим людям ссылка недоступна. В
              мессенджеры отправится текст рецепта.
            </p>
          )}
          {oversized && (
            <p className="field-hint">
              Рецепт слишком длинный для отправки через ссылку мессенджера.
              Скопируйте текст или выберите другое приложение.
            </p>
          )}
          {links && (
            <div className="share-options">
              {!oversized && (
                <>
                  <a
                    href={links.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send size={18} />
                    Telegram
                  </a>
                  <a
                    href={links.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={18} />
                    WhatsApp
                  </a>
                  <a href={links.email}>
                    <Mail size={18} />
                    Почта
                  </a>
                </>
              )}
              {nativeShare && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.share(
                        local
                          ? { title: recipe.title, text }
                          : { title: recipe.title, text: recipe.title, url },
                      );
                    } catch (error) {
                      if (!(
                        error instanceof Error && error.name === "AbortError"
                      ))
                        toast(
                          "Не удалось открыть отправку. Выберите сервис или скопируйте рецепт.",
                        );
                    }
                  }}
                >
                  <Share2 size={18} />
                  Другие приложения
                </button>
              )}
              <button onClick={() => void copy(url, "Ссылка скопирована")}>
                <Copy size={18} />
                Скопировать ссылку
              </button>
              <button
                onClick={() => void copy(text, "Текст рецепта скопирован")}
              >
                <FileText size={18} />
                Скопировать рецепт
              </button>
            </div>
          )}
          {fallback && (
            <label className="field share-fallback">
              Буфер обмена недоступен. Выделите текст для копирования.
              <textarea
                readOnly
                value={fallback}
                rows={5}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
