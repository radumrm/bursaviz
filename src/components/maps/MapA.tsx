import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { HierarchyRectangularNode } from "d3-hierarchy";
import { fmtBig, fmtPrice, fmtSignedPct } from "../../lib/format";
import { stockHref } from "../../lib/router";
import { useSettings } from "../../lib/settings";
import type { IndexRow } from "../../lib/types";

interface Datum {
  name: string;
  row?: IndexRow;
  children?: Datum[];
}

const NEUTRAL_DARK = [65, 69, 84];
const NEUTRAL_LIGHT = [118, 126, 146];
const GREEN = [48, 190, 96];
const RED = [240, 62, 68];
const FULL_AT = 0.03;
const SECTOR_LABEL = 17;
const MIN_W = 30; // a tile narrower or shorter than this cannot carry a readable ticker
const MIN_H = 16;

function colour(change: number | null, neutral: number[]): string {
  if (change == null) return `rgb(${neutral.join(",")})`;
  const t = Math.min(1, Math.abs(change) / FULL_AT);
  const to = change >= 0 ? GREEN : RED;
  return `rgb(${neutral.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
}

const CSS = `
.ma-wrap { position: relative; }
.ma-map { position: relative; background: var(--bg-deep); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.ma-sector { position: absolute; overflow: hidden; pointer-events: none; }
.ma-sector span { display: block; padding: 2px 4px 0; font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ma-cell { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: #fff; line-height: 1.1; text-shadow: 0 1px 1px rgba(0,0,0,.35); }
.ma-cell:hover { text-decoration: none; outline: 2px solid #fff; outline-offset: -2px; z-index: 2; }
.ma-cell b { font-weight: 900; }
.ma-cell span { font-size: .56em; font-weight: 700; }
.ma-cap { margin: 6px 2px 0; font-size: 11.5px; color: var(--muted); }
.ma-tip { position: absolute; z-index: 5; pointer-events: none; background: var(--bg-raised); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; font-size: 12px; line-height: 1.45; box-shadow: 0 6px 20px rgba(0,0,0,.35); white-space: nowrap; }
.ma-tip strong { font-size: 13px; }
.ma-tip .ma-g { color: var(--green); } .ma-tip .ma-r { color: var(--red); }
.ma-over { margin-top: 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-deep); padding: 8px 10px 10px; }
.ma-over h3 { margin: 0 0 2px; font-size: 12px; font-weight: 700; color: var(--text); }
.ma-over p { margin: 0 0 8px; font-size: 11.5px; color: var(--muted); }
.ma-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px 16px; }
.ma-grp h4 { margin: 0 0 3px; font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-soft); }
.ma-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.ma-chip { display: inline-flex; gap: 5px; align-items: baseline; padding: 2px 6px; border-radius: 3px; color: #fff; font-size: 11.5px; font-weight: 800; line-height: 1.3; text-shadow: 0 1px 1px rgba(0,0,0,.35); }
.ma-chip:hover { text-decoration: none; outline: 2px solid var(--text); outline-offset: -1px; }
.ma-chip i { font-style: normal; font-weight: 700; font-size: 10.5px; opacity: .92; }
.ma-nocap { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
`;

export function MapA({ rows }: { rows: IndexRow[] }) {
  const { theme, convert, unit } = useSettings();
  const neutral = theme === "light" ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<{ r: IndexRow; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.max(380, Math.min(820, width * 0.5)));

  const { sectors, leaves, small, noCap } = useMemo(() => {
    const capped = rows.filter((r) => r.marketCap && r.marketCap > 0);
    const noCap = rows.filter((r) => !(r.marketCap && r.marketCap > 0)).sort((a, b) => a.ticker.localeCompare(b.ticker));
    if (!width) return { sectors: [], leaves: [], small: new Map<string, IndexRow[]>(), noCap };
    const bySector = new Map<string, IndexRow[]>();
    for (const r of capped) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
    const data: Datum = {
      name: "BVB",
      children: [...bySector].map(([name, list]) => ({ name, children: list.map((row) => ({ name: row.ticker, row })) })),
    };
    // Strict proportionality: weight is the raw market cap.
    const root = hierarchy(data)
      .sum((d) => d.row?.marketCap ?? 0)
      .sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
    const laid = treemap<Datum>()
      .tile(treemapSquarify.ratio(1.2))
      .size([width, height])
      .paddingInner(1)
      .paddingOuter(2)
      .paddingTop(SECTOR_LABEL)
      .round(true)(root);
    const leaves = laid.leaves() as HierarchyRectangularNode<Datum>[];
    const small = new Map<string, IndexRow[]>();
    for (const l of leaves) {
      if (l.x1 - l.x0 < MIN_W || l.y1 - l.y0 < MIN_H) {
        const r = l.data.row!;
        small.set(r.sector, [...(small.get(r.sector) ?? []), r]);
      }
    }
    for (const list of small.values()) list.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return { sectors: (laid.children ?? []) as HierarchyRectangularNode<Datum>[], leaves, small, noCap };
  }, [rows, width, height]);

  const smallCount = [...small.values()].reduce((n, l) => n + l.length, 0);
  const labelled = leaves.length - smallCount;

  const chip = (r: IndexRow) => (
    <a
      key={r.ticker}
      className="ma-chip"
      href={stockHref(r.ticker)}
      style={{ background: colour(r.changePct, neutral) }}
      title={`${r.ticker} · ${r.name}\nCapitalizare ${fmtBig(r.marketCap == null ? null : convert(r.marketCap))} ${unit()}`}
    >
      {r.ticker}
      <i>{fmtSignedPct(r.changePct)}</i>
    </a>
  );

  const showTip = (e: React.MouseEvent, r: IndexRow) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ r, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div className="ma-wrap">
      <style>{CSS}</style>
      <div className="ma-map" ref={ref} style={{ height }} onMouseLeave={() => setTip(null)}>
        {sectors.map((sec) => (
          <div
            key={sec.data.name}
            className="ma-sector"
            style={{ left: sec.x0, top: sec.y0, width: sec.x1 - sec.x0, height: sec.y1 - sec.y0 }}
          >
            <span>{sec.data.name}</span>
          </div>
        ))}
        {leaves.map((l) => {
          const r = l.data.row!;
          const w = l.x1 - l.x0;
          const h = l.y1 - l.y0;
          const size = Math.max(9, Math.min(34, Math.min(w / Math.max(r.ticker.length * 0.72, 2.9), h / 2.6)));
          const label = w >= MIN_W && h >= MIN_H;
          return (
            <a
              key={r.ticker}
              className="ma-cell"
              href={stockHref(r.ticker)}
              onMouseMove={(e) => showTip(e, r)}
              style={{ left: l.x0, top: l.y0, width: w, height: h, background: colour(r.changePct, neutral), fontSize: size }}
            >
              {label && <b>{r.ticker}</b>}
              {label && h > size * 2.3 && <span>{fmtSignedPct(r.changePct)}</span>}
            </a>
          );
        })}
        {tip && (
          <div
            className="ma-tip"
            style={{ left: Math.min(tip.x + 14, Math.max(0, width - 230)), top: Math.min(tip.y + 14, height - 90) }}
          >
            <strong>{tip.r.ticker}</strong> · {tip.r.name}
            <br />
            {fmtPrice(tip.r.price == null ? null : convert(tip.r.price))} {unit()}{" "}
            <span className={(tip.r.changePct ?? 0) >= 0 ? "ma-g" : "ma-r"}>{fmtSignedPct(tip.r.changePct)}</span>
            <br />
            Capitalizare {fmtBig(tip.r.marketCap == null ? null : convert(tip.r.marketCap))} {unit()}
            <br />
            {tip.r.sector}
          </div>
        )}
      </div>
      <div className="ma-cap">
        Aria fiecărui pătrat este proporțională cu capitalizarea bursieră; culoarea arată variația zilei.
        {smallCount > 0 && ` ${labelled} acțiuni au etichetă pe hartă, alte ${smallCount} sunt prea mici pentru etichetă și apar mai jos.`}
      </div>

      {(smallCount > 0 || noCap.length > 0) && (
        <div className="ma-over">
          {smallCount > 0 && (
            <>
              <h3>Prea mici pentru etichetă pe hartă ({smallCount})</h3>
              <p>Au pe hartă un pătrat la scară, dar fără text. Aici sunt grupate pe sector, cu aceeași culoare a zilei.</p>
              <div className="ma-groups">
                {[...small].map(([sector, list]) => (
                  <div className="ma-grp" key={sector}>
                    <h4>{sector}</h4>
                    <div className="ma-chips">{list.map(chip)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {noCap.length > 0 && (
            <div className={smallCount > 0 ? "ma-nocap" : undefined}>
              <h3>Fără capitalizare raportată ({noCap.length})</h3>
              <p>Nu au capitalizare în date, deci nu primesc arie pe hartă.</p>
              <div className="ma-chips">{noCap.map(chip)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
