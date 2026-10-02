import { useState } from 'react';
import { dec, dec2, int, parseNum } from '../format';
import { nutritionForGrams, portionLabel, unitLabel, validServings } from '../nutrition';
import type { Food } from '../types';

type Props = {
  food: Food;
  addLabel: string;
  onAdd: (grams: number, portion?: string) => void;
  onEdit?: () => void;
  onBack: () => void;
};

const GRAMS_ONLY = -1;

export default function Portion({ food, addLabel, onAdd, onEdit, onBack }: Props) {
  const units = validServings(food);
  const [unitIndex, setUnitIndex] = useState(units.length ? 0 : GRAMS_ONLY);
  const unit = units[unitIndex];
  const [count, setCount] = useState(unit ? '1' : '');
  const [grams, setGrams] = useState(unit ? dec(unit.grams) : '');
  // Count and grams are two views of the same amount; whichever was typed last is the truth.
  const [typed, setTyped] = useState<'count' | 'grams'>(unit ? 'count' : 'grams');

  const counted = typed === 'count' && unit ? parseNum(count) : undefined;
  const amount = counted !== undefined && unit ? counted * unit.grams : parseNum(grams);
  const valid = amount !== undefined && amount > 0;
  const preview = nutritionForGrams(food, amount ?? 0);

  const changeCount = (text: string, perUnit = unit?.grams) => {
    setCount(text);
    setTyped('count');
    const c = parseNum(text);
    if (perUnit) setGrams(c === undefined ? '' : dec(c * perUnit));
  };
  const changeGrams = (text: string) => {
    setGrams(text);
    setTyped('grams');
    const g = parseNum(text);
    if (unit) setCount(g === undefined ? '' : dec2(g / unit.grams));
  };
  const pickUnit = (index: number) => {
    setUnitIndex(index);
    if (index === GRAMS_ONLY) setTyped('grams');
    else changeCount(String(parseNum(count) ?? 1), units[index].grams);
  };
  const step = (delta: number) => changeCount(String(Math.max(0, (parseNum(count) ?? 0) + delta)));

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>Portion</h1>
        {onEdit && <button onClick={onEdit}>Edit food</button>}
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
          if (valid) onAdd(amount, counted !== undefined && unit ? portionLabel(counted, unit) : undefined);
        }}
      >
        {units.length > 0 && (
          <div className="chips" role="group" aria-label="Serving size">
            {units.map((u, i) => (
              <button
                type="button"
                key={u.name}
                className={i === unitIndex ? 'on' : ''}
                aria-pressed={i === unitIndex}
                onClick={() => pickUnit(i)}
              >
                {unitLabel(u)}
                <span className="muted"> {dec(u.grams)} g</span>
              </button>
            ))}
            <button
              type="button"
              className={unitIndex === GRAMS_ONLY ? 'on' : ''}
              aria-pressed={unitIndex === GRAMS_ONLY}
              onClick={() => pickUnit(GRAMS_ONLY)}
            >
              grams
            </button>
          </div>
        )}

        {unit && (
          <label className="field">
            How many × {unitLabel(unit)}
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
          <input
            key={unit ? 'with-unit' : 'grams-only'}
            inputMode="decimal"
            autoFocus={!unit}
            value={grams}
            onChange={(e) => changeGrams(e.target.value)}
          />
        </label>

        <section className="card protein">
          <div className="hero">
            {dec(preview.protein_g)}
            <span className="unit"> g protein</span>
          </div>
          <div className="sub">{int(preview.kcal)} kcal</div>
        </section>

        <button className="primary scan" type="submit" disabled={!valid}>
          {addLabel}
        </button>
      </form>
    </main>
  );
}
