import { useEffect, useMemo, useState } from "react";
import { Groups } from "../components/Groups";
import { IndexStrip } from "../components/IndexStrip";
import { Star } from "../components/Star";
import { MarketMap } from "../components/maps";
import { News } from "../components/News";
import { dataUrl, useJson } from "../lib/data";
import { fmtBig, fmtInt, fmtNum, fmtPct, fmtPrice, fmtSignedPct, ratingClass, signClass } from "../lib/format";
import { analystLabel, techLabel } from "../lib/indicators";
import { go, readHashQuery, stockHref, writeHashQuery } from "../lib/router";
import { CAPS, DIVS, EMPTY, fromParams, passes, PES, PRESETS, RATINGS, TECH_RATINGS, toParams } from "../lib/screener";
import type { Filters, Sort, SortKey } from "../lib/screener";
import { useSettings } from "../lib/settings";
import type { IndexFile, IndexRow, MarketNewsFile } from "../lib/types";

const CSV_FIELDS: (keyof IndexRow)[] = [
  "ticker", "name", "sector", "industry", "index", "price", "changePct", "marketCap", "pe", "divYield", "volume",
  "relVol", "perfW", "perfM", "perfYTD", "perfY", "rsi", "techScore", "recom", "target", "sma200", "high52Pct", "low52Pct",
];

/** The screener's current rows as a CSV file. Raw values: money in RON, percentages as fractions. */
function downloadCsv(rows: IndexRow[]) {
  const cell = (v: unknown) => {
    if (v == null) return "";
    const t = String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [CSV_FIELDS.join(","), ...rows.map((r) => CSV_FIELDS.map((k) => cell(r[k])).join(","))];
  // The BOM makes Excel read the diacritics in company names correctly.
  const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `bursaviz-screener-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const COLS: { key: SortKey; label: string; num?: boolean; title?: string }[] = [
  { key: "ticker", label: "Simbol" },
  { key: "name", label: "Companie" },
  { key: "marketCap", label: "Capitalizare", num: true },
  { key: "pe", label: "P/E", num: true },
  { key: "divYield", label: "Dividend", num: true, title: "Randamentul dividendului" },
  { key: "price", label: "Preț", num: true },
  { key: "changePct", label: "Variație", num: true },
  { key: "volume", label: "Volum", num: true },
  { key: "perfYTD", label: "YTD", num: true, title: "Evoluția de la începutul anului" },
  { key: "techScore", label: "Technical", num: true, title: "Rating tehnic calculat mecanic din indicatori" },
  { key: "recom", label: "Analyst", title: "Consensul analiștilor (Yahoo Finance); sortat de la cel mai bun" },
];

const DEFAULT_SORT: Sort = { key: "marketCap", desc: true };

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const W = 84;
  const H = 22;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={W} height={H} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "var(--green)" : "var(--red)"} strokeWidth="1.4" />
    </svg>
  );
}

function Movers({ title, rows }: { title: string; rows: IndexRow[] }) {
  const { convert } = useSettings();
  return (
    <div className="panel movers">
      <h2>{title}</h2>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} onClick={() => go(stockHref(r.ticker))}>
              <td><a href={stockHref(r.ticker)}>{r.ticker}</a></td>
              <td className="co">{r.name}</td>
              <td className="num">{fmtPrice(r.price == null ? null : convert(r.price))}</td>
              <td className={`num ${signClass(r.changePct)}`}>{fmtSignedPct(r.changePct)}</td>
              <td className="num vol">{fmtBig(r.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Home({ index, error }: { index: IndexFile | null; error: string | null }) {
  const { convert, unit } = useSettings();
  const marketNews = useJson<MarketNewsFile>(dataUrl("market-news.json")).data;
  const [f, setF] = useState<Filters>(() => fromParams(readHashQuery()));
  const [sort, setSort] = useState<Sort>(() => PRESETS.find((p) => p.id === f.signal)?.sort ?? DEFAULT_SORT);

  // A screen shared or edited by hand in the address bar (hashchange does not fire for our own replaceState).
  useEffect(() => {
    const onHash = () => {
      const next = fromParams(readHashQuery());
      setF(next);
      setSort(PRESETS.find((p) => p.id === next.signal)?.sort ?? DEFAULT_SORT);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const apply = (next: Filters) => {
    if (next.signal !== f.signal) setSort(PRESETS.find((p) => p.id === next.signal)?.sort ?? DEFAULT_SORT);
    setF(next);
    writeHashQuery(toParams(next));
  };
  const set = (patch: Partial<Filters>) => apply({ ...f, ...patch });
  const pickSector = (sector: string) => {
    set({ sector });
    document.getElementById("screener")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY);

  const rows = index?.rows ?? [];
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => (!f.sector || r.sector === f.sector) && passes(r, f));
    const { key, desc } = sort;
    const val = (r: IndexRow): number | string | null =>
      key === "value" ? (r.volume != null && r.price != null ? convert(r.volume * r.price) : null) : (r[key] as number | string | null);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // missing values always sink to the bottom
      if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(y as string, "ro") : (x as number) - (y as number);
      return desc ? -c : c;
    });
  }, [rows, sort, f, convert]);

  if (error) {
    return (
      <main className="wrap state">
        <h1>Lipsesc datele</h1>
        <p>Nu am găsit <code>public/data/index.json</code>. Rulează <code>npm run scrape</code> ca să descarci instantaneul de la Yahoo Finance.</p>
      </main>
    );
  }
  if (!index) return <main className="wrap state">Se încarcă piața…</main>;

  const traded = rows.filter((r) => r.changePct != null && (r.volume ?? 0) > 0);
  const gainers = [...traded].sort((a, b) => b.changePct! - a.changePct!).slice(0, 6);
  const losers = [...traded].sort((a, b) => a.changePct! - b.changePct!).slice(0, 6);
  const up = traded.filter((r) => r.changePct! > 0).length;
  const down = traded.filter((r) => r.changePct! < 0).length;

  const clickSort = (key: SortKey, num?: boolean) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !!num }));

  return (
    <main className="wrap stack home">
      <IndexStrip />
      <section>
        <header className="sec-head">
          <h1>Harta pieței</h1>
          <p>
            {rows.length} acțiuni BVB ·{" "}
            <span className="pos">{up} în creștere</span> · <span className="neg">{down} în scădere</span>
          </p>
        </header>
        <MarketMap rows={rows} />
      </section>

      <section className="movers-row">
        <Movers title="Cele mai mari creșteri" rows={gainers} />
        <Movers title="Cele mai mari scăderi" rows={losers} />
        <Groups rows={rows} active={f.sector} onPick={pickSector} />
      </section>

      {marketNews && marketNews.items?.length > 0 && (
        <section>
          <header className="sec-head">
            <h1>Știri din piață</h1>
          </header>
          <News news={marketNews.items} id="market-news" />
        </section>
      )}

      <section id="screener" className="anchor">
        <header className="sec-head">
          <h1>Toate acțiunile</h1>
          <p>
            <b>{shown.length}</b> din {rows.length} acțiuni{active ? " corespund filtrelor" : ""}
          </p>
        </header>
        <div className="filters">
          <select value={f.signal} onChange={(e) => set({ signal: e.target.value })} aria-label="Semnal" className={f.signal ? "set" : ""}>
            <option value="">Semnal: toate</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <div className="seg">
            <button className={!f.bet ? "on" : ""} onClick={() => set({ bet: false })}>Toate</button>
            <button className={f.bet ? "on" : ""} onClick={() => set({ bet: true })}>BET</button>
          </div>
          <select value={f.sector} onChange={(e) => set({ sector: e.target.value })} aria-label="Sector" className={f.sector ? "set" : ""}>
            <option value="">Toate sectoarele</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={f.cap} onChange={(e) => set({ cap: e.target.value })} aria-label="Capitalizare" className={f.cap ? "set" : ""}>
            <option value="">Capitalizare: toate</option>
            {CAPS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={f.pe} onChange={(e) => set({ pe: e.target.value })} aria-label="P/E" className={f.pe ? "set" : ""}>
            <option value="">P/E: toate</option>
            {PES.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={f.div} onChange={(e) => set({ div: e.target.value })} aria-label="Dividend" className={f.div ? "set" : ""}>
            <option value="">Dividend: oricare</option>
            {DIVS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={f.analyst} onChange={(e) => set({ analyst: e.target.value })} aria-label="Analyst rating" className={f.analyst ? "set" : ""}>
            <option value="">Analyst: toate</option>
            {RATINGS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={f.tech} onChange={(e) => set({ tech: e.target.value })} aria-label="Technical rating" className={f.tech ? "set" : ""}>
            <option value="">Technical: toate</option>
            {TECH_RATINGS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button className="reset" onClick={() => { apply(EMPTY); setSort(DEFAULT_SORT); }} disabled={!active && sort.key === DEFAULT_SORT.key && sort.desc}>
            Resetează
          </button>
          <button className="reset" onClick={() => downloadCsv(shown)} disabled={!shown.length} title="Descarcă rândurile afișate ca fișier CSV (valori în RON)">
            Export CSV
          </button>
        </div>
        <div className="panel screener">
          <table>
            <thead>
              <tr>
                <th className="num">Nr.</th>
                {COLS.map((c) => (
                  <th key={c.key} className={c.num ? "num" : ""} title={c.title} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                    <button onClick={() => clickSort(c.key, c.num)}>
                      {c.label}
                      <i>{sort.key === c.key ? (sort.desc ? "▼" : "▲") : ""}</i>
                    </button>
                  </th>
                ))}
                <th>30 zile</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.ticker} onClick={() => go(stockHref(r.ticker))}>
                  <td className="num dim">{i + 1}</td>
                  <td><Star ticker={r.ticker} small /><a href={stockHref(r.ticker)} onClick={(e) => e.stopPropagation()}>{r.ticker}</a></td>
                  <td className="co" title={r.sector}>{r.name}</td>
                  <td className="num">{fmtBig(r.marketCap == null ? null : convert(r.marketCap))}</td>
                  <td className="num">{fmtNum(r.pe)}</td>
                  <td className="num">{r.divYield ? fmtPct(r.divYield) : "-"}</td>
                  <td className="num"><b>{fmtPrice(r.price == null ? null : convert(r.price))}</b></td>
                  <td className={`num ${signClass(r.changePct)}`}>{fmtSignedPct(r.changePct)}</td>
                  <td className="num" title={r.volume != null && r.price != null ? `Valoare tranzacționată: ${fmtBig(convert(r.volume * r.price))} ${unit()}` : undefined}>{fmtInt(r.volume)}</td>
                  <td className={`num ${signClass(r.perfYTD)}`}>{fmtSignedPct(r.perfYTD)}</td>
                  <td className={`num rate ${ratingClass(techLabel(r.techScore))}`}>{techLabel(r.techScore) ?? "-"}</td>
                  <td className={`rate ${ratingClass(analystLabel(r.recom))}`} title={r.recom != null ? `Medie ${fmtNum(r.recom)} din 5` : "Fără acoperire de analiști"}>{analystLabel(r.recom) ?? "-"}</td>
                  <td><Spark values={r.spark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <div className="empty">Nicio acțiune nu corespunde filtrelor.</div>}
        </div>
      </section>
    </main>
  );
}
