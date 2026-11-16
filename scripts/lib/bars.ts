import type { DailyBar, IntraBar } from "../../src/lib/types.ts";

/**
 * Yahoo sometimes returns a daily bar with only the close filled in (open = high = low = close)
 * even though its own hourly bars for that day show a real range. Rebuild open/high/low for such
 * days from the hourly bars; the daily close and volume are kept as reported.
 * A day whose hourly bars are flat too is left alone: that is a genuine one-price session
 * (e.g. a stock locked at BVB's ±15% daily limit), not a data gap.
 * Intraday times are Bucharest wall-clock epochs, so reading them as UTC gives the local date.
 */
export function repairDaily(daily: DailyBar[], hourly: IntraBar[]): { bars: DailyBar[]; repaired: number } {
  const byDay = new Map<string, IntraBar[]>();
  for (const b of hourly) {
    const day = new Date(b[0] * 1000).toISOString().slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(b);
    else byDay.set(day, [b]);
  }
  let repaired = 0;
  const bars = daily.map((bar): DailyBar => {
    const [day, o, h, l, c, v] = bar;
    if (!(o === h && h === l && l === c)) return bar;
    const hs = byDay.get(day);
    if (!hs) return bar;
    const hi = Math.max(...hs.map((x) => x[2]));
    const lo = Math.min(...hs.map((x) => x[3]));
    if (!(hi > lo)) return bar;
    repaired++;
    return [day, hs[0][1], Math.max(hi, c), Math.min(lo, c), c, v];
  });
  return { bars, repaired };
}
