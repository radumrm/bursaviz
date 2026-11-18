// Snapshot scraper: pulls prices, fundamentals and news for every BVB ticker and writes
// static JSON under public/data/. The site only ever reads those files.
//
//   npm run scrape              # whole universe
//   npm run scrape -- TLV H2O   # only these tickers (the home-page index is merged, not replaced)
//   npm run scrape -- --news-only        # rewrite only news (stocks + market-news.json), no Yahoo calls
//   npm run scrape -- --fresh 6          # skip tickers whose stock file is younger than 6 hours

import YahooFinance from "yahoo-finance2";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TICKERS } from "./tickers.ts";
import type { TickerDef } from "./tickers.ts";
import { repairDaily } from "./lib/bars.ts";
import { PUBLICATIONS } from "./lib/publications.ts";
import { dedupeNews, isMarketRelevant, isRelevant, normalizeTitle, parseRss, tagTickers } from "./lib/news.ts";
import { buildCalendar, buildNewsAll } from "./lib/derived.ts";
import { technicals, techRating } from "../src/lib/indicators.ts";
import type {
  BarsFile, DailyBar, FxFile, IndexFile, IndexRow, IntraBar, MarketNewsFile, NewsItem, Period, Snapshot, StockFile,
} from "../src/lib/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data");
const TZ = "Europe/Bucharest";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const LOOSE = { validateResult: false } as const;

// ---------- small helpers ----------

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (x: unknown): string | null => {
  if (!x) return null;
  // Yahoo sometimes hands back epoch seconds instead of a Date.
  const d = x instanceof Date ? x : new Date(typeof x === "number" && x < 1e11 ? x * 1000 : (x as string));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Epoch seconds re-expressed so that reading them as UTC shows Bucharest wall-clock time. */
function localEpoch(d: Date): number {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(d)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000;
}

/** Counts Yahoo 429s seen by one unit of work (a ticker, or the FX fetch). */
interface RateCounter { hits: number }

async function soft<T>(label: string, fn: () => Promise<T>, rl?: RateCounter): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).split("\n")[0].slice(0, 140);
    console.log(`    · ${label}: ${msg}`);
    if (rl && /429|too many requests/i.test(msg)) rl.hits++;
    return null;
  }
}

// ---------- prices ----------

type YQuote = { date: Date; open?: number | null; high?: number | null; low?: number | null; close?: number | null; volume?: number | null };

function toDaily(quotes: YQuote[]): DailyBar[] {
  const byDate = new Map<string, DailyBar>();
  for (const q of quotes) {
    if (q.close == null || q.open == null || q.high == null || q.low == null) continue;
    const day = dateFmt.format(q.date);
    byDate.set(day, [day, r4(q.open), r4(q.high), r4(q.low), r4(q.close), q.volume ?? 0]);
  }
  const bars = [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // Cut history at the most recent impossible jump (unadjusted redenomination / bad ticks),
  // so charts and long-term performance never straddle a broken price scale.
  for (let i = bars.length - 1; i > 0; i--) {
    const ratio = bars[i][4] / bars[i - 1][4];
    if (!(ratio < 6 && ratio > 1 / 6)) return bars.slice(i);
  }
  return bars;
}

function toIntra(quotes: YQuote[]): IntraBar[] {
  const out: IntraBar[] = [];
  let prev = -1;
  for (const q of quotes) {
    if (q.close == null || q.open == null || q.high == null || q.low == null) continue;
    const t = localEpoch(q.date);
    if (t <= prev) continue;
    prev = t;
    out.push([t, r4(q.open), r4(q.high), r4(q.low), r4(q.close), q.volume ?? 0]);
  }
  return out;
}

// ---------- fundamentals ----------

function toPeriods(rows: unknown): Period[] {
  if (!Array.isArray(rows)) return [];
  const out: Period[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const d = iso(row.date);
    if (!d) continue;
    const v: Record<string, number> = {};
    for (const [k, val] of Object.entries(row)) {
      if (typeof val !== "number" || !Number.isFinite(val)) continue;
      // The "trailing" series comes back as trailingTotalRevenue etc. — normalise to the annual key names.
      const m = /^trailing([A-Z].*)$/.exec(k);
      const key = m ? (/^(EBIT|EBITDA)/.test(m[1]) ? m[1] : m[1][0].toLowerCase() + m[1].slice(1)) : k;
      v[key] = val;
    }
    if (v.totalRevenue == null && v.totalAssets == null && v.netIncome == null && v.operatingCashFlow == null) continue;
    out.push({ date: d.slice(0, 10), v });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function cagr(ps: Period[], key: string, years: number): number | null {
  if (ps.length < years + 1) return null;
  const a = ps[ps.length - 1].v[key];
  const b = ps[ps.length - 1 - years].v[key];
  return a > 0 && b > 0 ? Math.pow(a / b, 1 / years) - 1 : null;
}

function growth(ps: Period[], key: string): number | null {
  if (ps.length < 2) return null;
  const a = ps[ps.length - 1].v[key];
  const b = ps[ps.length - 2].v[key];
  return a != null && b != null && b !== 0 ? (a - b) / Math.abs(b) : null;
}

// ---------- news ----------

const NEWS_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; rss-reader)" };

async function fetchRss(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ro&gl=RO&ceid=RO:ro`;
  // Google (not Yahoo) rate-limits bursts; back off a couple of times before giving up.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: NEWS_HEADERS });
    if (res.ok) return parseRss(await res.text());
    if (res.status === 429 && attempt < 3) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`Google News RSS ${res.status}`);
  }
}

/** Several RSS queries, sequential and 150 ms apart; a failing query is skipped, not fatal (unless all fail). */
async function fetchRssMany(queries: string[]): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  let failed = 0;
  let lastErr: unknown = null;
  for (let i = 0; i < queries.length; i++) {
    if (i) await sleep(150);
    try {
      all.push(...(await fetchRss(queries[i])));
    } catch (e) {
      failed++;
      lastErr = e;
    }
  }
  if (failed === queries.length) throw lastErr;
  return all;
}

// Direct publication feeds: fetched once per run into a pool that both the market news and every ticker's
// news draw from. They only carry the latest 10-30 headlines each: freshness, not history.
let pubPool: NewsItem[] = [];
const pubLinks = new Set<string>();
const usedMarket = new Map<string, number>();
const usedTicker = new Map<string, number>();
const bump = (m: Map<string, number>, items: NewsItem[]) => {
  for (const n of items) if (pubLinks.has(n.link)) m.set(n.source, (m.get(n.source) ?? 0) + 1);
};

async function fetchPublications(): Promise<void> {
  const all: NewsItem[] = [];
  console.log(`Direct feeds (${PUBLICATIONS.length}):`);
  for (let i = 0; i < PUBLICATIONS.length; i++) {
    const pub = PUBLICATIONS[i];
    if (i) await sleep(150);
    try {
      const res = await fetch(pub.url, { headers: NEWS_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseRss(await res.text(), { source: pub.name, fallbackDate: new Date().toISOString() });
      console.log(`  ${items.length ? "✓" : "·"} ${pub.name.padEnd(22)} ${String(items.length).padStart(3)} items  ${pub.url}`);
      all.push(...items);
    } catch (e) {
      console.log(`  ✗ ${pub.name.padEnd(22)} skipped (${String((e as Error)?.message ?? e).slice(0, 80)})  ${pub.url}`);
    }
  }
  pubPool = dedupeNews(all);
  pubLinks.clear();
  for (const n of pubPool) pubLinks.add(n.link);
  console.log(`  pool: ${pubPool.length} unique headlines`);
}

async function fetchNews(def: TickerDef): Promise<NewsItem[]> {
  const merged = await fetchRssMany([
    `${def.q} when:1y`,
    `"${def.aliases[0]}" (acțiuni OR bursa OR BVB OR dividend OR profit) when:1y`,
  ]);
  const deduped = dedupeNews(merged);
  const relevant = deduped.filter((n) => isRelevant(n.title, def.aliases));
  const google = relevant.length < 5 ? deduped : relevant;
  // Direct items first so they win ties against the same headline from Google.
  const direct = pubPool.filter((n) => isRelevant(n.title, def.aliases));
  const out = dedupeNews([...direct, ...google]).slice(0, 60);
  bump(usedTicker, out);
  return out;
}

async function fetchMarketNews(): Promise<NewsItem[]> {
  const merged = await fetchRssMany([`"Bursa de Valori București" when:14d`, `BVB acțiuni when:14d`, `"indicele BET" when:14d`]).catch((e) => {
    if (!pubPool.length) throw e;
    return [] as NewsItem[]; // Google failed but the direct feeds are there
  });
  const tag = (list: NewsItem[]) =>
    list
      .map((n) => ({ ...n, tickers: tagTickers(n.title, TICKERS) }))
      .filter((n) => isMarketRelevant(n.title, n.tickers));
  const direct = dedupeNews(tag(pubPool));
  const seen = new Set(direct.map((n) => normalizeTitle(n.title)));
  const google = dedupeNews(tag(merged)).filter((n) => !seen.has(normalizeTitle(n.title)));
  // Direct-publication items are the on-topic ones: they take the cap first, Google fills the rest; shown newest first.
  const out = dedupeNews([...direct.slice(0, 40), ...google.slice(0, Math.max(0, 40 - direct.length))]);
  bump(usedMarket, out);
  return out;
}

// ---------- FX ----------

async function fetchFx(rl: RateCounter): Promise<FxFile | null> {
  const get = async (sym: string) => {
    const res = await soft(sym, () => yf.chart(sym, { period1: "2006-01-01", interval: "1d" }, LOOSE), rl);
    const m = new Map<string, number>();
    for (const q of ((res as any)?.quotes ?? []) as YQuote[]) if (q.close != null && q.close > 0) m.set(dateFmt.format(q.date), r4(q.close));
    return m;
  };
  const eur = await get("EURRON=X");
  const usd = await get("USDRON=X");
  const days = [...new Set([...eur.keys(), ...usd.keys()])].sort();
  const daily: [string, number, number][] = [];
  let e: number | null = null;
  let u: number | null = null;
  for (const day of days) {
    e = eur.get(day) ?? e;
    u = usd.get(day) ?? u;
    if (e != null && u != null) daily.push([day, e, u]);
  }
  if (!daily.length) return null;
  const last = daily[daily.length - 1];
  return { updatedAt: new Date().toISOString(), latest: { EUR: last[1], USD: last[2] }, daily };
}

// ---------- dividends ----------

function toDividends(events: unknown): [string, number][] {
  const out = new Map<string, number>();
  const list = Array.isArray(events) ? events : [];
  for (const ev of list as { amount?: number; date?: Date | number }[]) {
    const amount = num(ev?.amount);
    const d = ev?.date != null ? new Date(typeof ev.date === "number" && ev.date < 1e11 ? ev.date * 1000 : ev.date) : null;
    if (amount == null || amount <= 0 || !d || Number.isNaN(d.getTime())) continue;
    const day = dateFmt.format(d);
    out.set(day, r4((out.get(day) ?? 0) + amount));
  }
  return [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** CAGR of dividends summed per calendar year: last completed year vs `years` earlier. Null unless both sums > 0. */
function divCagr(divs: [string, number][], years: number): number | null {
  const sums = new Map<number, number>();
  for (const [day, amt] of divs) sums.set(Number(day.slice(0, 4)), (sums.get(Number(day.slice(0, 4))) ?? 0) + amt);
  const last = new Date().getFullYear() - 1;
  const a = sums.get(last) ?? 0;
  const b = sums.get(last - years) ?? 0;
  return a > 0 && b > 0 ? Math.pow(a / b, 1 / years) - 1 : null;
}

// ---------- home-page index row ----------

/** Build one home-page row from a stock file's snapshot and its daily bars. */
function toIndexRow(stock: StockFile, d: DailyBar[]): IndexRow {
  const sn = stock.snapshot;
  const n = (k: string) => num(sn[k]);
  return {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    industry: stock.industry,
    index: stock.index,
    price: n("price"),
    changePct: n("changePct"),
    marketCap: n("marketCap"),
    pe: n("pe"),
    volume: n("volume"),
    relVol: n("relVol"),
    perfW: n("perfW"),
    perfM: n("perfM"),
    perfYTD: n("perfYTD"),
    perfY: n("perfY"),
    rsi: n("rsi"),
    divYield: n("divTTMYield") ?? n("divEstYield"),
    recom: n("recom"),
    target: n("target"),
    techScore: n("techScore"),
    sma200: n("sma200"),
    high52Pct: n("high52Pct"),
    low52Pct: n("low52Pct"),
    spark: d.slice(-30).map((b) => b[4]),
  };
}

// ---------- one ticker ----------

interface TickerResult {
  row: IndexRow | null;
  rateLimited: boolean;
  meta?: MetaTicker;
}

async function scrapeTicker(def: TickerDef): Promise<TickerResult> {
  const sym = `${def.t}.RO`;
  const hourlyFrom = new Date(Date.now() - 729 * 864e5);
  const quarterHourFrom = new Date(Date.now() - 59 * 864e5);
  const rl: RateCounter = { hits: 0 };

  const previousNews: NewsItem[] =
    (await readJson<StockFile>(path.join(OUT, "stocks", `${def.t}.json`)))?.news ?? [];

  const [daily, hourly, quarterHour, qs, annualRaw, quarterlyRaw, trailingRaw, news] = await Promise.all([
    soft("daily", () => yf.chart(sym, { period1: "2006-01-01", interval: "1d" }, LOOSE), rl),
    soft("hourly", () => yf.chart(sym, { period1: hourlyFrom, interval: "1h" }, LOOSE), rl),
    soft("15m", () => yf.chart(sym, { period1: quarterHourFrom, interval: "15m" }, LOOSE), rl),
    soft("summary", () =>
      yf.quoteSummary(
        sym,
        { modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "calendarEvents", "earnings"] },
        LOOSE,
      ),
      rl,
    ),
    soft("annual", () => yf.fundamentalsTimeSeries(sym, { period1: "2012-01-01", type: "annual", module: "all" }, LOOSE), rl),
    soft("quarterly", () => yf.fundamentalsTimeSeries(sym, { period1: "2022-01-01", type: "quarterly", module: "all" }, LOOSE), rl),
    soft("trailing", () => yf.fundamentalsTimeSeries(sym, { period1: "2022-01-01", type: "trailing", module: "all" }, LOOSE), rl),
    soft("news", () => fetchNews(def)),
  ]);

  const rateLimited = rl.hits > 0;
  let d = toDaily(((daily as any)?.quotes ?? []) as YQuote[]);
  if (d.length < 2) return { row: null, rateLimited }; // Yahoo does not carry this ticker
  const h = toIntra(((hourly as any)?.quotes ?? []) as YQuote[]);
  d = repairDaily(d, h).bars;
  const m = toIntra(((quarterHour as any)?.quotes ?? []) as YQuote[]);
  const dividends = toDividends((daily as any)?.events?.dividends);

  const q: any = qs ?? {};
  const price_ = q.price ?? {};
  const sd = q.summaryDetail ?? {};
  const ks = q.defaultKeyStatistics ?? {};
  const fd = q.financialData ?? {};
  const ap = q.assetProfile ?? {};
  const meta: any = (daily as any)?.meta ?? {};

  let annual = toPeriods(annualRaw);
  let quarterly = toPeriods(quarterlyRaw);
  // Some issuers (e.g. H2O) have no statement time series on Yahoo — fall back to the
  // revenue / earnings summary so the charts still have something real to show.
  const fc = q.earnings?.financialsChart;
  if (!annual.length && Array.isArray(fc?.yearly)) {
    annual = fc.yearly
      .filter((y: any) => num(y.date) && num(y.revenue) != null)
      .map((y: any) => ({ date: `${y.date}-12-31`, v: { totalRevenue: y.revenue, netIncome: y.earnings } }));
  }
  if (!quarterly.length && Array.isArray(fc?.quarterly)) {
    const ends = ["03-31", "06-30", "09-30", "12-31"];
    quarterly = fc.quarterly
      .map((x: any) => ({ m: /^(\d)Q(\d{4})$/.exec(String(x.fiscalQuarter ?? x.date)), x }))
      .filter((o: any) => o.m && num(o.x.revenue) != null)
      .map((o: any) => ({ date: `${o.m[2]}-${ends[Number(o.m[1]) - 1]}`, v: { totalRevenue: o.x.revenue, netIncome: o.x.earnings } }));
  }
  const trailing = toPeriods(trailingRaw);
  const ttm = trailing.length ? trailing[trailing.length - 1] : null;
  const lastA = annual.length ? annual[annual.length - 1].v : {};
  const lastBS = (quarterly.length ? quarterly[quarterly.length - 1].v : null) ?? lastA;

  const tech = technicals(d);
  const rating = techRating(d);
  const lastBar = d[d.length - 1];
  const price = num(price_.regularMarketPrice) ?? num(meta.regularMarketPrice) ?? lastBar[4];
  const prevClose = num(price_.regularMarketPreviousClose) ?? num(sd.previousClose) ?? d[d.length - 2][4];
  const marketCap = num(price_.marketCap) ?? num(sd.marketCap);
  const eps = num(ks.trailingEps);
  const fEps = num(ks.forwardEps);
  const cashSh = num(fd.totalCashPerShare);
  const fcf = num(fd.freeCashflow);
  const high52 = num(sd.fiftyTwoWeekHigh) ?? tech.high52;
  const low52 = num(sd.fiftyTwoWeekLow) ?? tech.low52;
  const debtEq = num(fd.debtToEquity);
  const equity = num(lastBS.stockholdersEquity) ?? num(lastA.stockholdersEquity);
  const ltDebt =
    num(lastBS.longTermDebt) ?? num(lastBS.longTermDebtAndCapitalLeaseObligation) ??
    num(lastA.longTermDebt) ?? num(lastA.longTermDebtAndCapitalLeaseObligation);
  const ebit = num(lastA.EBIT);
  const taxRate = num(lastA.taxRateForCalcs);
  const invested = num(lastA.investedCapital);
  const epsKey = annual.some((p) => p.v.dilutedEPS != null) ? "dilutedEPS" : "basicEPS";
  const earningsDate = q.calendarEvents?.earnings?.earningsDate?.[0];

  const snapshot: Snapshot = {
    // column 1
    marketCap,
    enterpriseValue: num(ks.enterpriseValue),
    income: num(ks.netIncomeToCommon) ?? num(ttm?.v.netIncome) ?? num(lastA.netIncome),
    sales: num(fd.totalRevenue) ?? num(ttm?.v.totalRevenue) ?? num(lastA.totalRevenue),
    bookSh: num(ks.bookValue),
    cashSh,
    divEst: num(sd.dividendRate),
    divEstYield: num(sd.dividendYield),
    divTTM: num(sd.trailingAnnualDividendRate),
    divTTMYield: num(sd.trailingAnnualDividendYield),
    divExDate: iso(sd.exDividendDate),
    divGr3: divCagr(dividends, 3),
    divGr5: divCagr(dividends, 5),
    payout: num(sd.payoutRatio),
    employees: num(ap.fullTimeEmployees),
    ipo: iso(meta.firstTradeDate) ?? d[0][0],
    // column 2
    pe: num(sd.trailingPE),
    fpe: num(sd.forwardPE) ?? num(ks.forwardPE),
    peg: num(ks.pegRatio) ?? num(ks.trailingPegRatio),
    ps: num(sd.priceToSalesTrailing12Months),
    pb: num(ks.priceToBook),
    pc: cashSh && cashSh > 0 ? price / cashSh : null,
    pfcf: marketCap && fcf && fcf > 0 ? marketCap / fcf : null,
    evEbitda: num(ks.enterpriseToEbitda),
    evSales: num(ks.enterpriseToRevenue),
    quick: num(fd.quickRatio),
    current: num(fd.currentRatio),
    debtEq: debtEq != null ? debtEq / 100 : null,
    ltDebtEq: ltDebt != null && equity ? ltDebt / equity : null,
    // column 3
    eps,
    epsNextY: fEps,
    epsNextYPct: eps && fEps != null && eps > 0 ? fEps / eps - 1 : null,
    epsPast3: cagr(annual, epsKey, 3),
    epsPast5: cagr(annual, epsKey, 5),
    salesPast3: cagr(annual, "totalRevenue", 3),
    salesPast5: cagr(annual, "totalRevenue", 5),
    epsYoY: growth(annual, epsKey),
    salesYoY: growth(annual, "totalRevenue"),
    epsQoQ: num(ks.earningsQuarterlyGrowth) ?? num(fd.earningsGrowth),
    salesQoQ: num(fd.revenueGrowth),
    earningsDate: iso(earningsDate),
    // column 4
    insiderOwn: num(ks.heldPercentInsiders),
    instOwn: num(ks.heldPercentInstitutions),
    roa: num(fd.returnOnAssets),
    roe: num(fd.returnOnEquity),
    roic: ebit != null && invested && invested > 0 ? (ebit * (1 - (taxRate ?? 0.16))) / invested : null,
    grossM: num(fd.grossMargins) ? num(fd.grossMargins) : null, // 0 means "not reported" (banks)
    operM: num(fd.operatingMargins),
    profitM: num(fd.profitMargins),
    sma20: tech.sma20,
    sma50: tech.sma50,
    sma200: tech.sma200,
    // column 5
    shsOut: num(ks.sharesOutstanding),
    shsFloat: num(ks.floatShares),
    high52,
    high52Pct: high52 ? price / high52 - 1 : null,
    low52,
    low52Pct: low52 ? price / low52 - 1 : null,
    volW: tech.volW,
    volM: tech.volM,
    atr: tech.atr,
    rsi: tech.rsi,
    beta: num(sd.beta) ?? num(ks.beta),
    relVol: tech.relVol,
    avgVol: tech.avgVol,
    volume: num(price_.regularMarketVolume) ?? lastBar[5],
    // column 6
    perfW: tech.perfW,
    perfM: tech.perfM,
    perfQ: tech.perfQ,
    perfH: tech.perfH,
    perfYTD: tech.perfYTD,
    perfY: tech.perfY,
    perf3Y: tech.perf3Y,
    perf5Y: tech.perf5Y,
    perf10Y: tech.perf10Y,
    recom: num(fd.recommendationMean),
    target: num(fd.targetMeanPrice),
    techScore: rating ? r4(rating.score) : null,
    prevClose,
    price,
    change: prevClose ? price - prevClose : null,
    changePct: prevClose ? price / prevClose - 1 : null,
  };

  const name = (price_.longName as string) || (price_.shortName as string) || (meta.longName as string) || def.name;
  const currency = (price_.currency as string) || (meta.currency as string) || "RON";
  const stock: StockFile = {
    ticker: def.t,
    yahoo: sym,
    name,
    sector: (ap.sector as string) || "Other",
    industry: (ap.industry as string) || "",
    index: def.idx ?? null,
    currency,
    statementsCurrency: (fd.financialCurrency as string) || currency,
    dividends,
    updatedAt: new Date().toISOString(),
    quoteTime: iso(price_.regularMarketTime) ?? iso(meta.regularMarketTime),
    snapshot,
    ...(rating ? { techVotes: rating.votes } : {}),
    profile: {
      description: (ap.longBusinessSummary as string) || "",
      website: (ap.website as string) || null,
      city: (ap.city as string) || null,
      officers: ((ap.companyOfficers as any[]) ?? [])
        .filter((o) => o?.name && o?.title)
        .slice(0, 6)
        .map((o) => ({ name: String(o.name).replace(/\s+/g, " "), title: String(o.title) })),
    },
    statements: { annual, quarterly, ttm },
    // A failed or empty news fetch (Google rate limit) must not wipe the headlines already on disk.
    news: news?.length ? news : previousNews,
  };

  const bars: BarsFile = { d, h, m };
  await writeFile(path.join(OUT, "stocks", `${def.t}.json`), JSON.stringify(stock));
  await writeFile(path.join(OUT, "bars", `${def.t}.json`), JSON.stringify(bars));

  console.log(
    `  ✓ ${def.t.padEnd(8)} ${String(price).padStart(9)}  daily ${String(d.length).padStart(4)}  1h ${String(h.length).padStart(4)}  15m ${String(m.length).padStart(4)}  ` +
      `FY ${annual.length}  Q ${quarterly.length}  div ${dividends.length}  news ${stock.news.length}`,
  );

  const row = toIndexRow(stock, d);
  return {
    row,
    rateLimited,
    meta: {
      daily: d.length, h: h.length, m: m.length, annual: annual.length, quarterly: quarterly.length,
      news: stock.news.length, statementsCurrency: stock.statementsCurrency ?? currency,
    },
  };
}

// ---------- main ----------

interface MetaTicker {
  daily: number; h: number; m: number; annual: number; quarterly: number; news: number; statementsCurrency: string;
}
interface MetaFile {
  updatedAt: string;
  tickers: Record<string, MetaTicker>;
  skipped: string[];
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]) {
  const tickers: string[] = [];
  let newsOnly = false;
  let reindex = false;
  let freshHours: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--news-only") newsOnly = true;
    else if (a === "--reindex") reindex = true;
    else if (a === "--fresh" || a.startsWith("--fresh=")) {
      const v = a.includes("=") ? a.split("=")[1] : argv[++i];
      freshHours = Number(v);
      if (v === undefined || !Number.isFinite(freshHours) || freshHours < 0) {
        console.error(`--fresh needs a number of hours, got "${v}"`);
        process.exit(1);
      }
    } else if (a.startsWith("--")) {
      console.error(`Unknown flag ${a}`);
      process.exit(1);
    } else tickers.push(a.toUpperCase());
  }
  return { tickers, newsOnly, reindex, freshHours };
}

async function writeMarketNews() {
  const items = await soft("market news", fetchMarketNews);
  if (!items) return;
  const file: MarketNewsFile = { updatedAt: new Date().toISOString(), items };
  await writeFile(path.join(OUT, "market-news.json"), JSON.stringify(file));
  const direct = items.filter((n) => pubLinks.has(n.link)).length;
  console.log(`Market news: ${items.length} items, ${direct} from direct feeds`);
}

/**
 * Offline: rebuild calendar.json and news-all.json from the stock files and market-news.json on disk.
 * `updatedAt` is the age of the data they were built from (index.json / market-news.json), not of this run.
 */
async function writeDerived() {
  const dir = path.join(OUT, "stocks");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const stocks: StockFile[] = [];
  for (const f of files) {
    const stock = await readJson<StockFile>(path.join(dir, f));
    if (stock?.ticker && stock.snapshot) stocks.push(stock);
  }
  if (!stocks.length) {
    console.log("Derived files: no stock files on disk, nothing written");
    return;
  }
  const now = new Date();
  const today = dateFmt.format(now);
  const indexStamp = (await readJson<IndexFile>(path.join(OUT, "index.json")))?.updatedAt ?? now.toISOString();
  const market = await readJson<MarketNewsFile>(path.join(OUT, "market-news.json"));

  const calendar = { ...buildCalendar(stocks, now), updatedAt: indexStamp };
  await writeFile(path.join(OUT, "calendar.json"), JSON.stringify(calendar));
  const div = calendar.events.filter((e) => e.type === "dividend");
  const earn = calendar.events.filter((e) => e.type === "earnings");
  const future = (list: typeof div) => list.filter((e) => e.date >= today).length;
  console.log(
    `calendar.json: ${calendar.events.length} events — ${div.length} dividends (${future(div)} upcoming, ` +
      `${div.filter((e) => e.amount == null).length} without amount), ${earn.length} earnings (${future(earn)} upcoming), ` +
      `${new Set(calendar.events.map((e) => e.ticker)).size} tickers`,
  );

  const newsAll = { ...buildNewsAll(stocks, market?.items ?? [], TICKERS, now), updatedAt: market?.updatedAt ?? indexStamp };
  await writeFile(path.join(OUT, "news-all.json"), JSON.stringify(newsAll));
  const tagged = newsAll.items.filter((n) => n.tickers?.length).length;
  console.log(
    `news-all.json: ${newsAll.items.length} items (${tagged} tagged with a ticker)` +
      (newsAll.items.length ? `, ${newsAll.items[newsAll.items.length - 1].date.slice(0, 10)} … ${newsAll.items[0].date.slice(0, 10)}` : ""),
  );
}

/** Offline: recompute derived fields from the stocks/ and bars/ files on disk and rebuild index.json. No network. */
async function reindex() {
  const dir = path.join(OUT, "stocks");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const rows: IndexRow[] = [];
  let rated = 0;
  for (const f of files) {
    const stock = await readJson<StockFile>(path.join(dir, f));
    const bars = await readJson<BarsFile>(path.join(OUT, "bars", f));
    if (!stock || !bars?.d?.length) {
      console.log(`  - ${f}: stock or bars missing, skipped`);
      continue;
    }
    const rating = techRating(bars.d);
    stock.snapshot.techScore = rating ? r4(rating.score) : null;
    if (rating) {
      stock.techVotes = rating.votes;
      rated++;
    } else delete stock.techVotes;
    await writeFile(path.join(dir, f), JSON.stringify(stock));
    rows.push(toIndexRow(stock, bars.d));
  }
  const old = await readJson<IndexFile>(path.join(OUT, "index.json"));
  const out: IndexFile = {
    updatedAt: old?.updatedAt ?? new Date().toISOString(),
    rows: rows.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
  };
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(out));
  console.log(`Reindexed ${rows.length} stocks (${rated} with a technical rating, ${rows.filter((r) => r.recom != null).length} with analyst coverage). No network calls.`);
  await writeDerived();
}

async function main() {
  const { tickers: want, newsOnly, reindex: doReindex, freshHours } = parseArgs(process.argv.slice(2));
  if (doReindex) return reindex();
  const list = want.length ? TICKERS.filter((t) => want.includes(t.t)) : TICKERS;
  if (!list.length) {
    console.error(`No known tickers in: ${want.join(", ")}`);
    process.exit(1);
  }

  await mkdir(path.join(OUT, "stocks"), { recursive: true });
  await mkdir(path.join(OUT, "bars"), { recursive: true });

  const metaPath = path.join(OUT, "meta.json");
  const oldMeta = await readJson<MetaFile>(metaPath);
  const metaTickers: Record<string, MetaTicker> = { ...(oldMeta?.tickers ?? {}) };

  if (newsOnly) {
    console.log(`Refreshing news for ${list.length} tickers (no Yahoo calls)`);
    await fetchPublications();
    await writeMarketNews();
    for (const def of list) {
      const file = path.join(OUT, "stocks", `${def.t}.json`);
      const stock = await readJson<StockFile>(file);
      if (!stock) continue;
      const news = await soft(`news ${def.t}`, () => fetchNews(def));
      if (!news) continue;
      stock.news = news;
      await writeFile(file, JSON.stringify(stock));
      if (metaTickers[def.t]) metaTickers[def.t].news = news.length;
      console.log(`  ✓ ${def.t.padEnd(8)} news ${news.length}`);
      await sleep(150);
    }
    if (oldMeta) await writeFile(metaPath, JSON.stringify({ ...oldMeta, tickers: metaTickers }));
    const fmt = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
    console.log(`Direct items kept in market news: ${fmt(usedMarket)}`);
    console.log(`Direct items kept across ticker news: ${fmt(usedTicker)}`);
    return;
  }

  const indexPath = path.join(OUT, "index.json");
  const rows = new Map<string, IndexRow>();
  const old = await readJson<IndexFile>(indexPath);
  for (const r of old?.rows ?? []) rows.set(r.ticker, r);

  console.log(`Scraping ${list.length} BVB tickers → ${path.relative(ROOT, OUT)}/`);

  // FX once per run, before the tickers.
  const fxRl: RateCounter = { hits: 0 };
  const fx = await fetchFx(fxRl);
  if (fxRl.hits > 0) {
    console.log("\nYahoo is rate-limiting this connection (429 on FX) — stopping. Run again later.");
    process.exit(2);
  }
  if (fx) {
    await writeFile(path.join(OUT, "fx.json"), JSON.stringify(fx));
    console.log(`FX: ${fx.daily.length} days, latest EUR ${fx.latest.EUR}  USD ${fx.latest.USD}`);
  } else {
    console.log("FX: not available (existing fx.json, if any, left untouched)");
  }

  await fetchPublications();
  await writeMarketNews();

  const skipped: string[] = [];
  let rateLimitedTickers = 0;
  let stop = false;
  let next = 0;

  const worker = async () => {
    while (!stop && next < list.length) {
      const def = list[next++];
      if (freshHours != null) {
        const existing = await readJson<StockFile>(path.join(OUT, "stocks", `${def.t}.json`));
        const age = existing?.updatedAt ? Date.now() - new Date(existing.updatedAt).getTime() : Infinity;
        if (age < freshHours * 36e5) {
          console.log(`  · ${def.t.padEnd(8)} fresh, skipped`);
          continue;
        }
      }
      const res = await scrapeTicker(def).catch((e): TickerResult => {
        console.log(`  ✗ ${def.t}: ${String(e?.message ?? e).slice(0, 160)}`);
        return { row: null, rateLimited: false };
      });
      if (res.row) {
        rows.set(res.row.ticker, res.row);
        if (res.meta) metaTickers[def.t] = res.meta;
      } else skipped.push(def.t);
      if (res.rateLimited && ++rateLimitedTickers >= 3) {
        stop = true;
        console.log("\nYahoo is rate-limiting this connection — stopping here. Run `npm run scrape` again later.");
      }
      await sleep(350);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const out: IndexFile = {
    updatedAt: new Date().toISOString(),
    rows: [...rows.values()].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
  };
  await writeFile(indexPath, JSON.stringify(out));
  const meta: MetaFile = { updatedAt: out.updatedAt, tickers: metaTickers, skipped };
  await writeFile(metaPath, JSON.stringify(meta));
  await writeDerived();
  console.log(`\nDone: ${out.rows.length} tickers in index.json` + (skipped.length ? `, skipped: ${skipped.join(", ")}` : ""));
}

main();
