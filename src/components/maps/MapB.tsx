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
const CUT = 0.9; // the main map holds the largest companies that together reach 90% of total market cap
const HEADER = 40;
const NARROW = 820;

function colour(change: number | null, NEUTRAL: number[]): string {
  if (change == null) return `rgb(${NEUTRAL.join(",")})`;
  const t = Math.min(1, Math.abs(change) / FULL_AT);
  const to = change >= 0 ? GREEN : RED;
  return `rgb(${NEUTRAL.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
}

interface Laid {
  sectors: HierarchyRectangularNode<Datum>[];
  leaves: HierarchyRectangularNode<Datum>[];
  /** Pixels of tile area per RON of market cap. */
  density: number;
  fits: Map<string, Fit>;
}

interface Fit {
  lines: number;
  font: number;
  strip: number;
}

/** How a sector name wraps in a block of width w: never cut, the strip grows with the lines needed. */
function labelFit(name: string, w: number): Fit {
  const words = name.split(" ");
  const avail = Math.max(20, w - 8);
  for (const font of [10, 9.5, 9]) {
    const cw = font * 0.74;
    if (Math.max(...words.map((x) => x.length)) * cw > avail) continue;
    let lines = 1;
    let cur = 0;
    for (const x of words) {
      const wx = x.length * cw;
      if (cur && cur + cw + wx > avail) {
        lines++;
        cur = wx;
      } else cur += (cur ? cw : 0) + wx;
    }
    return { lines, font, strip: Math.round(lines * font * 1.25 + 6) };
  }
  // Last resort: a single word wider than the block breaks inside the word.
  const font = 9;
  const lines = Math.ceil((name.replace(/ /g, "").length * font * 0.74) / avail) + words.length - 1;
  return { lines, font, strip: Math.round(lines * font * 1.25 + 6) };
}

function layout(list: IndexRow[], w: number, h: number, flat = false): Laid {
  if (!w || !h || !list.length) return { sectors: [], leaves: [], density: 0, fits: new Map() };
  const bySector = new Map<string, IndexRow[]>();
  for (const r of list) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
  const data: Datum = {
    name: "BVB",
    children: [...bySector].map(([name, rs]) => ({ name, children: rs.map((row) => ({ name: row.ticker, row })) })),
  };
  if (flat) data.children = list.map((row) => ({ name: row.ticker, row }));
  const root = hierarchy(data)
    .sum((d) => d.row?.marketCap ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  // Each sector reserves the label strip its own (wrapped) name needs; widths depend on the layout, so iterate.
  let fits = new Map<string, Fit>();
  let laid = root as HierarchyRectangularNode<Datum>;
  for (let pass = 0; pass < (flat ? 1 : 4); pass++) {
    const f = fits;
    laid = treemap<Datum>()
      .tile(treemapSquarify.ratio(1.2))
      .size([w, h])
      .paddingInner(1)
      .paddingOuter(2)
      .paddingTop((n) => (flat || n.depth !== 1 ? 2 : (f.get(n.data.name)?.strip ?? SECTOR_LABEL)))
      .round(true)(root);
    const next = new Map<string, Fit>();
    for (const sec of laid.children ?? []) next.set(sec.data.name, labelFit(sec.data.name, sec.x1 - sec.x0));
    const same = [...next].every(([k, v]) => f.get(k)?.strip === v.strip && f.get(k)?.font === v.font);
    fits = next;
    if (same) break;
  }
  const leaves = laid.leaves() as HierarchyRectangularNode<Datum>[];
  let area = 0;
  let cap = 0;
  for (const l of leaves) {
    area += (l.x1 - l.x0) * (l.y1 - l.y0);
    cap += l.data.row!.marketCap!;
  }
  return { sectors: flat ? [] : ((laid.children ?? []) as HierarchyRectangularNode<Datum>[]), leaves, density: area / cap, fits };
}

const pct = (x: number) => (x * 100).toLocaleString("ro-RO", { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + "%";

export function MapB({ rows }: { rows: IndexRow[] }) {
  const { theme, convert, unit } = useSettings();
  const neutral = theme === "light" ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [zoomState, setZoom] = useState<string | null>(null);
  const zoom = zoomState && rows.some((r) => r.sector === zoomState) ? zoomState : null;
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const narrow = width > 0 && width < NARROW;
  const GAP = 10;
  const NOCAP_H = 46;
  const wideTotal = Math.round(Math.max(480, Math.min(820, width * 0.5)));

  const split = useMemo(() => {
    const withCap = rows.filter((r) => r.marketCap).sort((a, b) => b.marketCap! - a.marketCap!);
    const total = withCap.reduce((s, r) => s + r.marketCap!, 0);
    const main: IndexRow[] = [];
    let acc = 0;
    for (const r of withCap) {
      if (acc >= CUT * total) break;
      main.push(r);
      acc += r.marketCap!;
    }
    const rest = withCap.slice(main.length);
    const restCap = total - acc;
    const noCap = rows.filter((r) => !r.marketCap).sort((a, b) => a.ticker.localeCompare(b.ticker));
    return { main, rest, noCap, total, mainShare: acc / total, restShare: restCap / total };
  }, [rows]);

  // Width split: the small-cap map gets a fixed fraction of the width on wide screens.
  const mainW = narrow ? width : Math.round((width - GAP) * 0.6);
  const restW = narrow ? width : width - GAP - mainW;
  const mapH = narrow ? Math.round(Math.max(300, Math.min(520, width * 0.8))) : wideTotal - HEADER - NOCAP_H - GAP;

  const A = useMemo(() => layout(split.main, mainW, mapH), [split.main, mainW, mapH]);
  const B = useMemo(() => layout(split.rest, restW, mapH), [split.rest, restW, mapH]);
  const zoomRows = useMemo(() => (zoom ? rows.filter((r) => r.sector === zoom && r.marketCap) : []), [rows, zoom]);
  const zoomNoCap = useMemo(
    () => (zoom ? split.noCap.filter((r) => r.sector === zoom) : []),
    [split.noCap, zoom],
  );
  const zoomH = narrow ? mapH + 140 : mapH;
  const Z = useMemo(() => layout(zoomRows, width, zoomH, true), [zoomRows, width, zoomH]);
  const zoomShare = zoomRows.reduce((s, r) => s + r.marketCap!, 0) / split.total;
  const mag = A.density && B.density ? B.density / A.density : 0;
  const magText = mag ? mag.toLocaleString("ro-RO", { maximumFractionDigits: 1 }) : "";

  const tile = (l: HierarchyRectangularNode<Datum>, mapKey: string) => {
    const r = l.data.row!;
    const w = l.x1 - l.x0;
    const h = l.y1 - l.y0;
    const size = Math.max(9, Math.min(34, Math.min(w / Math.max(r.ticker.length * 0.72, 2.9), h / 2.6)));
    const label = w > 24 && h > 13;
    return (
      <a
        key={mapKey + r.ticker}
        className="mb-cell"
        href={stockHref(r.ticker)}
        title={`${r.ticker} · ${r.name}\n${fmtPrice(r.price == null ? null : convert(r.price))} ${unit()}  ${fmtSignedPct(r.changePct)}\nCapitalizare ${fmtBig(r.marketCap == null ? null : convert(r.marketCap))} ${unit()}`}
        style={{ left: l.x0, top: l.y0, width: w, height: h, background: colour(r.changePct, neutral), fontSize: size }}
      >
        {label && <b>{r.ticker}</b>}
        {label && h > size * 2.3 && <span>{fmtSignedPct(r.changePct)}</span>}
      </a>
    );
  };

  const readable = [...A.leaves, ...B.leaves].filter((l) => l.x1 - l.x0 > 24 && l.y1 - l.y0 > 13).length;

  const mapBox = (L: Laid, w: number, key: string) => (
    <div className="mb-canvas" style={{ width: w, height: mapH }}>
      {L.sectors.map((s) => (
        <div
          key={key + s.data.name}
          className="mb-sector"
          style={{ left: s.x0, top: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0 }}
        >
          <button
            type="button"
            className="mb-seclabel"
            onClick={() => setZoom(s.data.name)}
            title={`Mărește sectorul ${s.data.name} · ${s.children?.length ?? 0} acțiuni`}
            style={{ fontSize: L.fits.get(s.data.name)?.font ?? 10, minHeight: L.fits.get(s.data.name)?.strip }}
          >
            {s.data.name}
          </button>
        </div>
      ))}
      {L.leaves.map((l) => tile(l, key))}
    </div>
  );

  const chipRow = (list: IndexRow[]) => (
    <div className="mb-nocap">
            <span className="mb-nocap-label" title="Capitalizarea nu este raportată; nu au o suprafață proporțională.">
              Fără capitalizare raportată ({list.length})
            </span>
            <div className="mb-chips">
              {list.map((r) => (
                <a
                  key={r.ticker}
                  className="mb-chip"
                  href={stockHref(r.ticker)}
                  title={`${r.ticker} · ${r.name}\n${fmtPrice(r.price == null ? null : convert(r.price))} ${unit()}  ${fmtSignedPct(r.changePct)}\nCapitalizare: -`}
                  style={{ background: colour(r.changePct, neutral) }}
                >
                  <b>{r.ticker}</b>
                  <span>{fmtSignedPct(r.changePct)}</span>
                </a>
              ))}
            </div>
          </div>
  );

  return (
    <div className="mb-root" ref={ref} data-readable={readable}>
      <style>{CSS}</style>
      {width > 0 && (
        <>
          {zoom ? (
            <>
              <header className="mb-head mb-zoomhead" style={{ minHeight: HEADER }}>
                <button type="button" className="mb-back" onClick={() => setZoom(null)} title="Înapoi (Esc)">
                  ← Toate sectoarele
                </button>
                <b>{zoom}</b>
                <span>
                  {zoomRows.length + zoomNoCap.length} acțiuni · <em>{pct(zoomShare)}</em> din capitalizarea totală a pieței
                </span>
                <span className="mb-scale">Proporțional cu capitalizarea în interiorul sectorului</span>
              </header>
              <div className="mb-canvas" style={{ width, height: zoomH }}>
                {Z.leaves.map((l) => tile(l, "z"))}
              </div>
              {zoomNoCap.length > 0 && chipRow(zoomNoCap)}
            </>
          ) : (
          <>
          <div className="mb-maps" style={{ gap: GAP, flexDirection: narrow ? "column" : "row" }}>
            <section style={{ width: mainW }}>
              <header className="mb-head" style={{ minHeight: HEADER }}>
                <b>Companiile mari</b>
                <span>
                  {split.main.length} acțiuni · <em>{pct(split.mainShare)}</em> din capitalizarea totală a pieței
                </span>
                <span className="mb-scale">Scară de bază ×1</span>
              </header>
              {mapBox(A, mainW, "a")}
            </section>
            <section style={{ width: restW }}>
              <header className="mb-head mb-head-rest" style={{ minHeight: HEADER }}>
                <b>Restul pieței</b>
                <span>
                  {split.rest.length} acțiuni · <em>{pct(split.restShare)}</em> din capitalizarea totală
                </span>
                <span className="mb-scale mb-scale-big">Mărit de ~{magText}× față de harta mare</span>
              </header>
              {mapBox(B, restW, "b")}
            </section>
          </div>
          {chipRow(split.noCap)}
          </>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.mb-maps { display: flex; align-items: flex-start; }
.mb-maps > section { min-width: 0; }
.mb-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 0 2px 5px; font-size: 12px; color: var(--muted); line-height: 1.3; }
.mb-head b { color: var(--text); font-size: 13px; }
.mb-head em { font-style: normal; color: var(--text); font-weight: 700; }
.mb-scale { margin-left: auto; font-size: 11px; font-weight: 700; padding: 1px 7px; border: 1px solid var(--line); border-radius: 10px; color: var(--text-soft); background: var(--bg-raised); white-space: nowrap; }
.mb-scale-big { color: var(--bg-deep); background: var(--text); border-color: var(--text); }
.mb-canvas { position: relative; background: var(--bg-deep); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-sizing: border-box; }
.mb-head-rest + .mb-canvas { border-color: var(--text-soft); border-style: dashed; }
.mb-sector { position: absolute; overflow: hidden; }
.mb-seclabel { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 2px 4px 0; border: 0; background: transparent; font-family: inherit; font-weight: 700; letter-spacing: 0.3px; line-height: 1.25; text-transform: uppercase; text-align: left; color: var(--text-soft); white-space: normal; overflow-wrap: anywhere; cursor: pointer; }
.mb-seclabel:hover, .mb-seclabel:focus-visible { color: var(--text); background: var(--bg-raised); text-decoration: underline; outline: none; }
.mb-zoomhead { align-items: center; }
.mb-back { font: inherit; font-size: 12px; font-weight: 700; padding: 3px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--bg-raised); color: var(--text); cursor: pointer; }
.mb-back:hover { border-color: var(--text-soft); }
.mb-cell { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: #fff; line-height: 1.1; }
.mb-cell:hover { text-decoration: none; outline: 2px solid #fff; outline-offset: -2px; z-index: 2; }
.mb-cell b { font-weight: 900; }
.mb-cell span { font-size: 0.56em; font-weight: 700; }
.mb-nocap { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 6px 8px; border: 1px dashed var(--line); border-radius: var(--radius); background: var(--bg-raised); }
.mb-nocap-label { font-size: 11px; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.4px; flex: none; }
.mb-chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 180px)); gap: 4px; flex: 1; min-width: 0; }
.mb-chip { display: flex; flex-direction: column; align-items: center; padding: 3px 4px; color: #fff; font-size: 12px; line-height: 1.15; border-radius: 3px; }
.mb-chip:hover { text-decoration: none; outline: 2px solid #fff; outline-offset: -2px; }
.mb-chip span { font-size: 10px; font-weight: 700; }
@media (max-width: 820px) { .mb-nocap { flex-direction: column; align-items: stretch; } }
`;
