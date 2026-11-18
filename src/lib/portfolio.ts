// Portfolio: transactions kept in this browser + the pure maths on top of them.
// Executed by Node in tests: erasable TypeScript only, no React here (the hook is in usePortfolio.ts).

export const PORTFOLIO_KEY = "bv.portfolio";
export const PORTFOLIO_VERSION = 1;

export interface Tx {
  id: string;
  type: "buy" | "sell";
  ticker: string;
  /** YYYY-MM-DD */
  date: string;
  qty: number;
  /** RON per share */
  price: number;
  /** RON, optional (0 when absent) */
  fee: number;
}

export interface PortfolioFile {
  version: number;
  transactions: Tx[];
}

export interface MarketInfo {
  name: string;
  sector: string;
  price: number | null;
  changePct: number | null;
  divYield: number | null;
}

export interface Holding {
  ticker: string;
  name: string;
  sector: string;
  qty: number;
  /** Average cost per share (fees included), RON */
  avgCost: number;
  /** Total cost of the open position, RON */
  cost: number;
  price: number | null;
  value: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  pl: number | null;
  plPct: number | null;
  /** Share of the total market value (0..1) */
  weight: number | null;
  /** Estimated yearly dividend = value x yield */
  dividend: number | null;
}

export interface Totals {
  cost: number;
  value: number;
  dayChange: number;
  pl: number;
  plPct: number | null;
  dayChangePct: number | null;
  dividend: number;
  /** true when some open holding has no current price (totals then leave it out) */
  missingPrice: boolean;
}

export interface Computed {
  holdings: Holding[];
  totals: Totals;
  /** Realised P/L from sells, RON, per ticker and total */
  realised: number;
  realisedByTicker: Record<string, number>;
}

const EPS = 1e-9;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function sortTx(txs: Tx[]): Tx[] {
  // Stable: same-day transactions keep their entry order; buys before sells on the same day.
  return txs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.t.type === b.t.type ? a.i - b.i : a.t.type === "buy" ? -1 : 1))
    .map((x) => x.t);
}

interface Pos {
  qty: number;
  cost: number;
}

/** Run the average-cost method over the transactions. */
export function positions(txs: Tx[]): { open: Map<string, Pos>; realisedByTicker: Record<string, number> } {
  const open = new Map<string, Pos>();
  const realisedByTicker: Record<string, number> = {};
  for (const t of sortTx(txs)) {
    const p = open.get(t.ticker) ?? { qty: 0, cost: 0 };
    if (t.type === "buy") {
      p.qty += t.qty;
      p.cost += t.qty * t.price + t.fee;
    } else {
      const sold = Math.min(t.qty, p.qty);
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      realisedByTicker[t.ticker] = (realisedByTicker[t.ticker] ?? 0) + sold * t.price - t.fee - avg * sold;
      p.cost -= avg * sold;
      p.qty -= sold;
      if (p.qty < EPS) {
        p.qty = 0;
        p.cost = 0;
      }
    }
    open.set(t.ticker, p);
  }
  for (const [k, p] of open) if (p.qty <= 0) open.delete(k);
  return { open, realisedByTicker };
}

/** Id of the first sell that would take a position below zero, or null. */
export function firstOversell(txs: Tx[]): Tx | null {
  const qty = new Map<string, number>();
  for (const t of sortTx(txs)) {
    const q = (qty.get(t.ticker) ?? 0) + (t.type === "buy" ? t.qty : -t.qty);
    if (q < -EPS) return t;
    qty.set(t.ticker, q);
  }
  return null;
}

export function compute(txs: Tx[], market: (ticker: string) => MarketInfo | undefined): Computed {
  const { open, realisedByTicker } = positions(txs);
  const holdings: Holding[] = [];
  for (const [ticker, p] of open) {
    const m = market(ticker);
    const price = m && isNum(m.price) ? m.price : null;
    const value = price == null ? null : p.qty * price;
    const chg = m && isNum(m.changePct) ? m.changePct : null;
    const dayChange = value != null && chg != null && chg > -1 ? value - value / (1 + chg) : null;
    holdings.push({
      ticker,
      name: m?.name ?? ticker,
      sector: m?.sector || "Necunoscut",
      qty: p.qty,
      avgCost: p.cost / p.qty,
      cost: p.cost,
      price,
      value,
      dayChange,
      dayChangePct: dayChange != null && value != null && value - dayChange > 0 ? dayChange / (value - dayChange) : null,
      pl: value == null ? null : value - p.cost,
      plPct: value == null || p.cost <= 0 ? null : value / p.cost - 1,
      weight: null,
      dividend: value != null && m && isNum(m.divYield) ? value * m.divYield : null,
    });
  }
  const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  for (const h of holdings) h.weight = h.value != null && totalValue > 0 ? h.value / totalValue : null;
  holdings.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  const priced = holdings.filter((h) => h.value != null);
  const cost = priced.reduce((s, h) => s + h.cost, 0);
  const dayChange = priced.reduce((s, h) => s + (h.dayChange ?? 0), 0);
  const pl = totalValue - cost;
  const prev = totalValue - dayChange;
  const realised = Object.values(realisedByTicker).reduce((s, x) => s + x, 0);
  return {
    holdings,
    realised,
    realisedByTicker,
    totals: {
      cost,
      value: totalValue,
      dayChange,
      pl,
      plPct: cost > 0 ? totalValue / cost - 1 : null,
      dayChangePct: prev > 0 ? dayChange / prev : null,
      dividend: holdings.reduce((s, h) => s + (h.dividend ?? 0), 0),
      missingPrice: holdings.length > priced.length,
    },
  };
}

export interface TxInput {
  type: string;
  ticker: string;
  date: string;
  qty: number;
  price: number;
  fee: number;
}

export function todayISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Field-level checks that do not depend on the other transactions. Returns Romanian messages. */
export function validateFields(t: TxInput, known: ReadonlySet<string>, today: string): string[] {
  const errs: string[] = [];
  if (t.type !== "buy" && t.type !== "sell") errs.push("Tipul trebuie să fie Cumpărare sau Vânzare.");
  if (!known.has(t.ticker)) errs.push(`Simbolul „${t.ticker || ""}” nu există în datele BVB.`);
  if (!validDate(t.date)) errs.push("Data nu este validă.");
  else if (t.date > today) errs.push("Data nu poate fi în viitor.");
  if (!isNum(t.qty) || t.qty <= 0) errs.push("Cantitatea trebuie să fie un număr pozitiv.");
  if (!isNum(t.price) || t.price <= 0) errs.push("Prețul trebuie să fie un număr pozitiv.");
  if (!isNum(t.fee) || t.fee < 0) errs.push("Comisionul nu poate fi negativ.");
  return errs;
}

/**
 * Validate a transaction against the existing ones (`replacingId` = the one being edited).
 * Rejects a sell of more than is held at that date, and edits that would make a later sell invalid.
 */
export function validateTx(t: TxInput, existing: Tx[], known: ReadonlySet<string>, today: string, replacingId?: string): string[] {
  const errs = validateFields(t, known, today);
  if (errs.length) return errs;
  const others = existing.filter((x) => x.id !== replacingId);
  const candidate: Tx = { id: replacingId ?? "__new__", type: t.type as "buy" | "sell", ticker: t.ticker, date: t.date, qty: t.qty, price: t.price, fee: t.fee };
  const bad = firstOversell([...others, candidate]);
  if (bad) {
    if (bad.id === candidate.id) return [`Nu poți vinde mai mult decât deții la ${t.date}.`];
    return [`Modificarea ar face ca vânzarea din ${bad.date} (${bad.ticker}) să depășească cantitatea deținută.`];
  }
  return [];
}

/** Can this transaction be removed without leaving a later sell uncovered? */
export function validateDelete(id: string, existing: Tx[]): string | null {
  const bad = firstOversell(existing.filter((x) => x.id !== id));
  return bad ? `Nu poți șterge: vânzarea din ${bad.date} (${bad.ticker}) ar depăși cantitatea deținută.` : null;
}

let seq = 0;
export function newId(): string {
  return `t${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function serialize(txs: Tx[]): string {
  const file: PortfolioFile = { version: PORTFOLIO_VERSION, transactions: sortTx(txs) };
  return JSON.stringify(file, null, 2);
}

export type ImportResult = { ok: true; transactions: Tx[] } | { ok: false; error: string };

/** Parse and validate an exported file. Never throws. */
export function parseImport(text: string, known?: ReadonlySet<string>, today = todayISO()): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fișierul nu este un JSON valid." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "Structura fișierului nu este cea a unui portofoliu BursaViz." };
  const f = raw as Record<string, unknown>;
  if (f.version !== PORTFOLIO_VERSION) return { ok: false, error: `Versiune necunoscută a fișierului (${String(f.version)}).` };
  if (!Array.isArray(f.transactions)) return { ok: false, error: "Lipsește lista de tranzacții." };
  const out: Tx[] = [];
  for (let i = 0; i < f.transactions.length; i++) {
    const r = f.transactions[i] as Record<string, unknown> | null;
    const at = `Tranzacția ${i + 1}`;
    if (typeof r !== "object" || r === null) return { ok: false, error: `${at}: format greșit.` };
    const input: TxInput = {
      type: String(r.type),
      ticker: typeof r.ticker === "string" ? r.ticker.trim().toUpperCase() : "",
      date: typeof r.date === "string" ? r.date : "",
      qty: r.qty as number,
      price: r.price as number,
      fee: r.fee === undefined ? 0 : (r.fee as number),
    };
    // Unknown tickers are checked only when a ticker list is given.
    const errs = validateFields(input, known ?? new Set([input.ticker].filter(Boolean)), today);
    if (errs.length) return { ok: false, error: `${at}: ${errs[0]}` };
    out.push({ id: newId(), type: input.type as "buy" | "sell", ticker: input.ticker, date: input.date, qty: input.qty, price: input.price, fee: input.fee });
  }
  const bad = firstOversell(out);
  if (bad) return { ok: false, error: `Vânzarea din ${bad.date} (${bad.ticker}) depășește cantitatea deținută.` };
  return { ok: true, transactions: out };
}

/** Read the stored transactions. Corrupted storage gives an empty list. */
export function loadTransactions(): Tx[] {
  try {
    const r = parseImport(window.localStorage.getItem(PORTFOLIO_KEY) ?? "", undefined, "9999-12-31");
    return r.ok ? r.transactions : [];
  } catch {
    return [];
  }
}

export function saveTransactions(txs: Tx[]) {
  try {
    window.localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ version: PORTFOLIO_VERSION, transactions: txs }));
  } catch {
    // not fatal: the portfolio just will not survive a reload
  }
}
