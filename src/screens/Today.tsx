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

export default function Today(p: Props) {
  const [editing, setEditing] = useState<{ id: string; grams: string } | null>(null);
  const totals = dailyTotals(p.entries);
  const status = goalStatus(p.goals, totals);
  const isToday = p.day === p.today;
  const editGrams = editing ? parseNum(editing.grams) : undefined;

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

      <section className={'card protein' + (status.proteinMet ? ' good' : '')}>
        <div className="label">Protein</div>
        <div className="hero">
          {int(totals.protein_g)}
          <span className="unit"> / {int(p.goals.protein_g)} g</span>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${status.proteinFraction * 100}%` }} />
        </div>
        <div className="sub">{status.proteinMet ? '✓ Goal hit' : `${int(status.proteinToGo)} g to go`}</div>
      </section>

      <section className={'card' + (status.kcalOver ? ' bad' : '')}>
        <div className="label">Calories</div>
        <div className="row">
          <div className="big">
            {status.kcalOver ? `${int(-status.kcalLeft)} kcal over` : `${int(status.kcalLeft)} kcal left`}
          </div>
          <div className="muted">
            {int(totals.kcal)} / {int(p.goals.kcal)}
          </div>
        </div>
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
