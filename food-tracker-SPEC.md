# Food / Calorie Tracker — Build Spec

A **pure static Progressive Web App** (React) to scan food barcodes, log portions to a daily
log, and track calories + protein against daily goals. **No backend, no API key, no database
server.** Open Food Facts allows CORS (verified), so the browser calls it directly; everything
is cached and stored locally on the device.

Built for me, on Android. Build to this doc; where it's silent, prefer the simplest thing that
works.

---

## 0. Ethos

- **One user: me.** No accounts, no sync, no sharing. All data is local to the device.
- **Local-first and offline.** After the first scan of a food, it's cached forever; the app
  works with no signal for foods I've seen before. The daily log is entirely local.
- **Ugly is fine, legible matters.** Glanceable. The protein progress is the thing I look at.
- **The log is sacred.** A history of what I ate has value — local-first, plus JSON export (§9).
- **Test the pure logic** — the portion/nutrition math (§4). Skip UI tests.

---

## 1. Architecture (the simplest on the list)

- **Pure static PWA.** No backend, no serverless function, no env vars.
- **Scan → cache-first lookup → log.** On scan: check local cache (IndexedDB) first; on a miss,
  fetch Open Food Facts directly from the browser, cache the result, use it.
- **Everything local:** the food cache, the daily log, goals, and (v2) recipes all live in
  IndexedDB / localStorage on the device.
- **Scanning** via the browser **BarcodeDetector API** (natively supported on Android Chrome).
- Host as static files on Vercel/Netlify/Cloudflare — free, HTTPS (required for camera + PWA
  install), installable to the home screen.

---

## 2. Barcode scanning (BarcodeDetector)

- Use the **BarcodeDetector API** (`new BarcodeDetector({ formats: [...] })`). Restrict formats
  to food barcodes for speed/accuracy: `ean_13`, `ean_8`, `upc_a`, `upc_e`.
- Camera via `getUserMedia({ video: { facingMode: 'environment' } })` → live `<video>` → run
  detection on frames until a barcode is found, then stop the stream.
- **Feature-detect** `BarcodeDetector`. If absent (some browsers), fall back to manual barcode
  entry or a JS library — but on my Android target it's present, so native is the primary path.
- On a successful scan, hand the barcode string to the lookup logic (§3).
- Requires HTTPS (camera won't open on plain HTTP) — satisfied by the static host.
- Barcode normalization note: if a UPC-A ever comes back as a 13-digit EAN with a leading zero,
  strip the leading zero before lookup. (Minor; mostly an iOS quirk, but normalize anyway.)

---

## 3. Open Food Facts lookup (cache-first)

Endpoint: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`

**Lookup logic:**
```
async function lookup(barcode):
  cached = idb.get('food:' + barcode)
  if cached: return cached                     // instant, offline
  res = fetch(OFF_URL(barcode))                // only on cache miss
  json = await res.json()
  if json.status !== 1:                        // NOT FOUND — see below
      return { notFound: true, barcode }
  food = normalize(json.product)               // extract the fields we store (§4)
  idb.set('food:' + barcode, food)
  return food
```

**CRITICAL — branch on `status`, NOT the HTTP code.** Open Food Facts returns **HTTP 200 even
when a product doesn't exist**, with `status: 0` in the body (`status: 1` = found). If you trust
the HTTP status you'll cache "not found" as if it were food. So: `json.status === 1` → found;
`=== 0` → not found → trigger the manual-add form (§6). Never cache a not-found result as a food.

**Etiquette:** send a descriptive `User-Agent` header identifying the app (OFF asks for this),
e.g. `MikeFoodTracker/1.0 (personal use)`. Be considerate — the cache-first design already
minimizes calls, which is the main ask.

**Data is crowdsourced and uneven** — any nutrition field can be missing, mislabeled, or in an
unexpected basis. Code every field as optional; never assume a field exists.

---

## 4. The food + portion model, and the math (pure functions — `src/nutrition.ts`, TESTED)

This is the core logic of the app. Get it right, test it.

### What we store per food
Open Food Facts gives nutrition **per 100g** (reliable, almost always present) and *sometimes*
**per serving** with a serving size. Store the per-100g values as the basis, plus any serving
reference if present. **Store ALL macros even though we only display calories + protein** — they
come free in the same response, and future-you will want the history.

```ts
type Food = {
  barcode: string;
  name: string;
  brand?: string;
  // per-100g basis (the reliable one):
  per100g: {
    kcal: number;
    protein_g: number;
    carbs_g?: number;
    fat_g?: number;
    sugar_g?: number;
    fiber_g?: number;
    sodium_mg?: number;
  };
  servingSize_g?: number;    // if OFF provides it (enables "1 serving" shortcut)
  packageSize_g?: number;    // if known (enables "half the package")
  custom?: boolean;          // true for manually-added foods
};
```

### The portion math (the load-bearing part)
A log entry records an **amount in grams**; calories/macros are derived from per-100g.

```ts
// Calories/macros for an eaten amount, from the per-100g basis.
function nutritionForGrams(food: Food, grams: number) {
  const f = grams / 100;
  return {
    kcal: food.per100g.kcal * f,
    protein_g: food.per100g.protein_g * f,
    carbs_g: (food.per100g.carbs_g ?? 0) * f,
    fat_g: (food.per100g.fat_g ?? 0) * f,
    // ...etc, each guarded for missing fields
  };
}
```

**Portion entry — grams is the always-works path; shortcuts only when data allows:**
- **Grams** (always available): user types the amount in grams. Primary path.
- **"1 serving" / "½ serving"**: only offered if `servingSize_g` exists → grams = servingSize × n.
- **"Whole package" / "half"**: only offered if `packageSize_g` exists → grams = packageSize × n.
- **Do NOT offer "half of this" when there's no reference weight** — "half" of an unknown amount
  is undefined. Gray out / hide shortcuts whose reference weight is missing; grams always works.

**Test (`nutrition.ts`):** grams→nutrition scaling (150g = 1.5× per-100g); missing optional
fields default to 0, not NaN; serving/package shortcut conversions; the "no reference weight →
no shortcut" rule; a zero/empty-field food doesn't crash.

---

## 5. Daily log + goals

### Log entries
```ts
type LogEntry = {
  id: string;
  foodBarcode?: string;      // or a ref to a custom food
  foodName: string;          // denormalized for display
  grams: number;             // the eaten amount
  kcal: number;              // computed at log time (snapshot)
  protein_g: number;
  // store other macros too (snapshotted), even if not displayed
  loggedAt: number;          // epoch ms
};
```
- **Snapshot the computed nutrition at log time** (don't recompute from the food later) — so if
  the cached food data ever changes, past log entries stay accurate to what you logged.
- **Grouped by date.** "Today" = entries whose `loggedAt` is today (device local time). Days roll
  over at local midnight.
- **Edit and delete** every entry — tap to change grams (recomputes), swipe/button to remove.
  A log you can't correct is useless after the first mistake.
- **Previous days viewable** (browse back); retroactive logging ("add to yesterday") is a nice-
  to-have — at minimum, keep all history, don't discard past days.

### Goals
```ts
type Goals = { kcal: number; protein_g: number };   // user-set, stored locally
```
- A settings spot to set daily **calorie** and **protein** goals.
- The live dashboard shows **consumed today** and **remaining** for both, but frames them
  differently:
  - **Calories = a ceiling.** Show "X kcal left" / how much room before the limit; exceeding is
    the bad case (indicate when over).
  - **Protein = a floor.** Show "Yg to go" as *progress toward* the target; meeting/exceeding is
    the good case (celebrate hitting it). **Make protein the prominent metric** (it's the focus).
- Pure function `dailyTotals(entries)` sums today's entries → `{ kcal, protein_g, ... }`; the
  dashboard subtracts from goals. Testable.

---

## 6. Manual entry (first-class, not a fallback)

Needed for (a) foods not in Open Food Facts (`status: 0`), and (b) non-barcoded foods (an apple,
a restaurant meal). Make it fast and pleasant — between missing products and loose foods, this
path gets real use.

- A form: name, per-100g kcal + protein (+ optional other macros), optional serving size.
- Saves as a `Food` with `custom: true`, cached locally like a scanned food so it's reusable.
- A "recent / my foods" quick-pick so re-logging a common manual food is one tap, not re-typing.
- Triggered automatically on a `status: 0` scan ("Not found — add it?") and available directly
  from the log screen ("add food manually").

---

## 7. Screens

1. **Today (home):** the dashboard — protein progress (prominent) + calories remaining, then
   today's log entries (editable/removable), a big "Scan" button, and "add manually".
2. **Scan:** camera view with BarcodeDetector; on hit → food + portion-entry sheet; on miss →
   manual-add prefilled with the barcode.
3. **Portion entry:** the food, a grams input (default to serving size if known), serving/package
   shortcuts when available, "add to log".
4. **Manual add:** the §6 form.
5. **Settings:** set calorie + protein goals; export data (§9).
6. **(Optional) History:** browse previous days.

Design: the protein number is the hero. Glanceable, honest, minimal. No decoration that doesn't
carry information.

---

## 8. Storage (all local)

- **IndexedDB** for the food cache (`food:{barcode}`) and the log (can be one store keyed by id,
  or a per-day structure). IndexedDB over localStorage — the cache can grow and these are
  structured records.
- Namespace keys so nothing collides if this ever joins a multi-app PWA library
  (`food:*`, `log:*`, `goals`, `recipe:*`).
- No browser-storage APIs beyond IndexedDB/localStorage; no network except Open Food Facts.

---

## 9. Export (the log is sacred)

- An "Export" button dumps the full local dataset (foods, log, goals, recipes) to a JSON file via
  the browser share/download. This is the entire backup story — no cloud, just a file I own.
- Offer a matching import (replace from a JSON file) with a confirm.

---

## 10. PWA + hosting

- `vite-plugin-pwa` for manifest + service worker; installable on Android home screen, runs in
  browser too.
- Service worker precaches the app shell (opens offline); the food cache + log are in IndexedDB
  (work offline); only a *new* food's first lookup needs network.
- Static host (Vercel/Netlify/Cloudflare), free tier, HTTPS automatic (required for camera + PWA).
- No env vars, no secrets, no backend — nothing to configure beyond pointing the host at the repo.

---

## 11. Build order

1. **Open Food Facts lookup + cache** (cache-first, `status` handling) — prove the data pipeline;
   test with real + fake barcodes in console first.
2. **`nutrition.ts` + tests** — the portion/nutrition math.
3. **Manual scan-less flow first:** type a barcode or pick a food → portion entry → log → today's
   totals. (Gets the whole loop working before touching the camera.)
4. **Daily log + goals dashboard** (protein prominent, calories as ceiling) with edit/delete.
5. **BarcodeDetector scanning** — wire the camera into step 3's flow.
6. **Manual-add** (§6) + "my foods" quick-pick.
7. **Export/import** (§9).
8. **PWA config + deploy**, install on phone, use it.
9. *(v2 — see §12)* recipes/meals.

Steps 1–4 are a usable tracker (type the barcode, log, track goals) before the camera even works
— scanning is an accelerator on top of a loop that already functions.

---

## 12. v2 — Recipes / Meals (deferred on purpose)

A "meal" is just a **named, saved bundle of portions** — e.g. "usual breakfast" = 2 eggs + 100g
oats + 1 banana. Logging it adds all components (or one summed entry) to today in one tap. The
logic is trivial — it reuses the §4 portion math, summed and saved under a name:

```ts
type Recipe = { id: string; name: string; items: { foodBarcode: string; grams: number }[] };
// totals = sum of nutritionForGrams(food, grams) across items
```

**Why deferred, not because it's hard:** a meal is a *composition of logged foods*, so it depends
entirely on scan→portion→log being rock-solid first. Build the core, use it for a couple weeks,
then add meals — by then you'll know which meals you actually repeat, and can even auto-suggest
them ("you've logged these 3 together 5 times — save as a meal?"), which is only possible because
the simple logging came first. Build the foundation, then compose on top of it.

---

## 13. Non-goals (v1)
No accounts/sync/sharing, no backend, no recipes (v2), no macro display beyond calories + protein
(but store all macros), no exercise/calorie-burn tracking, no weight tracking, no barcode-less
image recognition, no settings sprawl. Local-first, single-user, offline.
