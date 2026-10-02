import { useRef, useState } from 'react';
import { buildBackup, parseBackup, type Backup } from '../backup';
import { dayKey } from '../days';
import type { AppData } from '../db';
import { parseNum } from '../format';
import type { Goals } from '../types';

type Props = {
  data: AppData;
  onSaveGoals: (goals: Goals) => Promise<void>;
  onImport: (backup: Backup) => Promise<void>;
  onBack: () => void;
};

export default function Settings({ data, onSaveGoals, onImport, onBack }: Props) {
  const [kcal, setKcal] = useState(String(data.goals.kcal));
  const [protein, setProtein] = useState(String(data.goals.protein_g));
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const goals = { kcal: parseNum(kcal), protein_g: parseNum(protein) };
  const goalsValid = goals.kcal !== undefined && goals.protein_g !== undefined;

  const exportData = () => {
    const now = Date.now();
    const blob = new Blob([JSON.stringify(buildBackup(data, now), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food-tracker-${dayKey(now)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const ok = window.confirm(
        `Replace ALL data on this device with this file?\n\n` +
          `File: ${backup.log.length} log entries, ${backup.foods.length} foods.\n` +
          `Now: ${data.log.length} log entries, ${data.foods.length} foods.`,
      );
      if (!ok) return;
      await onImport(backup);
      setKcal(String(backup.goals.kcal));
      setProtein(String(backup.goals.protein_g));
      setMessage({ text: 'Imported.' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed.', bad: true });
    }
  };

  return (
    <main className="screen">
      <header className="bar">
        <button onClick={onBack}>‹ Back</button>
        <h1>Settings</h1>
      </header>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (goals.kcal === undefined || goals.protein_g === undefined) return;
          await onSaveGoals({ kcal: goals.kcal, protein_g: goals.protein_g });
          setMessage({ text: 'Goals saved.' });
        }}
      >
        <label className="field">
          Daily protein goal (g)
          <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
        <label className="field">
          Daily calorie limit (kcal)
          <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={!goalsValid}>
          Save goals
        </button>
      </form>

      <section className="card">
        <div className="label">Backup</div>
        <p className="muted">
          {data.log.length} log entries · {data.foods.length} foods. Stored only on this device.
        </p>
        <div className="row">
          <button className="grow" onClick={exportData}>
            Export JSON
          </button>
          <button className="grow" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </section>

      {message && <p className={'notice' + (message.bad ? ' bad' : '')}>{message.text}</p>}
    </main>
  );
}
