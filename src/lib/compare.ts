// Pure helpers behind the compare page (`#/compare`) and the sector peers table.
// Executed by Node in tests: type-only imports, erasable TypeScript, no React.
import type { IndexRow, Snapshot } from "./types.ts";

/** A daily close series, oldest first: [YYYY-MM-DD, close]. */
export type Series = [date: string, close: number][];

export const MAX_COMPARE = 6;

// ---------- ticker list (URL) ----------

export interface TickerList {
  /** Known tickers, upper-cased, de-duplicated, in URL order, at most `max`. */
  tickers: string[];
  /** Entries that are not in the current snapshot. */
  unknown: string[];
  /** Known tickers dropped because the list was longer than `max`. */
  overflow: string[];
}

/** Read `t=TLV,snp,XYZ` into a clean list; anything not in `known` is reported, not kept. */
export function parseTickerList(raw: string | null | undefined, known: Iterable<string>, max = MAX_COMPARE): TickerList {
  const have = known instanceof Set ? (known as Set<string>) : new Set(known);
  const out: TickerList = { tickers: [], unknown: [], overflow: [] };
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(/[,\s;]+/)) {
    const t = part.trim().toUpperCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (!have.has(t)) out.unknown.push(t);
    else if (out.tickers.length < max) out.tickers.push(t);
    else out.overflow.push(t);
  }
  return out;
}

/**
 * Keep each ticker on the colour slot it already has and give newcomers the lowest free one,
 * so removing a stock never repaints the lines that stay.
 */
export function assignSlots(prev: Record<string, number>, tickers: string[], slots = MAX_COMPARE): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const t of tickers) {
    const s = prev[t];
    if (s != null && s >= 0 && s < slots && !used.has(s)) {
      next[t] = s;
      used.add(s);
    }
  }
  for (const t of tickers) {
    if (next[t] != null) continue;
    let s = 0;
    while (used.has(s) && s < slots - 1) s++;
    next[t] = s;
    used.add(s);
  }
  return next;
}

// ---------- ranges ----------

export type RangeId = "1L" | "3L" | "6L" | "YTD" | "1A" | "3A" | "5A" | "MAX";

export const RANGES: { id: RangeId; label: string; title: string; months: number | null }[] = [
  { id: "1L", label: "1L", title: "1 lună", months: 1 },
  { id: "3L", label: "3L", title: "3 luni", months: 3 },
  { id: "6L", label: "6L", title: "6 luni", months: 6 },
  { id: "YTD", label: "YTD", title: "De la începutul anului", months: null },
  { id: "1A", label: "1A", title: "1 an", months: 12 },
  { id: "3A", label: "3A", title: "3 ani", months: 36 },
  { id: "5A", label: "5A", title: "5 ani", months: 60 },
  { id: "MAX", label: "Max", title: "Tot istoricul", months: null },
];
export const DEFAULT_RANGE: RangeId = "1A";

export function asRange(raw: string | null | undefined): RangeId {
  const id = (raw ?? "").toUpperCase();
  return RANGES.find((r) => r.id === id)?.id ?? DEFAULT_RANGE;
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

/**
 * The calendar date a range starts on, counted back from `last` (YYYY-MM-DD); null for Max.
 * The series is rebased on the last close on or before this date, so YTD starts from the
 * final close of the previous year, as "Perf YTD" does.
 */
export function rangeStart(range: RangeId, last: string): string | null {
  const [y, m, d] = last.split("-").map(Number);
  if (range === "MAX") return null;
  if (range === "YTD") return `${y - 1}-12-31`;
  const months = RANGES.find((r) => r.id === range)?.months ?? 12;
  const total = y * 12 + (m - 1) - months;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, daysIn(yy, mm)))}`;
}

/**
 * The part of `series` a range covers: from the last bar on or before `start` (the base) to the end.
 * A stock listed after `start` begins at its first bar; one with no bar after `start` yields nothing.
 */
export function sliceRange(series: Series, start: string | null): Series {
  if (start == null) return series;
  let lo = 0;
  let hi = series.length; // first index whose date is after `start`
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] > start) hi = mid;
    else lo = mid + 1;
  }
  if (lo >= series.length) return [];
  return series.slice(Math.max(0, lo - 1));
}

/** Each close as a change against the first one (fraction): the first point is 0. */
export function rebase(series: Series): Series {
  const base = series[0]?.[1];
  if (!base || !(base > 0)) return [];
  return series.map(([date, close]) => [date, close / base - 1]);
}

/** Value of the last point dated on or before `date`; null before the series begins. */
export function valueAt(series: Series, date: string): number | null {
  let lo = 0;
  let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] > date) hi = mid;
    else lo = mid + 1;
  }
  return lo === 0 ? null : series[lo - 1][1];
}

// ---------- risk ----------

/** Last close against the first (fraction). */
export function totalReturn(series: Series): number | null {
  if (series.length < 2) return null;
  const first = series[0][1];
  return first > 0 ? series[series.length - 1][1] / first - 1 : null;
}

/** Simple close-to-close returns of consecutive values. */
export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

/** Sample standard deviation of daily returns, scaled to a year of `perYear` sessions. */
export function annualisedVolatility(series: Series, perYear = 252): number | null {
  const r = simpleReturns(series.map((p) => p[1]));
  if (r.length < 2) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const ss = r.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(ss / (r.length - 1)) * Math.sqrt(perYear);
}

export interface Drawdown {
  /** Deepest fall from a running peak, as a fraction <= 0 (-0.25 = a quarter lost). */
  depth: number;
  peak: string;
  trough: string;
}

/** Largest peak-to-trough decline inside the series. A series that never falls has depth 0. */
export function maxDrawdown(series: Series): Drawdown | null {
  if (!series.length) return null;
  let peakAt = 0;
  let best: Drawdown = { depth: 0, peak: series[0][0], trough: series[0][0] };
  for (let i = 1; i < series.length; i++) {
    if (series[i][1] > series[peakAt][1]) peakAt = i;
    const top = series[peakAt][1];
    const depth = top > 0 ? series[i][1] / top - 1 : 0;
    if (depth < best.depth) best = { depth, peak: series[peakAt][0], trough: series[i][0] };
  }
  return best;
}

/** Closes of both series on the dates they share, in date order. */
export function alignOnCommonDates(a: Series, b: Series): { dates: string[]; a: number[]; b: number[] } {
  const out = { dates: [] as string[], a: [] as number[], b: [] as number[] };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i][0] === b[j][0]) {
      out.dates.push(a[i][0]);
      out.a.push(a[i][1]);
      out.b.push(b[j][1]);
      i++;
      j++;
    } else if (a[i][0] < b[j][0]) i++;
    else j++;
  }
  return out;
}

/** Fewer return pairs than this say nothing (two pairs always correlate at exactly ±1). */
export const MIN_CORR_RETURNS = 3;

/**
 * Pearson correlation of the two stocks' returns between consecutive common dates.
 * `n` is the number of return pairs used; `r` is null with too few of them or when one side never moves.
 */
export function correlation(a: Series, b: Series): { r: number | null; n: number } {
  const al = alignOnCommonDates(a, b);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < al.dates.length; i++) {
    if (al.a[i - 1] > 0 && al.b[i - 1] > 0) {
      ra.push(al.a[i] / al.a[i - 1] - 1);
      rb.push(al.b[i] / al.b[i - 1] - 1);
    }
  }
  const n = ra.length;
  if (n < MIN_CORR_RETURNS) return { r: null, n };
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (ra[i] - ma) * (rb[i] - mb);
    saa += (ra[i] - ma) ** 2;
    sbb += (rb[i] - mb) ** 2;
  }
  // A side whose returns are all (numerically) the same has no direction to correlate with.
  const flat = (ss: number, m: number) => ss <= 1e-20 * Math.max(1, n * m * m);
  if (flat(saa, ma) || flat(sbb, mb)) return { r: null, n };
  return { r: Math.max(-1, Math.min(1, sab / Math.sqrt(saa * sbb))), n };
}

/** Symmetric matrix of pairwise correlations; the diagonal is 1 for any series with data. */
export function correlationMatrix(list: Series[]): { r: number | null; n: number }[][] {
  const m = list.map(() => list.map(() => ({ r: null as number | null, n: 0 })));
  for (let i = 0; i < list.length; i++) {
    m[i][i] = { r: list[i].length > 1 ? 1 : null, n: Math.max(0, list[i].length - 1) };
    for (let j = i + 1; j < list.length; j++) m[i][j] = m[j][i] = correlation(list[i], list[j]);
  }
  return m;
}

// ---------- metrics table ----------

type N = number | null | undefined;
const ok = (x: N): x is number => typeof x === "number" && Number.isFinite(x);

export function median(values: N[]): number | null {
  const xs = values.filter(ok).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Which way is "better" for a metric:
 * - `high` / `low`: the largest / smallest value wins;
 * - `lowPositive`: the smallest value above zero wins (a negative P/E is a loss, not a bargain);
 * - `lowNonNegative`: the smallest value from zero up wins (debt/equity; negative equity is not "low debt");
 * - `none`: neutral — nothing is marked (price, market cap, beta, RSI, range position).
 */
export type Better = "high" | "low" | "lowPositive" | "lowNonNegative" | "none";

/**
 * Indexes of the best value(s) in a row. Empty when the metric is neutral, when fewer than two
 * stocks have a comparable value, or when all comparable values are equal. Ties are all marked.
 */
export function bestIndexes(values: N[], better: Better): number[] {
  if (better === "none") return [];
  const fits = (v: number) => (better === "lowPositive" ? v > 0 : better === "lowNonNegative" ? v >= 0 : true);
  const idx: number[] = [];
  values.forEach((v, i) => ok(v) && fits(v) && idx.push(i));
  if (idx.length < 2) return [];
  const xs = idx.map((i) => values[i] as number);
  const best = better === "high" ? Math.max(...xs) : Math.min(...xs);
  const worst = better === "high" ? Math.min(...xs) : Math.max(...xs);
  if (best === worst) return [];
  return idx.filter((i) => values[i] === best);
}

/** Where the price sits between the 52-week low (0) and high (1). */
export function rangePosition(price: N, low: N, high: N): number | null {
  if (!ok(price) || !ok(low) || !ok(high) || !(high > low)) return null;
  return Math.max(0, Math.min(1, (price - low) / (high - low)));
}

export type MetricKind = "price" | "cap" | "ratio" | "pct" | "perf" | "range52" | "analyst" | "tech";

export interface MetricDef {
  id: string;
  /** FinViz-style label (English). */
  label: string;
  /** Snapshot keys, first numeric one wins. */
  keys: string[];
  kind: MetricKind;
  better: Better;
  hint?: string;
}

export interface MetricGroup {
  title: string;
  rows: MetricDef[];
}

const perf = (id: string, label: string): MetricDef => ({ id, label, keys: [id], kind: "perf", better: "high" });

export const METRIC_GROUPS: MetricGroup[] = [
  {
    title: "Preț și evaluare",
    rows: [
      { id: "price", label: "Price", keys: ["price"], kind: "price", better: "none" },
      { id: "marketCap", label: "Market Cap", keys: ["marketCap"], kind: "cap", better: "none" },
      { id: "pe", label: "P/E", keys: ["pe"], kind: "ratio", better: "lowPositive", hint: "Mai mic este mai bine, doar dacă este pozitiv" },
      { id: "fpe", label: "Forward P/E", keys: ["fpe"], kind: "ratio", better: "lowPositive", hint: "Pe baza profitului estimat de analiști" },
      { id: "ps", label: "P/S", keys: ["ps"], kind: "ratio", better: "lowPositive" },
      { id: "pb", label: "P/B", keys: ["pb"], kind: "ratio", better: "lowPositive" },
      { id: "evEbitda", label: "EV/EBITDA", keys: ["evEbitda"], kind: "ratio", better: "lowPositive" },
      { id: "divYield", label: "Dividend Yield", keys: ["divTTMYield", "divEstYield"], kind: "pct", better: "high", hint: "Dividendele din ultimele 12 luni raportate la preț" },
    ],
  },
  {
    title: "Rentabilitate și îndatorare",
    rows: [
      { id: "roe", label: "ROE", keys: ["roe"], kind: "pct", better: "high" },
      { id: "roa", label: "ROA", keys: ["roa"], kind: "pct", better: "high" },
      { id: "grossM", label: "Gross Margin", keys: ["grossM"], kind: "pct", better: "high" },
      { id: "operM", label: "Oper. Margin", keys: ["operM"], kind: "pct", better: "high" },
      { id: "profitM", label: "Profit Margin", keys: ["profitM"], kind: "pct", better: "high" },
      { id: "debtEq", label: "Debt/Eq", keys: ["debtEq"], kind: "ratio", better: "lowNonNegative", hint: "Datorii totale / capitaluri proprii; mai mic este mai bine" },
    ],
  },
  {
    title: "Risc și momentum",
    rows: [
      { id: "beta", label: "Beta", keys: ["beta"], kind: "ratio", better: "none", hint: "Sensibilitatea față de piață; nici mare, nici mic nu este „mai bine”" },
      { id: "rsi", label: "RSI (14)", keys: ["rsi"], kind: "ratio", better: "none" },
      { id: "range52", label: "52W Range", keys: [], kind: "range52", better: "none", hint: "Poziția prețului între minimul (0%) și maximul (100%) ultimelor 52 de săptămâni" },
    ],
  },
  {
    title: "Performanță",
    rows: [
      perf("perfW", "Perf Week"),
      perf("perfM", "Perf Month"),
      perf("perfQ", "Perf Quarter"),
      perf("perfYTD", "Perf YTD"),
      perf("perfY", "Perf Year"),
      perf("perf3Y", "Perf 3Y"),
      perf("perf5Y", "Perf 5Y"),
    ],
  },
  {
    title: "Ratinguri",
    rows: [
      { id: "recom", label: "Analyst rating", keys: ["recom"], kind: "analyst", better: "lowPositive", hint: "Recomandarea medie a analiștilor: 1 = Strong Buy, 5 = Strong Sell" },
      { id: "techScore", label: "Technical rating", keys: ["techScore"], kind: "tech", better: "high", hint: "Scor mecanic din indicatori tehnici, între −1 și +1" },
    ],
  },
];

/** The number a metric compares on; null when the snapshot does not have it. */
export function metricValue(def: MetricDef, snapshot: Snapshot | null | undefined): number | null {
  if (!snapshot) return null;
  const num = (k: string): number | null => {
    const v = snapshot[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  if (def.kind === "range52") return rangePosition(num("price"), num("low52"), num("high52"));
  for (const k of def.keys) {
    const v = num(k);
    if (v != null) return v;
  }
  return null;
}

// ---------- sector peers ----------

const byCapDesc = (a: IndexRow, b: IndexRow) =>
  (b.marketCap ?? -1) - (a.marketCap ?? -1) || a.ticker.localeCompare(b.ticker);

/**
 * Every stock of `ticker`'s sector (the stock itself included), largest market cap first,
 * stocks without a market cap last. Empty when the ticker is unknown or alone in its sector.
 */
export function sectorPeers(rows: IndexRow[], ticker: string): IndexRow[] {
  const self = rows.find((r) => r.ticker === ticker);
  if (!self || !self.sector) return [];
  const all = rows.filter((r) => r.sector === self.sector).sort(byCapDesc);
  return all.length > 1 ? all : [];
}

/** The stock followed by its largest sector peers — the list handed to the compare page. */
export function compareSet(rows: IndexRow[], ticker: string, size = 5): string[] {
  const peers = sectorPeers(rows, ticker).filter((r) => r.ticker !== ticker);
  return [ticker, ...peers.slice(0, Math.max(0, size - 1)).map((r) => r.ticker)];
}

/** The `count` largest stocks by market cap among `rows`. */
export function largest(rows: IndexRow[], count: number): string[] {
  return [...rows].filter((r) => r.marketCap != null).sort(byCapDesc).slice(0, count).map((r) => r.ticker);
}
