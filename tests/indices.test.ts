import { test } from "node:test";
import assert from "node:assert/strict";
import { capWeightedIndex, dailyFromHourly, mergeCloses, perf } from "../scripts/lib/indices.ts";
import type { Close } from "../scripts/lib/indices.ts";

test("dailyFromHourly keeps the last hourly close of each Bucharest day", () => {
  const q = [
    { date: "2026-11-13T08:00:00Z", close: 100 },
    { date: "2026-11-13T15:00:00Z", close: 102 }, // 17:00 Bucharest: the session's last bar
    { date: "2026-11-13T12:00:00Z", close: 101 },
    { date: "2026-11-16T08:00:00Z", close: null },
    { date: "2026-11-16T15:00:00Z", close: 103.456 },
    { date: "2026-11-16T22:30:00Z", close: 999 }, // 00:30 on the 17th in Bucharest
  ];
  assert.deepEqual(dailyFromHourly(q), [["2026-11-13", 102], ["2026-11-16", 103.46], ["2026-11-17", 999]]);
});

test("mergeCloses lets fresh values win and keeps older history", () => {
  assert.deepEqual(mergeCloses([["2026-01-02", 1], ["2026-01-05", 2]], [["2026-01-05", 3], ["2026-01-06", 4]]), [
    ["2026-01-02", 1], ["2026-01-05", 3], ["2026-01-06", 4],
  ]);
});

test("perf uses fractions and session counts like the stock snapshot", () => {
  const d: Close[] = [];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 300; i++) d.push([new Date(start + i * 864e5).toISOString().slice(0, 10), 100 + i]);
  const p = perf(d)!;
  assert.equal(p.last, 399);
  assert.equal(p.changePct, Math.round((399 / 398 - 1) * 1e6) / 1e6);
  assert.equal(p.perfW, Math.round((399 / 394 - 1) * 1e6) / 1e6);
  assert.equal(p.perfM, Math.round((399 / 378 - 1) * 1e6) / 1e6);
  assert.equal(p.perfY, Math.round((399 / 147 - 1) * 1e6) / 1e6);
  // All 300 days fall in 2025, so there is no previous-year close to measure YTD from.
  assert.equal(p.perfYTD, null);
  assert.equal(perf([["2026-01-02", 5]])!.changePct, null);
  assert.equal(perf([])?.last, undefined);
});

test("capWeightedIndex weights returns by market cap and rebases to 1000", () => {
  // A: cap 300 (3 shares at 100), B: cap 100 (10 shares at 10). Day 2: A +10%, B -10%.
  const a: Close[] = [["2026-01-05", 100], ["2026-01-06", 110], ["2026-01-07", 100]];
  const b: Close[] = [["2026-01-05", 10], ["2026-01-06", 9], ["2026-01-07", 10]];
  const ix = capWeightedIndex([{ ticker: "A", marketCap: 300, closes: a }, { ticker: "B", marketCap: 100, closes: b }], "2026-01-01");
  // shares from today's cap: A 3, B 10 → day 1 cap 400, day 2 330 + 90 = 420, day 3 400.
  assert.deepEqual(ix, [["2026-01-05", 1000], ["2026-01-06", 1050], ["2026-01-07", 1000]]);
});

test("capWeightedIndex: a late listing joins without a jump, a missing bar carries the last close", () => {
  const a: Close[] = [["2026-01-05", 100], ["2026-01-06", 110], ["2026-01-07", 121]];
  const late: Close[] = [["2026-01-06", 50], ["2026-01-07", 50]];
  const ix = capWeightedIndex([{ ticker: "A", marketCap: 121, closes: a }, { ticker: "L", marketCap: 1000, closes: late }], "2026-01-01");
  assert.deepEqual(ix.map((x) => x[1]), [1000, 1100, 1100 * ((121 + 1000) / (110 + 1000))].map((x) => Math.round(x * 100) / 100));

  const gap: Close[] = [["2026-01-05", 10], ["2026-01-07", 20]]; // no bar on the 6th: flat, then +100%
  const ix2 = capWeightedIndex([{ ticker: "A", marketCap: 121, closes: a }, { ticker: "G", marketCap: 20, closes: gap }], "2026-01-05");
  assert.equal(ix2.length, 3);
  // day 6: A 100→110 (shares 1), G flat at 10 (shares 1) → (110+10)/(100+10)
  assert.equal(ix2[1][1], Math.round(1000 * (120 / 110) * 100) / 100);
});

test("capWeightedIndex ignores members without a cap and days before the window", () => {
  const a: Close[] = [["2025-12-30", 90], ["2026-01-05", 100], ["2026-01-06", 120]];
  const ix = capWeightedIndex([{ ticker: "A", marketCap: 120, closes: a }, { ticker: "Z", marketCap: 0, closes: a }], "2026-01-01");
  assert.deepEqual(ix, [["2026-01-05", 1000], ["2026-01-06", 1200]]);
  assert.deepEqual(capWeightedIndex([], "2026-01-01"), []);
});
