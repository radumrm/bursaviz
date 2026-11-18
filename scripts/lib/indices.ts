// Pure index maths (no network, no files): daily closes from Yahoo's hourly index bars, performance fields,
// and a market-cap-weighted index rebuilt from constituent closes.

/** A daily close: [YYYY-MM-DD, close]. */
export type Close = [string, number];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Yahoo's daily chart for BVB indices (^BET.RO …) only returns today's bar; its hourly chart goes back ~730 days.
 * One daily close per Bucharest session = the close of that day's last hourly bar (BVB closes at 17:45, and the
 * 17:00 bar ends with the closing auction). Bars without a close are skipped.
 */
export function dailyFromHourly(quotes: { date: Date | string | number; close?: number | null }[]): Close[] {
  const byDay = new Map<string, { t: number; c: number }>();
  for (const q of quotes) {
    if (q.close == null || !Number.isFinite(q.close) || q.close <= 0) continue;
    const t = new Date(q.date).getTime();
    if (Number.isNaN(t)) continue;
    const day = dayFmt.format(new Date(t));
    const cur = byDay.get(day);
    if (!cur || t >= cur.t) byDay.set(day, { t, c: q.close });
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => [d, round2(v.c)]);
}

/** Merge two close series by day; `fresh` wins on the days both have. Oldest first. */
export function mergeCloses(old: Close[], fresh: Close[]): Close[] {
  const m = new Map<string, number>(old);
  for (const [d, c] of fresh) m.set(d, c);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export interface Perf {
  last: number;
  changePct: number | null;
  perfW: number | null;
  perfM: number | null;
  perfYTD: number | null;
  perfY: number | null;
}

/**
 * Same conventions as `technicals()` for stocks: fractions (0.0042 = +0.42%), close to close over
 * 1 / 5 / 21 / 252 sessions, YTD against the last close of the previous calendar year. Null when the
 * history is too short. `prevClose` (Yahoo's previous close) overrides the 1-day base when given.
 */
export function perf(d: Close[], prevClose?: number | null): Perf | null {
  const n = d.length;
  if (!n) return null;
  const last = d[n - 1][1];
  const rel = (base: number | null | undefined) => (base != null && base > 0 ? round6(last / base - 1) : null);
  const back = (k: number) => (n > k ? rel(d[n - 1 - k][1]) : null);
  const year = d[n - 1][0].slice(0, 4);
  let ytd: number | null = null;
  for (let i = n - 1; i >= 0; i--) {
    if (d[i][0].slice(0, 4) < year) {
      ytd = d[i][1];
      break;
    }
  }
  return {
    last,
    changePct: prevClose != null && prevClose > 0 ? rel(prevClose) : back(1),
    perfW: back(5),
    perfM: back(21),
    perfYTD: rel(ytd),
    perfY: back(252),
  };
}

export interface Member {
  ticker: string;
  /** Market capitalisation today, in the trading currency. */
  marketCap: number;
  /** Daily closes, oldest first. */
  closes: Close[];
}

/**
 * Market-cap-weighted index of `members`, rebased to `base` on the first session on or after `from`.
 *
 * Only today's market cap is known, so shares are taken as constant (cap ÷ last close) and a member's weight on
 * any day is shares × that day's close. The index is chain-linked: each session's return is the cap-weighted
 * average of the members' returns from the previous session, so a stock that lists (or starts having bars)
 * mid-window joins without a jump. A member without a bar on a session keeps its last close (0% that day).
 * Sessions are the days on which at least half of the members that already exist have a bar, so one stray
 * bar of an illiquid stock does not add a day.
 *
 * An approximation: the official BET weighs free float and caps each member's weight, which this does not.
 */
export function capWeightedIndex(members: Member[], from: string, base = 1000): Close[] {
  const ms = members
    .filter((m) => m.marketCap > 0 && m.closes.length)
    .map((m) => {
      const last = m.closes[m.closes.length - 1][1];
      return { shares: m.marketCap / last, byDay: new Map(m.closes), first: m.closes[0][0] };
    })
    .filter((m) => Number.isFinite(m.shares) && m.shares > 0);
  if (!ms.length) return [];

  const count = new Map<string, number>();
  for (const m of ms) for (const d of m.byDay.keys()) if (d >= from) count.set(d, (count.get(d) ?? 0) + 1);
  const days = [...count.keys()].sort().filter((d) => {
    const alive = ms.filter((m) => m.first <= d).length;
    return (count.get(d) ?? 0) * 2 >= alive;
  });
  if (!days.length) return [];

  // Last close on or before each session, per member (carried forward over days it did not trade).
  const lastClose = ms.map((m) => {
    let cur: number | null = null;
    const before = [...m.byDay.entries()].filter(([d]) => d < days[0]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (before.length) cur = before[before.length - 1][1];
    return cur;
  });

  const out: Close[] = [];
  let level = base;
  for (let k = 0; k < days.length; k++) {
    const day = days[k];
    let capPrev = 0;
    let capNow = 0;
    const next = ms.map((m, i) => m.byDay.get(day) ?? lastClose[i]);
    if (k > 0) {
      for (let i = 0; i < ms.length; i++) {
        const p = lastClose[i];
        const c = next[i];
        if (p == null || c == null || p <= 0) continue; // joins today: no return yet
        capPrev += ms[i].shares * p;
        capNow += ms[i].shares * c;
      }
      if (capPrev > 0) level *= capNow / capPrev;
    }
    for (let i = 0; i < ms.length; i++) lastClose[i] = next[i];
    out.push([day, round2(level)]);
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
