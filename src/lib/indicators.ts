// Pure technical-indicator math. Shared by the scraper (Node) and the chart (browser),
// so this file must stay free of runtime imports.
import type { DailyBar, TechVote } from "./types";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` values; α = 2 / (period + 1). */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  out[period - 1] = e;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

/** Bollinger Bands: SMA ± `mult` population standard deviations over `period` values. */
export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const n = values.length;
  const mid = sma(values, period);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  if (period < 1 || n < period) return { mid: new Array(n).fill(null), upper, lower };
  for (let i = period - 1; i < n; i++) {
    const m = mid[i] as number;
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) ss += (values[j] - m) ** 2;
    const sd = Math.sqrt(ss / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

/** MACD line (EMA fast − EMA slow), its signal (EMA of the MACD line) and the histogram (MACD − signal). */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const n = values.length;
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line: (number | null)[] = new Array(n).fill(null);
  let start = -1;
  for (let i = 0; i < n; i++) {
    const a = ef[i];
    const b = es[i];
    if (a != null && b != null) {
      line[i] = a - b;
      if (start < 0) start = i;
    }
  }
  const sig: (number | null)[] = new Array(n).fill(null);
  const hist: (number | null)[] = new Array(n).fill(null);
  if (start >= 0) {
    const tail = ema(line.slice(start) as number[], signal);
    tail.forEach((v, j) => {
      sig[start + j] = v;
      const m = line[start + j];
      if (v != null && m != null) hist[start + j] = m - v;
    });
  }
  return { macd: line, signal: sig, hist };
}

/**
 * Volume-weighted average price: cumulative typical price × volume ÷ cumulative volume,
 * restarted whenever `sessionKey[i]` changes. Null while the session has no volume yet.
 */
export function vwap(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  sessionKey: (string | number)[],
): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || sessionKey[i] !== sessionKey[i - 1]) {
      pv = 0;
      vol = 0;
    }
    const v = volume[i] > 0 ? volume[i] : 0;
    pv += ((high[i] + low[i] + close[i]) / 3) * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let ag = gain / period;
  let al = loss / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/** Wilder's Average True Range. */
export function atr(high: number[], low: number[], close: number[], period = 14): (number | null)[] {
  const n = close.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return out;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    tr[i] =
      i === 0
        ? high[i] - low[i]
        : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i];
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < n; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface Technicals {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  atr: number | null;
  volW: number | null;
  volM: number | null;
  perfW: number | null;
  perfM: number | null;
  perfQ: number | null;
  perfH: number | null;
  perfYTD: number | null;
  perfY: number | null;
  perf3Y: number | null;
  perf5Y: number | null;
  perf10Y: number | null;
  high52: number | null;
  low52: number | null;
  avgVol: number | null;
  relVol: number | null;
}

/** Everything in the snapshot table that is derived from daily price history. Ratios are fractions (0.05 = 5%). */
export function technicals(d: DailyBar[]): Technicals {
  const n = d.length;
  const empty: Technicals = {
    sma20: null, sma50: null, sma200: null, rsi: null, atr: null, volW: null, volM: null,
    perfW: null, perfM: null, perfQ: null, perfH: null, perfYTD: null, perfY: null,
    perf3Y: null, perf5Y: null, perf10Y: null, high52: null, low52: null, avgVol: null, relVol: null,
  };
  if (n < 2) return empty;

  const h = d.map((b) => b[2]);
  const l = d.map((b) => b[3]);
  const c = d.map((b) => b[4]);
  const v = d.map((b) => b[5]);
  const last = c[n - 1];

  const pct = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? a / b - 1 : null);
  // Performance over k trading sessions, close to close.
  const back = (k: number) => (n > k ? pct(last, c[n - 1 - k]) : null);
  const range = (k: number) => {
    const xs: number[] = [];
    for (let i = Math.max(0, n - k); i < n; i++) if (l[i] > 0) xs.push((h[i] - l[i]) / l[i]);
    return mean(xs);
  };

  const year = d[n - 1][0].slice(0, 4);
  let ytdBase: number | null = null;
  for (let i = n - 1; i >= 0; i--) {
    if (d[i][0].slice(0, 4) < year) {
      ytdBase = c[i];
      break;
    }
  }

  const win = Math.min(n, 252);
  const avgVol = mean(v.slice(Math.max(0, n - 64), n - 1));

  return {
    sma20: pct(last, sma(c, 20)[n - 1]),
    sma50: pct(last, sma(c, 50)[n - 1]),
    sma200: pct(last, sma(c, 200)[n - 1]),
    rsi: rsi(c, 14)[n - 1],
    atr: atr(h, l, c, 14)[n - 1],
    volW: range(5),
    volM: range(21),
    perfW: back(5),
    perfM: back(21),
    perfQ: back(63),
    perfH: back(126),
    perfYTD: pct(last, ytdBase),
    perfY: back(252),
    perf3Y: back(756),
    perf5Y: back(1260),
    perf10Y: back(2520),
    high52: Math.max(...h.slice(n - win)),
    low52: Math.min(...l.slice(n - win)),
    avgVol,
    relVol: avgVol ? v[n - 1] / avgVol : null,
  };
}

// ---------- ratings ----------

export type RatingLabel = "Strong Buy" | "Buy" | "Hold" | "Neutral" | "Sell" | "Strong Sell";

/** Yahoo's mean recommendation (1 = Strong Buy .. 5 = Strong Sell) → label. Null when there is no coverage. */
export function analystLabel(mean: number | null | undefined): RatingLabel | null {
  if (mean == null || !Number.isFinite(mean)) return null;
  if (mean <= 1.5) return "Strong Buy";
  if (mean <= 2.5) return "Buy";
  if (mean <= 3.5) return "Hold";
  if (mean <= 4.5) return "Sell";
  return "Strong Sell";
}

/** Technical score in [-1, 1] → label. */
export function techLabel(score: number | null | undefined): RatingLabel | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 0.5) return "Strong Buy";
  if (score >= 0.15) return "Buy";
  if (score <= -0.5) return "Strong Sell";
  if (score <= -0.15) return "Sell";
  return "Neutral";
}

export interface TechRating {
  score: number;
  label: RatingLabel;
  votes: TechVote[];
}

const sign = (x: number): -1 | 0 | 1 => (x > 0 ? 1 : x < 0 ? -1 : 0);
const f1 = (x: number) => x.toFixed(1).replace(".", ",");
const sp = (x: number) => (x > 0 ? "+" : "") + f1(x * 100) + "%";

/**
 * Mechanical technical rating in the spirit of TradingView's: seven votes of +1 / 0 / -1
 * (close vs SMA 20 / 50 / 200, SMA 50 vs SMA 200, RSI 14, MACD vs signal, 1-month performance),
 * averaged into a score in [-1, 1]. Null with fewer than 200 daily bars.
 */
export function techRating(d: DailyBar[]): TechRating | null {
  const n = d.length;
  if (n < 200) return null;
  const c = d.map((b) => b[4]);
  const last = c[n - 1];
  const s20 = sma(c, 20)[n - 1];
  const s50 = sma(c, 50)[n - 1];
  const s200 = sma(c, 200)[n - 1];
  const r = rsi(c, 14)[n - 1];
  const m = macd(c);
  const ml = m.macd[n - 1];
  const ms = m.signal[n - 1];
  const base = c[n - 22];
  const votes: TechVote[] = [];
  const vsSma = (key: string, label: string, avg: number | null) => {
    if (avg == null || !avg) return;
    votes.push({ key, label, vote: sign(last / avg - 1), detail: `${sp(last / avg - 1)} față de medie` });
  };
  vsSma("sma20", "Preț vs SMA 20", s20);
  vsSma("sma50", "Preț vs SMA 50", s50);
  vsSma("sma200", "Preț vs SMA 200", s200);
  if (s50 != null && s200 != null) {
    votes.push({ key: "cross", label: "SMA 50 vs SMA 200", vote: sign(s50 - s200), detail: s50 > s200 ? "50 peste 200" : s50 < s200 ? "50 sub 200" : "egale" });
  }
  if (r != null) {
    const vote = r >= 75 ? -1 : r > 55 ? 1 : r <= 25 ? 1 : r < 45 ? -1 : 0;
    votes.push({ key: "rsi", label: "RSI 14", vote, detail: `RSI ${f1(r)}${r >= 75 ? " (supracumpărat)" : r <= 25 ? " (supravândut)" : ""}` });
  }
  if (ml != null && ms != null) {
    // A gap below one millionth of the price is a tie (a straight-line trend leaves the two lines converged).
    const gap = Math.abs(ml - ms) < Math.abs(last) * 1e-6 ? 0 : ml - ms;
    votes.push({ key: "macd", label: "MACD vs semnal", vote: sign(gap), detail: gap > 0 ? "MACD peste semnal" : gap < 0 ? "MACD sub semnal" : "egale" });
  }
  if (base) {
    votes.push({ key: "perfM", label: "Performanță 1 lună", vote: sign(last / base - 1), detail: sp(last / base - 1) });
  }
  if (!votes.length) return null;
  const score = votes.reduce((s, v) => s + v.vote, 0) / votes.length;
  return { score, label: techLabel(score) as RatingLabel, votes };
}
