import { useState } from 'react';
import { dec, parseNum } from '../format';
import { draftToFood, toPer100g } from '../nutrition';
import type { Food, FoodDraft, Per100g } from '../types';

type Props = {
  draft: FoodDraft;
  notice?: string;
  onSave: (food: Food) => void;
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

export default function ManualAdd({ draft, notice, onSave, onBack }: Props) {
  const [name, setName] = useState(draft.name ?? '');
  const [brand, setBrand] = useState(draft.brand ?? '');
  const [basis, setBasis] = useState('100');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.key, show(draft.per100g?.[f.key])])),
  );
  const [serving, setServing] = useState(show(draft.servingSize_g));
  const [pack, setPack] = useState(show(draft.packageSize_g));

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
      servingSize_g: parseNum(serving),
      packageSize_g: parseNum(pack),
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

        <label className="field">
          Serving size (g, optional)
          <input inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} />
        </label>

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
          <label className="field">
            Package size (g)
            <input inputMode="decimal" value={pack} onChange={(e) => setPack(e.target.value)} />
          </label>
          {draft.barcode && !draft.barcode.startsWith('custom-') && (
            <p className="muted">Barcode: {draft.barcode}</p>
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
