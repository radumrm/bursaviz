import type { BarsFile } from "./types";

export type Tf = "15M" | "30M" | "1H" | "4H" | "D" | "W" | "M";

export interface Candle {
  /** 'YYYY-MM-DD' for daily and above, epoch seconds (Bucharest wall clock) for intraday. */
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Raw = [string | number, number, number, number, number, number];

function group(bars: Raw[], keyOf: (b: Raw) => string | number): Candle[] {
  const out: Candle[] = [];
  let key: string | number | null = null;
  let cur: Candle | null = null;
  for (const b of bars) {
    const k = keyOf(b);
    if (cur && k === key) {
      cur.high = Math.max(cur.high, b[2]);
      cur.low = Math.min(cur.low, b[3]);
      cur.close = b[4];
      cur.volume += b[5];
    } else {
      cur = { time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] };
      key = k;
      out.push(cur);
    }
  }
  return out;
}

const SESSION_OPEN_HOUR = 10; // BVB regular session: 10:00 – 18:00 Bucharest time

/** Monday of the week a 'YYYY-MM-DD' date falls in, as a day number. */
function weekKey(date: string): number {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 864e5);
  return Math.floor((day + 3) / 7); // 1970-01-01 was a Thursday
}

export function candlesFor(tf: Tf, bars: BarsFile): Candle[] {
  switch (tf) {
    case "15M":
      return group(bars.m ?? [], (b) => b[0]);
    case "30M":
      return group(bars.m ?? [], (b) => Math.floor((b[0] as number) / 1800));
    case "1H":
      return group(bars.h, (b) => b[0]);
    case "4H":
      // Two candles per session: 10:00–14:00 and 14:00–18:00.
      return group(bars.h, (b) => {
        const t = b[0] as number;
        const day = Math.floor(t / 86400);
        const hour = Math.floor((t % 86400) / 3600);
        return day * 10 + Math.max(0, Math.floor((hour - SESSION_OPEN_HOUR) / 4));
      });
    case "D":
      return group(bars.d, (b) => b[0]);
    case "W":
      return group(bars.d, (b) => weekKey(b[0] as string));
    case "M":
      return group(bars.d, (b) => (b[0] as string).slice(0, 7));
  }
}

// ---------- chart helpers (v3) ----------

/**
 * Heikin-Ashi candles: close = (O + H + L + C) / 4, open = midpoint of the previous HA body
 * ((O + C) / 2 for the first bar), high / low widened to contain the HA body. Volume and time are kept.
 */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  candles.forEach((c, i) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      time: c.time,
      open,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      close,
      volume: c.volume,
    });
    prevOpen = open;
    prevClose = close;
  });
  return out;
}

export type RangePreset = "1L" | "3L" | "6L" | "YTD" | "1A" | "5A" | "MAX";

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** `day` moved back by `months` calendar months, the day-of-month clamped to the target month's length. */
function monthsBack(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const idx = y * 12 + (m - 1) - months;
  const ty = Math.floor(idx / 12);
  const tm = idx - ty * 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return isoDay(Date.UTC(ty, tm, Math.min(d, last)));
}

/** First day ('YYYY-MM-DD') a range preset shows, counted back from `lastDay`, never before `firstDay`. */
export function rangeStart(preset: RangePreset, lastDay: string, firstDay: string): string {
  let start: string;
  switch (preset) {
    case "1L": start = monthsBack(lastDay, 1); break;
    case "3L": start = monthsBack(lastDay, 3); break;
    case "6L": start = monthsBack(lastDay, 6); break;
    case "1A": start = monthsBack(lastDay, 12); break;
    case "5A": start = monthsBack(lastDay, 60); break;
    case "YTD": start = `${lastDay.slice(0, 4)}-01-01`; break;
    case "MAX": start = firstDay; break;
  }
  return start < firstDay ? firstDay : start;
}

/** The calendar day of a candle time ('YYYY-MM-DD'; intraday epochs are wall-clock, read as UTC). */
export function candleDay(t: string | number): string {
  return typeof t === "string" ? t : new Date(t * 1000).toISOString().slice(0, 10);
}

const TF_ORDER: Tf[] = ["15M", "30M", "1H", "4H", "D", "W", "M"];
/** Fewer bars than this in the range says too little; more is too dense to read. */
const RANGE_MIN_BARS = 15;
const RANGE_MAX_BARS = 2000;
/** History that starts a few days after the range start (a weekend, a holiday) still covers it. */
const COVER_SLACK_DAYS = 4;

/**
 * The interval to show a date range starting on `startDay` with: the current one when its history reaches
 * that far back with a readable number of bars, else the finest interval that does. When none does, the one
 * reaching furthest back; with nothing available at all, the current one.
 */
export function tfForRange(current: Tf, startDay: string, avail: { tf: Tf; candles: Candle[] }[]): Tf {
  const usable = avail.filter((a) => a.candles.length > 0);
  if (!usable.length) return current;
  const slack = isoDay(dayMs(startDay) + COVER_SLACK_DAYS * 864e5);
  const fits = (a: { candles: Candle[] }) => {
    if (candleDay(a.candles[0].time) > slack) return false;
    let n = 0;
    for (let i = a.candles.length - 1; i >= 0 && candleDay(a.candles[i].time) >= startDay; i--) n++;
    return n >= RANGE_MIN_BARS && n <= RANGE_MAX_BARS;
  };
  const cur = usable.find((a) => a.tf === current);
  if (cur && fits(cur)) return current;
  const rank = (tf: Tf) => TF_ORDER.indexOf(tf);
  const sorted = [...usable].sort((a, b) => rank(a.tf) - rank(b.tf));
  const fine = sorted.find(fits);
  if (fine) return fine.tf;
  let best = sorted[0];
  for (const a of sorted) if (candleDay(a.candles[0].time) < candleDay(best.candles[0].time)) best = a;
  return best.tf;
}

/** Key of the candle a day belongs to: the day itself (D), its week's Monday (W) or 'YYYY-MM' (M). */
export function bucketOf(tf: Tf, day: string): string {
  if (tf === "W") {
    const t = dayMs(day);
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    return isoDay(t - dow * 864e5);
  }
  if (tf === "M") return day.slice(0, 7);
  return day;
}

/**
 * Index of the candle an event dated `day` belongs to, among daily-or-longer candle times (ascending).
 * Daily: that session, or the next one when the market was closed. Weekly / monthly: the candle containing it.
 * -1 when the day is outside the history, and always for intraday intervals.
 */
export function indexForDay(tf: Tf, times: string[], day: string): number {
  if (!times.length || (tf !== "D" && tf !== "W" && tf !== "M")) return -1;
  if (tf === "D") {
    if (day < times[0] || day > times[times.length - 1]) return -1;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] >= day) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
  const key = bucketOf(tf, day);
  for (let i = times.length - 1; i >= 0; i--) {
    const k = bucketOf(tf, times[i]);
    if (k === key) return i;
    if (k < key) return -1;
  }
  return -1;
}

/**
 * The future candle slots from just after `lastDay` up to the one holding `day` (weekdays for D, Mondays for W,
 * first of the month for M), so an upcoming event can be drawn to the right of the last candle.
 * Empty when `day` is not after the last candle's slot, is more than `max` slots away, or the interval is intraday.
 */
export function futureSlots(tf: Tf, lastDay: string, day: string, max: number): string[] {
  if (tf !== "D" && tf !== "W" && tf !== "M") return [];
  const target = bucketOf(tf, day);
  if (target <= bucketOf(tf, lastDay)) return [];
  const out: string[] = [];
  if (tf === "M") {
    let [y, m] = lastDay.split("-").map(Number);
    for (;;) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      const slot = `${y}-${String(m).padStart(2, "0")}-01`;
      out.push(slot);
      if (slot.slice(0, 7) >= target) break;
      if (out.length > max) return [];
    }
    return out.length > max ? [] : out;
  }
  const step = tf === "W" ? 7 : 1;
  let t = dayMs(bucketOf(tf, lastDay));
  for (;;) {
    t += step * 864e5;
    const dow = new Date(t).getUTCDay();
    if (tf === "D" && (dow === 0 || dow === 6)) continue;
    const slot = isoDay(t);
    out.push(slot);
    if (slot >= target) break;
    if (out.length > max) return [];
  }
  return out.length > max ? [] : out;
}
