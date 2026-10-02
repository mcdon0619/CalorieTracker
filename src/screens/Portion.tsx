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
  const serving = food.servingSize_g && food.servingSize_g > 0 ? food.servingSize_g : undefined;
  const [grams, setGrams] = useState(serving ? dec(serving) : '');
  const [count, setCount] = useState(serving ? '1' : '');
  // Count and grams are two views of the same amount; grams is what gets logged.
  const changeGrams = (text: string) => {
    setGrams(text);
    const g = parseNum(text);
    if (serving) setCount(g === undefined ? '' : String(Math.round((g / serving) * 100) / 100));
  };
  const changeCount = (text: string) => {
    setCount(text);
    const c = parseNum(text);
    if (serving) setGrams(c === undefined ? '' : dec(c * serving));
  };
  const step = (delta: number) => changeCount(String(Math.max(0, (parseNum(count) ?? 0) + delta)));
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
        {serving && (
          <label className="field">
            How many (1 {food.servingName ?? 'serving'} = {dec(serving)} g)
            <div className="row">
              <button type="button" aria-label="One less" onClick={() => step(-1)}>
                −
              </button>
              <input
                className="grow count"
                inputMode="decimal"
                value={count}
                onChange={(e) => changeCount(e.target.value)}
              />
              <button type="button" aria-label="One more" onClick={() => step(1)}>
                +
              </button>
            </div>
          </label>
        )}
        <label className="field">
          Amount (g)
          <input inputMode="decimal" autoFocus={!serving} value={grams} onChange={(e) => changeGrams(e.target.value)} />
        </label>

        {shortcuts.length > 0 && (
          <div className="chips">
            {shortcuts.map((s) => (
              <button type="button" key={s.label} onClick={() => changeGrams(dec(s.grams))}>
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
