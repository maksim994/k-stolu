"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { z } from "zod";
import {
  emptyShopping,
  shoppingSourceSchema,
  type ShoppingState,
} from "@/domain/cooking";
import { mealPlanSchema } from "@/domain/meal-plan";
import { availablePantry } from "@/domain/pantry";
const row = z.object({
  key: z.string(),
  ingredientId: z.string(),
  name: z.string(),
  group: z.string(),
  quantity: z.number().positive().nullable(),
  unit: z.string(),
  sources: z.array(z.string()),
});
const stored = z.object({
  version: z.literal(1),
  pantry: z.array(z.string()),
  unavailableBasics: z.array(z.enum(["salt", "sugar", "oil"])).default([]),
  favorites: z.array(z.string()),
  plan: mealPlanSchema.default([]),
  shopping: z.object({
    sources: z.array(shoppingSourceSchema),
    manual: z.array(row),
    checked: z.array(z.string()),
    hidden: z.array(z.string()),
    overrides: z.record(
      z.string(),
      z.object({
        quantity: z.number().positive().nullable(),
        unit: z.string(),
      }),
    ),
  }),
});
type State = z.infer<typeof stored>;
const initial: State = {
  version: 1,
  pantry: [],
  unavailableBasics: [],
  favorites: [],
  plan: [],
  shopping: emptyShopping,
};
const Context = createContext<{
  state: State;
  pantry: string[];
  setState: Dispatch<SetStateAction<State>>;
  hydrated: boolean;
  toast: (message: string) => void;
  storageError: string;
}>({
  state: initial,
  pantry: availablePantry([]),
  setState: () => {},
  hydrated: false,
  toast: () => {},
  storageError: "",
});
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial),
    [hydrated, setHydrated] = useState(false),
    [message, setMessage] = useState(""),
    [storageError, setStorageError] = useState("");
  const pantry = useMemo(
    () => availablePantry(state.pantry, state.unavailableBasics),
    [state.pantry, state.unavailableBasics],
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("k-stolu:v1");
      if (raw) {
        const result = stored.safeParse(JSON.parse(raw));
        if (result.success) setState(result.data);
        else
          setStorageError(
            "Сохранённые списки повреждены. Можно начать новые списки.",
          );
      }
    } catch {
      setStorageError(
        "Не удалось прочитать сохранённые списки. Проверьте доступ браузера к хранилищу.",
      );
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated || storageError) return;
    try {
      localStorage.setItem("k-stolu:v1", JSON.stringify(state));
    } catch {
      setStorageError(
        "Браузер не сохранил изменения. Разрешите хранение данных и обновите страницу.",
      );
    }
  }, [state, hydrated, storageError]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <Context.Provider
      value={{
        state,
        pantry,
        setState,
        hydrated,
        toast: setMessage,
        storageError,
      }}
    >
      {children}
      {storageError && (
        <div className="storage-alert" role="alert">
          {storageError}
          <button
            onClick={() => {
              if (
                confirm(
                  "Начать новые списки? Повреждённые сохранённые данные будут заменены.",
                )
              ) {
                setState(initial);
                setStorageError("");
              }
            }}
          >
            Начать заново
          </button>
        </div>
      )}
      <div
        className={`toast ${message ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </Context.Provider>
  );
}
export const useHousehold = () => useContext(Context);
export function useShopping() {
  const { state, setState } = useHousehold();
  return [
    state.shopping,
    (action: SetStateAction<ShoppingState>) =>
      setState((s) => ({
        ...s,
        shopping: typeof action === "function" ? action(s.shopping) : action,
      })),
  ] as const;
}
