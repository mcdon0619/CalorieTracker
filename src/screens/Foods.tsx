import { useMemo, useState } from 'react';
import { dec, int } from '../format';
import type { Food } from '../types';

type Props = {
  foods: Food[];
  onPick: (food: Food) => void;
  onEdit: (food: Food) => void;
  onManual: () => void;
  onBack: () => void;
};

export default function Foods({ foods, onPick, onEdit, onManual, onBack }: Props) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return foods
      .filter((f) => !q || `${f.name} ${f.brand ?? ''} ${f.barcode}`.toLowerCase().includes(q))
      .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name));
  }, [foods, query]);

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>My foods</h1>
        <button onClick={onManual}>+ New</button>
      </header>
      <input placeholder="Search" aria-label="Search foods" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="list">
        {shown.length === 0 && (
          <li className="muted empty">{foods.length ? 'No matches.' : 'No foods yet. Scan or add one.'}</li>
        )}
        {shown.map((f) => (
          <li key={f.barcode} className="row">
            <button className="entry grow" onClick={() => onPick(f)}>
              <span className="name">
                {f.name}
                {f.brand && <span className="muted"> · {f.brand}</span>}
              </span>
              <span className="nums">
                <strong>{dec(f.per100g.protein_g)} g</strong>
                <span className="muted">{int(f.per100g.kcal)} kcal /100g</span>
              </span>
            </button>
            <button aria-label={`Edit ${f.name}`} onClick={() => onEdit(f)}>
              ✎
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
