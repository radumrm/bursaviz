# Graph Report - FinVizTry  (2026-11-16)

## Corpus Check
- 171 files · ~701,187 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .css 2, (none) 1)

## Summary
- 349 nodes · 885 edges · 11 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Scraper & Data Fetching
- Header, Search & Heatmap
- Runtime Dependencies
- App Shell & Data Loading
- Price Chart & Aggregation
- Bar Charts & Sankey
- Financial Statements
- TypeScript Config
- Snapshot Table & Types
- Dev Dependencies
- News & Formatting

## God Nodes (most connected - your core abstractions)
1. `Home()` - 29 edges
2. `useSettings()` - 24 edges
3. `Stock()` - 23 edges
4. `fmtNum()` - 20 edges
5. `PriceChart()` - 19 edges
6. `fmtSignedPct()` - 19 edges
7. `fmtPrice()` - 18 edges
8. `scrapeTicker()` - 17 edges
9. `fmtBig()` - 15 edges
10. `signClass()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*` --references--> `Statements()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/components/Statements.tsx
- `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*` --references--> `useJson()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/lib/data.ts
- `Shared contracts (already in the repo — read these two files)` --references--> `SettingsProvider()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/lib/settings.tsx
- `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*` --references--> `SettingsProvider()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/lib/settings.tsx
- `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` --references--> `useSettings()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-bursaviz-v2.md → src/lib/settings.tsx

## Import Cycles
- None detected.

## Communities (11 total, 0 thin omitted)

### Community 0 - "Scraper & Data Fetching"
Cohesion: 0.06
Nodes (63): BursaViz v2 Implementation Plan, Global Constraints, Review Focus, Shared contracts (already in the repo — read these two files), Task 1: Scraper — 15-minute bars, FX, dividends, better news  *(agent: sonnet)*, dedupeNews(), ENT, isMarketRelevant() (+55 more)

### Community 1 - "Header, Search & Heatmap"
Cohesion: 0.12
Nodes (51): Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*, Header(), Heatmap(), tile(), BarChart(), MiniBars(), niceStep(), Point (+43 more)

### Community 2 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, d3-hierarchy, lightweight-charts, react, react-dom, description, devDependencies, @types/d3-hierarchy (+27 more)

### Community 3 - "App Shell & Data Loading"
Cohesion: 0.10
Nodes (30): d3-hierarchy, react, App(), colour(), GREEN, NEUTRAL_DARK, NEUTRAL_LIGHT, RED (+22 more)

### Community 4 - "Price Chart & Aggregation"
Cohesion: 0.07
Nodes (49): Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*, dayOf(), DEFAULT_ON, digitsFor(), IndDef, INDICATORS, IndId, INITIAL_BARS (+41 more)

### Community 5 - "Bar Charts & Sankey"
Cohesion: 0.20
Nodes (10): buildFlow(), FILL, Flow, FlowLink, FlowNode, layout(), pos(), RIBBON (+2 more)

### Community 6 - "Financial Statements"
Cohesion: 0.18
Nodes (13): BALANCE, CASHFLOW, endDate(), INCOME, periodLabel(), read(), RowDef, show() (+5 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 8 - "Snapshot Table & Types"
Cohesion: 0.13
Nodes (28): TickerResult, Groups(), Datum, analystLabel(), techLabel(), capId(), CAPS, DIVS (+20 more)

### Community 9 - "Dev Dependencies"
Cohesion: 0.33
Nodes (5): Actualizarea datelor, BursaViz, Limite cunoscute, Pornire, Structură

### Community 10 - "News & Formatting"
Cohesion: 0.40
Nodes (4): BursaViz, Commands, Orient cheaply, Rules of the codebase

## Knowledge Gaps
- **5 isolated node(s):** `@types/d3-hierarchy`, `@types/node`, `@types/react`, `@types/react-dom`, `typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 131 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell & Data Loading` to `Header, Search & Heatmap`, `Runtime Dependencies`, `Price Chart & Aggregation`, `Bar Charts & Sankey`, `Financial Statements`, `Snapshot Table & Types`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `useSettings()` (e.g. with `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` and `Task 3: Theme switch, currency switch, market news panel  *(agent: sonnet)*`) actually correct?**
  _`useSettings()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/d3-hierarchy`, `@types/node`, `@types/react` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scraper & Data Fetching` be split into smaller, more focused modules?**
  _Cohesion score 0.05859969558599695 - nodes in this community are weakly interconnected._
- **Why does `yahoo-finance2` connect `Runtime Dependencies` to `Scraper & Data Fetching`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PriceChart()` (e.g. with `Task 2: Chart — 15M / 30M intervals and an indicator menu  *(agent: opus)*` and `loadIndicators()`) actually correct?**
  _`PriceChart()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Header, Search & Heatmap` be split into smaller, more focused modules?**
  _Cohesion score 0.1191772534785239 - nodes in this community are weakly interconnected._