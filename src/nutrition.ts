import type { Food, FoodDraft, Goals, LogEntry, Nutrition, Per100g, RecipeItem, ServingUnit } from './types';

const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'sugar_g', 'fiber_g', 'sodium_mg'] as const;

// Missing / non-finite values count as 0, never NaN.
function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function positive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export const ZERO: Nutrition = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  sugar_g: 0,
  fiber_g: 0,
  sodium_mg: 0,
};

// Calories/macros for an eaten amount, from the per-100g basis.
export function nutritionForGrams(food: Pick<Food, 'per100g'>, grams: number): Nutrition {
  const f = n(grams) / 100;
  const p: Partial<Per100g> = food.per100g ?? {};
  const out = { ...ZERO };
  for (const k of NUTRIENTS) out[k] = n(p[k]) * f;
  return out;
}

// The serving units a food can be counted in: only those with a name and a real weight.
// No reference weight means no unit; grams always works.
export function validServings(food: Pick<FoodDraft, 'servings'>): ServingUnit[] {
  const out: ServingUnit[] = [];
  for (const u of Array.isArray(food.servings) ? food.servings : []) {
    const name = typeof u?.name === 'string' ? u.name.trim() : '';
    if (!name || !positive(u.grams)) continue;
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ name, grams: u.grams });
  }
  return out;
}

// "egg" -> "1 egg"; "3 links" stays "3 links".
export const unitLabel = (unit: ServingUnit) => (/^\d/.test(unit.name) ? unit.name : `1 ${unit.name}`);

// How a counted portion is shown in the log: "4 × egg".
export const portionLabel = (count: number, unit: ServingUnit) =>
  `${Math.round(count * 100) / 100} × ${unit.name}`;

export function dailyTotals(entries: readonly Partial<Nutrition>[]): Nutrition {
  const out = { ...ZERO };
  for (const e of entries) for (const k of NUTRIENTS) out[k] += n(e[k]);
  return out;
}

// An amount of a food with its nutrition snapshotted; it never reads the food again.
export function makeItem(food: Food, grams: number, portion?: string): RecipeItem {
  const item: RecipeItem = {
    foodBarcode: food.barcode,
    foodName: food.name,
    grams,
    ...nutritionForGrams(food, grams),
  };
  if (portion) item.portion = portion;
  return item;
}

export function makeEntry(food: Food, grams: number, loggedAt: number, id: string, portion?: string): LogEntry {
  return { id, ...makeItem(food, grams, portion), loggedAt };
}

// Change an entry's grams by scaling its own snapshot (not the current food data).
export function rescaleEntry(entry: LogEntry, grams: number): LogEntry {
  const f = positive(entry.grams) ? n(grams) / entry.grams : 0;
  const out = { ...entry, grams };
  delete out.portion; // the count it was entered with no longer applies
  for (const k of NUTRIENTS) out[k] = n(entry[k]) * f;
  return out;
}

export type GoalStatus = {
  kcalLeft: number; // negative when over the ceiling
  kcalOver: boolean;
  proteinToGo: number; // 0 once the floor is met
  proteinMet: boolean;
  proteinFraction: number; // 0..1 for the progress bar
};

// Calories are a ceiling, protein is a floor.
export function goalStatus(goals: Goals, totals: Pick<Nutrition, 'kcal' | 'protein_g'>): GoalStatus {
  const kcalLeft = n(goals.kcal) - n(totals.kcal);
  const goalP = n(goals.protein_g);
  const proteinToGo = Math.max(0, goalP - n(totals.protein_g));
  return {
    kcalLeft,
    kcalOver: kcalLeft < 0,
    proteinToGo,
    proteinMet: goalP > 0 && proteinToGo === 0,
    proteinFraction: goalP > 0 ? Math.min(1, n(totals.protein_g) / goalP) : 0,
  };
}

// Digits only; a UPC-A reported as a 13-digit EAN with a leading zero becomes 12 digits.
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13 && digits.startsWith('0') ? digits.slice(1) : digits;
}

// Convert values entered "per <basis> grams" to the per-100g basis we store.
export function toPer100g(values: Partial<Per100g>, basisGrams: number): Partial<Per100g> {
  const out: Partial<Per100g> = {};
  if (!positive(basisGrams)) return out;
  for (const k of NUTRIENTS) {
    const v = values[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = (v * 100) / basisGrams;
  }
  return out;
}

// A draft is loggable once it has a name, calories and protein.
export function draftToFood(draft: FoodDraft, barcode: string): Food | undefined {
  const name = draft.name?.trim();
  const p = draft.per100g ?? {};
  if (!name || typeof p.kcal !== 'number' || typeof p.protein_g !== 'number') return undefined;
  if (!Number.isFinite(p.kcal) || !Number.isFinite(p.protein_g)) return undefined;
  const food: Food = { barcode, name, per100g: { ...p, kcal: p.kcal, protein_g: p.protein_g } };
  if (draft.brand?.trim()) food.brand = draft.brand.trim();
  const servings = validServings(draft);
  if (servings.length) food.servings = servings;
  return food;
}

type LegacyFood = Food & { servingSize_g?: number; servingName?: string; packageSize_g?: number };

// Foods saved before serving units existed had one serving size and a package size.
export function migrateFood(stored: LegacyFood): Food {
  const { servingSize_g, servingName, packageSize_g, ...food } = stored;
  if (food.servings) return food;
  const servings = validServings({
    servings: [
      { name: servingName?.trim() || 'serving', grams: servingSize_g as number },
      { name: 'package', grams: packageSize_g as number },
    ],
  });
  return servings.length ? { ...food, servings } : food;
}

export type MealInput = { name: string; items: RecipeItem[]; cookedWeight_g?: number; portions?: number };

// A batch-cooked meal becomes one food: the ingredients' summed nutrition spread over the
// finished weight (the cooked weight if given, otherwise the ingredients' combined weight).
export function buildMeal(input: MealInput, barcode: string): Food | undefined {
  const name = input.name.trim();
  const rawWeight = input.items.reduce((sum, i) => sum + n(i.grams), 0);
  const weight = positive(input.cookedWeight_g) ? input.cookedWeight_g : rawWeight;
  if (!name || input.items.length === 0 || !positive(weight)) return undefined;

  const totals = dailyTotals(input.items);
  const per100g = { ...ZERO };
  for (const k of NUTRIENTS) per100g[k] = (totals[k] * 100) / weight;

  const recipe: NonNullable<Food['recipe']> = { items: input.items };
  if (positive(input.cookedWeight_g)) recipe.cookedWeight_g = input.cookedWeight_g;
  const food: Food = { barcode, name, per100g, custom: true, recipe };
  if (positive(input.portions)) {
    recipe.portions = input.portions;
    food.servings = [{ name: 'portion', grams: weight / input.portions }];
  }
  return food;
}
