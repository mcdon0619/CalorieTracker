import { draftToFood, validServings } from './nutrition';
import type { Food, FoodDraft, Per100g, ServingUnit } from './types';

const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_size',
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

const GRAMS = /\b(\d+(?:[.,]\d+)?)\s*(?:grams?|gr|g|ml)\b/gi;
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:/–-]+|[\s,;:/–-]+$/g, '');

// The human part of a serving text: "3 links (68 g)" -> "3 links", "30 g (2 biscuits)" ->
// "2 biscuits", "68 g" -> "".
function servingLabel(text: string): string {
  const noGrams = text.replace(GRAMS, ' ');
  return tidy(noGrams.replace(/\([^)]*\)/g, ' ')) || tidy(/\(([^)]*)\)/.exec(noGrams)?.[1] ?? '');
}

const singular = (word: string) => (/[^s]s$/i.test(word) ? word.slice(0, -1) : word);

// Serving units from OFF's free-text serving size, its gram quantity and the package size.
// The label's own serving comes first (the default); "3 links" also yields a single "link".
export function parseServings(p: Record<string, unknown>): ServingUnit[] {
  const out: ServingUnit[] = [];
  const text = str(p.serving_size) ?? '';
  const inText = new RegExp(GRAMS.source, 'i').exec(text)?.[1];
  const grams = weight(p.serving_quantity, p.serving_quantity_unit) ?? (num(inText?.replace(',', '.')) || undefined);
  if (grams) {
    const label = servingLabel(text);
    const counted = /^(\d+)\s+(.+)$/.exec(label);
    const count = counted ? Number(counted[1]) : 0;
    if (!label) out.push({ name: 'serving', grams });
    else if (counted && count === 1) out.push({ name: counted[2], grams });
    else {
      out.push({ name: label, grams });
      if (counted && count > 1 && count <= 50) out.push({ name: singular(counted[2]), grams: grams / count });
    }
  }
  const pack = weight(p.product_quantity, p.product_quantity_unit);
  if (pack && !out.some((u) => u.grams === pack)) out.push({ name: 'package', grams: pack });
  return validServings({ servings: out });
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
  const servings = parseServings(p);
  if (servings.length) draft.servings = servings;
  return draft;
}

// Fresh OFF data over a food already on the device: OFF's values win where it has them,
// and serving units the user added are kept after OFF's.
export function mergeDraft(old: FoodDraft, fresh: FoodDraft): FoodDraft {
  const merged: FoodDraft = { ...old, ...fresh, per100g: { ...old.per100g, ...fresh.per100g } };
  const servings = validServings({ servings: [...(fresh.servings ?? []), ...(old.servings ?? [])] });
  if (servings.length) merged.servings = servings;
  return merged;
}

export type LookupResult =
  | { kind: 'found'; food: Food }
  | { kind: 'incomplete'; draft: FoodDraft } // in OFF, but missing name/kcal/protein
  | { kind: 'notFound'; barcode: string };

type FetchJson = (url: string) => Promise<unknown>;

export type LookupDeps = {
  getCached: (barcode: string) => Promise<Food | undefined>;
  setCached: (food: Food) => Promise<void>;
  fetchJson: FetchJson;
};

// OFF answers "not found" with status 0 in the body (the HTTP code is unreliable),
// so read the body whatever the HTTP status is.
export const fetchJson: FetchJson = async (url) => (await fetch(url)).json();

// The product as OFF has it now; undefined if OFF has no such product.
// Throws on network failure or an unrecognisable response.
export async function fetchDraft(barcode: string, fetchJson: FetchJson): Promise<FoodDraft | undefined> {
  const json = (await fetchJson(offUrl(barcode))) as { status?: unknown; product?: unknown } | null;
  // Branch on `status`, never the HTTP code.
  if (json?.status === 0) return undefined;
  if (json?.status !== 1) throw new Error('Unexpected response from Open Food Facts');
  return parseProduct(json.product, barcode);
}

// Cache-first. Only a found, complete food is ever cached.
export async function lookup(barcode: string, deps: LookupDeps): Promise<LookupResult> {
  const cached = await deps.getCached(barcode);
  if (cached) return { kind: 'found', food: cached };

  const draft = await fetchDraft(barcode, deps.fetchJson);
  if (!draft) return { kind: 'notFound', barcode };
  const food = draftToFood(draft, barcode);
  if (!food) return { kind: 'incomplete', draft };
  await deps.setCached(food);
  return { kind: 'found', food };
}
