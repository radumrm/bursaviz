import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, buildNewsAll, bucharestDay } from "../scripts/lib/derived.ts";
import type { NewsItem, StockFile } from "../src/lib/types.ts";

const now = new Date("2026-11-18T18:00:00Z");
type S = Pick<StockFile, "ticker" | "name" | "dividends" | "snapshot">;

test("bucharestDay reads ISO timestamps in Bucharest and passes plain days through", () => {
  assert.equal(bucharestDay("2026-11-24T23:30:00.000Z"), "2026-11-25");
  assert.equal(bucharestDay("2026-11-24"), "2026-11-24");
  assert.equal(bucharestDay(null), null);
  assert.equal(bucharestDay("nonsense"), null);
});

test("buildCalendar: 3 years of dividends with yields, a future ex-date, earnings; oldest first", () => {
  const stocks: S[] = [
    {
      ticker: "TLV", name: "Banca Transilvania",
      dividends: [["2022-06-01", 1], ["2024-06-11", 0.8], ["2026-06-15", 1.2]],
      snapshot: { price: 40, divExDate: "2026-06-15T00:00:00.000Z", earningsDate: "2026-11-20T06:00:00.000Z" },
    },
    { ticker: "ONE", name: "One United", dividends: [], snapshot: { price: 0, divExDate: "2026-11-25T00:00:00.000Z", earningsDate: null } },
    { ticker: "X", name: "No price", dividends: [["2026-01-10", 0.5]], snapshot: { price: null, earningsDate: "2026-10-29T00:00:00.000Z" } },
  ];
  const { events, updatedAt } = buildCalendar(stocks, now);
  assert.equal(updatedAt, now.toISOString());
  assert.deepEqual(events, [
    { date: "2024-06-11", type: "dividend", ticker: "TLV", name: "Banca Transilvania", amount: 0.8, yield: 0.02 },
    { date: "2026-01-10", type: "dividend", ticker: "X", name: "No price", amount: 0.5 },
    { date: "2026-06-15", type: "dividend", ticker: "TLV", name: "Banca Transilvania", amount: 1.2, yield: 0.03 },
    { date: "2026-10-29", type: "earnings", ticker: "X", name: "No price" },
    { date: "2026-11-20", type: "earnings", ticker: "TLV", name: "Banca Transilvania" },
    { date: "2026-11-25", type: "dividend", ticker: "ONE", name: "One United" },
  ]);
});

test("buildCalendar does not repeat an ex-date that is already in the history, and drops a past announced one", () => {
  const s: S = { ticker: "H2O", name: "Hidroelectrica", dividends: [["2026-12-01", 2]], snapshot: { price: 100, divExDate: "2026-12-01T00:00:00.000Z" } };
  const past: S = { ticker: "P", name: "Past", dividends: [], snapshot: { divExDate: "2026-01-01T00:00:00.000Z" } };
  const { events } = buildCalendar([s, past], now);
  assert.deepEqual(events.map((e) => [e.date, e.ticker, e.amount]), [["2026-12-01", "H2O", 2]]);
});

const item = (title: string, date: string, extra: Partial<NewsItem> = {}): NewsItem => ({ title, link: `https://x/${title}`, source: "S", date, ...extra });
const defs = [{ t: "TLV", aliases: ["Banca Transilvania"] }, { t: "SNP", aliases: ["OMV Petrom", "Petrom"] }, { t: "H2O", aliases: ["Hidroelectrica"] }];

test("buildNewsAll merges stock and market news by normalised title and tags tickers", () => {
  const stocks = [
    { ticker: "TLV", news: [item("Profit record la bancă", "2026-11-10T10:00:00Z"), item("Petrom și BT, în top", "2026-11-12T10:00:00Z")] },
    { ticker: "H2O", news: [item("PROFIT record la bancă!", "2026-11-09T10:00:00Z")] },
  ];
  const market = [item("Petrom și BT în top", "2026-11-12T09:00:00Z", { tickers: ["SNP"] }), item("BET urcă", "2026-11-13T10:00:00Z", { tickers: [] })];
  const { items } = buildNewsAll(stocks, market, defs, now);
  assert.deepEqual(items.map((n) => [n.title, n.date.slice(0, 10), n.tickers]), [
    ["BET urcă", "2026-11-13", []],
    ["Petrom și BT în top", "2026-11-12", ["TLV", "SNP"]],
    ["PROFIT record la bancă!", "2026-11-09", ["TLV", "H2O"]],
  ]);
});

test("buildNewsAll caps the list, newest first", () => {
  const news = Array.from({ length: 10 }, (_, i) => item(`Știre ${i}`, `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z`));
  const { items } = buildNewsAll([{ ticker: "TLV", news }], [], defs, now, 3);
  assert.deepEqual(items.map((n) => n.title), ["Știre 9", "Știre 8", "Știre 7"]);
});
