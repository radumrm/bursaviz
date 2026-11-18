import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, firstOversell, parseImport, serialize, validateDelete, validateTx } from "../src/lib/portfolio.ts";
import type { MarketInfo, Tx } from "../src/lib/portfolio.ts";

const tx = (id: string, type: "buy" | "sell", date: string, qty: number, price: number, fee = 0, ticker = "TLV"): Tx => ({ id, type, ticker, date, qty, price, fee });
const near = (a: number | null, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const mkt = (price: number | null, changePct: number | null = 0.1, divYield: number | null = 0.05): ((t: string) => MarketInfo | undefined) => (t) =>
  t === "TLV" ? { name: "Banca Transilvania", sector: "Financiar", price, changePct, divYield } : undefined;
const known = new Set(["TLV", "SNP"]);

test("buy-buy-sell with average cost", () => {
  const txs = [tx("1", "buy", "2025-01-10", 100, 20), tx("2", "buy", "2025-02-10", 100, 30), tx("3", "sell", "2025-03-10", 50, 40)];
  const c = compute(txs, mkt(35));
  const h = c.holdings[0];
  near(h.qty, 150);
  near(h.avgCost, 25); // (2000 + 3000) / 200
  near(h.cost, 3750);
  near(h.value, 5250);
  near(h.pl, 1500);
  near(h.plPct, 0.4);
  near(c.realised, 50 * 40 - 50 * 25); // 750
  near(h.weight, 1);
  near(h.dividend, 262.5);
  near(c.totals.value, 5250);
});

test("day change from changePct", () => {
  const c = compute([tx("1", "buy", "2025-01-10", 100, 10)], mkt(11, 0.1));
  near(c.holdings[0].dayChange, 100); // 1100 - 1000
  near(c.holdings[0].dayChangePct, 0.1);
});

test("fees raise cost and lower proceeds", () => {
  const c = compute([tx("1", "buy", "2025-01-10", 10, 10, 5), tx("2", "sell", "2025-01-11", 10, 12, 3)], mkt(12));
  assert.equal(c.holdings.length, 0);
  near(c.realised, 10 * 12 - 3 - 105); // 12
});

test("selling everything closes the position", () => {
  const c = compute([tx("1", "buy", "2025-01-10", 7, 3.3), tx("2", "sell", "2025-02-10", 7, 4)], mkt(5));
  assert.equal(c.holdings.length, 0);
  near(c.realised, 7 * 4 - 7 * 3.3);
  near(c.totals.value, 0);
});

test("oversell rejected, also by date", () => {
  const txs = [tx("1", "buy", "2025-02-01", 10, 10)];
  const ok = { type: "sell", ticker: "TLV", date: "2025-03-01", qty: 10, price: 11, fee: 0 };
  assert.deepEqual(validateTx(ok, txs, known, "2026-01-01"), []);
  assert.equal(validateTx({ ...ok, qty: 11 }, txs, known, "2026-01-01").length, 1);
  assert.equal(validateTx({ ...ok, date: "2025-01-01" }, txs, known, "2026-01-01").length, 1); // before the buy
  assert.ok(firstOversell([...txs, tx("2", "sell", "2025-03-01", 11, 1)]));
});

test("deleting a buy that covers a sell is refused", () => {
  const txs = [tx("1", "buy", "2025-01-01", 10, 10), tx("2", "sell", "2025-02-01", 5, 12)];
  assert.ok(validateDelete("1", txs));
  assert.equal(validateDelete("2", txs), null);
});

test("field validation", () => {
  const base = { type: "buy", ticker: "TLV", date: "2025-01-01", qty: 1, price: 1, fee: 0 };
  const t = "2026-01-01";
  assert.deepEqual(validateTx(base, [], known, t), []);
  assert.equal(validateTx({ ...base, ticker: "XXX" }, [], known, t).length, 1);
  assert.equal(validateTx({ ...base, qty: 0 }, [], known, t).length, 1);
  assert.equal(validateTx({ ...base, price: -1 }, [], known, t).length, 1);
  assert.equal(validateTx({ ...base, fee: -1 }, [], known, t).length, 1);
  assert.equal(validateTx({ ...base, qty: NaN }, [], known, t).length, 1);
  assert.match(validateTx({ ...base, date: "2027-01-01" }, [], known, t)[0], /viitor/);
  assert.equal(validateTx({ ...base, date: "2025-02-30" }, [], known, t).length, 1);
});

test("export / import round trip", () => {
  const txs = [tx("1", "buy", "2025-01-10", 100, 20, 2), tx("2", "sell", "2025-03-10", 50, 40)];
  const r = parseImport(serialize(txs), known, "2026-01-01");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.transactions.length, 2);
    near(compute(r.transactions, mkt(30)).realised, compute(txs, mkt(30)).realised);
  }
});

test("malformed imports rejected", () => {
  const bad = (s: string) => assert.equal(parseImport(s, known, "2026-01-01").ok, false, s);
  bad("not json");
  bad("[]");
  bad(JSON.stringify({ version: 99, transactions: [] }));
  bad(JSON.stringify({ version: 1 }));
  bad(JSON.stringify({ version: 1, transactions: [{ type: "buy", ticker: "TLV", date: "2025-01-01", qty: "x", price: 1 }] }));
  bad(JSON.stringify({ version: 1, transactions: [{ type: "buy", ticker: "ZZZ", date: "2025-01-01", qty: 1, price: 1 }] }));
  bad(JSON.stringify({ version: 1, transactions: [{ type: "sell", ticker: "TLV", date: "2025-01-01", qty: 1, price: 1 }] }));
});
