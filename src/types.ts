export type Per100g = {
  kcal: number;
  protein_g: number;
  carbs_g?: number;
  fat_g?: number;
  sugar_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
};

export type Food = {
  barcode: string; // real barcode, or "custom-<uuid>" for non-barcoded foods
  name: string;
  brand?: string;
  per100g: Per100g;
  servingSize_g?: number;
  servingName?: string; // what one serving is called, e.g. "egg"; only meaningful with servingSize_g
  packageSize_g?: number;
  custom?: boolean;
  lastUsedAt?: number; // epoch ms; orders the "my foods" quick-pick
};

// A food that may still be missing required fields (prefills the manual-add form).
export type FoodDraft = {
  barcode?: string;
  name?: string;
  brand?: string;
  per100g?: Partial<Per100g>;
  servingSize_g?: number;
  servingName?: string;
  packageSize_g?: number;
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

export type LogEntry = Nutrition & {
  id: string;
  foodBarcode?: string;
  foodName: string;
  grams: number;
  loggedAt: number; // epoch ms
};

export type Goals = { kcal: number; protein_g: number };

export type Recipe = { id: string; name: string; items: { foodBarcode: string; grams: number }[] };
