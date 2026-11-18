/** Pure dividend calculations. Payments are [ex-date 'YYYY-MM-DD', amount][] , oldest first. */
export type Payment = [date: string, amount: number];

export interface YearSum {
  year: number;
  total: number;
  count: number;
}

/** Cleans the raw list: drops malformed entries, sorts oldest first. */
export function cleanPayments(raw: unknown): Payment[] {
  if (!Array.isArray(raw)) return [];
  const out: Payment[] = [];
  for (const r of raw) {
    if (Array.isArray(r) && typeof r[0] === "string" && /^\d{4}-\d{2}-\d{2}/.test(r[0]) && typeof r[1] === "number" && Number.isFinite(r[1])) {
      out.push([r[0].slice(0, 10), r[1]]);
    }
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Sum of payments per calendar year of the ex-date, ascending; years without payment are omitted. */
export function yearlySums(payments: Payment[]): YearSum[] {
  const m = new Map<number, YearSum>();
  for (const [d, a] of payments) {
    const y = Number(d.slice(0, 4));
    const e = m.get(y) ?? { year: y, total: 0, count: 0 };
    e.total += a;
    e.count += 1;
    m.set(y, e);
  }
  return [...m.values()].sort((a, b) => a.year - b.year);
}

/**
 * Years in a row with at least one payment, counted back from the latest year.
 * The current year does not break the streak while it has no payment yet.
 */
export function consecutiveYears(sums: YearSum[], currentYear: number): number {
  const years = new Set(sums.map((s) => s.year));
  let y = years.has(currentYear) ? currentYear : currentYear - 1;
  let n = 0;
  while (years.has(y)) {
    n++;
    y--;
  }
  return n;
}

/** Annual compound growth of the yearly total over `span` complete years, or null. Current year excluded. */
export function yearlyGrowth(sums: YearSum[], currentYear: number, span: number): number | null {
  const by = new Map(sums.map((s) => [s.year, s.total]));
  const end = by.get(currentYear - 1);
  const start = by.get(currentYear - 1 - span);
  if (end == null || start == null || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / span) - 1;
}

/** Fractional change of each payment against the previous one (null for the first). */
export function changes(payments: Payment[]): (number | null)[] {
  return payments.map((p, i) => (i === 0 || payments[i - 1][1] <= 0 ? null : p[1] / payments[i - 1][1] - 1));
}
