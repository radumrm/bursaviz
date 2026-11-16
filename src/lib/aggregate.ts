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
