import { describe, expect, it, vi } from 'vitest';
import { lookup, mergeDraft, parseProduct, parseServings, type LookupDeps } from './off';
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
      servings: [
        { name: 'serving', grams: 15 },
        { name: 'package', grams: 400 },
      ],
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
    expect(d.servings).toBeUndefined();
  });
});

describe('parseServings', () => {
  const units = (serving_size: string, serving_quantity?: number) => parseServings({ serving_size, serving_quantity });

  it('names a single-piece serving after the piece', () => {
    expect(units('1 egg (50g)', 50)).toEqual([{ name: 'egg', grams: 50 }]);
  });

  it('keeps the label serving as default and derives a single piece', () => {
    const [label, single] = units('3 links (68 g)', 68);
    expect(label).toEqual({ name: '3 links', grams: 68 });
    expect(single.name).toBe('link');
    expect(single.grams).toBeCloseTo(22.667);
  });

  it('falls back to a plain "serving" when the text is only a weight', () => {
    expect(units('68 g', 68)).toEqual([{ name: 'serving', grams: 68 }]);
    expect(units('', 30)).toEqual([{ name: 'serving', grams: 30 }]);
  });

  it('reads the weight from the text when the quantity field is missing', () => {
    expect(units('2 tbsp (32,5 g)')[0]).toEqual({ name: '2 tbsp', grams: 32.5 });
    expect(units('1 cup (240 ml)')).toEqual([{ name: 'cup', grams: 240 }]);
  });

  it('finds the label inside the parentheses too', () => {
    expect(units('30 g (2 biscuits)', 30).map((u) => u.name)).toEqual(['2 biscuits', 'biscuit']);
  });

  it('does not derive a piece from fractional or uncounted labels', () => {
    expect(units('1/2 cup (120g)', 120)).toEqual([{ name: '1/2 cup', grams: 120 }]);
    expect(units('bar (45 g)', 45)).toEqual([{ name: 'bar', grams: 45 }]);
  });

  it('gives no units without any weight', () => {
    expect(units('3 links')).toEqual([]);
    expect(parseServings({})).toEqual([]);
  });

  it('adds the package unless it is the same as the serving', () => {
    expect(parseServings({ serving_quantity: 330, product_quantity: 330 })).toEqual([{ name: 'serving', grams: 330 }]);
    expect(parseServings({ product_quantity: '340', product_quantity_unit: 'g' })).toEqual([
      { name: 'package', grams: 340 },
    ]);
  });
});

describe('mergeDraft', () => {
  it('prefers fresh OFF data and keeps the units the user added', () => {
    const old = {
      barcode: '1',
      name: 'My sausages',
      per100g: { kcal: 300, protein_g: 15, fat_g: 25 },
      servings: [
        { name: 'serving', grams: 68 },
        { name: 'half pack', grams: 170 },
      ],
    };
    const fresh = {
      barcode: '1',
      per100g: { kcal: 310 },
      servings: [
        { name: '3 links', grams: 68 },
        { name: 'link', grams: 68 / 3 },
        { name: 'serving', grams: 70 },
      ],
    };
    const merged = mergeDraft(old, fresh);
    expect(merged.name).toBe('My sausages');
    expect(merged.per100g).toEqual({ kcal: 310, protein_g: 15, fat_g: 25 });
    expect(merged.servings?.map((u) => u.name)).toEqual(['3 links', 'link', 'serving', 'half pack']);
    expect(merged.servings?.[2].grams).toBe(70);
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
