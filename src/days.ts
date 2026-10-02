// Days are local-time "YYYY-MM-DD" keys; they roll over at local midnight.

const pad = (v: number) => String(v).padStart(2, '0');

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

export function shiftDay(key: string, delta: number): string {
  const [y, m, d] = parts(key);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
}

// Timestamp for a new entry on `key`: that date, at the current time of day.
export function timestampForDay(key: string, now: number): number {
  if (dayKey(now) === key) return now;
  const [y, m, d] = parts(key);
  const t = new Date(now);
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).getTime();
}

export function formatDay(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, -1)) return 'Yesterday';
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: y === parts(todayKey)[0] ? undefined : 'numeric',
  });
}
