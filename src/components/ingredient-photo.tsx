const ids = [
  "egg",
  "tomato",
  "cheese",
  "milk",
  "oil",
  "salt",
  "pepper",
  "cottage-cheese",
  "flour",
  "sugar",
  "oats",
  "apple",
  "butter",
  "cinnamon",
  "chicken-fillet",
  "potato",
  "carrot",
  "onion",
  "rice",
  "greens",
  "water",
  "lentils",
  "garlic",
  "paprika",
  "chicken-thigh",
  "ground-meat",
  "passata",
  "white-fish",
  "zucchini",
  "lemon",
  "cucumber",
  "feta",
  "olives",
  "oregano",
  "baking-powder",
];
const rowPositions = [0, 16.2, 31.9, 47.64, 63.36, 79.09, 96.23];
export function IngredientPhoto({ id }: { id: string }) {
  const index = ids.indexOf(id);
  return (
    <span
      aria-hidden="true"
      className={`ingredient-photo ${index < 0 ? "empty" : ""}`}
      style={
        index < 0
          ? undefined
          : {
              backgroundPosition: `${(index % 5) * 25}% ${rowPositions[Math.floor(index / 5)]}%`,
            }
      }
    />
  );
}
