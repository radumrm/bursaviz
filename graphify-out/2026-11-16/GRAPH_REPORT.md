# Graph Report - FinVizTry  (2026-11-16)

## Corpus Check
- Large corpus: 165 files · ~688,325 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 212 nodes · 475 edges · 11 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
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
1. `Stock()` - 21 edges
2. `fmtNum()` - 18 edges
3. `Home()` - 15 edges
4. `fmtPrice()` - 14 edges
5. `fmtBig()` - 14 edges
6. `fmtSignedPct()` - 14 edges
7. `compilerOptions` - 13 edges
8. `react` - 12 edges
9. `scrapeTicker()` - 12 edges
10. `signClass()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `scrapeTicker()` --calls--> `technicals`  [EXTRACTED]
  scripts/scrape.ts → src/lib/indicators.ts
- `App()` --calls--> `Header()`  [EXTRACTED]
  src/App.tsx → src/components/Header.tsx
- `App()` --calls--> `Home()`  [EXTRACTED]
  src/App.tsx → src/pages/Home.tsx
- `Datum` --references--> `IndexRow`  [EXTRACTED]
  src/components/Heatmap.tsx → src/lib/types.ts
- `shortNum()` --calls--> `fmtNum()`  [EXTRACTED]
  src/components/MiniBars.tsx → src/lib/format.ts

## Import Cycles
- None detected.

## Communities (11 total, 0 thin omitted)

### Community 0 - "Scraper & Data Fetching"
Cohesion: 0.11
Nodes (26): cagr(), dateFmt, ENT, fetchNews(), growth(), iso(), localEpoch(), LOOSE (+18 more)

### Community 1 - "Header, Search & Heatmap"
Cohesion: 0.21
Nodes (26): Header(), colour(), Datum, GREEN, Heatmap(), NEUTRAL, RED, SnapshotTable() (+18 more)

### Community 2 - "Runtime Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, d3-hierarchy, lightweight-charts, react, react-dom, description, name, private (+17 more)

### Community 3 - "App Shell & Data Loading"
Cohesion: 0.16
Nodes (20): react, react-dom, App(), cache, dataUrl(), Loaded, loadJson(), useJson() (+12 more)

### Community 4 - "Price Chart & Aggregation"
Cohesion: 0.16
Nodes (20): INITIAL_BARS, MONTHS, pad(), PriceChart(), Props, TFS, timeLabel(), Candle (+12 more)

### Community 5 - "Bar Charts & Sankey"
Cohesion: 0.15
Nodes (16): BarChart(), MiniBars(), niceStep(), Point, shortNum(), buildFlow(), FILL, Flow (+8 more)

### Community 6 - "Financial Statements"
Cohesion: 0.18
Nodes (13): BALANCE, CASHFLOW, endDate(), INCOME, periodLabel(), read(), RowDef, show() (+5 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+6 more)

### Community 8 - "Snapshot Table & Types"
Cohesion: 0.24
Nodes (8): Cell, NA, Part, DASH, IntraBar, Officer, Snapshot, StockFile

### Community 9 - "Dev Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, @types/d3-hierarchy, @types/node, @types/react, @types/react-dom, typescript, vite, @vitejs/plugin-react (+1 more)

### Community 10 - "News & Formatting"
Cohesion: 0.47
Nodes (7): News(), dayKey(), fmtNewsDay(), fmtTime(), MONTHS, N, pad()

## Knowledge Gaps
- **5 isolated node(s):** `@types/d3-hierarchy`, `@types/node`, `@types/react`, `@types/react-dom`, `typescript`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 88 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell & Data Loading` to `Header, Search & Heatmap`, `Runtime Dependencies`, `Price Chart & Aggregation`, `Bar Charts & Sankey`, `Financial Statements`, `News & Formatting`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **What connects `@types/d3-hierarchy`, `@types/node`, `@types/react` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scraper & Data Fetching` be split into smaller, more focused modules?**
  _Cohesion score 0.1053763440860215 - nodes in this community are weakly interconnected._
- **Why does `devDependencies` connect `Dev Dependencies` to `Runtime Dependencies`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `Runtime Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Why does `yahoo-finance2` connect `Runtime Dependencies` to `Scraper & Data Fetching`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._