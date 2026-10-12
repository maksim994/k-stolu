import { Leaf } from "lucide-react";
import type { Recipe } from "@/domain/recipe";

export function RecipeNutrition({
  nutrition,
}: {
  nutrition: Recipe["nutrition"];
}) {
  if (!nutrition) return null;
  return (
    <section className="recipe-nutrition" aria-label="Питание и баланс">
      <h2>
        <Leaf size={20} aria-hidden="true" />
        Питание и баланс
      </h2>
      {nutrition.weightManagement && (
        <span className="nutrition-tag">Для контроля веса</span>
      )}
      <p>{nutrition.rationale}</p>
      {!!nutrition.tips.length && (
        <ul>
          {nutrition.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      )}
      <p className="nutrition-disclaimer">
        Снижение веса зависит от всего рациона и размера порций. Калорийность не
        рассчитана; это общие советы для взрослых, не лечебная диета.{" "}
        <a
          href="https://www.who.int/news-room/fact-sheets/detail/healthy-diet"
          target="_blank"
          rel="noopener noreferrer"
        >
          Принципы ВОЗ
        </a>
      </p>
    </section>
  );
}
