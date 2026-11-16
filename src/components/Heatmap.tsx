import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { HierarchyRectangularNode } from "d3-hierarchy";
import { fmtBig, fmtPrice, fmtSignedPct } from "../lib/format";
import { stockHref } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { IndexRow } from "../lib/types";

interface Datum {
  name: string;
  row?: IndexRow;
  children?: Datum[];
}

// Tile text is white in both themes, so the neutral tile stays a mid-dark grey-blue in the light theme too.
const NEUTRAL_DARK = [65, 69, 84];
const NEUTRAL_LIGHT = [118, 126, 146];
const GREEN = [48, 190, 96];
const RED = [240, 62, 68];
const FULL_AT = 0.03; // a ±3% day gets the full colour
const SIZE_EXPONENT = 0.45;
const SECTOR_LABEL = 19;

function colour(change: number | null, NEUTRAL: number[]): string {
  if (change == null) return `rgb(${NEUTRAL.join(",")})`;
  const t = Math.min(1, Math.abs(change) / FULL_AT);
  const to = change >= 0 ? GREEN : RED;
  return `rgb(${NEUTRAL.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
}

export function Heatmap({ rows }: { rows: IndexRow[] }) {
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

  const height = Math.round(Math.max(480, Math.min(820, width * 0.5)));

  // One treemap, FinViz style: sectors are the blocks, stocks the tiles inside them.
  // Tile area follows market cap, but compressed (cap^0.45): on raw market cap the five largest
  // issuers take 80% of the map and the small caps disappear.
  const { sectors, leaves } = useMemo(() => {
    if (!width) return { sectors: [], leaves: [] };
    const caps = rows.filter((r) => r.marketCap).map((r) => r.marketCap as number);
    const smallest = caps.length ? Math.min(...caps) : 1;
    // Yahoo reports no market cap for a few small issuers: they get the smallest tile rather than none.
    const weight = (r: IndexRow) => Math.pow(r.marketCap || smallest, SIZE_EXPONENT);
    const bySector = new Map<string, IndexRow[]>();
    for (const r of rows) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
    const data: Datum = {
      name: "BVB",
      children: [...bySector].map(([name, list]) => ({ name, children: list.map((row) => ({ name: row.ticker, row })) })),
    };
    const root = hierarchy(data)
      .sum((d) => (d.row ? weight(d.row) : 0))
      .sort((x, y) => (y.value ?? 0) - (x.value ?? 0));
    // paddingOuter resets all four sides, so the label strip (paddingTop) has to be set after it.
    const laid = treemap<Datum>()
      .tile(treemapSquarify.ratio(1.2))
      .size([width, height])
      .paddingInner(1)
      .paddingOuter(3)
      .paddingTop(SECTOR_LABEL)
      .round(true)(root);
    return {
      sectors: (laid.children ?? []) as HierarchyRectangularNode<Datum>[],
      leaves: laid.leaves() as HierarchyRectangularNode<Datum>[],
    };
  }, [rows, width, height]);

  return (
    <div className="heatmap" ref={ref} style={{ height }}>
      {sectors.map((sec) => (
        <div
          key={sec.data.name}
          className="hm-sector"
          style={{ left: sec.x0, top: sec.y0, width: sec.x1 - sec.x0, height: sec.y1 - sec.y0 }}
        >
          <span title={`${sec.data.name} · ${sec.children?.length ?? 0} acțiuni`}>{sec.data.name}</span>
        </div>
      ))}
      {leaves.map((l) => tile(l))}
    </div>
  );

  function tile(l: HierarchyRectangularNode<Datum>) {

        const r = l.data.row!;
        const w = l.x1 - l.x0;
        const h = l.y1 - l.y0;
        // Fit both lines: the ticker, and the percent line below it (about 2.7em wide).
        const size = Math.max(10, Math.min(34, Math.min(w / Math.max(r.ticker.length * 0.72, 2.9), h / 2.6)));
        const label = w > 26 && h > 14;
        return (
          <a
            key={r.ticker}
            className="hm-cell"
            href={stockHref(r.ticker)}
            title={`${r.ticker} · ${r.name}\n${fmtPrice(r.price == null ? null : convert(r.price))} ${unit()}  ${fmtSignedPct(r.changePct)}\nCapitalizare ${fmtBig(r.marketCap == null ? null : convert(r.marketCap))} ${unit()}`}
            style={{ left: l.x0, top: l.y0, width: w, height: h, background: colour(r.changePct, neutral), fontSize: size }}
          >
            {label && <b>{r.ticker}</b>}
            {label && h > size * 2.3 && <span>{fmtSignedPct(r.changePct)}</span>}
          </a>
        );
  }
}
