import { DASH, fmtBig, fmtDate, fmtInt, fmtNum, fmtPct, fmtPrice, signClass } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Snapshot, StockFile } from "../lib/types";

interface Part {
  text: string;
  cls?: string;
}
type Cell = [label: string, value: Part[], hint?: string];

const NA: Part[] = [{ text: DASH }];
const NA_BVB = "Indisponibil pentru BVB în sursa gratuită";

export function SnapshotTable({ stock }: { stock: StockFile }) {
  const { convert } = useSettings();
  const s: Snapshot = stock.snapshot;
  const sc = stock.statementsCurrency ?? stock.currency;
  const n = (k: string): number | null => (typeof s[k] === "number" ? (s[k] as number) : null);
  /** Snapshot number in the display currency; `from` is the currency the value is reported in. */
  const mn = (k: string, from = stock.currency): number | null => {
    const x = n(k);
    return x == null ? null : convert(x, from);
  };
  const str = (k: string): string | null => (typeof s[k] === "string" ? (s[k] as string) : null);

  // --- value builders ---
  const plain = (text: string): Part[] => [{ text }];
  /** Plain number, red when negative. */
  const val = (k: string, digits = 2): Part[] => {
    const x = n(k);
    return x == null ? NA : [{ text: fmtNum(x, digits), cls: x < 0 ? "neg" : "" }];
  };
  const big = (k: string): Part[] => {
    const x = n(k);
    return x == null ? NA : [{ text: fmtBig(x), cls: x < 0 ? "neg" : "" }];
  };
  /** Money value in the display currency. */
  const bigM = (k: string, from = stock.currency): Part[] => {
    const x = mn(k, from);
    return x == null ? NA : [{ text: fmtBig(x), cls: x < 0 ? "neg" : "" }];
  };
  const valM = (k: string, digits = 2): Part[] => {
    const x = mn(k);
    return x == null ? NA : [{ text: fmtNum(x, digits), cls: x < 0 ? "neg" : "" }];
  };
  /** Percent coloured by sign (performance, growth, distance from averages). */
  const signed = (k: string): Part[] => {
    const x = n(k);
    return x == null ? NA : [{ text: fmtPct(x), cls: signClass(x) }];
  };
  /** Percent that is only flagged when negative (margins, returns). */
  const pct = (k: string): Part[] => {
    const x = n(k);
    return x == null ? NA : [{ text: fmtPct(x), cls: x < 0 ? "neg" : "" }];
  };
  const pair = (a: string, b: string): Part[] => {
    const x = n(a);
    const y = n(b);
    return x == null && y == null
      ? [{ text: "- -" }]
      : [
          { text: x == null ? DASH : fmtPct(x), cls: signClass(x) },
          { text: y == null ? DASH : fmtPct(y), cls: signClass(y) },
        ];
  };
  const dividend = (amount: string, yld: string): Part[] => {
    const a = mn(amount);
    if (a == null || a === 0) return NA;
    const y = n(yld);
    return [{ text: fmtNum(a, a < 1 ? 4 : 2) + (y != null ? ` (${fmtPct(y)})` : "") }];
  };
  const withDistance = (level: string, dist: string): Part[] => {
    const l = mn(level);
    return l == null ? NA : [{ text: fmtPrice(l) }, { text: fmtPct(n(dist)), cls: signClass(n(dist)) }];
  };
  const date = (k: string): Part[] => (str(k) ? plain(fmtDate(str(k))) : NA);

  const columns: Cell[][] = [
    [
      ["Index", plain(stock.index ?? DASH)],
      ["Market Cap", bigM("marketCap")],
      ["Enterprise Value", bigM("enterpriseValue")],
      ["Income", bigM("income", sc), sc !== stock.currency ? `Raportat în ${sc}` : undefined],
      ["Sales", bigM("sales", sc), sc !== stock.currency ? `Raportat în ${sc}` : undefined],
      ["Book/sh", valM("bookSh")],
      ["Cash/sh", valM("cashSh")],
      ["Dividend Est.", dividend("divEst", "divEstYield")],
      ["Dividend TTM", dividend("divTTM", "divTTMYield")],
      ["Dividend Ex-Date", date("divExDate")],
      ["Dividend Gr. 3/5Y", pair("divGr3", "divGr5"), "Creștere anuală compusă a dividendului pe acțiune"],
      ["Payout", pct("payout")],
      ["Employees", plain(fmtInt(n("employees")))],
      ["IPO", date("ipo"), "Prima zi de tranzacționare din istoricul Yahoo"],
    ],
    [
      ["P/E", val("pe")],
      ["Forward P/E", val("fpe")],
      ["PEG", val("peg")],
      ["P/S", val("ps")],
      ["P/B", val("pb")],
      ["P/C", val("pc")],
      ["P/FCF", val("pfcf")],
      ["EV/EBITDA", val("evEbitda")],
      ["EV/Sales", val("evSales")],
      ["Quick Ratio", val("quick")],
      ["Current Ratio", val("current")],
      ["Debt/Eq", val("debtEq")],
      ["LT Debt/Eq", val("ltDebtEq")],
      ["Option/Short", plain("No / No"), "BVB nu are opțiuni pe acțiuni; vânzarea în lipsă este marginală"],
    ],
    [
      ["EPS (ttm)", valM("eps", 3)],
      ["EPS next Y", valM("epsNextY", 3), "Estimarea analiștilor pentru anul următor"],
      ["EPS next Q", NA, NA_BVB],
      ["EPS this Y", NA, NA_BVB],
      ["EPS next Y %", signed("epsNextYPct"), "EPS estimat pentru anul următor față de EPS (ttm)"],
      ["EPS next 5Y", NA, NA_BVB],
      ["EPS past 3/5Y", pair("epsPast3", "epsPast5"), "Creștere anuală compusă din situațiile anuale"],
      ["Sales past 3/5Y", pair("salesPast3", "salesPast5"), "Creștere anuală compusă din situațiile anuale"],
      ["EPS Y/Y (FY)", signed("epsYoY"), "Ultimul an fiscal față de cel precedent"],
      ["Sales Y/Y (FY)", signed("salesYoY"), "Ultimul an fiscal față de cel precedent"],
      ["EPS Q/Q", signed("epsQoQ"), "Ultimul trimestru față de același trimestru din anul precedent"],
      ["Sales Q/Q", signed("salesQoQ"), "Ultimul trimestru față de același trimestru din anul precedent"],
      ["Earnings", date("earningsDate")],
      ["EPS/Sales Surpr.", [{ text: "- -" }], NA_BVB],
    ],
    [
      ["Insider Own", pct("insiderOwn")],
      ["Insider Trans", NA, NA_BVB],
      ["Inst Own", pct("instOwn")],
      ["Inst Trans", NA, NA_BVB],
      ["ROA", pct("roa")],
      ["ROE", pct("roe")],
      ["ROIC", pct("roic"), "EBIT după impozit / capital investit, ultimul an fiscal"],
      ["Gross Margin", pct("grossM")],
      ["Oper. Margin", pct("operM")],
      ["Profit Margin", pct("profitM")],
      ["SMA20", signed("sma20"), "Distanța prețului față de media mobilă pe 20 de zile"],
      ["SMA50", signed("sma50"), "Distanța prețului față de media mobilă pe 50 de zile"],
      ["SMA200", signed("sma200"), "Distanța prețului față de media mobilă pe 200 de zile"],
      ["Trades", NA, NA_BVB],
    ],
    [
      ["Shs Outstand", big("shsOut")],
      ["Shs Float", big("shsFloat")],
      ["Short Float", NA, NA_BVB],
      ["Short Ratio", NA, NA_BVB],
      ["Short Interest", NA, NA_BVB],
      ["52W High", withDistance("high52", "high52Pct")],
      ["52W Low", withDistance("low52", "low52Pct")],
      ["Volatility", n("volW") == null ? NA : plain(`${fmtPct(n("volW"))} ${fmtPct(n("volM"))}`), "Interval mediu zilnic maxim–minim: săptămână, lună"],
      ["ATR (14)", valM("atr", (mn("price") ?? 1) >= 10 ? 2 : (mn("price") ?? 1) >= 1 ? 3 : 4)],
      ["RSI (14)", val("rsi")],
      ["Beta", val("beta")],
      ["Rel Volume", val("relVol")],
      ["Avg Volume", big("avgVol"), "Media pe 3 luni"],
      ["Volume", plain(fmtInt(n("volume")))],
    ],
    [
      ["Perf Week", signed("perfW")],
      ["Perf Month", signed("perfM")],
      ["Perf Quarter", signed("perfQ")],
      ["Perf Half Y", signed("perfH")],
      ["Perf YTD", signed("perfYTD")],
      ["Perf Year", signed("perfY")],
      ["Perf 3Y", signed("perf3Y")],
      ["Perf 5Y", signed("perf5Y")],
      ["Perf 10Y", signed("perf10Y")],
      ["Recom", val("recom"), "Recomandarea medie a analiștilor: 1 = cumpără, 5 = vinde"],
      ["Target Price", mn("target") == null ? NA : plain(fmtPrice(mn("target")))],
      ["Prev Close", plain(fmtPrice(mn("prevClose")))],
      ["Price", plain(fmtPrice(mn("price")))],
      ["Change %", signed("changePct")],
    ],
  ];

  return (
    <section className="panel snap">
      {columns.map((col, ci) => (
        <dl className="snap-col" key={ci}>
          {col.map(([label, parts, hint]) => (
            <div className="snap-row" key={label} title={hint}>
              <dt>{label}</dt>
              <dd>
                {parts.map((p, pi) => (
                  <span className={p.cls} key={pi}>
                    {p.text}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ))}
    </section>
  );
}
