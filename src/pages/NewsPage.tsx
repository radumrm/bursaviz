import { useCallback, useMemo, useState } from "react";
import { dataUrl, useJson } from "../lib/data";
import { dayKey, fmtTime } from "../lib/format";
import { readHashQuery, stockHref, writePageQuery } from "../lib/router";
import { useWatchlist } from "../lib/watchlist";
import type { IndexFile, MarketNewsFile, NewsItem } from "../lib/types";
import "./newspage.css";

const PAGE = 60;
type Period = "1" | "7" | "30" | "all";
const PERIODS: [Period, string][] = [["1", "Azi"], ["7", "7 zile"], ["30", "30 zile"], ["all", "Tot"]];

interface Filters {
  q: string;
  src: string;
  ticker: string;
  fav: boolean;
  period: Period;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function fromHash(): Filters {
  const p = readHashQuery();
  const per = p.get("p");
  return {
    q: p.get("q") ?? "",
    src: p.get("src") ?? "",
    ticker: (p.get("t") ?? "").toUpperCase(),
    fav: p.get("fav") === "1",
    period: per === "1" || per === "7" || per === "30" ? per : "all",
  };
}

function dayLabel(d: Date, now: Date): string {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Azi";
  if (d.toDateString() === y.toDateString()) return "Ieri";
  return d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const validDate = (s: string) => !Number.isNaN(new Date(s).getTime());

export function NewsPage({ index }: { index: IndexFile | null }) {
  const all = useJson<MarketNewsFile>(dataUrl("news-all.json"));
  // Only ask for the old file when the full one is not there.
  const fallback = useJson<MarketNewsFile>(all.error ? dataUrl("market-news.json") : null);
  const watch = useWatchlist();
  const [f, setF] = useState<Filters>(fromHash);
  const [limit, setLimit] = useState(PAGE);

  const update = useCallback((patch: Partial<Filters>) => {
    setF((prev) => {
      const next = { ...prev, ...patch };
      const p = new URLSearchParams();
      if (next.q) p.set("q", next.q);
      if (next.src) p.set("src", next.src);
      if (next.ticker) p.set("t", next.ticker);
      if (next.fav) p.set("fav", "1");
      if (next.period !== "all") p.set("p", next.period);
      writePageQuery("news", p);
      return next;
    });
    setLimit(PAGE);
  }, []);

  const file = all.data ?? fallback.data;
  const loading = all.loading || (!!all.error && fallback.loading);
  const items: NewsItem[] = useMemo(
    () => (file?.items ?? []).filter((i) => i && i.title && i.link && validDate(i.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [file],
  );

  const known = useMemo(() => new Set((index?.rows ?? []).map((r) => r.ticker)), [index]);
  const favSet = useMemo(() => new Set(watch), [watch]);

  // Filter in two steps so the source dropdown can show counts under all the other filters.
  const base = useMemo(() => {
    const q = fold(f.q.trim());
    const now = new Date();
    const cutoff = f.period === "all" ? null : (() => {
      const c = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      c.setDate(c.getDate() - (Number(f.period) - 1));
      return c.getTime();
    })();
    return items.filter((i) => {
      if (cutoff != null && new Date(i.date).getTime() < cutoff) return false;
      if (q && !fold(i.title).includes(q)) return false;
      if (f.ticker && !i.tickers?.includes(f.ticker)) return false;
      if (f.fav && !i.tickers?.some((t) => favSet.has(t))) return false;
      return true;
    });
  }, [items, f.q, f.ticker, f.fav, f.period, favSet]);

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of base) m.set(i.source || "-", (m.get(i.source || "-") ?? 0) + 1);
    return m;
  }, [base]);
  const allSources = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.source || "-", (m.get(i.source || "-") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const matches = useMemo(() => (f.src ? base.filter((i) => (i.source || "-") === f.src) : base), [base, f.src]);

  const topTickers = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of matches) for (const t of new Set(i.tickers ?? [])) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  }, [matches]);
  const topSources = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of matches) m.set(i.source || "-", (m.get(i.source || "-") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [matches]);

  if (loading) return <main className="wrap state">Se încarcă…</main>;
  if (!file) {
    return (
      <main className="wrap state">
        <h1>Știri</h1>
        <p>Nu există încă un fișier cu știri (news-all.json / market-news.json). Rulează scraper-ul pentru a-l genera.</p>
      </main>
    );
  }

  const now = new Date();
  const shown = matches.slice(0, limit);
  const dirty = !!(f.q || f.src || f.ticker || f.fav || f.period !== "all");
  const reset = () => update({ q: "", src: "", ticker: "", fav: false, period: "all" });
  const tickerOptions = (index?.rows ?? []).map((r) => r.ticker);
  const tickerBad = !!f.ticker && known.size > 0 && !known.has(f.ticker);

  const groups: { key: string; label: string; items: NewsItem[] }[] = [];
  for (const i of shown) {
    const d = new Date(i.date);
    const key = dayKey(d);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(i);
    else groups.push({ key, label: dayLabel(d, now), items: [i] });
  }

  return (
    <main className="wrap stack newspage">
      <div className="sec-head">
        <h1>Știri</h1>
        <p>
          <b>{matches.length}</b> {matches.length === 1 ? "titlu" : "titluri"}
          {dirty && <> din {items.length}</>}
        </p>
      </div>

      <div className="np-filters">
        <input
          type="search"
          className="np-q"
          placeholder="Caută în titluri…"
          aria-label="Caută în titluri"
          value={f.q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <select className={f.src ? "set" : ""} aria-label="Sursă" value={f.src} onChange={(e) => update({ src: e.target.value })}>
          <option value="">Toate sursele</option>
          {f.src && !sourceCounts.has(f.src) && <option value={f.src}>{f.src} (0)</option>}
          {allSources.map(([s]) => (
            <option key={s} value={s}>{s} ({sourceCounts.get(s) ?? 0})</option>
          ))}
        </select>
        <input
          className={`np-t${f.ticker ? " set" : ""}${tickerBad ? " bad" : ""}`}
          list="np-tickers"
          placeholder="Ticker"
          aria-label="Ticker"
          value={f.ticker}
          onChange={(e) => update({ ticker: e.target.value.toUpperCase().trim() })}
        />
        <datalist id="np-tickers">
          {tickerOptions.map((t) => <option key={t} value={t} />)}
        </datalist>
        <label className="np-fav">
          <input type="checkbox" checked={f.fav} onChange={(e) => update({ fav: e.target.checked })} />
          Doar favorite
        </label>
        <div className="seg" role="group" aria-label="Perioadă">
          {PERIODS.map(([v, l]) => (
            <button key={v} className={f.period === v ? "on" : ""} onClick={() => update({ period: v })}>{l}</button>
          ))}
        </div>
        {dirty && <button className="np-reset" onClick={reset}>Resetează</button>}
      </div>

      <div className="np-layout">
        <section className="panel np-list" aria-live="polite">
          {!matches.length ? (
            <div className="empty">
              {f.fav && !watch.length ? "Nu ai încă favorite. Marchează cu steluță emitenți pentru a le urmări aici." : "Nicio știre nu se potrivește filtrelor."}
              {dirty && <div><button className="link-btn" onClick={reset}>Resetează filtrele</button></div>}
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.key} className="np-day">
                  <h2>{g.label}</h2>
                  <ul>
                    {g.items.map((i) => (
                      <li key={i.link}>
                        <time dateTime={i.date}>{fmtTime(new Date(i.date))}</time>
                        <span className="story">
                          <a href={i.link} target="_blank" rel="noreferrer noopener">{i.title}</a>
                          {i.source && <span className="src">({i.source})</span>}
                          {i.tickers?.map((t) => (
                            <a key={t} className="chip" href={stockHref(t)}>{t}</a>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {matches.length > limit && (
                <button className="link-btn" onClick={() => setLimit(limit + PAGE)}>
                  Arată mai multe ({matches.length - limit} rămase)
                </button>
              )}
            </>
          )}
        </section>

        <aside className="np-side">
          <section className="panel">
            <h3>Cele mai menționate</h3>
            {topTickers.length ? (
              <div className="np-tick">
                {topTickers.map(([t, c]) => (
                  <button key={t} className={f.ticker === t ? "on" : ""} onClick={() => update({ ticker: f.ticker === t ? "" : t })} title={`Filtrează după ${t}`}>
                    {t} <span>{c}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="dim">Niciun emitent menționat.</p>
            )}
          </section>
          <section className="panel">
            <h3>Titluri pe sursă</h3>
            {topSources.length ? (
              <ul className="np-src">
                {topSources.map(([s, c]) => (
                  <li key={s}>
                    <button className={f.src === s ? "on" : ""} onClick={() => update({ src: f.src === s ? "" : s })}>
                      <span>{s}</span>
                      <b className="num">{c}</b>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">-</p>
            )}
          </section>
        </aside>
      </div>

      <p className="np-note">
        Titlurile vin din Google News și din publicațiile românești listate; linkurile se deschid pe site-ul publicației.
        {file.updatedAt && validDate(file.updatedAt) && <> Actualizat {new Date(file.updatedAt).toLocaleString("ro-RO")}.</>}
      </p>
    </main>
  );
}
