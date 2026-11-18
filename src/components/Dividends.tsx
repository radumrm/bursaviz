import { useMemo, useState, useSyncExternalStore } from "react";
import { DASH, fmtDate, fmtInt, fmtNum, fmtPct, fmtSignedPct, signClass } from "../lib/format";
import { useSettings } from "../lib/settings";
import { changes, cleanPayments, consecutiveYears, yearlyGrowth, yearlySums } from "../lib/dividends.ts";
import type { StockFile } from "../lib/types";
import "./dividends.css";

const YEARS = 12;
const NARROW_YEARS = 7;

const narrowQuery = "(max-width: 560px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(narrowQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isNarrow = () => window.matchMedia(narrowQuery).matches;
const FIRST_ROWS = 8;

const amt = (x: number): string => fmtNum(x, Math.abs(x) >= 1 ? 2 : 4);

function niceStep(span: number, target = 4): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
}

interface Bar {
  year: number;
  value: number;
  count: number;
}

function YearChart({ bars, currentYear, unit, narrow }: { bars: Bar[]; currentYear: number; unit: string; narrow: boolean }) {
  const W = narrow ? 420 : 760;
  const H = 230;
  const m = { top: 24, right: 50, bottom: 26, left: 6 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const hi = Math.max(...bars.map((b) => b.value), 0.0001);
  const step = niceStep(hi);
  const y1 = Math.ceil(hi / step) * step;
  const y = (v: number) => m.top + ih - (v / y1) * ih;
  const ticks: number[] = [];
  for (let t = 0; t <= y1 + step / 2; t += step) ticks.push(t);
  const slot = iw / bars.length;
  const bw = Math.min(46, slot * 0.7);
  const label = `Dividende pe an (${unit} / acțiune)`;
  return (
    <figure className="dv-chart">
      <figcaption>{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={m.left + iw + 8} y={y(t) + 4} className="tick">{fmtNum(t, step >= 0.05 ? 2 : 3)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = m.left + slot * i + (slot - bw) / 2;
          const top = y(b.value);
          const h = b.value > 0 ? Math.max(2, y(0) - top) : 0;
          const partial = b.year === currentYear;
          return (
            <g key={b.year}>
              <title>{`${b.year}${partial ? " (an în curs, posibil incomplet)" : ""}: ${amt(b.value)} ${unit}, ${b.count} ${b.count === 1 ? "plată" : "plăți"}`}</title>
              {h > 0 && <rect x={x} y={top} width={bw} height={h} rx={2} className={partial ? "bar partial" : "bar"} />}
              {h > 0 && (
                <text x={x + bw / 2} y={top - 5} textAnchor="middle" className="val">{amt(b.value)}</text>
              )}
              <text x={x + bw / 2} y={H - 7} textAnchor="middle" className="tick">{partial ? `${b.year}*` : b.year}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function Dividends({ stock }: { stock: StockFile }) {
  const { convert, unit } = useSettings();
  const [all, setAll] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const cur = stock.currency || "RON";
  const u = unit(cur);
  const s = stock.snapshot ?? {};
  const n = (k: string): number | null => {
    const v = s[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  const payments = useMemo(() => cleanPayments(stock.dividends), [stock.dividends]);
  const sums = useMemo(() => yearlySums(payments), [payments]);
  const currentYear = new Date().getFullYear();

  if (!payments.length) {
    return (
      <section className="panel dv dv-none">
        <h2>Dividende</h2>
        <span>Yahoo Finance nu are istoric de dividende pentru acest emitent.</span>
      </section>
    );
  }

  // Each payment converted at its own date, then summed per year.
  const conv = (date: string, a: number) => convert(a, cur, date);
  const perYear = new Map<number, Bar>();
  for (const [d, a] of payments) {
    const yr = Number(d.slice(0, 4));
    const b = perYear.get(yr) ?? { year: yr, value: 0, count: 0 };
    b.value += conv(d, a);
    b.count += 1;
    perYear.set(yr, b);
  }
  const lastYear = Math.max(currentYear, sums[sums.length - 1].year);
  const firstYear = Math.max(sums[0].year, lastYear - (narrow ? NARROW_YEARS : YEARS) + 1);
  const bars: Bar[] = [];
  for (let yr = firstYear; yr <= lastYear; yr++) bars.push(perYear.get(yr) ?? { year: yr, value: 0, count: 0 });

  const streak = consecutiveYears(sums, currentYear);
  const gr3 = n("divGr3") ?? yearlyGrowth(sums, currentYear, 3);
  const gr5 = n("divGr5") ?? yearlyGrowth(sums, currentYear, 5);
  const ttm = n("divTTM");
  const ttmYield = n("divTTMYield");
  const est = n("divEst");
  const estYield = n("divEstYield");
  const payout = n("payout");
  const exRaw = typeof s.divExDate === "string" ? s.divExDate : null;
  const exDate = exRaw ? exRaw.slice(0, 10) : null;
  const today = new Date().toISOString().slice(0, 10);
  const lastPay = payments[payments.length - 1][0];
  const exLabel = exDate && exDate >= today ? "Următorul ex-date" : "Ultimul ex-date";
  const exShown = exDate ?? lastPay;

  const ch = changes(payments);
  const rows = payments.map((p, i) => ({ p, c: ch[i] })).reverse();
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);

  const figs: [string, string, string?, string?][] = [
    ["Dividend TTM", ttm == null ? DASH : `${amt(convert(ttm, cur))} ${u}`, "", "Suma dividendelor din ultimele 12 luni"],
    ["Yield TTM", fmtPct(ttmYield), "", "Dividend TTM / preț"],
    ["Dividend estimat", est == null ? DASH : `${amt(convert(est, cur))} ${u}`, "", estYield != null ? `Yield estimat ${fmtPct(estYield)}` : undefined],
    [exLabel, fmtDate(exShown), "", "Data ex-dividend"],
    ["Payout ratio", fmtPct(payout), "", "Dividend / profit net"],
    ["Creștere 3 ani", fmtSignedPct(gr3), signClass(gr3), "Creștere anuală compusă a dividendului"],
    ["Creștere 5 ani", fmtSignedPct(gr5), signClass(gr5), "Creștere anuală compusă a dividendului"],
    ["Ani consecutivi", streak ? `${fmtInt(streak)} ${streak === 1 ? "an" : "ani"}` : DASH, "", "Ani calendaristici la rând cu cel puțin o plată"],
  ];

  return (
    <section className="panel dv">
      <div className="panel-head">
        <h2>Dividende <small>{u} / acțiune, brut</small></h2>
      </div>
      <div className="dv-body">
        <div className="dv-left">
          <YearChart bars={bars} currentYear={currentYear} unit={u} narrow={narrow} />
          <dl className="dv-figs">
            {figs.map(([k, v, cls, hint]) => (
              <div key={k} title={hint}>
                <dt>{k}</dt>
                <dd className={cls}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="dv-right">
          <div className="dv-scroll">
            <table className="dv-table">
              <thead>
                <tr>
                  <th>Ex-date</th>
                  <th className="num">Dividend ({u})</th>
                  <th className="num">Față de anterior</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, c }) => (
                  <tr key={p[0]}>
                    <td>{fmtDate(p[0])}</td>
                    <td className="num" title={`${amt(p[1])} ${cur} la data plății`}>{amt(conv(p[0], p[1]))}</td>
                    <td className={`num ${signClass(c)}`}>{fmtSignedPct(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > FIRST_ROWS && (
            <button className="link-btn" onClick={() => setAll(!all)}>
              {all ? "Arată mai puține" : `Arată toate cele ${rows.length} plăți`}
            </button>
          )}
        </div>
      </div>
      <p className="dv-note">
        Sume brute, pe acțiune, așa cum le raportează Yahoo Finance; fiecare plată e convertită la cursul din data ei.
        * Anul curent poate fi incomplet. Sumele istorice pot să nu fie ajustate pentru splituri sau acțiuni gratuite ulterioare.
      </p>
    </section>
  );
}
