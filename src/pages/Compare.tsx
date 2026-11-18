import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from "lightweight-charts";
import type { Time } from "lightweight-charts";
import { loadJson, dataUrl } from "../lib/data";
import {
  DEFAULT_RANGE, MAX_COMPARE, METRIC_GROUPS, MIN_CORR_RETURNS, RANGES, annualisedVolatility, asRange, assignSlots,
  bestIndexes, correlationMatrix, largest, maxDrawdown, metricValue, parseTickerList, rangeStart, rebase, sliceRange,
  totalReturn, valueAt,
} from "../lib/compare";
import type { MetricDef, RangeId, Series } from "../lib/compare";
import { fmtBig, fmtDate, fmtNum, fmtPct, fmtPrice, fmtSignedPct, ratingClass, signClass } from "../lib/format";
import { analystLabel, techLabel } from "../lib/indicators";
import { readHashQuery, stockHref, writePageQuery } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { Theme } from "../lib/settings";
import { useWatchlist } from "../lib/watchlist";
import type { BarsFile, IndexFile, IndexRow, StockFile } from "../lib/types";
import "./compare.css";

// ---------- colours ----------

/** Categorical series colours, fixed order (validated for both surfaces); a stock keeps its slot while it stays selected. */
const SERIES: Record<Theme, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"],
};
const CHART: Record<Theme, { text: string; grid: string; crosshair: string; label: string; zero: string }> = {
  dark: { text: "#9aa1b0", grid: "rgba(255,255,255,0.045)", crosshair: "#5b6373", label: "#3a4050", zero: "#5b6170" },
  light: { text: "#4b5563", grid: "rgba(0,0,0,0.06)", crosshair: "#9ca3af", label: "#6b7280", zero: "#9aa2b2" },
};

// ---------- data loading ----------

interface Slot<T> {
  data: T | null;
  failed: boolean;
}

/** Load several JSON files (cached by `loadJson`); entries appear as each one lands. */
function useFiles<T>(rels: string[]): Record<string, Slot<T>> {
  const [got, setGot] = useState<Record<string, Slot<T>>>({});
  const key = rels.join("|");
  useEffect(() => {
    let alive = true;
    for (const rel of rels) {
      loadJson<T>(dataUrl(rel)).then(
        (data) => alive && setGot((g) => (g[rel]?.data === data ? g : { ...g, [rel]: { data, failed: false } })),
        () => alive && setGot((g) => ({ ...g, [rel]: { data: null, failed: true } })),
      );
    }
    return () => {
      alive = false;
    };
    // `key` stands for `rels`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return got;
}

// ---------- URL state ----------

function useCompareQuery() {
  const [q, setQ] = useState(() => readHashQuery().toString());
  useEffect(() => {
    const on = () => setQ(readHashQuery().toString());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const params = useMemo(() => new URLSearchParams(q), [q]);
  const write = (tickers: string[], range: RangeId) => {
    const p = new URLSearchParams();
    if (tickers.length) p.set("t", tickers.join(","));
    if (range !== DEFAULT_RANGE) p.set("r", range);
    writePageQuery("compare", p);
    setQ(p.toString());
  };
  return { params, write };
}

// ---------- picker ----------

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Picker({ rows, have, onAdd }: { rows: IndexRow[]; have: string[]; onAdd: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const full = have.length >= MAX_COMPARE;
  const matches = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    const m = rows.filter((r) => !have.includes(r.ticker) && (norm(r.ticker).startsWith(n) || norm(r.name).includes(n)));
    m.sort((a, b) => Number(norm(b.ticker).startsWith(n)) - Number(norm(a.ticker).startsWith(n)) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return m.slice(0, 8);
  }, [q, rows, have]);
  const pick = (r: IndexRow) => {
    onAdd(r.ticker);
    setQ("");
    setHi(0);
  };
  return (
    <div className="cmp-pick">
      <input
        type="text"
        autoComplete="off"
        aria-label="Adaugă o acțiune la comparație"
        placeholder={full ? `Maximum ${MAX_COMPARE} acțiuni` : "Adaugă simbol sau companie…"}
        disabled={full}
        value={q}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls="cmp-suggest"
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && matches[hi]) {
            e.preventDefault();
            pick(matches[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length > 0 && (
        <ul id="cmp-suggest" role="listbox" className="cmp-suggest">
          {matches.map((r, i) => (
            <li
              key={r.ticker}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? "on" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              <b>{r.ticker}</b>
              <span>{r.name}</span>
            </li>
          ))}
        </ul>
      )}
      {q.trim() !== "" && matches.length === 0 && <span className="dim cmp-nomatch">Nicio potrivire.</span>}
    </div>
  );
}

// ---------- start state ----------

interface Preset {
  id: string;
  title: string;
  note: string;
  tickers: string[];
}

function presets(rows: IndexRow[], favourites: string[]): Preset[] {
  const known = new Set(rows.map((r) => r.ticker));
  const of = (pred: (r: IndexRow) => boolean, n = MAX_COMPARE) => largest(rows.filter(pred), n);
  const list: Preset[] = [
    { id: "big", title: "Cele mai mari companii", note: "după Market Cap", tickers: of(() => true) },
    { id: "banks", title: "Băncile", note: "Banks", tickers: of((r) => /^Banks/i.test(r.industry)) },
    { id: "energy", title: "Energie", note: "petrol și gaze", tickers: of((r) => r.sector === "Energy") },
    { id: "util", title: "Utilități", note: "electricitate, gaze, apă", tickers: of((r) => r.sector === "Utilities") },
    { id: "fin", title: "Servicii financiare", note: "fără bănci", tickers: of((r) => r.sector === "Financial Services" && !/^Banks/i.test(r.industry)) },
  ];
  const fav = favourites.filter((t) => known.has(t)).slice(0, MAX_COMPARE);
  if (fav.length) list.splice(1, 0, { id: "fav", title: "Favoritele tale", note: favourites.length > MAX_COMPARE ? `primele ${MAX_COMPARE}` : "din lista ta", tickers: fav });
  return list.filter((p) => p.tickers.length >= 2 || (p.id === "fav" && p.tickers.length));
}

// ---------- chart ----------

interface Line {
  ticker: string;
  color: string;
  /** Rebased performance, fraction. */
  points: Series;
}

const pctLabel = (x: number) => `${x > 0 ? "+" : ""}${fmtNum(x, Math.abs(x) >= 100 ? 0 : 1)}%`;

function PerfChart({ lines, theme }: { lines: Line[]; theme: Theme }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || !lines.some((l) => l.points.length)) return;
    setHover(null);
    const pal = CHART[theme] ?? CHART.dark;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: pal.text,
        fontFamily: "Lato, -apple-system, 'Segoe UI', sans-serif",
        fontSize: 12,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: pal.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.06 } },
      timeScale: { borderVisible: false, rightOffset: 2 },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: pal.crosshair, labelBackgroundColor: pal.label },
        horzLine: { color: pal.crosshair, labelBackgroundColor: pal.label },
      },
      localization: { locale: "ro-RO" },
      handleScroll: { vertTouchDrag: false },
    });
    const priceFormat = { type: "custom" as const, minMove: 0.01, formatter: pctLabel };
    lines.forEach((l, k) => {
      if (!l.points.length) return;
      const s = chart.addSeries(LineSeries, {
        color: l.color,
        lineWidth: 2,
        priceFormat,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
      });
      s.setData(l.points.map(([d, v]) => ({ time: d as Time, value: v * 100 })));
      if (k === 0) s.createPriceLine({ price: 0, color: pal.zero, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => setHover(typeof p.time === "string" ? p.time : null));
    return () => chart.remove();
  }, [lines, theme]);

  const last = lines.reduce((m, l) => {
    const d = l.points[l.points.length - 1]?.[0];
    return d && d > m ? d : m;
  }, "");
  const at = hover ?? last;

  return (
    <>
      <div className="cmp-legend" aria-live="off">
        <span className="cmp-when">{at ? fmtDate(at) : "-"}</span>
        {lines.map((l) => {
          const v = at ? valueAt(l.points, at) : null;
          const started = l.points.length > 0 && at >= l.points[0][0];
          return (
            <span key={l.ticker} className="cmp-leg">
              <i style={{ background: l.color }} aria-hidden="true" />
              <b>{l.ticker}</b>
              <span className={started ? signClass(v) : "dim"}>{started && v != null ? fmtSignedPct(v, 1) : "-"}</span>
            </span>
          );
        })}
      </div>
      <div className="cmp-chart" ref={boxRef} />
    </>
  );
}

// ---------- metrics table ----------

function MetricCell({ def, value, stock }: { def: MetricDef; value: number | null; stock: StockFile | null }) {
  const { convert } = useSettings();
  if (value == null || !stock) return <>-</>;
  switch (def.kind) {
    case "price":
      return <>{fmtPrice(convert(value, stock.currency))}</>;
    case "cap":
      return <>{fmtBig(convert(value, stock.currency))}</>;
    case "ratio":
      return <span className={value < 0 ? "neg" : ""}>{fmtNum(value, 2)}</span>;
    case "pct":
      return <span className={value < 0 ? "neg" : ""}>{fmtPct(value)}</span>;
    case "perf":
      return <span className={signClass(value)}>{fmtSignedPct(value)}</span>;
    case "range52":
      return (
        <span className="cmp-range" title={`${fmtPct(value, 0)} din intervalul de 52 de săptămâni`}>
          <span className="cmp-range-bar" aria-hidden="true"><b style={{ left: `${value * 100}%` }} /></span>
          {fmtPct(value, 0)}
        </span>
      );
    case "analyst": {
      const l = analystLabel(value);
      return <span><span className={ratingClass(l)}>{l ?? "-"}</span> <span className="dim">{fmtNum(value, 2)}</span></span>;
    }
    case "tech": {
      const l = techLabel(value);
      return <span><span className={ratingClass(l)}>{l ?? "-"}</span> <span className="dim">{value > 0 ? "+" : ""}{fmtNum(value, 2)}</span></span>;
    }
  }
}

// ---------- page ----------

export function Compare({ index }: { index: IndexFile | null }) {
  const { theme, currency, convert, unit } = useSettings();
  const favourites = useWatchlist();
  const { params, write } = useCompareQuery();
  const rows = index?.rows ?? [];
  const byTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);
  const parsed = useMemo(() => parseTickerList(params.get("t"), byTicker.keys()), [params, byTicker]);
  const tickers = parsed.tickers;
  const range = asRange(params.get("r"));

  const slotsRef = useRef<Record<string, number>>({});
  const slots = useMemo(() => (slotsRef.current = assignSlots(slotsRef.current, tickers)), [tickers]);
  const colour = (t: string) => SERIES[theme][slots[t] ?? 0];

  const bars = useFiles<BarsFile>(useMemo(() => tickers.map((t) => `bars/${t}.json`), [tickers]));
  const stocks = useFiles<StockFile>(useMemo(() => tickers.map((t) => `stocks/${t}.json`), [tickers]));

  useEffect(() => {
    document.title = tickers.length ? `Compară ${tickers.join(", ")} · BursaViz` : "Compară acțiuni · BursaViz";
    return () => {
      document.title = "BursaViz — acțiunile de la BVB";
    };
  }, [tickers]);

  const setTickers = (next: string[]) => write(next.slice(0, MAX_COMPARE), range);
  const add = (t: string) => !tickers.includes(t) && setTickers([...tickers, t]);
  const remove = (t: string) => setTickers(tickers.filter((x) => x !== t));

  // Daily closes in the display currency (each day at its own rate), cut to the chosen range.
  const ranged = useMemo(() => {
    const full = tickers.map((t) => bars[`bars/${t}.json`]?.data?.d ?? []);
    const lastDay = full.reduce((m, d) => (d.length && d[d.length - 1][0] > m ? d[d.length - 1][0] : m), "");
    const start = lastDay ? rangeStart(range, lastDay) : null;
    return {
      start,
      series: full.map((d): Series => {
        const raw: Series = d.map((b) => [b[0], b[4]]);
        const cut = sliceRange(raw, start);
        return currency === "RON" ? cut : cut.map(([day, c]) => [day, convert(c, "RON", day)]);
      }),
    };
  }, [tickers, bars, range, currency, convert]);

  const lines = useMemo<Line[]>(
    () => tickers.map((t, i) => ({ ticker: t, color: SERIES[theme][slots[t] ?? 0], points: rebase(ranged.series[i]) })),
    [tickers, ranged, theme, slots],
  );
  const risk = useMemo(
    () =>
      ranged.series.map((s) => ({
        from: s[0]?.[0] ?? null,
        ret: totalReturn(s),
        vol: annualisedVolatility(s),
        dd: maxDrawdown(s),
      })),
    [ranged],
  );
  const corr = useMemo(() => correlationMatrix(ranged.series), [ranged]);

  if (!index) return <main className="wrap state">Se încarcă lista de acțiuni…</main>;

  const loadingBars = tickers.some((t) => !bars[`bars/${t}.json`]);
  const missingBars = tickers.filter((t) => bars[`bars/${t}.json`]?.failed || (bars[`bars/${t}.json`]?.data && !bars[`bars/${t}.json`]?.data?.d.length));
  const missingStocks = tickers.filter((t) => stocks[`stocks/${t}.json`]?.failed);
  const rangeTitle = RANGES.find((r) => r.id === range)?.title ?? "";
  const lateStarters = tickers.filter((_, i) => ranged.start && risk[i].from && risk[i].from! > ranged.start && ranged.series[i].length);
  const ccy = unit("RON");

  return (
    <main className="wrap stack cmp">
      <div className="sec-head cmp-head">
        <h1>Compară acțiuni</h1>
        <p>Până la {MAX_COMPARE} acțiuni de la BVB, una lângă alta: evoluție, indicatori, risc.</p>
      </div>

      <section className="panel cmp-bar">
        <ul className="cmp-chips" aria-label="Acțiuni comparate">
          {tickers.map((t) => (
            <li key={t} className="cmp-chip">
              <i style={{ background: colour(t) }} aria-hidden="true" />
              <a href={stockHref(t)} title={byTicker.get(t)?.name}>{t}</a>
              <button type="button" aria-label={`Scoate ${t} din comparație`} title={`Scoate ${t}`} onClick={() => remove(t)}>×</button>
            </li>
          ))}
        </ul>
        <Picker rows={rows} have={tickers} onAdd={add} />
        {tickers.length > 0 && (
          <button type="button" className="cmp-clear" onClick={() => setTickers([])}>Golește</button>
        )}
      </section>

      {(parsed.unknown.length > 0 || parsed.overflow.length > 0) && (
        <p className="cmp-note">
          {parsed.unknown.length > 0 && <>Simboluri necunoscute, ignorate: <b>{parsed.unknown.join(", ")}</b>. </>}
          {parsed.overflow.length > 0 && <>Se compară cel mult {MAX_COMPARE} acțiuni; ignorate: <b>{parsed.overflow.join(", ")}</b>.</>}
        </p>
      )}

      {tickers.length === 0 ? (
        <section className="panel cmp-start">
          <h2>Alege acțiunile de comparat</h2>
          <p className="dim">Caută un simbol în câmpul de mai sus sau pornește de la un set gata făcut:</p>
          <div className="cmp-presets">
            {presets(rows, favourites).map((p) => (
              <button key={p.id} type="button" className="cmp-preset" onClick={() => setTickers(p.tickers)}>
                <b>{p.title}</b>
                <small>{p.note}</small>
                <span>{p.tickers.join(" · ")}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="panel cmp-perf">
            <div className="panel-head">
              <h2>Performanță <small>{rangeTitle}</small></h2>
              <div className="seg cmp-ranges" role="group" aria-label="Perioadă">
                {RANGES.map((r) => (
                  <button key={r.id} type="button" className={range === r.id ? "on" : ""} title={r.title} aria-pressed={range === r.id} onClick={() => write(tickers, r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {loadingBars && !lines.some((l) => l.points.length) ? (
              <div className="empty">Se încarcă istoricul de preț…</div>
            ) : lines.some((l) => l.points.length) ? (
              <PerfChart lines={lines} theme={theme} />
            ) : (
              <div className="empty">Nu am istoric de preț pentru perioada aleasă.</div>
            )}
            <p className="cmp-foot">
              Variația prețului de închidere față de începutul perioadei, în {ccy}. Doar preț: dividendele nu sunt incluse
              (istoricul nu este ajustat pentru ele).
              {lateStarters.length > 0 && <> {lateStarters.join(", ")} {lateStarters.length > 1 ? "au" : "are"} istoric mai scurt și {lateStarters.length > 1 ? "pornesc" : "pornește"} de la primul preț disponibil.</>}
              {missingBars.length > 0 && <> Fără istoric de preț: {missingBars.join(", ")}.</>}
            </p>
          </section>

          <section className="panel cmp-metrics">
            <div className="panel-head">
              <h2>Indicatori <small>sume în {ccy} · cea mai bună valoare din rând este marcată</small></h2>
            </div>
            <div className="cmp-scroll">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Indicator</span></th>
                    {tickers.map((t) => (
                      <th key={t} scope="col" className="num">
                        <span className="cmp-col">
                          <i style={{ background: colour(t) }} aria-hidden="true" />
                          <a href={stockHref(t)}>{t}</a>
                        </span>
                        <small title={byTicker.get(t)?.name}>{byTicker.get(t)?.name}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                {METRIC_GROUPS.map((g) => (
                  <tbody key={g.title}>
                    <tr className="cmp-group">
                      <th scope="rowgroup" colSpan={tickers.length + 1}>{g.title}</th>
                    </tr>
                    {g.rows.map((def) => {
                      const sts = tickers.map((t) => stocks[`stocks/${t}.json`]?.data ?? null);
                      const values = sts.map((s) => metricValue(def, s?.snapshot));
                      const best = new Set(bestIndexes(values, def.better));
                      return (
                        <tr key={def.id}>
                          <th scope="row" title={def.hint}>{def.label}</th>
                          {tickers.map((t, i) => (
                            <td key={t} className={`num${best.has(i) ? " cmp-best" : ""}`} title={best.has(i) ? "Cea mai bună valoare din rând" : undefined}>
                              {stocks[`stocks/${t}.json`] ? <MetricCell def={def} value={values[i]} stock={sts[i]} /> : <span className="dim">…</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            {missingStocks.length > 0 && <p className="cmp-foot">Nu am indicatori pentru: {missingStocks.join(", ")}.</p>}
          </section>

          <section className="panel cmp-risk">
            <div className="panel-head">
              <h2>Risc <small>{rangeTitle}, din prețurile zilnice în {ccy}</small></h2>
            </div>
            <div className="cmp-risk-grid">
              <div className="cmp-scroll">
                <table className="cmp-table cmp-risk-table">
                  <thead>
                    <tr>
                      <th scope="col">Simbol</th>
                      <th scope="col" className="num" title="Variația prețului pe perioadă">Randament</th>
                      <th scope="col" className="num" title="Abaterea standard a randamentelor zilnice, anualizată (×√252)">Volatilitate</th>
                      <th scope="col" className="num" title="Cea mai mare scădere de la un maxim la un minim ulterior">Max Drawdown</th>
                      <th scope="col">De la</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickers.map((t, i) => {
                      const r = risk[i];
                      return (
                        <tr key={t}>
                          <th scope="row"><span className="cmp-col"><i style={{ background: colour(t) }} aria-hidden="true" />{t}</span></th>
                          <td className={`num ${signClass(r.ret)}`}>{fmtSignedPct(r.ret)}</td>
                          <td className="num">{fmtPct(r.vol)}</td>
                          <td
                            className={`num ${r.dd && r.dd.depth < 0 ? "neg" : ""}`}
                            title={r.dd && r.dd.depth < 0 ? `de la ${fmtDate(r.dd.peak)} la ${fmtDate(r.dd.trough)}` : undefined}
                          >
                            {r.dd ? fmtPct(r.dd.depth) : "-"}
                          </td>
                          <td className="dim">{r.from ? fmtDate(r.from) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="cmp-corr">
                <h3>Corelația randamentelor zilnice</h3>
                {tickers.length < 2 ? (
                  <p className="dim">Adaugă cel puțin două acțiuni pentru matricea de corelație.</p>
                ) : (
                  <>
                    <div className="cmp-scroll">
                      <table className="cmp-matrix">
                        <thead>
                          <tr>
                            <th scope="col"><span className="sr-only">Simbol</span></th>
                            {tickers.map((t) => <th key={t} scope="col">{t}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {tickers.map((a, i) => (
                            <tr key={a}>
                              <th scope="row">{a}</th>
                              {tickers.map((b, j) => {
                                const c = corr[i]?.[j];
                                const r = c?.r ?? null;
                                const mix = r == null ? 0 : Math.round(Math.abs(r) * 55);
                                const style = i === j || r == null ? undefined : { background: `color-mix(in srgb, var(${r >= 0 ? "--blue" : "--red"}) ${mix}%, var(--bg))` };
                                return (
                                  <td
                                    key={b}
                                    className={i === j ? "diag" : ""}
                                    style={style}
                                    title={i === j ? undefined : r == null ? `Prea puține zile comune (${c?.n ?? 0})` : `${a} / ${b}: ${fmtNum(r, 2)} din ${c?.n} zile comune`}
                                  >
                                    {i === j ? "1" : r == null ? "-" : fmtNum(r, 2)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="cmp-scale">
                      <span className="cmp-scale-bar" aria-hidden="true" />
                      <span>−1 opus</span><span>0 fără legătură</span><span>+1 împreună</span>
                    </p>
                    <p className="dim cmp-small">Calculată doar pe zilele în care ambele acțiuni au cotație; minimum {MIN_CORR_RETURNS} zile.</p>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
