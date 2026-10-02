import { draftToFood } from './nutrition';
import type { Food, FoodDraft, Per100g } from './types';

const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_quantity_unit',
  'product_quantity',
  'product_quantity_unit',
].join(',');

export const offUrl = (barcode: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;

const KJ_PER_KCAL = 4.184;

// OFF numbers arrive as numbers or strings, or not at all.
function num(v: unknown): number | undefined {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) && x >= 0 ? x : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// A reference weight only counts if it is in grams (ml treated as grams); other units are ignored.
function weight(quantity: unknown, unit: unknown): number | undefined {
  const q = num(quantity);
  if (!q) return undefined;
  const u = str(unit)?.toLowerCase();
  return u === undefined || u === 'g' || u === 'ml' ? q : undefined;
}

// Extract the fields we store. Every field is optional: the data is crowdsourced.
export function parseProduct(product: unknown, barcode: string): FoodDraft {
  const p = (product && typeof product === 'object' ? product : {}) as Record<string, unknown>;
  const nm = (p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {}) as Record<string, unknown>;

  const per100g: Partial<Per100g> = {};
  const kj = num(nm['energy-kj_100g']) ?? num(nm['energy_100g']);
  const kcal = num(nm['energy-kcal_100g']) ?? (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
  const saltG = num(nm['salt_100g']);
  const sodiumG = num(nm['sodium_100g']) ?? (saltG !== undefined ? saltG / 2.5 : undefined);
  const values: Partial<Per100g> = {
    kcal,
    protein_g: num(nm['proteins_100g']),
    carbs_g: num(nm['carbohydrates_100g']),
    fat_g: num(nm['fat_100g']),
    sugar_g: num(nm['sugars_100g']),
    fiber_g: num(nm['fiber_100g']),
    sodium_mg: sodiumG !== undefined ? sodiumG * 1000 : undefined,
  };
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) per100g[k as keyof Per100g] = v;
  }

  const draft: FoodDraft = { barcode, per100g };
  const name = str(p.product_name) ?? str(p.product_name_en) ?? str(p.generic_name);
  if (name) draft.name = name;
  const brand = str(p.brands)?.split(',')[0].trim();
  if (brand) draft.brand = brand;
  const serving = weight(p.serving_quantity, p.serving_quantity_unit);
  if (serving) draft.servingSize_g = serving;
  const pack = weight(p.product_quantity, p.product_quantity_unit);
  if (pack) draft.packageSize_g = pack;
  return draft;
}

export type LookupResult =
  | { kind: 'found'; food: Food }
  | { kind: 'incomplete'; draft: FoodDraft } // in OFF, but missing name/kcal/protein
  | { kind: 'notFound'; barcode: string };

export type LookupDeps = {
  getCached: (barcode: string) => Promise<Food | undefined>;
  setCached: (food: Food) => Promise<void>;
  fetchJson: (url: string) => Promise<unknown>;
};

// OFF answers "not found" with status 0 in the body (the HTTP code is unreliable),
// so read the body whatever the HTTP status is.
export const fetchJson = async (url: string): Promise<unknown> => (await fetch(url)).json();

// Cache-first. Throws on network failure or an unrecognisable response.
export async function lookup(barcode: string, deps: LookupDeps): Promise<LookupResult> {
  const cached = await deps.getCached(barcode);
  if (cached) return { kind: 'found', food: cached };

  const json = (await deps.fetchJson(offUrl(barcode))) as { status?: unknown; product?: unknown } | null;
  // Branch on `status`, never the HTTP code. Only a found, complete food is ever cached.
  if (json?.status === 0) return { kind: 'notFound', barcode };
  if (json?.status !== 1) throw new Error('Unexpected response from Open Food Facts');

  const draft = parseProduct(json.product, barcode);
  const food = draftToFood(draft, barcode);
  if (!food) return { kind: 'incomplete', draft };
  await deps.setCached(food);
  return { kind: 'found', food };
}
