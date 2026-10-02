import { useState } from 'react';
import { shiftDay } from '../days';
import { dec, int, parseNum } from '../format';
import { dailyTotals, goalStatus } from '../nutrition';
import type { Goals, LogEntry } from '../types';

type Props = {
  day: string;
  today: string;
  dayLabel: string;
  entries: LogEntry[];
  goals: Goals;
  onPickDay: (day: string) => void;
  onScan: () => void;
  onFoods: () => void;
  onManual: () => void;
  onSettings: () => void;
  onUpdateEntry: (entry: LogEntry, grams: number) => void;
  onDeleteEntry: (id: string) => void;
};

// Bar fill, 0..1; no bar without a goal.
const fraction = (value: number, goal: number | undefined) => (goal && goal > 0 ? Math.min(1, value / goal) : 0);

export default function Today(p: Props) {
  const [editing, setEditing] = useState<{ id: string; grams: string } | null>(null);
  const totals = dailyTotals(p.entries);
  const status = goalStatus(p.goals, totals);
  const isToday = p.day === p.today;
  const editGrams = editing ? parseNum(editing.grams) : undefined;
  const macros = [
    { label: 'Carbs', value: totals.carbs_g, goal: p.goals.carbs_g },
    { label: 'Fat', value: totals.fat_g, goal: p.goals.fat_g },
    { label: status.proteinMet ? 'Protein ✓' : 'Protein', value: totals.protein_g, goal: p.goals.protein_g },
  ];

  return (
    <main className="screen">
      <header className="bar">
        <button aria-label="Previous day" onClick={() => p.onPickDay(shiftDay(p.day, -1))}>
          ‹
        </button>
        <h1>{p.dayLabel}</h1>
        <button aria-label="Next day" disabled={isToday} onClick={() => p.onPickDay(shiftDay(p.day, 1))}>
          ›
        </button>
        <button aria-label="Settings" onClick={p.onSettings}>
          ⚙
        </button>
      </header>
      {!isToday && (
        <button className="link" onClick={() => p.onPickDay(p.today)}>
          Back to today
        </button>
      )}

      <section className={'card' + (status.kcalOver ? ' bad' : '')}>
        <div className="label">Calories</div>
        <div className="row">
          <div>
            <span className="big">{int(totals.kcal)} cal</span>
            <span className="muted"> / {int(p.goals.kcal)}</span>
          </div>
          <div>
            <span className="big">{int(Math.abs(status.kcalLeft))}</span>
            <span className="muted"> {status.kcalOver ? 'over' : 'left'}</span>
          </div>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${fraction(totals.kcal, p.goals.kcal) * 100}%` }} />
        </div>
      </section>

      <section className="card macros">
        {macros.map((m) => (
          <div className="macro" key={m.label}>
            <div className="label">{m.label}</div>
            <div>
              <span className="big">{int(m.value)} g</span>
              {m.goal ? <span className="muted"> / {int(m.goal)}</span> : null}
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${fraction(m.value, m.goal) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>

      <button className="primary scan" onClick={p.onScan}>
        Scan
      </button>
      <div className="row">
        <button className="grow" onClick={p.onFoods}>
          My foods
        </button>
        <button className="grow" onClick={p.onManual}>
          Add manually
        </button>
      </div>

      <h2 className="label heading">Logged items</h2>
      <ul className="list">
        {p.entries.length === 0 && <li className="muted empty">Nothing logged.</li>}
        {p.entries.map((e) =>
          editing?.id === e.id ? (
            <li key={e.id} className="editing">
              <div className="name">{e.foodName}</div>
              <form
                className="row"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (!editGrams) return;
                  p.onUpdateEntry(e, editGrams);
                  setEditing(null);
                }}
              >
                <input
                  className="grow"
                  inputMode="decimal"
                  autoFocus
                  aria-label="Grams"
                  value={editing.grams}
                  onChange={(ev) => setEditing({ id: e.id, grams: ev.target.value })}
                />
                <span>g</span>
                <button className="primary" type="submit" disabled={!editGrams}>
                  Save
                </button>
              </form>
              <div className="row">
                <button
                  className="danger grow"
                  onClick={() => {
                    p.onDeleteEntry(e.id);
                    setEditing(null);
                  }}
                >
                  Delete
                </button>
                <button className="grow" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={e.id}>
              <button className="entry" onClick={() => setEditing({ id: e.id, grams: dec(e.grams) })}>
                <span className="name">
                  {e.foodName}
                  <span className="muted">
                    {' · '}
                    {e.portion ? `${e.portion} · ` : ''}
                    {dec(e.grams)} g
                  </span>
                </span>
                <span className="nums">
                  <strong>{dec(e.protein_g)} g</strong>
                  <span className="muted">{int(e.kcal)} kcal</span>
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </main>
  );
}
