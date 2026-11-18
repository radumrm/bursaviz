import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPrevious, runExit } from "../scripts/lib/health.ts";

test("keepPrevious never lets an empty answer replace data on disk", () => {
  const kept: string[] = [];
  assert.deepEqual(keepPrevious([], [1, 2], "1h", kept), [1, 2]);
  assert.deepEqual(keepPrevious([3], [1, 2], "15m", kept), [3]);
  assert.deepEqual(keepPrevious([], [], "annual", kept), []);
  assert.deepEqual(keepPrevious([], undefined, "quarterly", kept), []);
  assert.deepEqual(kept, ["1h"]);
});

test("runExit: 429 first, then FX, then the 80% rule", () => {
  const ok = { rateLimited: false, fxOk: true, attempted: 66, refreshed: 66 };
  assert.equal(runExit(ok).code, 0);
  assert.equal(runExit({ ...ok, rateLimited: true, fxOk: false, refreshed: 0 }).code, 2);
  assert.equal(runExit({ ...ok, fxOk: false }).code, 3);
  assert.equal(runExit({ ...ok, refreshed: 52 }).code, 4); // 52 / 66 = 78.8%
  assert.equal(runExit({ ...ok, refreshed: 53 }).code, 0); // 80.3%
  assert.equal(runExit({ ...ok, attempted: 0, refreshed: 0 }).code, 0); // everything was fresh
});
