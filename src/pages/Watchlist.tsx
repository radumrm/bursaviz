import { useMemo, useState } from "react";
import type { IndexFile, IndexRow } from "../lib/types";
import { useSettings } from "../lib/settings";
import { compareHref, go, stockHref } from "../lib/router";
import { setWatchlist, toggleWatch, useWatchlist } from "../lib/watchlist";
import { analystLabel, techLabel } from "../lib/indicators";
import { fmtBig, fmtInt, fmtNum, fmtPct, fmtPrice, fmtSignedPct, ratingClass, signClass } from "../lib/format";
import "./watchlist.css";

type Key = "ticker" | "name" | "price" | "changePct" | "volume" | "marketCap" | "pe" | "divYield" | "perfW" | "perfM" | "perfYTD" | "techScore" | "recom";
interface Col {
  key: Key;
  label: string;
  num?: boolean;
  title?: string;
}
const COLS: Col[] = [
  { key: "ticker", label: "Simbol" },
  { key: "name", label: "Companie" },
  { key: "price", label: "Preț", num: true },
  { key: "changePct", label: "Schimb.", num: true, title: "Variația față de ședința anterioară" },
  { key: "volume", label: "Volum", num: true },
  { key: "marketCap", label: "Market Cap", num: true },
  { key: "pe", label: "P/E", num: true },
  { key: "divYield", label: "Div. Yield", num: true },
  { key: "perfW", label: "Săpt.", num: true, title: "Evoluția pe ultima săptămână" },
  { key: "perfM", label: "Lună", num: true, title: "Evoluția pe ultima lună" },
  { key: "perfYTD", label: "YTD", num: true, title: "De la începutul anului" },
  { key: "techScore", label: "Technical", num: true, title: "Rating tehnic calculat mecanic din indicatori" },
  { key: "recom", label: "Analyst", title: "Consensul analiștilor (Yahoo Finance); sortat de la cel mai bun" },
];

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

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function AddBox({ rows, have }: { rows: IndexRow[]; have: string[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    const m = rows.filter((r) => !have.includes(r.ticker) && (norm(r.ticker).startsWith(n) || norm(r.name).includes(n)));
    m.sort((a, b) => Number(norm(b.ticker).startsWith(n)) - Number(norm(a.ticker).startsWith(n)) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return m.slice(0, 8);
  }, [q, rows, have]);
  const pick = (r: IndexRow) => {
    toggleWatch(r.ticker);
    setQ("");
    setHi(0);
  };
  const alreadyHave = q.trim() !== "" && matches.length === 0 && rows.some((r) => have.includes(r.ticker) && (norm(r.ticker) === norm(q.trim()) || norm(r.name).includes(norm(q.trim()))));
  return (
    <div className="wl-add">
      <label htmlFor="wl-add-in">Adaugă</label>
      <div className="wl-add-box">
        <input
          id="wl-add-in"
          type="text"
          autoComplete="off"
          placeholder="Simbol sau companie…"
          value={q}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="wl-add-list"
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
          <ul id="wl-add-list" role="listbox" className="wl-suggest">
            {matches.map((r, i) => (
              <li key={r.ticker} role="option" aria-selected={i === hi} className={i === hi ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
                <b>{r.ticker}</b>
                <span>{r.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {alreadyHave && <span className="dim">Deja în listă.</span>}
      {q.trim() !== "" && matches.length === 0 && !alreadyHave && <span className="dim">Nicio potrivire.</span>}
    </div>
  );
}

export function Watchlist({ index }: { index: IndexFile | null }) {
  const { convert, unit } = useSettings();
  const list = useWatchlist();
  const [sort, setSort] = useState<{ key: Key; desc: boolean } | null>(null);
  const [sel, setSel] = useState<string[]>([]);

  const rows = index?.rows ?? [];
  const byTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows]);

  const ordered = useMemo(() => {
    const items = list.map((t) => ({ t, r: byTicker.get(t) ?? null }));
    if (!sort) return items;
    const { key, desc } = sort;
    const val = (r: IndexRow | null): number | string | null => {
      if (!r) return null;
      const v = r[key];
      return typeof v === "number" || typeof v === "string" ? v : null;
    };
    return [...items].sort((a, b) => {
      const x = val(a.r);
      const y = val(b.r);
      if (x == null && y == null) return 0;
      if (x == null) return 1; // missing data always last
      if (y == null) return -1;
      const c = typeof x === "string" ? x.localeCompare(String(y), "ro") : (x as number) - (y as number);
      // Analyst: 1 = best, so "descending" should list the best first.
      const flip = key === "recom" ? !desc : desc;
      return flip ? -c : c;
    });
  }, [list, byTicker, sort]);

  const live = ordered.filter((x) => x.r).map((x) => x.r as IndexRow);
  const up = live.filter((r) => (r.changePct ?? 0) > 0).length;
  const down = live.filter((r) => (r.changePct ?? 0) < 0).length;
  const withChg = live.filter((r) => r.changePct != null);
  const avg = withChg.length ? withChg.reduce((s, r) => s + (r.changePct as number), 0) / withChg.length : null;

  const clickSort = (c: Col) => {
    const first = c.num && c.key !== "recom" ? true : false; // numbers start with the highest
    setSort((s) => (!s || s.key !== c.key ? { key: c.key, desc: first } : s.desc === first ? { key: c.key, desc: !first } : null));
  };

  const move = (t: string, d: -1 | 1) => {
    const i = list.indexOf(t);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setWatchlist(next);
  };

  const available = list.filter((t) => byTicker.has(t));
  const picked = sel.filter((t) => available.includes(t));
  const toCompare = (picked.length ? picked : available).slice(0, 6);

  if (list.length === 0) {
    const sugg = [...rows].filter((r) => r.index === "BET").sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 6);
    const fallback = sugg.length ? sugg : [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 6);
    return (
      <main className="wrap stack watchlist">
        <div className="sec-head">
          <h1>Favorite</h1>
        </div>
        <div className="panel empty wl-empty">
          <svg viewBox="0 0 20 20" width="34" height="34" aria-hidden="true" className="wl-bigstar">
            <path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.7l-5.1 2.8L6 11.8l-4.2-4 5.7-.7z" />
          </svg>
          <h2>Nicio acțiune urmărită încă</h2>
          <p>Apasă steluța de lângă un simbol, în tabelul de pe prima pagină sau pe pagina unei acțiuni, ca să o adaugi aici. Sau începe cu câteva dintre cele mai mari companii din BET:</p>
          <div className="wl-sugg">
            {fallback.map((r) => (
              <button key={r.ticker} type="button" onClick={() => toggleWatch(r.ticker)} title={r.name}>
                + {r.ticker}
              </button>
            ))}
            {fallback.length > 0 && (
              <button type="button" className="all" onClick={() => setWatchlist(fallback.map((r) => r.ticker))}>
                Adaugă-le pe toate
              </button>
            )}
          </div>
          <div className="wl-empty-add">
            <AddBox rows={rows} have={list} />
          </div>
        </div>
        <p className="dim wl-note">Lista se păstrează doar în acest browser (localStorage). Nu există cont și nu se trimite nimic către un server.</p>
      </main>
    );
  }

  return (
    <main className="wrap stack watchlist">
      <div className="sec-head wl-head">
        <h1>
          Favorite <small>{list.length} {list.length === 1 ? "simbol" : "simboluri"}</small>
        </h1>
        <div className="wl-summary" aria-live="polite">
          {live.length > 0 ? (
            <>
              Azi: <b className="pos">{up} în creștere</b> · <b className="neg">{down} în scădere</b> · medie{" "}
              <b className={signClass(avg)}>{fmtSignedPct(avg)}</b>
            </>
          ) : (
            <span className="dim">Fără date de preț.</span>
          )}
        </div>
      </div>

      <div className="wl-bar">
        <AddBox rows={rows} have={list} />
        <div className="wl-actions">
          <a
            className={`wl-btn${toCompare.length < 2 ? " disabled" : ""}`}
            href={toCompare.length < 2 ? undefined : compareHref(toCompare)}
            aria-disabled={toCompare.length < 2}
            title={toCompare.length < 2 ? "Alege cel puțin două simboluri" : `Compară ${toCompare.join(", ")}`}
          >
            Compară {picked.length ? `(${Math.min(picked.length, 6)})` : toCompare.length >= 2 ? `(primele ${toCompare.length})` : ""}
          </a>
          {sort && (
            <button type="button" className="wl-btn" onClick={() => setSort(null)} title="Revino la ordinea ta">
              Ordinea mea
            </button>
          )}
        </div>
      </div>

      <div className="panel wl-table">
        <table>
          <thead>
            <tr>
              <th className="sel" aria-label="Selectare pentru comparare" />
              {COLS.map((c) => (
                <th key={c.key} className={c.num ? "num" : ""} title={c.title} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <button type="button" onClick={() => clickSort(c)}>
                    {c.label}
                    <i>{sort?.key === c.key ? (sort.desc ? "▼" : "▲") : ""}</i>
                  </button>
                </th>
              ))}
              <th>30 zile</th>
              <th className="act" aria-label="Acțiuni" />
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ t, r }, i) => {
              const controls = (
                <>
                  <button type="button" disabled={!!sort || i === 0} onClick={() => move(t, -1)} aria-label={`Mută ${t} mai sus`} title={sort ? "Dezactivează sortarea ca să reordonezi" : "Mai sus"}>
                    ↑
                  </button>
                  <button type="button" disabled={!!sort || i === ordered.length - 1} onClick={() => move(t, 1)} aria-label={`Mută ${t} mai jos`} title={sort ? "Dezactivează sortarea ca să reordonezi" : "Mai jos"}>
                    ↓
                  </button>
                  <button type="button" className="rm" onClick={() => toggleWatch(t)} aria-label={`Elimină ${t} din favorite`} title="Elimină">
                    ✕
                  </button>
                </>
              );
              if (!r) {
                return (
                  <tr key={t} className="gone">
                    <td className="sel" />
                    <td>{t}</td>
                    <td colSpan={COLS.length - 1} className="dim">
                      Indisponibil: simbolul nu mai există în datele curente.
                    </td>
                    <td />
                    <td className="act">{controls}</td>
                  </tr>
                );
              }
              const tl = techLabel(r.techScore);
              const al = analystLabel(r.recom);
              return (
                <tr key={t} onClick={() => go(stockHref(t))}>
                  <td className="sel" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={sel.includes(t)}
                      onChange={(e) => setSel((s) => (e.target.checked ? [...s, t] : s.filter((x) => x !== t)))}
                      aria-label={`Selectează ${t} pentru comparare`}
                    />
                  </td>
                  <td>
                    <a href={stockHref(t)} onClick={(e) => e.stopPropagation()}>
                      {t}
                    </a>
                  </td>
                  <td className="co" title={r.sector}>{r.name}</td>
                  <td className="num"><b>{fmtPrice(r.price == null ? null : convert(r.price))}</b></td>
                  <td className={`num ${signClass(r.changePct)}`}>{fmtSignedPct(r.changePct)}</td>
                  <td className="num" title={r.volume != null && r.price != null ? `Valoare tranzacționată: ${fmtBig(convert(r.volume * r.price))} ${unit()}` : undefined}>{fmtInt(r.volume)}</td>
                  <td className="num">{fmtBig(r.marketCap == null ? null : convert(r.marketCap))}</td>
                  <td className="num">{fmtNum(r.pe)}</td>
                  <td className="num">{r.divYield ? fmtPct(r.divYield) : "-"}</td>
                  <td className={`num ${signClass(r.perfW)}`}>{fmtSignedPct(r.perfW)}</td>
                  <td className={`num ${signClass(r.perfM)}`}>{fmtSignedPct(r.perfM)}</td>
                  <td className={`num ${signClass(r.perfYTD)}`}>{fmtSignedPct(r.perfYTD)}</td>
                  <td className={`num rate ${ratingClass(tl)}`}>{tl ?? "-"}</td>
                  <td className={`rate ${ratingClass(al)}`} title={r.recom != null ? `Medie ${fmtNum(r.recom)} din 5` : "Fără acoperire de analiști"}>{al ?? "-"}</td>
                  <td><Spark values={r.spark} /></td>
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    {controls}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dim wl-note">
        Lista se păstrează doar în acest browser (localStorage); nu există cont și nu se trimite nimic către un server. Prețuri în {unit()}, date întârziate.
      </p>
    </main>
  );
}
