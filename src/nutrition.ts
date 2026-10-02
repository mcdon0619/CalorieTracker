import type { Food, FoodDraft, Goals, LogEntry, Nutrition, Per100g } from './types';

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

export type Shortcut = { label: string; grams: number };

// Serving/package shortcuts, only for reference weights the food actually has.
export function portionShortcuts(food: Pick<Food, 'servingSize_g' | 'packageSize_g'>): Shortcut[] {
  const out: Shortcut[] = [];
  if (positive(food.servingSize_g)) {
    out.push(
      { label: '½ serving', grams: food.servingSize_g / 2 },
      { label: '1 serving', grams: food.servingSize_g },
      { label: '2 servings', grams: food.servingSize_g * 2 },
    );
  }
  if (positive(food.packageSize_g)) {
    out.push(
      { label: '½ package', grams: food.packageSize_g / 2 },
      { label: 'Whole package', grams: food.packageSize_g },
    );
  }
  return out;
}

export function dailyTotals(entries: readonly Partial<Nutrition>[]): Nutrition {
  const out = { ...ZERO };
  for (const e of entries) for (const k of NUTRIENTS) out[k] += n(e[k]);
  return out;
}

// Snapshot the nutrition at log time; the entry never reads the food again.
export function makeEntry(food: Food, grams: number, loggedAt: number, id: string): LogEntry {
  return {
    id,
    foodBarcode: food.barcode,
    foodName: food.name,
    grams,
    ...nutritionForGrams(food, grams),
    loggedAt,
  };
}

// Change an entry's grams by scaling its own snapshot (not the current food data).
export function rescaleEntry(entry: LogEntry, grams: number): LogEntry {
  const f = positive(entry.grams) ? n(grams) / entry.grams : 0;
  const out = { ...entry, grams };
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
  if (positive(draft.servingSize_g)) {
    food.servingSize_g = draft.servingSize_g;
    if (draft.servingName?.trim()) food.servingName = draft.servingName.trim();
  }
  if (positive(draft.packageSize_g)) food.packageSize_g = draft.packageSize_g;
  return food;
}
