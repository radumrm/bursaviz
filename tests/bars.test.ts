import test from "node:test";
import assert from "node:assert/strict";
import { repairDaily } from "../scripts/lib/bars.ts";
import type { DailyBar, IntraBar } from "../src/lib/types.ts";

const at = (iso: string) => Date.parse(iso + "Z") / 1000;

test("a flat daily bar is rebuilt from that day's hourly range, keeping close and volume", () => {
  const daily: DailyBar[] = [["2026-11-10", 5, 5, 5, 5, 900]];
  const hourly: IntraBar[] = [
    [at("2026-11-10T10:00:00"), 4.8, 4.9, 4.7, 4.9, 100],
    [at("2026-11-10T11:00:00"), 4.9, 5.2, 4.9, 5.1, 200],
  ];
  const { bars, repaired } = repairDaily(daily, hourly);
  assert.equal(repaired, 1);
  assert.deepEqual(bars[0], ["2026-11-10", 4.8, 5.2, 4.7, 5, 900]);
});

test("a one-price session (hourly bars flat too) and days without hourly data are left alone", () => {
  const daily: DailyBar[] = [["2026-11-09", 0.37, 0.37, 0.37, 0.37, 10], ["2020-01-03", 2, 2, 2, 2, 5]];
  const hourly: IntraBar[] = [[at("2026-11-09T10:00:00"), 0.37, 0.37, 0.37, 0.37, 10]];
  const { bars, repaired } = repairDaily(daily, hourly);
  assert.equal(repaired, 0);
  assert.deepEqual(bars, daily);
});

test("a normal bar is never touched, and the repaired range always contains the close", () => {
  const daily: DailyBar[] = [["2026-11-10", 1, 3, 1, 2, 7], ["2026-11-11", 9, 9, 9, 9, 7]];
  const hourly: IntraBar[] = [[at("2026-11-11T10:00:00"), 5, 6, 4, 5, 1]];
  const { bars } = repairDaily(daily, hourly);
  assert.deepEqual(bars[0], daily[0]);
  assert.deepEqual(bars[1], ["2026-11-11", 5, 9, 4, 9, 7]);
});
