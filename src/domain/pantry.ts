export const basicIngredientIds = ["water", "salt", "sugar", "oil"] as const;

export function isBasicIngredient(id: string) {
  return basicIngredientIds.some((basic) => basic === id);
}

export function availablePantry(
  pantry: string[],
  unavailableBasics: string[] = [],
) {
  return [
    ...new Set([
      ...pantry.filter((id) => !isBasicIngredient(id)),
      ...basicIngredientIds.filter(
        (id) => id === "water" || !unavailableBasics.includes(id),
      ),
    ]),
  ];
}

export function togglePantryItem<
  T extends { pantry: string[]; unavailableBasics: string[] },
>(state: T, id: string): T {
  if (id === "water") return state;
  if (isBasicIngredient(id))
    return {
      ...state,
      pantry: state.pantry.filter((item) => item !== id),
      unavailableBasics: state.unavailableBasics.includes(id)
        ? state.unavailableBasics.filter((item) => item !== id)
        : [...state.unavailableBasics, id],
    };
  return {
    ...state,
    pantry: state.pantry.includes(id)
      ? state.pantry.filter((item) => item !== id)
      : [...state.pantry, id],
  };
}
