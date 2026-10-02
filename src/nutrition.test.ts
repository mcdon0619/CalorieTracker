import { describe, expect, it } from 'vitest';
import {
  buildMeal,
  dailyTotals,
  draftToFood,
  goalStatus,
  makeEntry,
  makeItem,
  migrateFood,
  normalizeBarcode,
  nutritionForGrams,
  portionLabel,
  rescaleEntry,
  toPer100g,
  unitLabel,
  validServings,
} from './nutrition';
import type { Food } from './types';

const oats: Food = {
  barcode: '123',
  name: 'Oats',
  per100g: { kcal: 380, protein_g: 13, carbs_g: 60, fat_g: 7, sugar_g: 1, fiber_g: 10, sodium_mg: 5 },
  servings: [
    { name: 'serving', grams: 40 },
    { name: 'package', grams: 500 },
  ],
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

describe('serving units', () => {
  it('offers the units a food has', () => {
    expect(validServings(oats)).toEqual(oats.servings);
  });

  it('offers no unit without a reference weight', () => {
    expect(validServings({})).toEqual([]);
    expect(
      validServings({
        servings: [
          { name: 'serving', grams: 0 },
          { name: 'package', grams: NaN },
          { name: '  ', grams: 50 },
        ],
      }),
    ).toEqual([]);
  });

  it('trims names and drops duplicates', () => {
    expect(
      validServings({
        servings: [
          { name: ' egg ', grams: 50 },
          { name: 'Egg', grams: 60 },
        ],
      }),
    ).toEqual([{ name: 'egg', grams: 50 }]);
  });

  it('labels units and counted portions', () => {
    expect(unitLabel({ name: 'egg', grams: 50 })).toBe('1 egg');
    expect(unitLabel({ name: '3 links', grams: 68 })).toBe('3 links');
    expect(portionLabel(4, { name: 'egg', grams: 50 })).toBe('4 × egg');
    expect(portionLabel(1.5, { name: '3 links', grams: 68 })).toBe('1.5 × 3 links');
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
    const e = makeEntry(oats, 40, 1000, 'id1', '1 × serving');
    expect(e).toMatchObject({
      id: 'id1',
      foodBarcode: '123',
      foodName: 'Oats',
      grams: 40,
      loggedAt: 1000,
      portion: '1 × serving',
    });
    expect(e.kcal).toBeCloseTo(152);
    expect('portion' in makeEntry(oats, 40, 1000, 'id2')).toBe(false);
  });

  it('rescales from its own snapshot when grams change, dropping the count', () => {
    const e = rescaleEntry(makeEntry(oats, 40, 1000, 'id1', '1 × serving'), 80);
    expect(e.grams).toBe(80);
    expect(e.kcal).toBeCloseTo(304);
    expect(e.protein_g).toBeCloseTo(10.4);
    expect(e.loggedAt).toBe(1000);
    expect(e.portion).toBeUndefined();
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
    expect(
      draftToFood({ name: ' X ', per100g: { kcal: 1, protein_g: 0 }, servings: [{ name: 'serving', grams: 0 }] }, 'b'),
    ).toEqual({ barcode: 'b', name: 'X', per100g: { kcal: 1, protein_g: 0 } });
  });

  it('keeps valid serving units', () => {
    const per100g = { kcal: 143, protein_g: 12.6 };
    expect(draftToFood({ name: 'Eggs', per100g, servings: [{ name: ' egg ', grams: 50 }] }, 'b')?.servings).toEqual([
      { name: 'egg', grams: 50 },
    ]);
  });
});

describe('migrateFood', () => {
  const base = { barcode: '1', name: 'Eggs', per100g: { kcal: 143, protein_g: 12.6 } };

  it('turns the old serving and package sizes into units', () => {
    expect(migrateFood({ ...base, servingSize_g: 50, servingName: 'egg', packageSize_g: 600 })).toEqual({
      ...base,
      servings: [
        { name: 'egg', grams: 50 },
        { name: 'package', grams: 600 },
      ],
    });
    expect(migrateFood({ ...base, servingSize_g: 30 }).servings).toEqual([{ name: 'serving', grams: 30 }]);
  });

  it('leaves foods without legacy sizes, or already migrated, alone', () => {
    expect(migrateFood(base)).toEqual(base);
    expect(migrateFood(oats)).toEqual(oats);
  });
});

describe('buildMeal', () => {
  const chicken: Food = { barcode: 'c', name: 'Canned chicken', per100g: { kcal: 100, protein_g: 20 } };
  const soup: Food = { barcode: 's', name: 'Lentil soup', per100g: { kcal: 60, protein_g: 4, carbs_g: 9 } };
  const items = [makeItem(chicken, 300), makeItem(soup, 500)]; // 600 kcal, 80 g protein, 800 g

  it('spreads the summed nutrition over the ingredient weight by default', () => {
    const meal = buildMeal({ name: ' Chicken soup ', items }, 'meal-1');
    expect(meal).toMatchObject({ barcode: 'meal-1', name: 'Chicken soup', custom: true, recipe: { items } });
    expect(meal?.per100g.kcal).toBeCloseTo(75);
    expect(meal?.per100g.protein_g).toBeCloseTo(10);
    expect(meal?.servings).toBeUndefined();
  });

  it('uses the cooked weight when given', () => {
    const meal = buildMeal({ name: 'Soup', items, cookedWeight_g: 600 }, 'm');
    expect(meal?.per100g.kcal).toBeCloseTo(100);
    expect(meal?.recipe?.cookedWeight_g).toBe(600);
  });

  it('adds a portion unit; all portions together equal the whole batch', () => {
    const meal = buildMeal({ name: 'Soup', items, portions: 2 }, 'm')!;
    expect(meal.servings).toEqual([{ name: 'portion', grams: 400 }]);
    const portion = nutritionForGrams(meal, 400);
    expect(portion.kcal * 2).toBeCloseTo(600);
    expect(portion.protein_g * 2).toBeCloseTo(80);
    // Same per-portion nutrition whatever the cooked weight is.
    const cooked = buildMeal({ name: 'Soup', items, portions: 2, cookedWeight_g: 650 }, 'm')!;
    expect(nutritionForGrams(cooked, cooked.servings![0].grams).kcal).toBeCloseTo(300);
  });

  it('needs a name and at least one ingredient with weight', () => {
    expect(buildMeal({ name: '', items }, 'm')).toBeUndefined();
    expect(buildMeal({ name: 'Soup', items: [] }, 'm')).toBeUndefined();
    expect(buildMeal({ name: 'Soup', items: [makeItem(soup, 0)] }, 'm')).toBeUndefined();
  });
});
