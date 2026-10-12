import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Такого рецепта здесь нет</h1>
      <p>Возможно, он ещё не опубликован или адрес изменился.</p>
      <Link className="button primary" href="/">
        К рецептам
      </Link>
    </div>
  );
}
