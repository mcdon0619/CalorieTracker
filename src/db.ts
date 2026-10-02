import { clear, createStore, del, entries, set, setMany } from 'idb-keyval';
import type { Backup } from './backup';
import type { Food, Goals, LogEntry, Recipe } from './types';

// One IndexedDB store; keys are namespaced: food:{barcode}, log:{id}, recipe:{id}, goals.
const store = createStore('food-tracker', 'kv');

export const DEFAULT_GOALS: Goals = { kcal: 2000, protein_g: 150 };

export type AppData = { foods: Food[]; log: LogEntry[]; goals: Goals; recipes: Recipe[] };

export async function loadAll(): Promise<AppData> {
  const data: AppData = { foods: [], log: [], goals: DEFAULT_GOALS, recipes: [] };
  for (const [key, value] of await entries(store)) {
    if (typeof key !== 'string') continue;
    if (key.startsWith('food:')) data.foods.push(value as Food);
    else if (key.startsWith('log:')) data.log.push(value as LogEntry);
    else if (key.startsWith('recipe:')) data.recipes.push(value as Recipe);
    else if (key === 'goals') data.goals = value as Goals;
  }
  return data;
}

export const putFood = (food: Food) => set('food:' + food.barcode, food, store);
export const putEntry = (entry: LogEntry) => set('log:' + entry.id, entry, store);
export const deleteEntry = (id: string) => del('log:' + id, store);
export const putGoals = (goals: Goals) => set('goals', goals, store);

// Import: replace everything with the contents of a backup.
export async function replaceAll(backup: Backup): Promise<void> {
  await clear(store);
  await setMany(
    [
      ...backup.foods.map((f): [string, unknown] => ['food:' + f.barcode, f]),
      ...backup.log.map((e): [string, unknown] => ['log:' + e.id, e]),
      ...backup.recipes.map((r): [string, unknown] => ['recipe:' + r.id, r]),
      ['goals', backup.goals],
    ],
    store,
  );
}
