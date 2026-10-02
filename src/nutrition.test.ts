import { describe, expect, it } from 'vitest';
import {
  dailyTotals,
  draftToFood,
  goalStatus,
  makeEntry,
  normalizeBarcode,
  nutritionForGrams,
  portionShortcuts,
  rescaleEntry,
  toPer100g,
} from './nutrition';
import type { Food } from './types';

const oats: Food = {
  barcode: '123',
  name: 'Oats',
  per100g: { kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7, sugar_g: 1, fiber_g: 10, sodium_mg: 5 },
  servingSize_g: 40,
  packageSize_g: 500,
};

describe('nutritionForGrams', () => {
  it('scales per-100g values (150g = 1.5x)', () => {
    const r = nutritionForGrams(oats, 150);
    expect(r.kcal).toBeCloseTo(570);
    expect(r.protein_g).toBeCloseTo(19.5);
    expect(r.carbs_g).toBeCloseTo(90);
    expect(r.sodium_mg).toBeCloseTo(7.5);
  });

  it('defaults missing optional fields to 0, not NaN', () => {
    const r = nutritionForGrams({ per100g: { kcal: 100, protein_g: 5 } }, 200);
    expect(r).toEqual({ kcal: 200, protein_g: 10, carbs_g: 0, fat_g: 0, sugar_g: 0, fiber_g: 0, sodium_mg: 0 });
  });

  it('does not crash or produce NaN on an empty / garbage food', () => {
    const broken = { per100g: { kcal: NaN, protein_g: undefined } } as unknown as Food;
    for (const v of Object.values(nutritionForGrams(broken, 100))) expect(v).toBe(0);
    for (const v of Object.values(nutritionForGrams({} as Food, 100))) expect(v).toBe(0);
    for (const v of Object.values(nutritionForGrams(oats, NaN))) expect(v).toBe(0);
  });

  it('is zero for zero grams', () => {
    expect(nutritionForGrams(oats, 0).kcal).toBe(0);
  });
});

describe('portionShortcuts', () => {
  it('converts serving and package shortcuts to grams', () => {
    expect(portionShortcuts(oats)).toEqual([
      { label: '½ serving', grams: 20 },
      { label: '1 serving', grams: 40 },
      { label: '2 servings', grams: 80 },
      { label: '½ package', grams: 250 },
      { label: 'Whole package', grams: 500 },
    ]);
  });

  it('offers no shortcut without a reference weight', () => {
    expect(portionShortcuts({})).toEqual([]);
    expect(portionShortcuts({ servingSize_g: 0, packageSize_g: NaN })).toEqual([]);
  });

  it('offers only the shortcuts whose reference exists', () => {
    expect(portionShortcuts({ packageSize_g: 200 }).map((s) => s.label)).toEqual(['½ package', 'Whole package']);
    expect(portionShortcuts({ servingSize_g: 30 }).every((s) => s.label.includes('serving'))).toBe(true);
  });
});

describe('dailyTotals', () => {
  it('sums entries', () => {
    const t = dailyTotals([makeEntry(oats, 100, 0, 'a'), makeEntry(oats, 50, 0, 'b')]);
    expect(t.kcal).toBeCloseTo(570);
    expect(t.protein_g).toBeCloseTo(19.5);
  });

  it('is all zeros for no entries and tolerates missing fields', () => {
    expect(dailyTotals([]).kcal).toBe(0);
    expect(dailyTotals([{ kcal: 10 }, {}]).protein_g).toBe(0);
  });
});

describe('entries', () => {
  it('snapshots nutrition at log time', () => {
    const e = makeEntry(oats, 40, 1000, 'id1');
    expect(e).toMatchObject({ id: 'id1', foodBarcode: '123', foodName: 'Oats', grams: 40, loggedAt: 1000 });
    expect(e.kcal).toBeCloseTo(152);
  });

  it('rescales from its own snapshot when grams change', () => {
    const e = rescaleEntry(makeEntry(oats, 40, 1000, 'id1'), 80);
    expect(e.grams).toBe(80);
    expect(e.kcal).toBeCloseTo(304);
    expect(e.protein_g).toBeCloseTo(10.4);
    expect(e.loggedAt).toBe(1000);
  });

  it('rescaling a zero-gram entry gives zeros, not NaN', () => {
    const e = rescaleEntry({ ...makeEntry(oats, 0, 0, 'x') }, 50);
    expect(e.kcal).toBe(0);
  });
});

describe('goalStatus', () => {
  const goals = { kcal: 2000, protein_g: 150 };

  it('reports room under the calorie ceiling and protein still to go', () => {
    const s = goalStatus(goals, { kcal: 1200, protein_g: 90 });
    expect(s).toMatchObject({ kcalLeft: 800, kcalOver: false, proteinToGo: 60, proteinMet: false });
    expect(s.proteinFraction).toBeCloseTo(0.6);
  });

  it('flags over calories and met protein', () => {
    const s = goalStatus(goals, { kcal: 2100, protein_g: 160 });
    expect(s).toMatchObject({ kcalLeft: -100, kcalOver: true, proteinToGo: 0, proteinMet: true, proteinFraction: 1 });
  });

  it('handles a zero protein goal', () => {
    expect(goalStatus({ kcal: 0, protein_g: 0 }, { kcal: 0, protein_g: 0 })).toMatchObject({
      proteinMet: false,
      proteinFraction: 0,
    });
  });
});

describe('normalizeBarcode', () => {
  it('strips the leading zero from a 13-digit UPC-A', () => {
    expect(normalizeBarcode('0012345678905')).toBe('012345678905');
  });
  it('leaves real EAN-13, EAN-8 and UPC-A alone', () => {
    expect(normalizeBarcode('3017620422003')).toBe('3017620422003');
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('012345678905')).toBe('012345678905');
  });
  it('drops non-digits', () => {
    expect(normalizeBarcode(' 3017-6204 22003\n')).toBe('3017620422003');
  });
});

describe('toPer100g', () => {
  it('converts a per-portion basis to per-100g', () => {
    expect(toPer100g({ kcal: 650, protein_g: 40 }, 400)).toEqual({ kcal: 162.5, protein_g: 10 });
  });
  it('is the identity at 100g and empty for a bad basis', () => {
    expect(toPer100g({ kcal: 50 }, 100)).toEqual({ kcal: 50 });
    expect(toPer100g({ kcal: 50 }, 0)).toEqual({});
  });
});

describe('draftToFood', () => {
  it('needs name, kcal and protein', () => {
    expect(draftToFood({ name: 'X', per100g: { kcal: 1 } }, 'b')).toBeUndefined();
    expect(draftToFood({ per100g: { kcal: 1, protein_g: 1 } }, 'b')).toBeUndefined();
    expect(draftToFood({ name: ' X ', per100g: { kcal: 1, protein_g: 0 }, servingSize_g: 0 }, 'b')).toEqual({
      barcode: 'b',
      name: 'X',
      per100g: { kcal: 1, protein_g: 0 },
    });
  });
});
