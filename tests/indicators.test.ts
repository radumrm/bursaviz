import { test } from "node:test";
import assert from "node:assert/strict";
import { bollinger, ema, macd, vwap } from "../src/lib/indicators.ts";

const close = (a: number | null, b: number, eps = 1e-9) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs((a as number) - b) < eps, `${a} ≈ ${b}`);
};

test("ema is seeded with the SMA of the first `period` values", () => {
  assert.deepEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test("bollinger uses the population standard deviation", () => {
  const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
  close(b.mid[7], 5);
  close(b.upper[7], 9);
  close(b.lower[7], 1);
  for (let i = 0; i < 7; i++) {
    assert.equal(b.mid[i], null);
    assert.equal(b.upper[i], null);
    assert.equal(b.lower[i], null);
  }
});

test("macd starts at slow-1 and its signal 8 bars later", () => {
  const v = Array.from({ length: 40 }, (_, i) => 10 + i * 0.5);
  const m = macd(v);
  assert.equal(m.macd.length, 40);
  assert.equal(m.signal.length, 40);
  assert.equal(m.hist.length, 40);
  assert.equal(m.macd[24], null);
  assert.equal(typeof m.macd[25], "number");
  assert.equal(m.signal[32], null);
  assert.equal(typeof m.signal[33], "number");
  for (let i = 0; i < 40; i++) {
    const a = m.macd[i];
    const s = m.signal[i];
    if (a != null && s != null) close(m.hist[i], a - s);
    else assert.equal(m.hist[i], null);
  }
});

test("vwap accumulates within a session and resets on a new key", () => {
  assert.deepEqual(vwap([10, 20], [10, 20], [10, 20], [1, 3], ["a", "a"]), [10, 17.5]);
  assert.deepEqual(vwap([10, 20], [10, 20], [10, 20], [1, 3], ["a", "b"]), [10, 20]);
  assert.deepEqual(vwap([10, 20], [10, 20], [10, 20], [0, 3], [1, 1]), [null, 20]);
});

test("too few values give all-null arrays, without throwing", () => {
  assert.deepEqual(ema([1, 2], 3), [null, null]);
  const b = bollinger([1, 2, 3], 20);
  assert.deepEqual(b, { mid: [null, null, null], upper: [null, null, null], lower: [null, null, null] });
  const m = macd([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(m.macd, new Array(10).fill(null));
  assert.deepEqual(m.signal, new Array(10).fill(null));
  assert.deepEqual(m.hist, new Array(10).fill(null));
  // enough for the MACD line but not for its signal
  const m2 = macd(Array.from({ length: 30 }, (_, i) => i));
  assert.equal(typeof m2.macd[29], "number");
  assert.deepEqual(m2.signal, new Array(30).fill(null));
  assert.deepEqual(ema([], 9), []);
  assert.deepEqual(vwap([], [], [], [], []), []);
});

import { analystLabel, techLabel, techRating } from "../src/lib/indicators.ts";
import type { DailyBar } from "../src/lib/types.ts";

const barsFrom = (closes: number[]): DailyBar[] =>
  closes.map((c, i) => [`2024-01-${String(i).padStart(4, "0")}`, c, c, c, c, 1000]);

test("techRating: steadily rising series is Strong Buy", () => {
  const r = techRating(barsFrom(Array.from({ length: 300 }, (_, i) => 100 + i * 0.5)));
  assert.notEqual(r, null);
  assert.equal(r!.label, "Strong Buy");
  assert.ok(r!.score >= 0.5);
  assert.equal(r!.votes.length, 7);
});

test("techRating: steadily falling series is Strong Sell", () => {
  const r = techRating(barsFrom(Array.from({ length: 300 }, (_, i) => 400 - i)));
  assert.equal(r!.label, "Strong Sell");
  assert.ok(r!.score <= -0.5);
});

test("techRating: fewer than 200 bars gives null", () => {
  assert.equal(techRating(barsFrom(Array.from({ length: 199 }, (_, i) => 100 + i))), null);
});

test("label thresholds", () => {
  assert.equal(analystLabel(1.5), "Strong Buy");
  assert.equal(analystLabel(2.5), "Buy");
  assert.equal(analystLabel(3.5), "Hold");
  assert.equal(analystLabel(4.5), "Sell");
  assert.equal(analystLabel(4.6), "Strong Sell");
  assert.equal(analystLabel(null), null);
  assert.equal(techLabel(0.15), "Buy");
  assert.equal(techLabel(0.1), "Neutral");
  assert.equal(techLabel(-0.15), "Sell");
  assert.equal(techLabel(-0.5), "Strong Sell");
});
