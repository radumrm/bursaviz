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
