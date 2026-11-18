import { test } from "node:test";
import assert from "node:assert/strict";
import { candlesFor } from "../src/lib/aggregate.ts";
import type { BarsFile, IntraBar } from "../src/lib/types.ts";

/** Bucharest wall-clock time stored as if it were UTC, the way the scraper writes intraday bars. */
const at = (h: number, m = 0) => Date.UTC(2026, 10, 10, h, m) / 1000;

test("30M merges two 15-minute bars of the same half hour", () => {
  const m: IntraBar[] = [
    [at(10, 0), 10, 11, 9.5, 10.5, 100],
    [at(10, 15), 10.5, 12, 10, 11.5, 50],
    [at(10, 30), 11.5, 11.8, 11.2, 11.4, 70],
  ];
  const bars: BarsFile = { d: [], h: [], m };
  assert.deepEqual(candlesFor("30M", bars), [
    { time: at(10, 0), open: 10, high: 12, low: 9.5, close: 11.5, volume: 150 },
    { time: at(10, 30), open: 11.5, high: 11.8, low: 11.2, close: 11.4, volume: 70 },
  ]);
  assert.equal(candlesFor("15M", bars).length, 3);
});

test("15M / 30M without 15-minute bars give no candles", () => {
  assert.deepEqual(candlesFor("15M", { d: [], h: [] }), []);
  assert.deepEqual(candlesFor("30M", { d: [], h: [] }), []);
});

test("4H splits one 10:00–17:00 session into two candles", () => {
  const h: IntraBar[] = [];
  for (let hour = 10; hour <= 17; hour++) h.push([at(hour), hour, hour + 0.5, hour - 0.5, hour + 0.25, 10]);
  const c = candlesFor("4H", { d: [], h });
  assert.equal(c.length, 2);
  assert.deepEqual(c[0], { time: at(10), open: 10, high: 13.5, low: 9.5, close: 13.25, volume: 40 });
  assert.deepEqual(c[1], { time: at(14), open: 14, high: 17.5, low: 13.5, close: 17.25, volume: 40 });
});

// ---------- v3: Heikin-Ashi, range presets, event slots ----------

import { bucketOf, futureSlots, heikinAshi, indexForDay, rangeStart, tfForRange } from "../src/lib/aggregate.ts";
import type { Candle } from "../src/lib/aggregate.ts";

test("heikinAshi: close is the OHLC mean, open the midpoint of the previous HA body", () => {
  const src: Candle[] = [
    { time: "2026-01-05", open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: "2026-01-06", open: 11, high: 13, low: 10, close: 12, volume: 200 },
    { time: "2026-01-07", open: 12, high: 12.5, low: 8, close: 9, volume: 300 },
  ];
  const ha = heikinAshi(src);
  assert.equal(ha.length, 3);
  // bar 0: open = (O + C) / 2, close = (O + H + L + C) / 4
  assert.deepEqual(ha[0], { time: "2026-01-05", open: 10.5, high: 12, low: 9, close: 10.5, volume: 100 });
  // bar 1: open = (10.5 + 10.5) / 2, close = (11 + 13 + 10 + 12) / 4
  assert.deepEqual(ha[1], { time: "2026-01-06", open: 10.5, high: 13, low: 10, close: 11.5, volume: 200 });
  // bar 2: open = (10.5 + 11.5) / 2 = 11, close = 41.5 / 4; the HA open (11) stays inside high/low
  assert.deepEqual(ha[2], { time: "2026-01-07", open: 11, high: 12.5, low: 8, close: 10.375, volume: 300 });
});

test("heikinAshi: high / low always contain the HA body; input is not mutated", () => {
  const src: Candle[] = [
    { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 1 },
    { time: 2, open: 20, high: 21, low: 19, close: 20, volume: 1 }, // gap up: HA open (10) is below the real low
  ];
  const copy = JSON.parse(JSON.stringify(src));
  const ha = heikinAshi(src);
  assert.equal(ha[1].open, 10);
  assert.equal(ha[1].low, 10);
  assert.equal(ha[1].high, 21);
  assert.deepEqual(src, copy);
});

test("heikinAshi: no bars → no candles, one bar → one candle", () => {
  assert.deepEqual(heikinAshi([]), []);
  assert.equal(heikinAshi([{ time: "2026-01-05", open: 1, high: 2, low: 0.5, close: 1.5, volume: 0 }]).length, 1);
});

test("rangeStart: months and years back from the last day, clamped to the first day with data", () => {
  assert.equal(rangeStart("1L", "2026-11-16", "2007-12-21"), "2026-10-16");
  assert.equal(rangeStart("3L", "2026-11-16", "2007-12-21"), "2026-08-16");
  assert.equal(rangeStart("6L", "2026-11-16", "2007-12-21"), "2026-05-16");
  assert.equal(rangeStart("YTD", "2026-11-16", "2007-12-21"), "2026-01-01");
  assert.equal(rangeStart("1A", "2026-11-16", "2007-12-21"), "2025-11-16");
  assert.equal(rangeStart("5A", "2026-11-16", "2007-12-21"), "2021-11-16");
  assert.equal(rangeStart("MAX", "2026-11-16", "2007-12-21"), "2007-12-21");
  // a listing younger than the preset: start at its first day
  assert.equal(rangeStart("5A", "2026-11-16", "2024-03-01"), "2024-03-01");
  // month ends: 31 May − 3 months is the last day of February, not 3 March
  assert.equal(rangeStart("3L", "2026-05-31", "2000-01-03"), "2026-02-28");
  assert.equal(rangeStart("1L", "2026-01-15", "2000-01-03"), "2025-12-15");
});

/** `n` daily-or-longer candles ending on `last`, `step` days apart. */
const daily = (n: number, last: string, step = 1): Candle[] => {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(end - (n - 1 - i) * step * 864e5).toISOString().slice(0, 10),
    open: 1, high: 1, low: 1, close: 1, volume: 0,
  }));
};
/** `perDay` intraday candles on each of the `days` calendar days ending on `last`. */
const intra = (days: number, perDay: number, last: string): Candle[] => {
  const end = Date.parse(`${last}T10:00:00Z`) / 1000;
  const out: Candle[] = [];
  for (let d = days - 1; d >= 0; d--) {
    for (let k = 0; k < perDay; k++) out.push({ time: end - d * 86400 + k * 900, open: 1, high: 1, low: 1, close: 1, volume: 0 });
  }
  return out;
};

test("tfForRange keeps the current interval when it reaches back far enough with a readable bar count", () => {
  const avail = [
    { tf: "15M" as const, candles: intra(60, 32, "2026-11-16") },
    { tf: "1H" as const, candles: intra(730, 8, "2026-11-16") },
    { tf: "D" as const, candles: daily(4000, "2026-11-16") },
    { tf: "W" as const, candles: daily(575, "2026-11-16", 7) },
    { tf: "M" as const, candles: daily(132, "2026-11-16", 30.5) },
  ];
  assert.equal(tfForRange("15M", "2026-10-16", avail), "15M"); // one month: 15M has it
  assert.equal(tfForRange("D", "2026-10-16", avail), "D");
  assert.equal(tfForRange("D", "2021-11-16", avail), "D"); // 5 years of daily bars is still fine
});

test("tfForRange switches to the finest interval that covers the range", () => {
  const avail = [
    { tf: "15M" as const, candles: intra(60, 32, "2026-11-16") },
    { tf: "1H" as const, candles: intra(730, 8, "2026-11-16") },
    { tf: "D" as const, candles: daily(4000, "2026-11-16") },
    { tf: "W" as const, candles: daily(575, "2026-11-16", 7) },
    { tf: "M" as const, candles: daily(132, "2026-11-16", 30.5) },
  ];
  assert.equal(tfForRange("15M", "2026-08-16", avail), "1H"); // 15M history is only 60 days
  assert.equal(tfForRange("15M", "2021-11-16", avail), "D"); // 5 years: intraday does not reach
  assert.equal(tfForRange("1H", "2025-11-16", avail), "D"); // a year of hourly bars is too many to read
  assert.equal(tfForRange("D", "2015-12-05", avail), "W"); // 4000 daily bars → weekly
  assert.equal(tfForRange("M", "2026-10-16", avail), "15M"); // one monthly candle says nothing
});

test("tfForRange: nothing fits or nothing available → stays where it is", () => {
  assert.equal(tfForRange("D", "2026-01-01", []), "D");
  assert.equal(tfForRange("D", "2026-01-01", [{ tf: "D", candles: [] }]), "D");
  // only a handful of bars exist at all: the coarse-but-covering interval is still the best there is
  assert.equal(tfForRange("15M", "2026-11-01", [{ tf: "D", candles: daily(5, "2026-11-16") }]), "D");
});

test("bucketOf groups days by week (Monday-based) and month", () => {
  assert.equal(bucketOf("D", "2026-11-16"), "2026-11-16");
  assert.equal(bucketOf("W", "2026-11-16"), bucketOf("W", "2026-11-20")); // Mon and Fri of one week
  assert.notEqual(bucketOf("W", "2026-11-15"), bucketOf("W", "2026-11-16")); // Sun | Mon
  assert.equal(bucketOf("M", "2026-11-16"), "2026-11");
});

test("indexForDay: daily → that day's candle or the next session; weekly / monthly → the candle containing it", () => {
  const days = ["2026-06-11", "2026-06-12", "2026-06-15", "2026-06-16"];
  assert.equal(indexForDay("D", days, "2026-06-15"), 2);
  assert.equal(indexForDay("D", days, "2026-06-13"), 2); // Saturday → Monday
  assert.equal(indexForDay("D", days, "2026-06-01"), -1); // before the history
  assert.equal(indexForDay("D", days, "2026-06-17"), -1); // after it
  assert.equal(indexForDay("D", [], "2026-06-17"), -1);

  const weeks = ["2026-06-02", "2026-06-08", "2026-06-15"]; // first week starts on a Tuesday (Monday holiday)
  assert.equal(indexForDay("W", weeks, "2026-06-12"), 1);
  assert.equal(indexForDay("W", weeks, "2026-06-01"), 0); // the Monday of a week whose first session was Tuesday
  assert.equal(indexForDay("W", weeks, "2026-06-24"), -1);
  assert.equal(indexForDay("M", ["2026-05-04", "2026-06-02"], "2026-06-15"), 1);
  assert.equal(indexForDay("M", ["2026-05-04", "2026-06-02"], "2026-06-01"), 1);
  assert.equal(indexForDay("M", ["2026-05-04", "2026-06-02"], "2026-04-30"), -1);
  assert.equal(indexForDay("1H", days, "2026-06-15"), -1); // intraday carries no event marks
});

test("futureSlots: the sessions / weeks / months between the last candle and an upcoming date", () => {
  // Monday 16 nov → Friday 20 nov: four weekdays
  assert.deepEqual(futureSlots("D", "2026-11-16", "2026-11-20", 40), ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  // across a weekend, and a Saturday date lands on the next Monday
  assert.deepEqual(futureSlots("D", "2026-11-19", "2026-11-21", 40), ["2026-11-20", "2026-11-23"]);
  assert.deepEqual(futureSlots("D", "2026-11-16", "2026-11-16", 40), []); // not in the future
  assert.deepEqual(futureSlots("D", "2026-11-16", "2026-11-10", 40), []);
  assert.deepEqual(futureSlots("D", "2026-11-16", "2027-06-01", 40), []); // too far ahead to draw
  assert.deepEqual(futureSlots("W", "2026-11-16", "2026-11-20", 12), []); // same week: the candle exists
  assert.deepEqual(futureSlots("W", "2026-11-18", "2026-12-02", 12), ["2026-11-23", "2026-11-30"]);
  assert.deepEqual(futureSlots("M", "2026-11-16", "2027-01-20", 6), ["2026-12-01", "2027-01-01"]);
  assert.deepEqual(futureSlots("M", "2026-11-16", "2026-11-30", 6), []);
  assert.deepEqual(futureSlots("1H", "2026-11-16", "2026-11-20", 40), []);
});
