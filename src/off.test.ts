import { describe, expect, it, vi } from 'vitest';
import { lookup, parseProduct, type LookupDeps } from './off';
import type { Food } from './types';

const product = {
  product_name: 'Nutella',
  brands: 'Ferrero, Nutella',
  serving_quantity: '15',
  serving_quantity_unit: 'g',
  product_quantity: 400,
  product_quantity_unit: 'g',
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    sugars_100g: 56.3,
    sodium_100g: 0.0428,
  },
};

function deps(json: unknown, cache = new Map<string, Food>()) {
  const d = {
    getCached: vi.fn(async (b: string) => cache.get(b)),
    setCached: vi.fn(async (f: Food) => void cache.set(f.barcode, f)),
    fetchJson: vi.fn(async () => json),
  } satisfies LookupDeps;
  return { d, cache };
}

describe('parseProduct', () => {
  it('extracts the stored fields', () => {
    expect(parseProduct(product, '3017620422003')).toEqual({
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      per100g: { kcal: 539, protein_g: 6.3, carbs_g: 57.5, fat_g: 30.9, sugar_g: 56.3, sodium_mg: 42.8 },
      servingSize_g: 15,
      packageSize_g: 400,
    });
  });

  it('falls back to kJ for energy and salt for sodium', () => {
    const d = parseProduct({ nutriments: { energy_100g: 418.4, salt_100g: 1 } }, '1');
    expect(d.per100g?.kcal).toBeCloseTo(100);
    expect(d.per100g?.sodium_mg).toBeCloseTo(400);
  });

  it('treats every field as optional', () => {
    expect(parseProduct({}, '1')).toEqual({ barcode: '1', per100g: {} });
    expect(parseProduct(undefined, '1')).toEqual({ barcode: '1', per100g: {} });
    expect(parseProduct({ nutriments: { proteins_100g: 'abc', fat_100g: -1 }, product_name: '  ' }, '1')).toEqual({
      barcode: '1',
      per100g: {},
    });
  });

  it('ignores reference weights that are not in grams/ml', () => {
    const d = parseProduct({ serving_quantity: 1, serving_quantity_unit: 'oz', product_quantity: 0 }, '1');
    expect(d.servingSize_g).toBeUndefined();
    expect(d.packageSize_g).toBeUndefined();
  });
});

describe('lookup', () => {
  it('returns a cached food without touching the network', async () => {
    const food: Food = { barcode: '9', name: 'Cached', per100g: { kcal: 1, protein_g: 1 } };
    const { d } = deps(null, new Map([['9', food]]));
    expect(await lookup('9', d)).toEqual({ kind: 'found', food });
    expect(d.fetchJson).not.toHaveBeenCalled();
  });

  it('fetches, normalises and caches on a miss', async () => {
    const { d, cache } = deps({ status: 1, product });
    const r = await lookup('3017620422003', d);
    expect(r.kind).toBe('found');
    expect(d.fetchJson).toHaveBeenCalledWith(expect.stringContaining('/api/v2/product/3017620422003.json'));
    expect(cache.get('3017620422003')?.name).toBe('Nutella');
  });

  it('treats status 0 as not found and never caches it', async () => {
    const { d, cache } = deps({ status: 0, status_verbose: 'product not found' });
    expect(await lookup('000', d)).toEqual({ kind: 'notFound', barcode: '000' });
    expect(d.setCached).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('returns an uncached draft when calories or protein are missing', async () => {
    const { d } = deps({ status: 1, product: { product_name: 'Mystery', nutriments: { 'energy-kcal_100g': 50 } } });
    const r = await lookup('5', d);
    expect(r).toEqual({ kind: 'incomplete', draft: { barcode: '5', name: 'Mystery', per100g: { kcal: 50 } } });
    expect(d.setCached).not.toHaveBeenCalled();
  });

  it('throws on an unrecognisable response rather than guessing', async () => {
    await expect(lookup('5', deps({}).d)).rejects.toThrow();
    await expect(lookup('5', deps(null).d)).rejects.toThrow();
  });
});
