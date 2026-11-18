import { useMemo } from "react";
import { compareSet, median, sectorPeers } from "../lib/compare";
import { fmtBig, fmtNum, fmtPct, fmtSignedPct, ratingClass, signClass } from "../lib/format";
import { techLabel } from "../lib/indicators";
import { compareHref, go, stockHref } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { IndexFile, IndexRow, StockFile } from "../lib/types";
import "./peers.css";

const COMPARE_SIZE = 5;

/** The stock against the rest of its sector, from the index rows only (no extra fetches). */
export function PeersTable({ stock, index }: { stock: StockFile; index: IndexFile | null }) {
  const { convert, unit } = useSettings();
  const rows = index?.rows ?? [];
  const peers = useMemo(() => sectorPeers(rows, stock.ticker), [rows, stock.ticker]);
  if (!peers.length) return null;

  const med = {
    marketCap: median(peers.map((r) => r.marketCap)),
    pe: median(peers.map((r) => (r.pe != null && r.pe > 0 ? r.pe : null))),
    divYield: median(peers.map((r) => r.divYield)),
    changePct: median(peers.map((r) => r.changePct)),
    perfYTD: median(peers.map((r) => r.perfYTD)),
    perfY: median(peers.map((r) => r.perfY)),
    techScore: median(peers.map((r) => r.techScore)),
  };
  const cmp = compareSet(rows, stock.ticker, COMPARE_SIZE);
  const rank = peers.findIndex((r) => r.ticker === stock.ticker) + 1;
  const money = (x: number | null) => (x == null ? null : convert(x));

  const tech = (score: number | null) => {
    const l = techLabel(score);
    return <span className={ratingClass(l)} title={score != null ? `scor ${fmtNum(score, 2)}` : undefined}>{l ?? "-"}</span>;
  };

  const line = (r: IndexRow, i: number) => {
    const self = r.ticker === stock.ticker;
    return (
      <tr
        key={r.ticker}
        className={self ? "pt-self" : undefined}
        aria-current={self ? "true" : undefined}
        onClick={self ? undefined : () => go(stockHref(r.ticker))}
      >
        <td className="num dim">{i + 1}</td>
        <th scope="row">{self ? r.ticker : <a href={stockHref(r.ticker)} onClick={(e) => e.stopPropagation()}>{r.ticker}</a>}</th>
        <td className="co" title={r.name}>{r.name}</td>
        <td className="num">{fmtBig(money(r.marketCap))}</td>
        <td className="num">{r.pe == null ? "-" : <span className={r.pe < 0 ? "neg" : ""}>{fmtNum(r.pe, 2)}</span>}</td>
        <td className="num">{fmtPct(r.divYield)}</td>
        <td className={`num ${signClass(r.changePct)}`}>{fmtSignedPct(r.changePct)}</td>
        <td className={`num ${signClass(r.perfYTD)}`}>{fmtSignedPct(r.perfYTD)}</td>
        <td className={`num ${signClass(r.perfY)}`}>{fmtSignedPct(r.perfY)}</td>
        <td>{tech(r.techScore)}</td>
      </tr>
    );
  };

  return (
    <section className="panel pt" aria-labelledby="pt-title">
      <div className="panel-head">
        <h2 id="pt-title">
          Comparație în sector <small>{stock.sector} · locul {rank} din {peers.length} după Market Cap</small>
        </h2>
        <a className="pt-cmp" href={compareHref(cmp)}>Compară în detaliu →</a>
      </div>
      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Simbol</th>
              <th scope="col">Companie</th>
              <th scope="col" className="num" title={`În ${unit()}`}>Market Cap</th>
              <th scope="col" className="num">P/E</th>
              <th scope="col" className="num">Div. Yield</th>
              <th scope="col" className="num" title="Variația față de ședința anterioară">Schimb.</th>
              <th scope="col" className="num" title="De la începutul anului">YTD</th>
              <th scope="col" className="num" title="Ultimele 12 luni">1 an</th>
              <th scope="col">Technical</th>
            </tr>
          </thead>
          <tbody>{peers.map(line)}</tbody>
          <tfoot>
            <tr className="pt-median">
              <td />
              <th scope="row" title="Mediana sectorului, inclusiv această acțiune; P/E doar din valorile pozitive">Mediană</th>
              <td>sector, {peers.length} companii</td>
              <td className="num">{fmtBig(money(med.marketCap))}</td>
              <td className="num">{fmtNum(med.pe, 2)}</td>
              <td className="num">{fmtPct(med.divYield)}</td>
              <td className={`num ${signClass(med.changePct)}`}>{fmtSignedPct(med.changePct)}</td>
              <td className={`num ${signClass(med.perfYTD)}`}>{fmtSignedPct(med.perfYTD)}</td>
              <td className={`num ${signClass(med.perfY)}`}>{fmtSignedPct(med.perfY)}</td>
              <td>{tech(med.techScore)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
