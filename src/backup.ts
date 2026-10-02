import type { Food, Goals, LogEntry, Recipe } from './types';

export type Backup = {
  app: 'food-tracker';
  version: 1;
  exportedAt: string;
  foods: Food[];
  log: LogEntry[];
  goals: Goals;
  recipes: Recipe[];
};

export function buildBackup(data: Omit<Backup, 'app' | 'version' | 'exportedAt'>, now: number): Backup {
  return { app: 'food-tracker', version: 1, exportedAt: new Date(now).toISOString(), ...data };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Validates an export file. Throws with a readable message if it isn't one.
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  if (!isObj(json) || json.app !== 'food-tracker') throw new Error('Not a Food Tracker export file.');
  if (json.version !== 1) throw new Error(`Unsupported export version: ${String(json.version)}`);

  const { foods, log, goals, recipes } = json;
  if (!Array.isArray(foods) || !Array.isArray(log)) throw new Error('Export is missing foods or log.');
  for (const f of foods) {
    if (!isObj(f) || typeof f.barcode !== 'string' || typeof f.name !== 'string' || !isObj(f.per100g)) {
      throw new Error('Export contains an invalid food.');
    }
  }
  for (const e of log) {
    if (!isObj(e) || typeof e.id !== 'string' || !isNum(e.grams) || !isNum(e.loggedAt)) {
      throw new Error('Export contains an invalid log entry.');
    }
  }
  if (!isObj(goals) || !isNum(goals.kcal) || !isNum(goals.protein_g)) throw new Error('Export has invalid goals.');
  const validRecipes = Array.isArray(recipes) ? recipes.filter((r) => isObj(r) && typeof r.id === 'string') : [];

  return {
    app: 'food-tracker',
    version: 1,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
    foods: foods as Food[],
    log: log as LogEntry[],
    goals: { kcal: goals.kcal, protein_g: goals.protein_g },
    recipes: validRecipes as Recipe[],
  };
}
