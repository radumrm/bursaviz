import { useState } from "react";
import { fmtNum } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Period, StockFile } from "../lib/types";

/** "m" money in millions, "eps" per-share money, "pct" percent, "shares" a count in millions (never converted). */
type Unit = "m" | "eps" | "pct" | "shares";
type Values = Record<string, number>;

interface RowDef {
  label: string;
  key?: string;
  calc?: (v: Values) => number | undefined;
  unit?: Unit;
  strong?: boolean;
}

const ratio = (a: number | undefined, b: number | undefined) => (a != null && b ? (a / b) * 100 : undefined);

const INCOME: RowDef[] = [
  { label: "Total Revenue", key: "totalRevenue", strong: true },
  { label: "Cost of Revenue", key: "costOfRevenue" },
  { label: "Gross Profit", key: "grossProfit", strong: true },
  { label: "Net Interest Income", key: "netInterestIncome" },
  { label: "Non-Interest Income", key: "nonInterestIncome" },
  { label: "Selling, General & Administrative", key: "sellingGeneralAndAdministration" },
  { label: "Research & Development", key: "researchAndDevelopment" },
  { label: "Operating Expenses", key: "operatingExpense" },
  { label: "Operating Income", key: "operatingIncome", strong: true },
  { label: "Interest Expense", key: "interestExpense" },
  { label: "Unusual Items", key: "totalUnusualItems" },
  { label: "Net Income Before Taxes", key: "pretaxIncome" },
  { label: "Income Taxes", key: "taxProvision" },
  { label: "Net Income From Continuing Operations", key: "netIncomeContinuousOperations" },
  { label: "Net Income", key: "netIncome", strong: true },
  { label: "EPS (Basic)", key: "basicEPS", unit: "eps" },
  { label: "EPS (Diluted)", key: "dilutedEPS", unit: "eps" },
  { label: "EBIT", key: "EBIT" },
  { label: "EBITDA", key: "EBITDA" },
  { label: "Gross Margin %", calc: (v) => ratio(v.grossProfit, v.totalRevenue), unit: "pct" },
  { label: "Operating Margin %", calc: (v) => ratio(v.operatingIncome, v.totalRevenue), unit: "pct" },
  { label: "Net Margin %", calc: (v) => ratio(v.netIncome, v.totalRevenue), unit: "pct" },
  { label: "Diluted Shares", key: "dilutedAverageShares", unit: "shares" },
];

const BALANCE: RowDef[] = [
  { label: "Cash & Equivalents", key: "cashAndCashEquivalents" },
  { label: "Cash & Short-Term Investments", key: "cashCashEquivalentsAndShortTermInvestments" },
  { label: "Receivables", key: "receivables" },
  { label: "Inventory", key: "inventory" },
  { label: "Total Current Assets", key: "currentAssets", strong: true },
  { label: "Net Property, Plant & Equipment", key: "netPPE" },
  { label: "Goodwill & Intangibles", key: "goodwillAndOtherIntangibleAssets" },
  { label: "Net Loans", key: "netLoan" },
  { label: "Total Non-Current Assets", key: "totalNonCurrentAssets" },
  { label: "Total Assets", key: "totalAssets", strong: true },
  { label: "Accounts Payable", key: "accountsPayable" },
  { label: "Current Debt", key: "currentDebt" },
  { label: "Total Current Liabilities", key: "currentLiabilities", strong: true },
  { label: "Long-Term Debt", key: "longTermDebt" },
  { label: "Total Deposits", key: "totalDeposits" },
  { label: "Total Non-Current Liabilities", key: "totalNonCurrentLiabilitiesNetMinorityInterest" },
  { label: "Total Liabilities", key: "totalLiabilitiesNetMinorityInterest", strong: true },
  { label: "Common Stock", key: "commonStock" },
  { label: "Retained Earnings", key: "retainedEarnings" },
  { label: "Shareholders' Equity", key: "stockholdersEquity", strong: true },
  { label: "Minority Interest", key: "minorityInterest" },
  { label: "Total Debt", key: "totalDebt" },
  { label: "Net Debt", key: "netDebt" },
  { label: "Working Capital", key: "workingCapital" },
  { label: "Invested Capital", key: "investedCapital" },
  { label: "Tangible Book Value", key: "tangibleBookValue" },
  { label: "Shares Outstanding", key: "ordinarySharesNumber", unit: "shares" },
];

const CASHFLOW: RowDef[] = [
  { label: "Net Income", key: "netIncomeFromContinuingOperations" },
  { label: "Depreciation & Amortization", key: "depreciationAndAmortization" },
  { label: "Change in Working Capital", key: "changeInWorkingCapital" },
  { label: "Cash From Operations", key: "operatingCashFlow", strong: true },
  { label: "Capital Expenditure", key: "capitalExpenditure" },
  { label: "Cash From Investing", key: "investingCashFlow", strong: true },
  { label: "Debt Issued", key: "issuanceOfDebt" },
  { label: "Debt Repaid", key: "repaymentOfDebt" },
  { label: "Dividends Paid", key: "cashDividendsPaid" },
  { label: "Share Buybacks", key: "repurchaseOfCapitalStock" },
  { label: "Cash From Financing", key: "financingCashFlow", strong: true },
  { label: "Net Change in Cash", key: "changesInCash" },
  { label: "Cash at Beginning of Period", key: "beginningCashPosition" },
  { label: "Cash at End of Period", key: "endCashPosition" },
  { label: "Free Cash Flow", key: "freeCashFlow", strong: true },
];

const TABS = [
  { id: "income", label: "Income Statement", rows: INCOME, ttm: true },
  { id: "balance", label: "Balance Sheet", rows: BALANCE, ttm: false },
  { id: "cash", label: "Cash Flow", rows: CASHFLOW, ttm: true },
] as const;

const read = (row: RowDef, v: Values): number | undefined => (row.calc ? row.calc(v) : v[row.key!]);

function show(x: number | undefined, unit: Unit | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  if (unit === "eps") return fmtNum(x, Math.abs(x) < 1 ? 4 : 2);
  if (unit === "pct") return fmtNum(x, 2);
  return fmtNum(x / 1e6, 2);
}

function periodLabel(date: string, quarterly: boolean): string {
  const [y, m] = date.split("-").map(Number);
  return quarterly ? `Q${Math.ceil(m / 3)} ${y}` : `FY ${y}`;
}

const endDate = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
};

/** Tiny bar chart of a row across periods, oldest on the left. */
function Spark({ values }: { values: (number | undefined)[] }) {
  const xs = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (xs.length < 2) return null;
  const max = Math.max(0, ...xs);
  const min = Math.min(0, ...xs);
  const span = max - min || 1;
  const H = 18;
  const bw = 4;
  const zero = (max / span) * H;
  return (
    <svg className="spark" width={values.length * (bw + 2)} height={H} aria-hidden="true">
      {values.map((x, i) => {
        if (x == null || !Number.isFinite(x)) return null;
        const h = Math.max(1, (Math.abs(x) / span) * H);
        return (
          <rect key={i} x={i * (bw + 2)} y={x >= 0 ? zero - h : zero} width={bw} height={h} fill={x >= 0 ? "var(--blue-bar)" : "var(--red)"} />
        );
      })}
    </svg>
  );
}

export function Statements({ stock }: { stock: StockFile }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("income");
  const [quarterly, setQuarterly] = useState(false);
  const def = TABS.find((t) => t.id === tab)!;
  const { annual, quarterly: q, ttm } = stock.statements;
  const { convert, unit } = useSettings();
  const sc = stock.statementsCurrency ?? stock.currency;
  /** Value of `row` for a period, converted at that period's own end date (no date = latest rate). */
  const get = (row: RowDef, v: Values, day?: string): number | undefined => {
    const x = read(row, v);
    return x == null || row.unit === "pct" || row.unit === "shares" ? x : convert(x, sc, day);
  };

  const periods: Period[] = (quarterly ? q : annual).slice(-6).reverse(); // newest first
  const showTtm = def.ttm && !quarterly && ttm != null;
  const rows = def.rows.filter((r) => periods.some((p) => read(r, p.v) != null) || (showTtm && read(r, ttm!.v) != null));

  return (
    <section className="panel statements" id="financials">
      <header className="panel-head">
        <nav className="st-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="fy">
          <span>Timeframe</span>
          <div className="seg">
            <button className={!quarterly ? "on" : ""} onClick={() => setQuarterly(false)}>Annual</button>
            <button className={quarterly ? "on" : ""} onClick={() => setQuarterly(true)} disabled={!q.length}>Quarterly</button>
          </div>
        </div>
      </header>

      {!periods.length || !rows.length ? (
        <div className="empty">
          Yahoo Finance nu are {quarterly ? "situații trimestriale" : "această situație financiară"} pentru {stock.ticker}.
        </div>
      ) : (
        <>
          <div className="st-scroll">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th aria-hidden="true" />
                  {showTtm && <th>TTM</th>}
                  {periods.map((p) => (
                    <th key={p.date}>{periodLabel(p.date, quarterly)}</th>
                  ))}
                </tr>
                <tr className="sub">
                  <th>Period End Date</th>
                  <th aria-hidden="true" />
                  {showTtm && <th>—</th>}
                  {periods.map((p) => (
                    <th key={p.date}>{endDate(p.date)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const vals = periods.map((p) => get(r, p.v, p.date));
                  return (
                    <tr key={r.label} className={r.strong ? "strong" : ""}>
                      <th scope="row">{r.label}</th>
                      <td className="spark-cell"><Spark values={[...vals].reverse()} /></td>
                      {showTtm && <td>{show(get(r, ttm!.v), r.unit)}</td>}
                      {vals.map((x, i) => (
                        <td key={periods[i].date} className={x != null && x < 0 ? "minus" : ""}>{show(x, r.unit)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="units">values in Millions, {unit(sc)} · EPS în {unit(sc)}, marje în %</p>
        </>
      )}
    </section>
  );
}
