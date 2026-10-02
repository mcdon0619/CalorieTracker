import { useState } from 'react';
import { dec, dec2, parseNum } from '../format';
import { draftToFood, toPer100g } from '../nutrition';
import type { Food, FoodDraft, Per100g } from '../types';

type Props = {
  draft: FoodDraft;
  notice?: string;
  onSave: (food: Food) => void;
  onRefresh?: () => void; // re-read this barcode from Open Food Facts
  onBack: () => void;
};

const NUTRIENT_FIELDS: { key: keyof Per100g; label: string; required?: boolean }[] = [
  { key: 'kcal', label: 'Calories (kcal)', required: true },
  { key: 'protein_g', label: 'Protein (g)', required: true },
  { key: 'carbs_g', label: 'Carbs (g)' },
  { key: 'fat_g', label: 'Fat (g)' },
  { key: 'sugar_g', label: 'Sugar (g)' },
  { key: 'fiber_g', label: 'Fiber (g)' },
  { key: 'sodium_mg', label: 'Sodium (mg)' },
];

const show = (v: number | undefined) => (v === undefined ? '' : dec(v));
const EMPTY_UNIT = { name: '', grams: '' };

export default function ManualAdd({ draft, notice, onSave, onRefresh, onBack }: Props) {
  const [name, setName] = useState(draft.name ?? '');
  const [brand, setBrand] = useState(draft.brand ?? '');
  const [basis, setBasis] = useState('100');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, show(draft.per100g?.[f.key])])),
  );
  const [units, setUnits] = useState(() =>
    draft.servings?.length ? draft.servings.map((u) => ({ name: u.name, grams: dec2(u.grams) })) : [EMPTY_UNIT],
  );
  const setUnit = (index: number, patch: Partial<typeof EMPTY_UNIT>) =>
    setUnits(units.map((u, i) => (i === index ? { ...u, ...patch } : u)));

  const basisGrams = parseNum(basis);
  const entered: Partial<Per100g> = {};
  for (const f of NUTRIENT_FIELDS) {
    const v = parseNum(values[f.key]);
    if (v !== undefined) entered[f.key] = v;
  }
  const food = draftToFood(
    {
      name,
      brand,
      per100g: toPer100g(entered, basisGrams ?? 0),
      // A weight with no name is still a usable unit.
      servings: units.map((u) => ({ name: u.name.trim() || 'serving', grams: parseNum(u.grams) ?? 0 })),
    },
    draft.barcode ?? `custom-${crypto.randomUUID()}`,
  );

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>{draft.name ? 'Edit food' : 'Add food'}</h1>
      </header>
      {notice && <p className="notice">{notice}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (food) onSave({ ...food, custom: true });
        }}
      >
        <label className="field">
          Name
          <input autoFocus={!draft.name} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Brand (optional)
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>

        <label className="field">
          Nutrition values below are per (g)
          <input inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} />
        </label>
        {NUTRIENT_FIELDS.filter((f) => f.required).map((f) => (
          <label className="field" key={f.key}>
            {f.label}
            <input
              inputMode="decimal"
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}

        <div className="field">
          Serving sizes (optional). The first is the default.
          {units.map((u, i) => (
            <div className="row" key={i}>
              <input
                className="grow"
                placeholder="e.g. egg, 3 links"
                aria-label={`Serving ${i + 1} name`}
                value={u.name}
                onChange={(e) => setUnit(i, { name: e.target.value })}
              />
              <input
                className="grams"
                inputMode="decimal"
                placeholder="g"
                aria-label={`Serving ${i + 1} weight in grams`}
                value={u.grams}
                onChange={(e) => setUnit(i, { grams: e.target.value })}
              />
              <button
                type="button"
                aria-label={`Remove serving ${i + 1}`}
                onClick={() => setUnits(units.length > 1 ? units.filter((_, j) => j !== i) : [EMPTY_UNIT])}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setUnits([...units, EMPTY_UNIT])}>
            + Add serving size
          </button>
        </div>

        <details>
          <summary>More (optional)</summary>
          {NUTRIENT_FIELDS.filter((f) => !f.required).map((f) => (
            <label className="field" key={f.key}>
              {f.label}
              <input
                inputMode="decimal"
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </label>
          ))}
          {onRefresh && (
            <>
              <p className="muted">Barcode: {draft.barcode}</p>
              <button type="button" onClick={onRefresh}>
                Refresh from Open Food Facts
              </button>
            </>
          )}
        </details>

        <button className="primary scan" type="submit" disabled={!food}>
          Save food
        </button>
        {!food && <p className="muted">Needs a name, calories and protein.</p>}
      </form>
    </main>
  );
}
