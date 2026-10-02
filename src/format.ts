// Parse a user-typed non-negative number ("12,5" and "12.5" both work).
export function parseNum(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  if (t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

export const int = (v: number) => Math.round(v).toLocaleString();

// Up to two decimals, for values that get parsed back (form fields).
export const dec2 = (v: number) => String(Math.round(v * 100) / 100);

// Up to one decimal, without a trailing ".0".
export const dec = (v: number) => String(Math.round(v * 10) / 10);
