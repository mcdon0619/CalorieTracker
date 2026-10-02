export type Per100g = {
  kcal: number;
  protein_g: number;
  carbs_g?: number;
  fat_g?: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
};

// A countable amount of a food. `name` is what one of them is called: "egg", "3 links",
// "package", "portion". Names that start with a number ("3 links") are shown as-is.
export type ServingUnit = { name: string; grams: number };

export type Food = {
  barcode: string; // real barcode, or "custom-<uuid>" / "meal-<uuid>"
  name: string;
  brand?: string;
  per100g: Per100g;
  servings?: ServingUnit[]; // first one is the default on the portion screen
  custom?: boolean;
  lastUsedAt?: number; // epoch ms; orders the "my foods" quick-pick
  // Set for batch-cooked meals: per100g is derived from these ingredients.
  recipe?: { items: RecipeItem[]; cookedWeight_g?: number; portions?: number };
};

// A food that may still be missing required fields (prefills the manual-add form).
export type FoodDraft = {
  barcode?: string;
  name?: string;
  brand?: string;
  per100g?: Partial<Per100g>;
  servings?: ServingUnit[];
};

export type Nutrition = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
};

// An amount of a food with its nutrition snapshotted (a meal ingredient, or a log entry).
export type RecipeItem = Nutrition & {
  foodBarcode?: string;
  foodName: string;
  grams: number;
  portion?: string; // how it was entered, e.g. "4 × egg"; display only
};

export type LogEntry = RecipeItem & {
  id: string;
  loggedAt: number; // epoch ms
};

// Calories and protein are always set; carbs and fat targets are optional.
export type Goals = { kcal: number; protein_g: number; carbs_g?: number; fat_g?: number };

export type Recipe = { id: string; name: string; items: { foodBarcode: string; grams: number }[] };
