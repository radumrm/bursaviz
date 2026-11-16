import { useMemo, useRef, useState } from "react";
import { fmtDate, fmtPrice, fmtSignedPct, signClass } from "../lib/format";
import { go, stockHref } from "../lib/router";
import { CURRENCIES, useSettings } from "../lib/settings";
import type { IndexFile } from "../lib/types";

const NO_FX = "Cursul valutar lipsește — rulează npm run scrape";

export function Header({ index }: { index: IndexFile | null }) {
  const { theme, setTheme, currency, setCurrency, fxReady, convert } = useSettings();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !index) return [];
    const starts = index.rows.filter((r) => r.ticker.toLowerCase().startsWith(needle));
    const rest = index.rows.filter(
      (r) => !r.ticker.toLowerCase().startsWith(needle) && (r.name.toLowerCase().includes(needle) || r.ticker.toLowerCase().includes(needle)),
    );
    return [...starts, ...rest].slice(0, 8);
  }, [q, index]);

  const pick = (ticker: string) => {
    go(stockHref(ticker));
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      pick(hits[active].ticker);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <header className="site-head">
      <div className="wrap">
        <a className="logo" href="#/" aria-label="BursaViz — pagina principală">
          bursa<span>viz</span>
          <em>BVB</em>
        </a>

        <div className="search">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4.5 4.5" /></svg>
          <input
            ref={inputRef}
            value={q}
            placeholder="Caută simbol sau companie"
            aria-label="Caută simbol sau companie"
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKey}
          />
          {open && q.trim() && (
            <ul className="hits" role="listbox">
              {hits.length === 0 && <li className="none">Niciun rezultat pentru „{q.trim()}”</li>}
              {hits.map((r, i) => (
                <li
                  key={r.ticker}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "on" : ""}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r.ticker);
                  }}
                >
                  <b>{r.ticker}</b>
                  <span>{r.name}</span>
                  <i>{fmtPrice(r.price == null ? null : convert(r.price))}</i>
                  <i className={signClass(r.changePct)}>{fmtSignedPct(r.changePct)}</i>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="site-nav">
          <a href="#/">Piață</a>
        </nav>
        <div className="head-ctl">
          <div className="seg" role="group" aria-label="Moneda de afișare" title={fxReady ? undefined : NO_FX}>
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                className={c === currency ? "on" : ""}
                aria-pressed={c === currency}
                disabled={!fxReady}
                title={fxReady ? undefined : NO_FX}
                onClick={() => setCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="theme-btn"
            aria-label={theme === "dark" ? "Comută pe tema deschisă" : "Comută pe tema închisă"}
            title={theme === "dark" ? "Tema deschisă" : "Tema închisă"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="3.6" />
                <path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3z" />
              </svg>
            )}
          </button>
        </div>
        {index && <div className="asof">Date la {fmtDate(index.updatedAt)}</div>}
      </div>
    </header>
  );
}
