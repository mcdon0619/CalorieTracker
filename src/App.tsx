import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Backup } from './backup';
import { dayKey, formatDay, timestampForDay } from './days';
import * as db from './db';
import { dec2 } from './format';
import { makeEntry, makeItem, normalizeBarcode, rescaleEntry } from './nutrition';
import { fetchDraft, fetchJson, lookup, mergeDraft } from './off';
import Foods from './screens/Foods';
import ManualAdd from './screens/ManualAdd';
import Meal, { type MealDraft } from './screens/Meal';
import Portion from './screens/Portion';
import Scan from './screens/Scan';
import Settings from './screens/Settings';
import Today from './screens/Today';
import type { Food, FoodDraft, Goals, LogEntry } from './types';

type Screen =
  | { name: 'today' }
  | { name: 'scan' }
  | { name: 'lookup'; barcode: string; error?: string }
  | { name: 'foods' }
  | { name: 'portion'; food: Food }
  | { name: 'manual'; draft: FoodDraft; notice?: string; rev?: number }
  | { name: 'meal' }
  | { name: 'settings' };

const HOME: Screen = { name: 'today' };
const isScannedBarcode = (barcode: string | undefined): barcode is string => !!barcode && /^\d+$/.test(barcode);

export default function App() {
  const [data, setData] = useState<db.AppData | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [screen, setScreen] = useState<Screen>(HOME);
  const [now, setNow] = useState(() => Date.now());
  const [pickedDay, setPickedDay] = useState<string | null>(null); // null = today
  // While a meal is being built, picked portions go into it instead of the log.
  const [meal, setMeal] = useState<MealDraft | null>(null);

  const reload = useCallback(
    () => db.loadAll().then(setData, (e) => setLoadError(e instanceof Error ? e.message : String(e))),
    [],
  );
  useEffect(() => void reload(), [reload]);

  // Keep "today" current: roll over at local midnight even if the app stays open.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const today = dayKey(now);
  const day = pickedDay ?? today;
  const dayLabel = formatDay(day, today);

  const dayEntries = useMemo(
    () =>
      (data?.log ?? []).filter((e) => dayKey(e.loggedAt) === day).sort((a, b) => a.loggedAt - b.loggedAt),
    [data, day],
  );

  if (loadError) return <main className="screen">Could not open local storage: {loadError}</main>;
  if (!data) return <main className="screen muted">Loading…</main>;

  const saveFood = async (food: Food) => {
    await db.putFood(food);
    setData((d) => d && { ...d, foods: [...d.foods.filter((f) => f.barcode !== food.barcode), food] });
  };

  // Saving an edited food keeps its place in the "my foods" order.
  const saveEdited = (food: Food) => {
    const lastUsedAt = data.foods.find((f) => f.barcode === food.barcode)?.lastUsedAt;
    return saveFood(lastUsedAt ? { ...food, lastUsedAt } : food);
  };

  const addPortion = async (food: Food, grams: number, portion?: string) => {
    if (meal) {
      setMeal({ ...meal, items: [...meal.items, makeItem(food, grams, portion)] });
      setScreen({ name: 'meal' });
      return;
    }
    const at = Date.now();
    const entry = makeEntry(food, grams, timestampForDay(day, at), crypto.randomUUID(), portion);
    await db.putEntry(entry);
    setData((d) => d && { ...d, log: [...d.log, entry] });
    await saveFood({ ...food, lastUsedAt: at });
    setScreen(HOME);
  };

  const updateEntry = async (entry: LogEntry, grams: number) => {
    const next = rescaleEntry(entry, grams);
    await db.putEntry(next);
    setData((d) => d && { ...d, log: d.log.map((e) => (e.id === next.id ? next : e)) });
  };

  const removeEntry = async (id: string) => {
    await db.deleteEntry(id);
    setData((d) => d && { ...d, log: d.log.filter((e) => e.id !== id) });
  };

  const saveGoals = async (goals: Goals) => {
    await db.putGoals(goals);
    setData((d) => d && { ...d, goals });
  };

  const importBackup = async (backup: Backup) => {
    await db.replaceAll(backup);
    await reload();
  };

  const handleBarcode = async (raw: string) => {
    const barcode = normalizeBarcode(raw);
    if (!barcode) return;
    setScreen({ name: 'lookup', barcode });
    try {
      const result = await lookup(barcode, {
        getCached: async (b) => data.foods.find((f) => f.barcode === b),
        setCached: saveFood,
        fetchJson,
      });
      if (result.kind === 'found') setScreen({ name: 'portion', food: result.food });
      else if (result.kind === 'incomplete') {
        setScreen({
          name: 'manual',
          draft: result.draft,
          notice: 'Found, but Open Food Facts is missing some values. Fill in the gaps.',
        });
      } else {
        setScreen({ name: 'manual', draft: { barcode }, notice: `No product found for ${barcode}. Add it?` });
      }
    } catch {
      setScreen({ name: 'lookup', barcode, error: 'Lookup failed. You may be offline.' });
    }
  };

  // Re-read a scanned food from Open Food Facts into the edit form (nothing is saved until Save).
  const refreshDraft = async (draft: FoodDraft, barcode: string) => {
    const rev = Date.now();
    try {
      const fresh = await fetchDraft(barcode, fetchJson);
      setScreen(
        fresh
          ? { name: 'manual', rev, draft: mergeDraft(draft, fresh), notice: 'Refreshed. Check the values and save.' }
          : { name: 'manual', rev, draft, notice: 'Open Food Facts has no product with this barcode.' },
      );
    } catch {
      setScreen({ name: 'manual', rev, draft, notice: 'Refresh failed. You may be offline.' });
    }
  };

  const startMeal = (food?: Food) => {
    setMeal({
      barcode: food?.barcode,
      name: food?.name ?? '',
      items: food?.recipe?.items ?? [],
      cooked: food?.recipe?.cookedWeight_g ? dec2(food.recipe.cookedWeight_g) : '',
      portions: food?.recipe?.portions ? dec2(food.recipe.portions) : '',
    });
    setScreen({ name: 'meal' });
  };

  const editFood = (food: Food) => (food.recipe ? startMeal(food) : setScreen({ name: 'manual', draft: food }));

  const back = () => setScreen(meal ? { name: 'meal' } : HOME);

  switch (screen.name) {
    case 'today':
      return (
        <Today
          day={day}
          today={today}
          dayLabel={dayLabel}
          entries={dayEntries}
          goals={data.goals}
          onPickDay={(d) => setPickedDay(d === today ? null : d)}
          onScan={() => setScreen({ name: 'scan' })}
          onFoods={() => setScreen({ name: 'foods' })}
          onManual={() => setScreen({ name: 'manual', draft: {} })}
          onSettings={() => setScreen({ name: 'settings' })}
          onUpdateEntry={updateEntry}
          onDeleteEntry={removeEntry}
        />
      );
    case 'scan':
      return <Scan onBarcode={handleBarcode} onBack={back} />;
    case 'lookup':
      return (
        <main className="screen">
          <header className="bar">
            <button onClick={back}>‹ Back</button>
            <h1>{screen.barcode}</h1>
          </header>
          {screen.error ? (
            <>
              <p className="notice bad">{screen.error}</p>
              <button className="primary" onClick={() => handleBarcode(screen.barcode)}>
                Retry
              </button>
              <button onClick={() => setScreen({ name: 'manual', draft: { barcode: screen.barcode } })}>
                Add manually instead
              </button>
            </>
          ) : (
            <p className="muted">Looking up…</p>
          )}
        </main>
      );
    case 'foods':
      return (
        <Foods
          foods={data.foods}
          building={!!meal}
          onPick={(food) => setScreen({ name: 'portion', food })}
          onEdit={editFood}
          onNewFood={() => setScreen({ name: 'manual', draft: {} })}
          onNewMeal={() => startMeal()}
          onBack={back}
        />
      );
    case 'portion': {
      const { food } = screen;
      return (
        <Portion
          key={food.barcode}
          food={food}
          addLabel={meal ? 'Add to meal' : dayLabel === 'Today' ? 'Add to log' : `Add to ${dayLabel}`}
          onAdd={(grams, portion) => addPortion(food, grams, portion)}
          onEdit={meal && food.recipe ? undefined : () => editFood(food)}
          onBack={back}
        />
      );
    }
    case 'manual': {
      const { draft } = screen;
      const barcode = draft.barcode;
      return (
        <ManualAdd
          key={screen.rev}
          draft={draft}
          notice={screen.notice}
          onSave={async (food) => {
            await saveEdited(food);
            setScreen({ name: 'portion', food });
          }}
          onRefresh={isScannedBarcode(barcode) ? () => refreshDraft(draft, barcode) : undefined}
          onBack={back}
        />
      );
    }
    case 'meal':
      if (!meal) return null;
      return (
        <Meal
          draft={meal}
          onChange={setMeal}
          onPickFood={() => setScreen({ name: 'foods' })}
          onScan={() => setScreen({ name: 'scan' })}
          onSave={async (food) => {
            await saveEdited(food);
            setMeal(null);
            setScreen({ name: 'portion', food });
          }}
          onCancel={() => {
            setMeal(null);
            setScreen({ name: 'foods' });
          }}
        />
      );
    case 'settings':
      return <Settings data={data} onSaveGoals={saveGoals} onImport={importBackup} onBack={back} />;
  }
}
