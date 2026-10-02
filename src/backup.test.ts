import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup } from './backup';
import { makeEntry } from './nutrition';
import type { Food } from './types';

const food: Food = { barcode: '1', name: 'Egg', per100g: { kcal: 143, protein_g: 12.6 } };
const data = { foods: [food], log: [makeEntry(food, 60, 5, 'e1')], goals: { kcal: 2000, protein_g: 150 }, recipes: [] };

describe('backup', () => {
  it('round-trips an export', () => {
    const backup = buildBackup(data, 0);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    const withMacros = buildBackup({ ...data, goals: { ...data.goals, carbs_g: 250, fat_g: 70 } }, 0);
    expect(parseBackup(JSON.stringify(withMacros)).goals).toEqual({ kcal: 2000, protein_g: 150, carbs_g: 250, fat_g: 70 });
  });

  it('rejects files that are not exports', () => {
    expect(() => parseBackup('nope')).toThrow(/JSON/);
    expect(() => parseBackup('{}')).toThrow(/Food Tracker/);
    expect(() => parseBackup(JSON.stringify({ ...buildBackup(data, 0), version: 2 }))).toThrow(/version/);
    expect(() => parseBackup(JSON.stringify({ ...buildBackup(data, 0), log: [{ id: 1 }] }))).toThrow(/log entry/);
    expect(() => parseBackup(JSON.stringify({ ...buildBackup(data, 0), goals: {} }))).toThrow(/goals/);
  });
});
