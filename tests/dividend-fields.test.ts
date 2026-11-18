import { test } from "node:test";
import assert from "node:assert/strict";
import { divCagr, dividendFields, ttmDividend } from "../scripts/lib/dividends.ts";

const digi: [string, number][] = [["2024-07-03", 0.4167], ["2025-06-26", 0.45], ["2026-07-07", 0.5]];

test("ttmDividend sums the twelve months up to and including the as-of day", () => {
  assert.equal(ttmDividend(digi, "2026-11-18"), 0.5);
  assert.equal(ttmDividend(digi, "2026-06-26"), 0); // 2025-06-26 is exactly a year earlier: outside
  assert.equal(ttmDividend(digi, "2026-06-25"), 0.45);
  assert.equal(ttmDividend([["2025-11-24", 0.5611], ["2026-06-15", 1.1222]], "2026-11-18"), 1.6833);
  assert.equal(ttmDividend([], "2026-11-18"), null);
  assert.equal(ttmDividend(undefined, "2026-11-18"), null);
});

test("dividendFields: the history beats Yahoo's TTM (DIGI's EUR value against a RON price)", () => {
  const f = dividendFields(digi, "2026-11-18", 58.9, { divTTM: 0.098, divTTMYield: 0.001661, divEst: 0.5, divEstYield: 0.0085 });
  assert.equal(f.divTTM, 0.5);
  assert.ok(Math.abs((f.divTTMYield ?? 0) - 0.5 / 58.9) < 1e-8);
  assert.equal(f.divEstYield, 0.0085);
});

test("dividendFields: no history keeps Yahoo, a history with nothing recent gives 0", () => {
  const yahoo = { divTTM: 0.2, divTTMYield: 0.05, divEst: null, divEstYield: null };
  assert.deepEqual(dividendFields([], "2026-11-18", 4, yahoo), { divTTM: 0.2, divTTMYield: 0.05, divEstYield: null });
  const lion = dividendFields([["2024-05-20", 0.41]], "2026-11-18", 4.76, { ...yahoo, divTTM: 0.464, divTTMYield: 0.097 });
  assert.equal(lion.divTTM, 0);
  assert.equal(lion.divTTMYield, 0);
});

test("dividendFields fills a zero forward yield from the forward rate, and needs a price for yields", () => {
  const pe = dividendFields([["2025-06-19", 0.5973]], "2026-11-18", 54.6, { divTTM: 0, divTTMYield: 0, divEst: 0.6, divEstYield: 0 });
  assert.ok(Math.abs((pe.divEstYield ?? 0) - 0.6 / 54.6) < 1e-8);
  const noPrice = dividendFields(digi, "2026-11-18", null, { divTTM: null, divTTMYield: null, divEst: 0.5, divEstYield: null });
  assert.equal(noPrice.divTTM, 0.5);
  assert.equal(noPrice.divTTMYield, null);
  assert.equal(noPrice.divEstYield, null);
});

test("divCagr compares calendar-year sums", () => {
  assert.ok(Math.abs((divCagr(digi, 1, 2025) ?? 0) - (0.45 / 0.4167 - 1)) < 1e-9);
  assert.equal(divCagr(digi, 3, 2025), null);
});
