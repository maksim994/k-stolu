"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Не удалось открыть рецепты</h1>
      <p>
        Попробуйте ещё раз. Если проблема сохраняется, проверьте, запущена ли
        база данных.
      </p>
      <button className="button primary" onClick={reset}>
        Попробовать снова
      </button>
    </div>
  );
}
