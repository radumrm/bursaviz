import { analystLabel, techLabel } from "./indicators";
import type { IndexRow } from "./types";

export type SortKey =
  | "ticker" | "name" | "marketCap" | "pe" | "price" | "changePct" | "volume" | "perfYTD" | "divYield"
  | "techScore" | "recom" | "rsi" | "relVol" | "high52Pct" | "low52Pct" | "sma200" | "value";

export interface Sort {
  key: SortKey;
  desc: boolean;
}

export interface Filters {
  signal: string;
  cap: string;
  pe: string;
  div: string;
  analyst: string;
  tech: string;
  sector: string;
  bet: boolean;
}

export const EMPTY: Filters = { signal: "", cap: "", pe: "", div: "", analyst: "", tech: "", sector: "", bet: false };

interface Preset {
  id: string;
  label: string;
  test: (r: IndexRow) => boolean;
  sort: Sort;
}

const has = (x: number | null): x is number => x != null && Number.isFinite(x);

export const PRESETS: Preset[] = [
  { id: "gainers", label: "Top Gainers", test: (r) => has(r.changePct) && r.changePct > 0, sort: { key: "changePct", desc: true } },
  { id: "losers", label: "Top Losers", test: (r) => has(r.changePct) && r.changePct < 0, sort: { key: "changePct", desc: false } },
  { id: "high52", label: "New 52W High", test: (r) => has(r.high52Pct) && r.high52Pct >= -0.02, sort: { key: "high52Pct", desc: true } },
  { id: "low52", label: "New 52W Low", test: (r) => has(r.low52Pct) && r.low52Pct <= 0.02, sort: { key: "low52Pct", desc: false } },
  { id: "overbought", label: "Overbought (RSI > 70)", test: (r) => has(r.rsi) && r.rsi > 70, sort: { key: "rsi", desc: true } },
  { id: "oversold", label: "Oversold (RSI < 30)", test: (r) => has(r.rsi) && r.rsi < 30, sort: { key: "rsi", desc: false } },
  { id: "unusual", label: "Unusual Volume", test: (r) => has(r.relVol) && r.relVol > 2, sort: { key: "relVol", desc: true } },
  { id: "above200", label: "Above SMA 200", test: (r) => has(r.sma200) && r.sma200 > 0, sort: { key: "sma200", desc: true } },
  { id: "below200", label: "Below SMA 200", test: (r) => has(r.sma200) && r.sma200 < 0, sort: { key: "sma200", desc: false } },
  { id: "active", label: "Most Active", test: (r) => has(r.volume) && r.volume > 0 && has(r.price), sort: { key: "value", desc: true } },
];

export const CAPS: [id: string, label: string][] = [
  ["large", "Large (≥ 20 mld.)"],
  ["mid", "Mid (≥ 2 mld.)"],
  ["small", "Small (≥ 300 mil.)"],
  ["micro", "Micro (< 300 mil.)"],
];
export const PES: [id: string, label: string][] = [
  ["lt10", "P/E sub 10"],
  ["10-20", "P/E 10–20"],
  ["gt20", "P/E peste 20"],
  ["profit", "Profitabile"],
];
export const DIVS: [id: string, label: string][] = [
  ["gt2", "Dividend > 2%"],
  ["gt5", "Dividend > 5%"],
];
export const RATINGS = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];
export const TECH_RATINGS = ["Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"];

export function capId(mc: number | null): string | null {
  if (!has(mc)) return null;
  return mc >= 20e9 ? "large" : mc >= 2e9 ? "mid" : mc >= 300e6 ? "small" : "micro";
}

/** Does this row pass every filter except the sector (the sector chart ignores its own filter). */
export function passes(r: IndexRow, f: Filters): boolean {
  if (f.bet && r.index !== "BET") return false;
  if (f.signal) {
    const p = PRESETS.find((x) => x.id === f.signal);
    if (p && !p.test(r)) return false;
  }
  if (f.cap && capId(r.marketCap) !== f.cap) return false;
  if (f.pe) {
    const pe = r.pe;
    if (!has(pe) || pe <= 0) return false;
    if (f.pe === "lt10" && !(pe < 10)) return false;
    if (f.pe === "10-20" && !(pe >= 10 && pe <= 20)) return false;
    if (f.pe === "gt20" && !(pe > 20)) return false;
  }
  if (f.div) {
    const dy = r.divYield;
    if (!has(dy) || dy <= (f.div === "gt5" ? 0.05 : 0.02)) return false;
  }
  if (f.analyst && analystLabel(r.recom) !== f.analyst) return false;
  if (f.tech && techLabel(r.techScore) !== f.tech) return false;
  return true;
}

export function toParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.signal) p.set("signal", f.signal);
  if (f.cap) p.set("cap", f.cap);
  if (f.pe) p.set("pe", f.pe);
  if (f.div) p.set("div", f.div);
  if (f.analyst) p.set("analyst", f.analyst);
  if (f.tech) p.set("tech", f.tech);
  if (f.sector) p.set("sector", f.sector);
  if (f.bet) p.set("bet", "1");
  return p;
}

/** Unknown or malformed values are dropped, so a stale link never breaks the page. */
export function fromParams(p: URLSearchParams): Filters {
  const pick = (k: string, ok: string[]) => (ok.includes(p.get(k) ?? "") ? (p.get(k) as string) : "");
  return {
    signal: pick("signal", PRESETS.map((x) => x.id)),
    cap: pick("cap", CAPS.map((x) => x[0])),
    pe: pick("pe", PES.map((x) => x[0])),
    div: pick("div", DIVS.map((x) => x[0])),
    analyst: pick("analyst", RATINGS),
    tech: pick("tech", TECH_RATINGS),
    sector: p.get("sector") ?? "",
    bet: p.get("bet") === "1",
  };
}

export const PERIODS = [
  { id: "d", label: "1 zi", key: "changePct" },
  { id: "w", label: "1 săpt.", key: "perfW" },
  { id: "m", label: "1 lună", key: "perfM" },
  { id: "ytd", label: "YTD", key: "perfYTD" },
] as const;

export interface GroupRow {
  sector: string;
  perf: number;
  count: number;
}

/** Market-cap-weighted mean performance per sector, best first. Stocks lacking the figure or a cap are skipped. */
export function groupPerf(rows: IndexRow[], key: (typeof PERIODS)[number]["key"]): GroupRow[] {
  const acc = new Map<string, { w: number; wp: number; n: number }>();
  for (const r of rows) {
    const p = r[key];
    const w = r.marketCap;
    if (!has(p) || !has(w) || w <= 0) continue;
    const a = acc.get(r.sector) ?? { w: 0, wp: 0, n: 0 };
    a.w += w;
    a.wp += w * p;
    a.n++;
    acc.set(r.sector, a);
  }
  return [...acc].map(([sector, a]) => ({ sector, perf: a.wp / a.w, count: a.n })).sort((x, y) => y.perf - x.perf);
}
