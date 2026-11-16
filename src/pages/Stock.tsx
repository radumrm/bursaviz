import { useEffect } from "react";
import { MiniBars } from "../components/MiniBars";
import { News } from "../components/News";
import { Ratings } from "../components/Ratings";
import { PriceChart } from "../components/PriceChart";
import { Sankey } from "../components/Sankey";
import { SnapshotTable } from "../components/SnapshotTable";
import { Statements } from "../components/Statements";
import { dataUrl, useJson } from "../lib/data";
import { fmtNum, fmtPct, fmtPrice, fmtSignedPct, signClass } from "../lib/format";
import { rememberTf, stockHref } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { BarsFile, IndexFile, StockFile } from "../lib/types";

const SECTIONS: [id: string, label: string][] = [
  ["chart", "Grafic"],
  ["snapshot", "Indicatori"],
  ["news", "Știri"],
  ["breakdown", "Venituri și cheltuieli"],
  ["financials", "Situații financiare"],
  ["company", "Companie"],
];

const quoteFmt = new Intl.DateTimeFormat("ro-RO", {
  timeZone: "Europe/Bucharest", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

function capSize(marketCap: number | null): string | null {
  if (marketCap == null) return null;
  if (marketCap >= 20e9) return "Large Cap";
  if (marketCap >= 2e9) return "Mid Cap";
  if (marketCap >= 300e6) return "Small Cap";
  return "Micro Cap";
}

const TILE_HUES = [212, 262, 158, 28, 338, 190, 48, 280];
function tileColour(ticker: string): string {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${TILE_HUES[h % TILE_HUES.length]} 52% 42%)`;
}

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function Stock({ ticker, tf, index }: { ticker: string; tf: string | null; index: IndexFile | null }) {
  const stock = useJson<StockFile>(dataUrl(`stocks/${ticker}.json`));
  const bars = useJson<BarsFile>(dataUrl(`bars/${ticker}.json`));
  const { convert, unit } = useSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [ticker]);

  useEffect(() => {
    if (stock.data) {
      const p = stock.data.snapshot.price;
      document.title = `${stock.data.ticker} ${fmtPrice(typeof p === "number" ? convert(p, stock.data.currency) : null)} — ${stock.data.name} · BursaViz`;
    }
    return () => {
      document.title = "BursaViz — acțiunile de la BVB";
    };
  }, [stock.data, convert]);

  if (stock.loading) return <main className="wrap state">Se încarcă {ticker}…</main>;
  if (!stock.data) {
    return (
      <main className="wrap state">
        <h1>Nu am date pentru „{ticker}”</h1>
        <p>
          Simbolul nu este în instantaneul curent. Dacă există pe BVB, adaugă-l în <code>scripts/tickers.ts</code> și rulează{" "}
          <code>npm run scrape -- {ticker}</code>.
        </p>
        <a className="link-btn" href="#/">← Înapoi la piață</a>
      </main>
    );
  }

  const s = stock.data;
  const snap = s.snapshot;
  const rawPrice = snap.price as number | null;
  const rawChange = snap.change as number | null;
  const price = rawPrice == null ? null : convert(rawPrice, s.currency);
  const change = rawChange == null ? null : convert(rawChange, s.currency);
  const changePct = snap.changePct as number | null;
  const size = capSize(snap.marketCap as number | null);
  const peers = (index?.rows ?? []).filter((r) => r.sector === s.sector && r.ticker !== s.ticker).slice(0, 10);
  const annual = s.statements.annual;
  const insider = snap.insiderOwn as number | null;
  const inst = snap.instOwn as number | null;

  return (
    <main>
      <div className="tk-head">
        <div className="wrap">
          <div className="tk-top">
            <div className="tk-id">
              <span className="tile" style={{ background: tileColour(s.ticker) }} aria-hidden="true">{s.ticker.slice(0, 2)}</span>
              <h1>{s.ticker}</h1>
              <span className="tk-name">{s.name}</span>
            </div>
            <div className="tk-quote">
              <strong>{fmtPrice(price)}</strong>
              <div>
                <small>{s.quoteTime ? quoteFmt.format(new Date(s.quoteTime)) : ""} · {unit(s.currency)}</small>
                <span className={signClass(change)}>
                  {change != null ? (change > 0 ? "+" : "") + fmtNum(change, Math.abs(price ?? 1) < 1 ? 4 : 2) : "-"} ({fmtSignedPct(changePct)})
                </span>
              </div>
            </div>
          </div>
          <div className="tk-bar">
            <nav aria-label="Secțiuni">
              {SECTIONS.map(([id, label], i) => (
                <button key={id} className={i === 0 ? "on" : ""} onClick={() => jump(id)}>{label}</button>
              ))}
            </nav>
            <ul className="tags">
              <li>{s.sector}</li>
              {s.industry && <li>{s.industry}</li>}
              <li>România</li>
              {size && <li>{size}</li>}
              {s.index && <li>{s.index}</li>}
              <li>BVB</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="wrap stack">
        <div id="chart" className="anchor">
          {bars.data ? (
            <PriceChart key={s.ticker} bars={bars.data} initialTf={tf} onTf={(next) => rememberTf(s.ticker, next)} />
          ) : (
            <section className="panel"><div className="empty">{bars.loading ? "Se încarcă graficul…" : "Nu am istoric de preț pentru acest simbol."}</div></section>
          )}
        </div>

        <div id="snapshot" className="anchor">
          {peers.length > 0 && (
            <p className="peers">
              <span>Peers</span>
              {peers.map((p) => (
                <a key={p.ticker} href={stockHref(p.ticker)} title={p.name}>{p.ticker}</a>
              ))}
            </p>
          )}
          <SnapshotTable stock={s} />
        </div>

        <Ratings stock={s} />

        <MiniBars annual={annual} currency={s.statementsCurrency ?? s.currency} />

        <div className="anchor">
          <News news={s.news} daily={bars.data?.d ?? []} />
          <p className="foot-note">Știri din Google News. Eticheta colorată arată variația acțiunii în ziua respectivă, când a depășit ±2%.</p>
        </div>

        <Sankey key={`sk-${s.ticker}`} annual={annual} currency={s.statementsCurrency ?? s.currency} />
        <Statements key={`st-${s.ticker}`} stock={s} />

        <section className="company" id="company">
          <div className="panel about">
            <p>{s.profile.description || "Yahoo Finance nu are o descriere pentru această companie."}</p>
          </div>
          <div className="panel own">
            <h2>Acționariat</h2>
            <dl>
              <div><dt>Insideri</dt><dd>{fmtPct(insider)}</dd></div>
              <div><dt>Instituții</dt><dd>{fmtPct(inst)}</dd></div>
              {insider != null && inst != null && (
                <div><dt>Restul pieței</dt><dd>{fmtPct(Math.max(0, 1 - insider - inst))}</dd></div>
              )}
            </dl>
            {s.profile.city && <p className="hq">Sediu: {s.profile.city}, România</p>}
          </div>
          <div className="panel officers">
            {s.profile.officers.length === 0 && <div className="empty small">Fără date despre conducere</div>}
            {s.profile.officers.map((o) => (
              <div key={o.name + o.title}>
                <small>{o.title}</small>
                <b>{o.name}</b>
              </div>
            ))}
          </div>
        </section>

        <p className="ext-links">
          <a href={`https://finance.yahoo.com/quote/${s.yahoo}`} target="_blank" rel="noreferrer noopener">deschide în Yahoo</a>
          <a href={`https://bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=${s.ticker}`} target="_blank" rel="noreferrer noopener">deschide pe bvb.ro</a>
          {s.profile.website && <a href={s.profile.website} target="_blank" rel="noreferrer noopener">site-ul companiei</a>}
        </p>
      </div>
    </main>
  );
}
