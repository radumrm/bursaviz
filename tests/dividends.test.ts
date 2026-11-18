import test from "node:test";
import assert from "node:assert/strict";
import { changes, cleanPayments, consecutiveYears, yearlyGrowth, yearlySums } from "../src/lib/dividends.ts";

const P = cleanPayments([
  ["2023-06-01", 1],
  ["2021-06-01", 0.5],
  ["2022-06-01", 0.8],
  ["2022-11-01", 0.2],
  ["bad", 3],
  ["2024-06-01", 2],
  null,
]);

test("cleanPayments sorts and drops junk", () => {
  assert.equal(P.length, 5);
  assert.equal(P[0][0], "2021-06-01");
  assert.deepEqual(cleanPayments(undefined), []);
});

test("yearlySums adds payments in a year", () => {
  const s = yearlySums(P);
  assert.deepEqual(s.map((x) => [x.year, Math.round(x.total * 10) / 10, x.count]), [[2021, 0.5, 1], [2022, 1, 2], [2023, 1, 1], [2024, 2, 1]]);
});

test("consecutiveYears", () => {
  const s = yearlySums(P);
  assert.equal(consecutiveYears(s, 2024), 4);
  assert.equal(consecutiveYears(s, 2025), 4); // current year not yet paid
  assert.equal(consecutiveYears(s, 2026), 0); // 2025 missed
  assert.equal(consecutiveYears(yearlySums([["2019-01-01", 1], ["2022-01-01", 1], ["2023-01-01", 1]]), 2023), 2);
});

test("yearlyGrowth is CAGR over complete years", () => {
  const s = yearlySums(P);
  assert.ok(Math.abs(yearlyGrowth(s, 2025, 1)! - 1) < 1e-9); // 1 -> 2
  assert.ok(Math.abs(yearlyGrowth(s, 2025, 3)! - (Math.pow(4, 1 / 3) - 1)) < 1e-9);
  assert.equal(yearlyGrowth(s, 2025, 5), null);
});

test("changes vs previous payment", () => {
  const c = changes([["2020-01-01", 1], ["2021-01-01", 1.5], ["2022-01-01", 0.75]]);
  assert.deepEqual(c, [null, 0.5, -0.5]);
});
