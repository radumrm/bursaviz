import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_GROUPS, alignOnCommonDates, annualisedVolatility, asRange, assignSlots, bestIndexes, compareSet, correlation,
  correlationMatrix, largest, maxDrawdown, median, metricValue, parseTickerList, rangePosition, rangeStart, rebase,
  sectorPeers, simpleReturns, sliceRange, totalReturn, valueAt,
} from "../src/lib/compare.ts";
import type { Series } from "../src/lib/compare.ts";
import type { IndexRow } from "../src/lib/types.ts";

const near = (a: number | null | undefined, b: number, eps = 1e-12) => {
  assert.ok(a != null, `expected a number near ${b}, got ${a}`);
  assert.ok(Math.abs((a as number) - b) < eps, `${a} ≈ ${b}`);
};

/** Consecutive January 2026 days: day(1) = "2026-01-01". */
const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;
const series = (closes: number[], from = 1): Series => closes.map((c, i) => [day(from + i), c]);

// ---------- ticker list ----------

test("parseTickerList upper-cases, de-duplicates, reports unknown tickers and caps the list", () => {
  const known = ["TLV", "SNP", "BRD", "H2O", "SNG", "EL", "TGN", "M"];
  assert.deepEqual(parseTickerList("tlv, SNP,XYZ,tlv,,BRD", known), { tickers: ["TLV", "SNP", "BRD"], unknown: ["XYZ"], overflow: [] });
  assert.deepEqual(parseTickerList(null, known), { tickers: [], unknown: [], overflow: [] });
  const many = parseTickerList("TLV,SNP,BRD,H2O,SNG,EL,TGN,M", new Set(known));
  assert.deepEqual(many.tickers, ["TLV", "SNP", "BRD", "H2O", "SNG", "EL"]);
  assert.deepEqual(many.overflow, ["TGN", "M"]);
});

test("assignSlots keeps a stock's colour when another one is removed and reuses the freed slot", () => {
  const a = assignSlots({}, ["TLV", "BRD", "SNP"]);
  assert.deepEqual(a, { TLV: 0, BRD: 1, SNP: 2 });
  const b = assignSlots(a, ["TLV", "SNP"]);
  assert.deepEqual(b, { TLV: 0, SNP: 2 });
  assert.deepEqual(assignSlots(b, ["TLV", "SNP", "H2O"]), { TLV: 0, SNP: 2, H2O: 1 });
});

// ---------- ranges ----------

test("rangeStart counts calendar months back and clamps the day", () => {
  assert.equal(rangeStart("1L", "2026-11-16"), "2026-10-16");
  assert.equal(rangeStart("1L", "2026-03-31"), "2026-02-28");
  assert.equal(rangeStart("3L", "2026-01-15"), "2025-10-15");
  assert.equal(rangeStart("6L", "2024-08-31"), "2024-02-29");
  assert.equal(rangeStart("1A", "2026-11-16"), "2025-11-16");
  assert.equal(rangeStart("5A", "2026-11-16"), "2021-11-16");
  assert.equal(rangeStart("YTD", "2026-11-16"), "2025-12-31");
  assert.equal(rangeStart("MAX", "2026-11-16"), null);
  assert.equal(asRange("3a"), "3A");
  assert.equal(asRange("nonsense"), "1A");
  assert.equal(asRange(null), "1A");
});

test("sliceRange starts on the last bar on or before the start date", () => {
  const s = series([10, 11, 12, 13, 14]); // Jan 1..5
  assert.deepEqual(sliceRange(s, day(3)), series([12, 13, 14], 3));
  // the start falls between bars → the bar before it is the base
  const gaps: Series = [[day(1), 10], [day(5), 11], [day(9), 12]];
  assert.deepEqual(sliceRange(gaps, day(7)), [[day(5), 11], [day(9), 12]]);
  assert.equal(sliceRange(s, null), s);
});

test("sliceRange: a stock listed after the range start begins where its data begins", () => {
  const late = series([50, 55], 10);
  assert.deepEqual(sliceRange(late, day(3)), late);
  // nothing after the start (a stock that stopped trading) → nothing to show
  assert.deepEqual(sliceRange(series([1, 2, 3]), day(20)), []);
  assert.deepEqual(sliceRange([], day(3)), []);
});

test("rebase starts at 0 and valueAt reads the last point on or before a date", () => {
  const r = rebase(series([20, 22, 18]));
  assert.equal(r[0][1], 0);
  near(r[1][1], 0.1);
  near(r[2][1], -0.1);
  assert.deepEqual(rebase([]), []);
  const s: Series = [[day(2), 1], [day(4), 2], [day(8), 3]];
  assert.equal(valueAt(s, day(1)), null);
  assert.equal(valueAt(s, day(2)), 1);
  assert.equal(valueAt(s, day(5)), 2);
  assert.equal(valueAt(s, day(30)), 3);
});

// ---------- risk ----------

test("a constant series has zero return, zero volatility and zero drawdown", () => {
  const flat = series([7, 7, 7, 7, 7]);
  assert.equal(totalReturn(flat), 0);
  assert.equal(annualisedVolatility(flat), 0);
  assert.equal(maxDrawdown(flat)?.depth, 0);
});

test("totalReturn is last over first", () => {
  near(totalReturn(series([100, 90, 125])), 0.25);
  assert.equal(totalReturn(series([100])), null);
  assert.equal(totalReturn([]), null);
});

test("annualisedVolatility is the sample deviation of daily returns times sqrt(sessions per year)", () => {
  // closes 100 → 110 → 99 → 108.9: returns +10%, −10%, +10%
  const s = series([100, 110, 99, 108.9]);
  const r = simpleReturns(s.map((p) => p[1]));
  near(r[0], 0.1);
  near(r[1], -0.1);
  near(r[2], 0.1);
  // mean 1/30, squared deviations 2·(2/30)² + (4/30)² = 24/900, sample variance 12/900
  near(annualisedVolatility(s, 1), Math.sqrt(12 / 900));
  near(annualisedVolatility(s), Math.sqrt(12 / 900) * Math.sqrt(252));
  // steady growth: every return identical → no volatility
  near(annualisedVolatility(series([100, 110, 121, 133.1])), 0, 1e-9);
  assert.equal(annualisedVolatility(series([100, 110])), null);
});

test("maxDrawdown finds the deepest peak-to-trough fall, not just the fall from the highest peak", () => {
  //             1    2    3    4    5    6    7
  const s = series([100, 120, 90, 110, 150, 135, 160]);
  const dd = maxDrawdown(s);
  near(dd?.depth, 90 / 120 - 1); // −25% from 120 to 90 beats −10% from 150 to 135
  assert.equal(dd?.peak, day(2));
  assert.equal(dd?.trough, day(3));
  // a fall that keeps going to the end
  near(maxDrawdown(series([10, 20, 15, 5]))?.depth, -0.75);
  // a series that only rises never draws down
  assert.equal(maxDrawdown(series([1, 2, 3]))?.depth, 0);
  assert.equal(maxDrawdown([]), null);
});

test("perfectly proportional series correlate at 1, mirrored returns at -1", () => {
  const a = series([10, 11, 10.5, 12, 11.4, 13]);
  const twice = series(a.map((p) => p[1] * 2));
  const c = correlation(a, twice);
  near(c.r, 1);
  assert.equal(c.n, 5);

  // b's return is always the negative of a's
  const ra = simpleReturns(a.map((p) => p[1]));
  const mirror = [100];
  for (const r of ra) mirror.push(mirror[mirror.length - 1] * (1 - r));
  near(correlation(a, series(mirror)).r, -1);
});

test("correlation matches a hand-computed value", () => {
  // returns a: +10%, −10%, +10%, −10%   b: +10%, +10%, −10%, −10%  → covariance 0
  const a = series([100, 110, 99, 108.9, 98.01]);
  const b = series([100, 110, 121, 108.9, 98.01]);
  near(correlation(a, b).r, 0);
  // returns a: 1%, 2%, 3%  b: 1%, 3%, 2% → r = 0.5
  const up = (rs: number[]) => rs.reduce((acc, r) => [...acc, acc[acc.length - 1] * (1 + r)], [100]);
  near(correlation(series(up([0.01, 0.02, 0.03])), series(up([0.01, 0.03, 0.02]))).r, 0.5, 1e-9);
});

test("correlation is undefined for a flat series or too few common days", () => {
  const a = series([10, 11, 10.5, 12, 11.4]);
  assert.equal(correlation(a, series([5, 5, 5, 5, 5])).r, null);
  assert.equal(correlation(series([10, 11, 12]), series([20, 21, 23])).r, null); // two return pairs
  assert.equal(correlation(a, []).r, null);
});

test("misaligned dates are aligned on the dates both series have", () => {
  // a trades Jan 1–6; b misses Jan 3 and has an extra Jan 7
  const a: Series = [[day(1), 100], [day(2), 110], [day(3), 132], [day(4), 121], [day(5), 133.1], [day(6), 119.79]];
  const b: Series = [[day(1), 50], [day(2), 55], [day(4), 60.5], [day(5), 66.55], [day(6), 59.895], [day(7), 80]];
  const al = alignOnCommonDates(a, b);
  assert.deepEqual(al.dates, [day(1), day(2), day(4), day(5), day(6)]);
  assert.deepEqual(al.a, [100, 110, 121, 133.1, 119.79]);
  assert.deepEqual(al.b, [50, 55, 60.5, 66.55, 59.895]);
  // on the common dates b is exactly half of a → the Jan 3 spike in a alone must not matter
  const c = correlation(a, b);
  assert.equal(c.n, 4);
  near(c.r, 1);
  // order of the arguments does not matter
  near(correlation(b, a).r, 1);
});

test("correlationMatrix is symmetric with ones on the diagonal", () => {
  const a = series([10, 11, 10.5, 12, 11.4, 13]);
  const b = series([20, 19, 21, 20, 23, 22]);
  const m = correlationMatrix([a, b, []]);
  assert.equal(m[0][0].r, 1);
  assert.equal(m[1][1].r, 1);
  assert.equal(m[2][2].r, null);
  assert.equal(m[0][1].r, m[1][0].r);
  assert.equal(m[0][1].r, correlation(a, b).r);
  assert.equal(m[0][2].r, null);
});

// ---------- metrics ----------

test("median ignores missing values", () => {
  assert.equal(median([3, null, 1, undefined, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, NaN]), null);
});

test("bestIndexes: lower P/E wins only among positive values", () => {
  assert.deepEqual(bestIndexes([12, -3, 8, null], "lowPositive"), [2]);
  assert.deepEqual(bestIndexes([12, -3, null], "lowPositive"), []); // one comparable value → nothing to compare
  assert.deepEqual(bestIndexes([0, 5, 9], "lowPositive"), [1]);
});

test("bestIndexes: higher wins for yield / ROE / margins, ties are all marked, equal rows have no winner", () => {
  assert.deepEqual(bestIndexes([0.03, 0.05, null, -0.01], "high"), [1]);
  assert.deepEqual(bestIndexes([0.05, 0.02, 0.05], "high"), [0, 2]);
  assert.deepEqual(bestIndexes([0.05, 0.05], "high"), []);
  assert.deepEqual(bestIndexes([0.4, 0, -1, 2], "lowNonNegative"), [1]);
  assert.deepEqual(bestIndexes([3, 1, 2], "low"), [1]);
});

test("bestIndexes: neutral metrics never have a winner", () => {
  assert.deepEqual(bestIndexes([1, 2, 3], "none"), []);
  const defs = METRIC_GROUPS.flatMap((g) => g.rows);
  const better = (id: string) => defs.find((d) => d.id === id)?.better;
  for (const id of ["price", "marketCap", "beta", "rsi", "range52"]) assert.equal(better(id), "none", id);
  for (const id of ["pe", "fpe", "ps", "pb", "evEbitda", "recom"]) assert.equal(better(id), "lowPositive", id);
  for (const id of ["divYield", "roe", "roa", "grossM", "operM", "profitM", "perfW", "perf5Y", "techScore"]) assert.equal(better(id), "high", id);
  assert.equal(better("debtEq"), "lowNonNegative");
});

test("metricValue reads the snapshot, falls back between keys and derives the 52-week position", () => {
  const defs = METRIC_GROUPS.flatMap((g) => g.rows);
  const def = (id: string) => defs.find((d) => d.id === id)!;
  const snap = { pe: 10.5, divTTMYield: null, divEstYield: 0.04, price: 30, low52: 20, high52: 40, roe: "n/a" };
  assert.equal(metricValue(def("pe"), snap), 10.5);
  assert.equal(metricValue(def("divYield"), snap), 0.04);
  assert.equal(metricValue(def("range52"), snap), 0.5);
  assert.equal(metricValue(def("roe"), snap), null);
  assert.equal(metricValue(def("beta"), snap), null);
  assert.equal(metricValue(def("pe"), null), null);
  assert.equal(rangePosition(45, 20, 40), 1);
  assert.equal(rangePosition(30, 40, 40), null);
});

// ---------- sector peers ----------

const row = (ticker: string, sector: string, marketCap: number | null): IndexRow => ({
  ticker, name: ticker, sector, industry: "", index: null, price: null, changePct: null, marketCap, pe: null, volume: null,
  relVol: null, perfW: null, perfM: null, perfYTD: null, perfY: null, rsi: null, divYield: null, recom: null, target: null,
  techScore: null, sma200: null, high52Pct: null, low52Pct: null, spark: [],
});

test("sectorPeers ranks the whole sector by market cap, the stock included", () => {
  const rows = [row("A", "Fin", 5), row("B", "Fin", 50), row("C", "Energy", 99), row("D", "Fin", null), row("E", "Fin", 20)];
  assert.deepEqual(sectorPeers(rows, "E").map((r) => r.ticker), ["B", "E", "A", "D"]);
  assert.deepEqual(sectorPeers(rows, "C"), []); // alone in its sector
  assert.deepEqual(sectorPeers(rows, "ZZ"), []);
  assert.deepEqual(compareSet(rows, "A", 3), ["A", "B", "E"]);
  assert.deepEqual(compareSet(rows, "C"), ["C"]);
  assert.deepEqual(largest(rows, 2), ["C", "B"]);
});
