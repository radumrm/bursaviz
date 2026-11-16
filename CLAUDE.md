# BursaViz

FinViz-style site for the Bucharest Stock Exchange. Scraper → static JSON → Vite + React (no backend).

## Orient cheaply

- Read `graphify-out/GRAPH_REPORT.md` (≈5 KB map of files, hubs and communities) before opening source files.
  For "what calls X / how does Y flow", run `graphify query "<question>"` instead of grepping.
- After changing code structure, refresh the map with `/graphify . --update`.
- Never read `public/data/**` (21 MB of scraped JSON) — the shapes are in `src/lib/types.ts`.

## Commands

- `npm run dev` · `npm run build` (type-check + bundle) · `npm test` (node --test, pure functions only)
- `npm run scrape` (all tickers) · `npm run scrape -- TLV H2O` (subset)

## Rules of the codebase

- Finance labels stay in English as on FinViz (P/E, EPS, Balance Sheet); site chrome is Romanian.
- Money shown in the UI goes through `useSettings().convert / unit` (`src/lib/settings.tsx`).
- `src/lib/indicators.ts` and `src/lib/aggregate.ts` are imported by Node scripts and tests:
  keep them free of runtime imports (type-only imports are fine).
- Missing data is shown as "-" with a tooltip; never invent values.
- Yahoo is reached only through `yahoo-finance2`; if it rate-limits (429), stop and retry later — do not work around it.
