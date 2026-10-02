import { dec, int, parseNum } from '../format';
import { buildMeal, dailyTotals, nutritionForGrams } from '../nutrition';
import type { Food, RecipeItem } from '../types';

// A meal being built; lives in App so it survives the trip to scan / pick an ingredient.
export type MealDraft = {
  barcode?: string; // set when editing an existing meal
  name: string;
  items: RecipeItem[];
  cooked: string;
  portions: string;
};

type Props = {
  draft: MealDraft;
  onChange: (draft: MealDraft) => void;
  onPickFood: () => void;
  onScan: () => void;
  onSave: (meal: Food) => void;
  onCancel: () => void;
};

export default function Meal({ draft, onChange, onPickFood, onScan, onSave, onCancel }: Props) {
  const totals = dailyTotals(draft.items);
  const rawWeight = draft.items.reduce((sum, i) => sum + i.grams, 0);
  const meal = buildMeal(
    {
      name: draft.name,
      items: draft.items,
      cookedWeight_g: parseNum(draft.cooked),
      portions: parseNum(draft.portions),
    },
    draft.barcode ?? `meal-${crypto.randomUUID()}`,
  );
  const portion = meal?.servings?.[0];

  return (
    <main className="screen">
      <header className="bar">
        <button
          onClick={() => {
            if (draft.items.length === 0 || window.confirm('Discard this meal?')) onCancel();
          }}
        >
          ‹ Cancel
        </button>
        <h1>{draft.barcode ? 'Edit meal' : 'New meal'}</h1>
      </header>

      <label className="field">
        Meal name
        <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      </label>

      <div className="label">Ingredients</div>
      <ul className="list">
        {draft.items.length === 0 && <li className="muted empty">Add everything that goes in the pot.</li>}
        {draft.items.map((item, i) => (
          <li key={i} className="row">
            <div className="entry grow">
              <span className="name">
                {item.foodName}
                <span className="muted">
                  {' · '}
                  {item.portion ? `${item.portion} · ` : ''}
                  {dec(item.grams)} g
                </span>
              </span>
              <span className="nums">
                <strong>{dec(item.protein_g)} g</strong>
                <span className="muted">{int(item.kcal)} kcal</span>
              </span>
            </div>
            <button
              aria-label={`Remove ${item.foodName}`}
              onClick={() => onChange({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="grow" onClick={onScan}>
          Scan ingredient
        </button>
        <button className="grow" onClick={onPickFood}>
          From my foods
        </button>
      </div>

      <label className="field">
        Makes how many portions (optional)
        <input
          inputMode="decimal"
          value={draft.portions}
          onChange={(e) => onChange({ ...draft, portions: e.target.value })}
        />
      </label>
      <label className="field">
        Finished weight in g (optional, if you weigh the pot)
        <input
          inputMode="decimal"
          placeholder={rawWeight ? `${dec(rawWeight)} (ingredients)` : ''}
          value={draft.cooked}
          onChange={(e) => onChange({ ...draft, cooked: e.target.value })}
        />
      </label>

      <section className="card">
        <div className="label">Whole batch</div>
        <div className="sub">
          {dec(totals.protein_g)} g protein · {int(totals.kcal)} kcal
        </div>
        {meal && portion && (
          <>
            <div className="label">Per portion ({dec(portion.grams)} g)</div>
            <div className="big">
              {dec(nutritionForGrams(meal, portion.grams).protein_g)} g protein ·{' '}
              {int(nutritionForGrams(meal, portion.grams).kcal)} kcal
            </div>
          </>
        )}
      </section>

      <button className="primary scan" disabled={!meal} onClick={() => meal && onSave(meal)}>
        Save meal
      </button>
      {!meal && <p className="muted">Needs a name and at least one ingredient.</p>}
    </main>
  );
}
