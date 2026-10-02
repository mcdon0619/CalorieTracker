import { useState } from 'react';
import { dec, int, parseNum } from '../format';
import { nutritionForGrams, portionShortcuts } from '../nutrition';
import type { Food } from '../types';

type Props = {
  food: Food;
  dayLabel: string;
  onAdd: (grams: number) => void;
  onEdit: () => void;
  onBack: () => void;
};

export default function Portion({ food, dayLabel, onAdd, onEdit, onBack }: Props) {
  const [grams, setGrams] = useState(food.servingSize_g ? dec(food.servingSize_g) : '');
  const amount = parseNum(grams);
  const valid = amount !== undefined && amount > 0;
  const preview = nutritionForGrams(food, amount ?? 0);
  const shortcuts = portionShortcuts(food);

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>Portion</h1>
        <button onClick={onEdit}>Edit food</button>
      </header>

      <section className="card">
        <div className="big">{food.name}</div>
        {food.brand && <div className="muted">{food.brand}</div>}
        <div className="sub">
          Per 100 g: {dec(food.per100g.protein_g)} g protein · {int(food.per100g.kcal)} kcal
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onAdd(amount);
        }}
      >
        <label className="field">
          Amount (g)
          <input inputMode="decimal" autoFocus value={grams} onChange={(e) => setGrams(e.target.value)} />
        </label>

        {shortcuts.length > 0 && (
          <div className="chips">
            {shortcuts.map((s) => (
              <button type="button" key={s.label} onClick={() => setGrams(dec(s.grams))}>
                {s.label}
                <span className="muted"> {dec(s.grams)} g</span>
              </button>
            ))}
          </div>
        )}

        <section className="card protein">
          <div className="hero">
            {dec(preview.protein_g)}
            <span className="unit"> g protein</span>
          </div>
          <div className="sub">{int(preview.kcal)} kcal</div>
        </section>

        <button className="primary scan" type="submit" disabled={!valid}>
          Add to {dayLabel === 'Today' ? 'log' : dayLabel}
        </button>
      </form>
    </main>
  );
}
