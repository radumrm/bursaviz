// Pure builders (no network, no file access) for the files derived from the per-stock snapshots:
// calendar.json (dividends + earnings dates) and news-all.json (every headline, tagged with tickers).

import type { CalendarEvent, CalendarFile, MarketNewsFile, NewsItem, StockFile } from "../../src/lib/types.ts";
import { normalizeTitle, tagTickers } from "./news.ts";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) in Bucharest of an ISO timestamp, a Date or an already-plain day. Null if unparseable. */
export function bucharestDay(x: unknown): string | null {
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  if (typeof x !== "string" && !(x instanceof Date)) return null;
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : dayFmt.format(d);
}

/** The same calendar day `years` earlier (29 Feb falls back to 28 Feb). */
function yearsBefore(day: string, years: number): string {
  const y = Number(day.slice(0, 4)) - years;
  const rest = day.slice(4);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}${rest === "-02-29" && !leap ? "-02-28" : rest}`;
}

const posNum = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

type CalendarStock = Pick<StockFile, "ticker" | "name" | "dividends" | "snapshot">;

export const CALENDAR_YEARS = 3;

/**
 * Corporate events of every stock, oldest first:
 *  - one `dividend` per entry of the dividend history from the last `CALENDAR_YEARS` years (later entries, if any, too),
 *    with `yield` = amount ÷ the snapshot price (today's price, not the price on the ex-date);
 *  - one `dividend` without an amount for an announced ex-date (`snapshot.divExDate`) that is today or later and
 *    not in the history yet — the amount of a future payment is not in the snapshot, so it is left out;
 *  - one `earnings` for `snapshot.earningsDate`, past or future.
 */
export function buildCalendar(stocks: CalendarStock[], now: Date): CalendarFile {
  const today = dayFmt.format(now);
  const from = yearsBefore(today, CALENDAR_YEARS);
  const events: CalendarEvent[] = [];
  for (const s of stocks) {
    const price = posNum(s.snapshot?.price);
    const base = { ticker: s.ticker, name: s.name };
    const have = new Set<string>();
    for (const row of s.dividends ?? []) {
      const day = bucharestDay(row?.[0]);
      const amount = posNum(row?.[1]);
      if (!day || amount == null || day < from || have.has(day)) continue;
      have.add(day);
      events.push({ date: day, type: "dividend", ...base, amount, ...(price ? { yield: round(amount / price, 6) } : {}) });
    }
    const ex = bucharestDay(s.snapshot?.divExDate);
    if (ex && ex >= today && !have.has(ex)) events.push({ date: ex, type: "dividend", ...base });
    const earn = bucharestDay(s.snapshot?.earningsDate);
    if (earn) events.push({ date: earn, type: "earnings", ...base });
  }
  events.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.ticker !== b.ticker ? (a.ticker < b.ticker ? -1 : 1) : a.type < b.type ? -1 : a.type > b.type ? 1 : 0,
  );
  return { updatedAt: now.toISOString(), events };
}

export const NEWS_ALL_CAP = 400;

/**
 * Every headline we hold — each stock's news plus the market news — collapsed by normalised title, newest first,
 * capped at `cap`. An item's `tickers` are the stocks whose file carried it plus the ones its title names
 * (`tagTickers`), in `defs` order. As in `dedupeNews`, the earliest copy of a headline is the one kept.
 */
export function buildNewsAll(
  stocks: Pick<StockFile, "ticker" | "news">[],
  market: NewsItem[],
  defs: { t: string; aliases: string[] }[],
  now: Date,
  cap: number = NEWS_ALL_CAP,
): MarketNewsFile {
  const order = new Map(defs.map((d, i) => [d.t, i]));
  const byTitle = new Map<string, { item: NewsItem; tickers: Set<string> }>();
  const add = (n: NewsItem, carrier: string | null) => {
    if (!n?.title || !n.link || !n.date) return;
    const key = normalizeTitle(n.title);
    if (!key) return;
    let cur = byTitle.get(key);
    if (!cur) {
      cur = { item: n, tickers: new Set() };
      byTitle.set(key, cur);
    } else if (n.date < cur.item.date) cur.item = n;
    if (carrier) cur.tickers.add(carrier);
    for (const t of n.tickers ?? []) cur.tickers.add(t);
  };
  for (const n of market) add(n, null);
  for (const s of stocks) for (const n of s.news ?? []) add(n, s.ticker);

  const items = [...byTitle.values()]
    .sort((a, b) => (a.item.date < b.item.date ? 1 : a.item.date > b.item.date ? -1 : 0))
    .slice(0, cap)
    .map(({ item, tickers }): NewsItem => {
      for (const t of tagTickers(item.title, defs)) tickers.add(t);
      const list = [...tickers].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : 1));
      return { title: item.title, link: item.link, source: item.source, date: item.date, tickers: list };
    });
  return { updatedAt: now.toISOString(), items };
}
