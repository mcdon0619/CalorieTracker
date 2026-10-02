# Food Tracker

Static PWA: scan a food barcode, log a portion, track protein and calories against daily goals.
No backend; all data lives in IndexedDB on the device. Spec: [food-tracker-SPEC.md](food-tracker-SPEC.md).

## Commands

```
npm install
npm run dev      # local dev server (camera works on localhost, not over LAN http)
npm test         # unit tests for the pure logic
npm run build    # type-check + production build into dist/
npm run preview  # serve dist/ locally, with the service worker
npm run icons    # regenerate public/icon-*.png
```

## Deploy

Any static host with HTTPS. Push this repo to GitHub, import it in Vercel / Netlify / Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`

No env vars. Open the deployed URL in Chrome on Android, then menu → "Add to Home screen".

## Layout

- `src/nutrition.ts` — portion maths, totals, goal status (tested)
- `src/off.ts` — Open Food Facts cache-first lookup and normalisation (tested)
- `src/days.ts`, `src/backup.ts` — local-day keys, export/import format (tested)
- `src/db.ts` — IndexedDB, keys namespaced `food:*`, `log:*`, `recipe:*`, `goals`
- `src/screens/` — Today, Scan, Portion, ManualAdd, Foods, Settings
