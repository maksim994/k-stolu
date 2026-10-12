import { Refrigerator, Snowflake } from "lucide-react";
import type { Recipe } from "@/domain/recipe";

const dayFormat = new Intl.NumberFormat("ru", {
  style: "unit",
  unit: "day",
  unitDisplay: "long",
});

export function RecipeStorage({ storage }: { storage: Recipe["storage"] }) {
  return (
    <section className="recipe-storage" aria-label="Хранение блюда">
      <h2>Хранение</h2>
      <dl className="storage-facts">
        <div>
          <dt>
            <Refrigerator size={18} aria-hidden="true" />В холодильнике
          </dt>
          <dd>
            {storage?.fridgeDays != null
              ? `Примерно ${dayFormat.format(storage.fridgeDays)}`
              : "Срок не указан"}
          </dd>
        </div>
        <div>
          <dt>
            <Snowflake size={18} aria-hidden="true" />
            Заморозка
          </dt>
          <dd>
            {storage?.freezable == null
              ? "Не указано"
              : storage.freezable
                ? "Можно замораживать"
                : "Не рекомендуется"}
          </dd>
        </div>
      </dl>
      {storage?.note && <p className="storage-note">{storage.note}</p>}
      {storage?.fridgeDays != null && (
        <p className="storage-conditions">
          Срок после приготовления при температуре не выше +4 °C, в закрытой
          ёмкости. Уберите блюдо в холодильник в течение 2 часов.
        </p>
      )}
    </section>
  );
}
