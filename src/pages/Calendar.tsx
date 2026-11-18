import { useEffect, useMemo, useState } from "react";
import { Star } from "../components/Star";
import { dataUrl, useJson } from "../lib/data";
import { DASH, fmtNum, fmtPct } from "../lib/format";
import { readHashQuery, stockHref, writePageQuery } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { CalendarEvent, CalendarFile, IndexFile } from "../lib/types";
import { useWatchlist } from "../lib/watchlist";
import "./calendar.css";

type View = "next" | "grid" | "past";
type TypeFilter = "all" | "dividend" | "earnings";

const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const MON_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const WEEKDAYS_LONG = ["luni", "marți", "miercuri", "joi", "vineri", "sâmbătă", "duminică"];
const PAGE = 40;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
/** Monday = 0 */
const wd = (d: Date) => (d.getDay() + 6) % 7;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(d, -wd(d));
const longDay = (s: string) => {
  const d = parse(s);
  return `${WEEKDAYS_LONG[wd(d)]}, ${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};
const shortDay = (s: string) => {
  const d = parse(s);
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
};
function weekTitle(mon: Date, thisMon: Date): string {
  const sun = addDays(mon, 6);
  const range =
    mon.getMonth() === sun.getMonth()
      ? `${mon.getDate()}–${sun.getDate()} ${MON_SHORT[mon.getMonth()]}`
      : `${mon.getDate()} ${MON_SHORT[mon.getMonth()]} – ${sun.getDate()} ${MON_SHORT[sun.getMonth()]}`;
  const diff = Math.round((mon.getTime() - thisMon.getTime()) / (7 * 864e5));
  const tag = diff === 0 ? "Săptămâna aceasta" : diff === 1 ? "Săptămâna viitoare" : "Săptămâna";
  return `${tag} · ${range} ${sun.getFullYear()}`;
}

const TYPE_LABEL = { dividend: "Dividend", earnings: "Rezultate" } as const;

function Chip({ type }: { type: CalendarEvent["type"] }) {
  return <span className={`cal-chip ${type}`}>{TYPE_LABEL[type]}</span>;
}

export function Calendar(_props: { index: IndexFile | null }) {
  const { data, loading } = useJson<CalendarFile>(dataUrl("calendar.json"));
  const { convert, unit } = useSettings();
  const watch = useWatchlist();

  const q0 = useMemo(() => readHashQuery(), []);
  const todayIso = iso(new Date());
  const [view, setView] = useState<View>((["next", "grid", "past"] as const).find((v) => v === q0.get("v")) ?? "next");
  const [type, setType] = useState<TypeFilter>((["dividend", "earnings"] as const).find((v) => v === q0.get("type")) ?? "all");
  const [fav, setFav] = useState(q0.get("fav") === "1");
  const [text, setText] = useState(q0.get("q") ?? "");
  const [month, setMonth] = useState(/^\d{4}-\d{2}$/.test(q0.get("m") ?? "") ? q0.get("m")! : todayIso.slice(0, 7));
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "next") p.set("v", view);
    if (view === "grid" && month !== todayIso.slice(0, 7)) p.set("m", month);
    if (type !== "all") p.set("type", type);
    if (fav) p.set("fav", "1");
    if (text.trim()) p.set("q", text.trim());
    writePageQuery("calendar", p);
  }, [view, month, type, fav, text, todayIso]);

  const all = data?.events ?? [];
  const filtered = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return all
      .filter((e) => type === "all" || e.type === type)
      .filter((e) => !fav || watch.includes(e.ticker))
      .filter((e) => !needle || e.ticker.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle))
      .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  }, [all, type, fav, watch, text]);

  const upcoming = useMemo(() => filtered.filter((e) => e.date >= todayIso), [filtered, todayIso]);
  const past = useMemo(() => filtered.filter((e) => e.date < todayIso).reverse(), [filtered, todayIso]);

  const favNext = useMemo(() => {
    const mine = all.filter((e) => e.date >= todayIso && watch.includes(e.ticker)).sort((a, b) => a.date.localeCompare(b.date));
    return {
      div: mine.filter((e) => e.type === "dividend").slice(0, 4),
      earn: mine.filter((e) => e.type === "earnings").slice(0, 4),
    };
  }, [all, watch, todayIso]);

  const money = (e: CalendarEvent) =>
    e.type === "dividend" && e.amount != null ? `${fmtNum(convert(e.amount, "RON"), 4)} ${unit("RON")}` : DASH;

  function Row({ e }: { e: CalendarEvent }) {
    return (
      <li className={`cal-row${e.date === todayIso ? " today" : ""}`}>
        <span className="cal-date num">{shortDay(e.date)}</span>
        <Chip type={e.type} />
        <span className="cal-who">
          <a href={stockHref(e.ticker)} className="cal-tk">{e.ticker}</a>
          <span className="cal-co" title={e.name}>{e.name}</span>
        </span>
        <span className="cal-amt num">{e.type === "dividend" ? money(e) : ""}</span>
        <span className="cal-yld num dim">{e.type === "dividend" && e.yield != null ? fmtPct(e.yield) : ""}</span>
        <Star ticker={e.ticker} small />
      </li>
    );
  }

  const groups = useMemo(() => {
    const thisMon = monday(parse(todayIso));
    const out: { key: string; title: string; items: CalendarEvent[] }[] = [];
    for (const e of upcoming) {
      const mon = monday(parse(e.date));
      const key = iso(mon);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, title: weekTitle(mon, thisMon), items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [upcoming, todayIso]);

  // Month grid
  const [my, mm] = month.split("-").map(Number);
  const first = new Date(my, mm - 1, 1);
  const gridStart = addDays(first, -wd(first));
  const weeks = Math.ceil((wd(first) + new Date(my, mm, 0).getDate()) / 7);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of filtered) (m.get(e.date) ?? m.set(e.date, []).get(e.date)!).push(e);
    return m;
  }, [filtered]);
  const shiftMonth = (n: number) => {
    const d = new Date(my, mm - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const monthEvents = filtered.filter((e) => e.date.startsWith(month));

  const views: [View, string][] = [["next", "Urmează"], ["grid", "Lună"], ["past", "Istoric"]];

  return (
    <main className="wrap stack cal">
      <header className="sec-head">
        <h1>Calendar</h1>
        <span className="dim">Dividende și rezultate ale companiilor de la BVB</span>
      </header>

      {(favNext.div.length > 0 || favNext.earn.length > 0) && (
        <section className="panel cal-sum">
          <div>
            <h2>Următoarele ex-dividend (favorite)</h2>
            {favNext.div.length ? (
              <ul>
                {favNext.div.map((e) => (
                  <li key={e.ticker + e.date}>
                    <a href={stockHref(e.ticker)} className="cal-tk">{e.ticker}</a>
                    <span className="num">{shortDay(e.date)}</span>
                    <span className="num dim">{money(e)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">Niciun dividend programat.</p>
            )}
          </div>
          <div>
            <h2>Următoarele rezultate (favorite)</h2>
            {favNext.earn.length ? (
              <ul>
                {favNext.earn.map((e) => (
                  <li key={e.ticker + e.date}>
                    <a href={stockHref(e.ticker)} className="cal-tk">{e.ticker}</a>
                    <span className="num">{shortDay(e.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim">Nicio dată de rezultate programată.</p>
            )}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head cal-ctl">
          <div className="seg" role="group" aria-label="Vedere">
            {views.map(([v, l]) => (
              <button key={v} type="button" className={view === v ? "on" : ""} onClick={() => { setView(v); setShown(PAGE); }}>{l}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Tip">
            {([["all", "Toate"], ["dividend", "Dividende"], ["earnings", "Rezultate"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={type === v ? "on" : ""} onClick={() => setType(v)}>{l}</button>
            ))}
          </div>
          <label className="cal-fav">
            <input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} /> Doar favorite
          </label>
          <input
            className="cal-q"
            type="search"
            placeholder="Simbol sau companie"
            aria-label="Filtrează după simbol sau companie"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="empty">Se încarcă…</div>
        ) : !data ? (
          <div className="empty">Calendarul nu este disponibil în acest snapshot.</div>
        ) : view === "next" ? (
          groups.length === 0 ? (
            <div className="empty">
              {all.some((e) => e.date >= todayIso)
                ? "Niciun eveniment viitor nu corespunde filtrelor."
                : "Niciun eveniment viitor în calendar."}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="cal-group">
                <h3>{g.title}</h3>
                <ul className="cal-list">{g.items.map((e, i) => <Row key={i} e={e} />)}</ul>
              </div>
            ))
          )
        ) : view === "past" ? (
          past.length === 0 ? (
            <div className="empty">Niciun eveniment trecut{filtered.length !== all.length ? " pentru filtrele alese" : ""}.</div>
          ) : (
            <div className="cal-group">
              <ul className="cal-list">
                {past.slice(0, shown).map((e, i) => <Row key={i} e={e} />)}
              </ul>
              {shown < past.length && (
                <div className="cal-more">
                  <button type="button" className="link-btn" onClick={() => setShown((n) => n + PAGE)}>
                    Arată mai multe ({past.length - shown})
                  </button>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="cal-month">
            <div className="cal-nav">
              <button type="button" aria-label="Luna precedentă" onClick={() => shiftMonth(-1)}>‹</button>
              <strong>{MONTHS[mm - 1]} {my}</strong>
              <button type="button" aria-label="Luna următoare" onClick={() => shiftMonth(1)}>›</button>
              {month !== todayIso.slice(0, 7) && (
                <button type="button" className="link-btn" onClick={() => setMonth(todayIso.slice(0, 7))}>Azi</button>
              )}
            </div>
            <div className="cal-grid">
              {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
              {Array.from({ length: weeks * 7 }, (_, i) => {
                const d = addDays(gridStart, i);
                const k = iso(d);
                const evs = byDay.get(k) ?? [];
                const out = d.getMonth() !== mm - 1;
                return (
                  <div key={k} className={`cal-cell${out ? " out" : ""}${k === todayIso ? " today" : ""}`}>
                    <span className="cal-dn num">{d.getDate()}</span>
                    {evs.map((e, j) => (
                      <a key={j} href={stockHref(e.ticker)} className={`cal-ev ${e.type}`} title={`${TYPE_LABEL[e.type]} ${e.ticker} – ${e.name}`}>
                        {e.ticker}
                      </a>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="cal-agenda">
              {monthEvents.length === 0 ? (
                <div className="empty small">Niciun eveniment în {MONTHS[mm - 1]}.</div>
              ) : (
                <ul className="cal-list">
                  {monthEvents.map((e, i) => (
                    <Row key={i} e={e} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <p className="cal-note dim">
        Datele provin de la Yahoo Finance și se pot modifica. Data ex-dividend (ex-date) este ziua de la care acțiunea se
        tranzacționează fără dividend: cine cumpără din acea zi nu mai primește dividendul.
        {data?.updatedAt ? ` Actualizat: ${longDay(data.updatedAt.slice(0, 10))}.` : ""}
      </p>
    </main>
  );
}
