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

// ---------- v3: Stochastic, OBV, ATR pane ----------

import { atr, obv, stochastic } from "../src/lib/indicators.ts";

test("stochastic: raw %K is the close's position in the high-low range of the window", () => {
  const high = [10, 12, 14, 13, 15];
  const low = [8, 9, 11, 10, 12];
  const cl = [9, 11, 13, 11, 14];
  // window 3, no smoothing of %K, %D = 2-bar average of %K
  const s = stochastic(high, low, cl, 3, 1, 2);
  assert.deepEqual(s.k.slice(0, 2), [null, null]);
  close(s.k[2], (100 * (13 - 8)) / (14 - 8)); // 83.33
  close(s.k[3], (100 * (11 - 9)) / (14 - 9)); // 40
  close(s.k[4], (100 * (14 - 10)) / (15 - 10)); // 80
  assert.deepEqual(s.d.slice(0, 3), [null, null, null]);
  close(s.d[3], (500 / 6 + 40) / 2);
  close(s.d[4], 60);
});

test("stochastic (14, 3, 3): %K starts at bar 15, %D at bar 17, both stay within 0..100", () => {
  const n = 60;
  const cl = Array.from({ length: n }, (_, i) => 20 + 5 * Math.sin(i / 4) + i * 0.05);
  const high = cl.map((c) => c + 0.6);
  const low = cl.map((c) => c - 0.4);
  const s = stochastic(high, low, cl);
  assert.equal(s.k.length, n);
  assert.equal(s.d.length, n);
  for (let i = 0; i < 15; i++) assert.equal(s.k[i], null);
  for (let i = 0; i < 17; i++) assert.equal(s.d[i], null);
  for (let i = 17; i < n; i++) {
    const k = s.k[i] as number;
    const d = s.d[i] as number;
    assert.ok(k >= 0 && k <= 100, `%K ${k}`);
    assert.ok(d >= 0 && d <= 100, `%D ${d}`);
  }
  // slow %K is the 3-bar mean of the raw value
  const raw = (i: number) => {
    const hh = Math.max(...high.slice(i - 13, i + 1));
    const ll = Math.min(...low.slice(i - 13, i + 1));
    return (100 * (cl[i] - ll)) / (hh - ll);
  };
  close(s.k[30], (raw(28) + raw(29) + raw(30)) / 3);
  close(s.d[30], ((s.k[28] as number) + (s.k[29] as number) + (s.k[30] as number)) / 3);
});

test("stochastic: too few bars → nulls, no throw; a flat window has no reading", () => {
  const few = stochastic([1, 2, 3], [1, 2, 3], [1, 2, 3]);
  assert.deepEqual(few.k, [null, null, null]);
  assert.deepEqual(few.d, [null, null, null]);
  assert.deepEqual(stochastic([], [], []), { k: [], d: [] });
  // 20 identical bars: high == low over every window, so the position in the range is undefined
  const flat = new Array(20).fill(5);
  const s = stochastic(flat, flat, flat);
  assert.ok(s.k.every((v) => v === null));
  assert.ok(s.d.every((v) => v === null));
});

test("obv adds the volume on up closes, subtracts it on down closes, ignores unchanged ones", () => {
  assert.deepEqual(obv([10, 11, 10.5, 10.5, 12], [100, 200, 50, 70, 30]), [0, 200, 150, 150, 180]);
});

test("obv: no bars → empty, one bar → 0, bad volumes count as 0", () => {
  assert.deepEqual(obv([], []), []);
  assert.deepEqual(obv([5], [1000]), [0]);
  assert.deepEqual(obv([1, 2, 3], [10, NaN, 5]), [0, 0, 5]);
});

test("atr (the ATR 14 pane): too few bars → nulls, no throw", () => {
  const few = atr([2, 3], [1, 2], [1.5, 2.5]);
  assert.deepEqual(few, [null, null]);
  assert.deepEqual(atr([], [], []), []);
  // constant 1-wide bars with no gaps: true range is always 1
  const n = 30;
  const a = atr(new Array(n).fill(11), new Array(n).fill(10), new Array(n).fill(10.5));
  for (let i = 0; i < 14; i++) assert.equal(a[i], null);
  close(a[14], 1);
  close(a[n - 1], 1);
});
