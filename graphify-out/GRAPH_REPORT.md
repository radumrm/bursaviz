# Graph Report - FinVizTry  (2026-11-18)

## Corpus Check
- 206 files · ~114,639 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: .css 11, (none) 1)

## Summary
- 677 nodes · 1970 edges · 24 communities
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e4ca3a8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- scrape.ts
- Home.tsx
- package.json
- settings.tsx
- PriceChart.tsx
- Calendar.tsx
- Statements.tsx
- TypeScript Config
- useSettings
- Dev Dependencies
- News & Formatting
- Compare.tsx
- Portfolio.tsx
- scrapeTicker
- news.ts
- aggregate.ts
- indicators.ts
- derived.ts
- Dividends.tsx
- ref_node_assert
- indices.ts
- PriceChart
- types.ts
- Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*

## God Nodes (most connected - your core abstractions)
1. `fmtSignedPct()` - 43 edges
2. `useSettings()` - 43 edges
3. `fmtNum()` - 39 edges
4. `PriceChart()` - 38 edges
5. `stockHref()` - 34 edges
6. `signClass()` - 32 edges
7. `Home()` - 32 edges
8. `fmtPrice()` - 31 edges
9. `Compare()` - 30 edges
10. `fmtBig()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Task 1: Scraper — 15-minute bars, FX, dividends, better news  *(agent: sonnet)*` --references--> `toIntra()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → scripts/scrape.ts
- `Task 1: Scraper — 15-minute bars, FX, dividends, better news  *(agent: sonnet)*` --references--> `TickerDef`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → scripts/tickers.ts
- `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*` --references--> `MiniBars()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/components/MiniBars.tsx
- `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` --references--> `PriceChart()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/components/PriceChart.tsx
- `What exists` --references--> `PriceChart()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v3.md → src/components/PriceChart.tsx

## Import Cycles
- None detected.

## Communities (24 total, 0 thin omitted)

### Community 0 - "scrape.ts"
Cohesion: 0.08
Nodes (22): Publication, PUBLICATIONS, ALL_MARKET, BET_COMPUTED, dateFmt, LOOSE, MetaFile, MetaTicker (+14 more)

### Community 1 - "Home.tsx"
Cohesion: 0.08
Nodes (71): react, Groups(), Card(), IndexStrip(), Perf(), Spark(), News(), PeersTable() (+63 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (34): dependencies, d3-hierarchy, lightweight-charts, react, react-dom, description, devDependencies, @types/d3-hierarchy (+26 more)

### Community 3 - "settings.tsx"
Cohesion: 0.13
Nodes (18): BursaViz v2 Implementation Plan, Global Constraints, Review Focus, Shared contracts (already in the repo — read these two files), react-dom, Ctx, CURRENCIES, initialCurrency() (+10 more)

### Community 4 - "PriceChart.tsx"
Cohesion: 0.06
Nodes (32): C_CMP, CompareLine, Convert, DEFAULT_ON, EventModel, EvItem, FUTURE_MAX, IndDef (+24 more)

### Community 5 - "Calendar.tsx"
Cohesion: 0.07
Nodes (58): BursaViz v3 — shared brief for parallel agents, Looking at your work, Report, Rules, What exists, App(), Header(), Star() (+50 more)

### Community 6 - "Statements.tsx"
Cohesion: 0.08
Nodes (28): BarChart(), MiniBars(), niceStep(), Point, shortNum(), buildFlow(), FILL, Flow (+20 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 8 - "useSettings"
Cohesion: 0.06
Nodes (62): Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*, d3-hierarchy, TickerResult, colour(), Datum, GREEN, Heatmap(), tile() (+54 more)

### Community 9 - "Dev Dependencies"
Cohesion: 0.33
Nodes (5): Actualizarea datelor, BursaViz, Limite cunoscute, Pornire, Structură

### Community 10 - "News & Formatting"
Cohesion: 0.40
Nodes (4): BursaViz, Commands, Orient cheaply, Rules of the codebase

### Community 11 - "Compare.tsx"
Cohesion: 0.07
Nodes (55): alignOnCommonDates(), annualisedVolatility(), asRange(), assignSlots(), bestIndexes(), Better, byCapDesc(), correlation() (+47 more)

### Community 12 - "Portfolio.tsx"
Cohesion: 0.10
Nodes (39): compute(), Computed, firstOversell(), Holding, ImportResult, isNum(), loadTransactions(), MarketInfo (+31 more)

### Community 13 - "scrapeTicker"
Cohesion: 0.17
Nodes (22): applyDividendFields(), cagr(), fetchFx(), growth(), iso(), localEpoch(), main(), num() (+14 more)

### Community 14 - "news.ts"
Cohesion: 0.21
Nodes (19): Task 1: Scraper — 15-minute bars, FX, dividends, better news  *(agent: sonnet)*, cleanSource(), dedupeNews(), ENT, isMarketRelevant(), isRelevant(), MARKET_TERMS, normalizeTitle() (+11 more)

### Community 15 - "aggregate.ts"
Cohesion: 0.20
Nodes (15): bucketOf(), candlesFor(), dayMs(), futureSlots(), group(), heikinAshi(), indexForDay(), isoDay() (+7 more)

### Community 16 - "indicators.ts"
Cohesion: 0.21
Nodes (15): atr(), bollinger(), f1(), mean(), obv(), RatingLabel, rsi(), sign() (+7 more)

### Community 17 - "derived.ts"
Cohesion: 0.16
Nodes (14): bucharestDay(), buildCalendar(), buildNewsAll(), CALENDAR_YEARS, CalendarStock, dayFmt, NEWS_ALL_CAP, posNum() (+6 more)

### Community 18 - "Dividends.tsx"
Cohesion: 0.25
Nodes (15): amt(), Bar, Dividends(), isNarrow(), niceStep(), subscribeNarrow(), YearChart(), changes() (+7 more)

### Community 19 - "ref_node_assert"
Cohesion: 0.19
Nodes (10): divCagr(), dividendFields, ttmDividend(), yearsBefore(), EXIT, keepPrevious(), MIN_REFRESHED, runExit() (+2 more)

### Community 20 - "indices.ts"
Cohesion: 0.29
Nodes (10): capWeightedIndex(), Close, dailyFromHourly(), dayFmt, Member, mergeCloses(), perf, round2() (+2 more)

### Community 21 - "PriceChart"
Cohesion: 0.24
Nodes (12): digitsFor(), firstAtOrAfter(), inCurrency(), loadChoice(), loadIndicators(), PriceChart(), readKey(), saveIndicators() (+4 more)

### Community 22 - "types.ts"
Cohesion: 0.29
Nodes (7): repairDaily(), CalendarEvent, DailyBar, IndexSeries, IntraBar, Officer, Snapshot

### Community 23 - "Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*"
Cohesion: 0.50
Nodes (5): Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*, Props, Tf, BarsFile, ChartEvents

## Knowledge Gaps
- **5 isolated node(s):** `@types/d3-hierarchy`, `@types/node`, `@types/react`, `@types/react-dom`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 240 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Home.tsx` to `package.json`, `settings.tsx`, `PriceChart.tsx`, `Calendar.tsx`, `Statements.tsx`, `useSettings`, `Compare.tsx`, `Portfolio.tsx`, `Dividends.tsx`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useSettings()` (e.g. with `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` and `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*`) actually correct?**
  _`useSettings()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/d3-hierarchy`, `@types/node`, `@types/react` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `scrape.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07635467980295567 - nodes in this community are weakly interconnected._
- **Why does `IndexRow` connect `useSettings` to `scrape.ts`, `Home.tsx`, `Calendar.tsx`, `Compare.tsx`, `types.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `PriceChart()` (e.g. with `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` and `What exists`) actually correct?**
  _`PriceChart()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Home.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07588075880758807 - nodes in this community are weakly interconnected._