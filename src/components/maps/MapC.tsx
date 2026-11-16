import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { HierarchyRectangularNode } from "d3-hierarchy";
import { fmtBig, fmtPrice, fmtSignedPct } from "../../lib/format";
import { stockHref } from "../../lib/router";
import { useSettings } from "../../lib/settings";
import type { IndexRow } from "../../lib/types";

type SizeMode = "cap" | "bal" | "eq" | "turn";
type Period = "d" | "w" | "m" | "ytd";

interface Datum {
  name: string;
  row?: IndexRow;
  children?: Datum[];
}

const SIZE_OPTS: { id: SizeMode; label: string }[] = [
  { id: "cap", label: "Capitalizare" },
  { id: "bal", label: "Echilibrat" },
  { id: "eq", label: "Egal" },
  { id: "turn", label: "Rulaj" },
];
const PERIOD_OPTS: { id: Period; label: string; full: number; words: string }[] = [
  { id: "d", label: "1 zi", full: 0.03, words: "variația de azi" },
  { id: "w", label: "1 săptămână", full: 0.06, words: "variația pe o săptămână" },
  { id: "m", label: "1 lună", full: 0.12, words: "variația pe o lună" },
  { id: "ytd", label: "YTD", full: 0.3, words: "variația de la începutul anului (YTD)" },
];

const NEUTRAL_DARK = [65, 69, 84];
const NEUTRAL_LIGHT = [118, 126, 146];
const GREEN = [48, 190, 96];
const RED = [240, 62, 68];
const SECTOR_LABEL = 20;
const BAL_EXPONENT = 0.45;
const LS_SIZE = "bursaviz.mapC.size";
const LS_PERIOD = "bursaviz.mapC.period";

function load<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as string[]).includes(v)) return v as T;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function mix(change: number | null, full: number, neutral: number[]): string {
  if (change == null) return `rgb(${neutral.join(",")})`;
  const t = Math.min(1, Math.abs(change) / full);
  const to = change >= 0 ? GREEN : RED;
  return `rgb(${neutral.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
}

function perfOf(r: IndexRow, p: Period): number | null {
  return p === "d" ? r.changePct : p === "w" ? r.perfW : p === "m" ? r.perfM : r.perfYTD;
}

function weightOf(r: IndexRow, mode: SizeMode, strictInZoom: boolean): number | null {
  switch (mode) {
    case "cap":
      return r.marketCap && r.marketCap > 0 ? r.marketCap : null;
    case "bal":
      return r.marketCap && r.marketCap > 0 ? (strictInZoom ? r.marketCap : Math.pow(r.marketCap, BAL_EXPONENT)) : null;
    case "eq":
      return 1;
    case "turn":
      return r.volume && r.price && r.volume * r.price > 0 ? r.volume * r.price : null;
  }
}

export function MapC({ rows }: { rows: IndexRow[] }) {
  const { theme, convert, unit } = useSettings();
  const neutral = theme === "light" ? NEUTRAL_LIGHT : NEUTRAL_DARK;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [mode, setModeState] = useState<SizeMode>(() => load<SizeMode>(LS_SIZE, ["cap", "bal", "eq", "turn"], "cap"));
  const [period, setPeriodState] = useState<Period>(() => load<Period>(LS_PERIOD, ["d", "w", "m", "ytd"], "d"));
  const [zoom, setZoom] = useState<string | null>(null);

  const setMode = (m: SizeMode) => {
    setModeState(m);
    save(LS_SIZE, m);
  };
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    save(LS_PERIOD, p);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pOpt = PERIOD_OPTS.find((p) => p.id === period)!;
  const full = pOpt.full;
  const mapH = Math.round(Math.max(420, Math.min(820, width * 0.5)));
  const activeZoom = zoom && rows.some((r) => r.sector === zoom) ? zoom : null;

  const missingLabel = mode === "turn" ? "fără rulaj azi" : "fără capitalizare raportată";

  const { sectors, leaves, missing, areaH, labelled } = useMemo(() => {
    const inScope = activeZoom ? rows.filter((r) => r.sector === activeZoom) : rows;
    const sized: IndexRow[] = [];
    const missing: IndexRow[] = [];
    for (const r of inScope) (weightOf(r, mode, !!activeZoom) == null ? missing : sized).push(r);
    const chipRows = missing.length && width ? Math.ceil((missing.length * 62) / Math.max(width - 16, 100)) : 0;
    const chipsH = missing.length ? 26 + chipRows * 30 : 0;
    const headH = activeZoom ? 30 : 0;
    const areaH = mapH - chipsH - headH;
    if (!width || !sized.length) return { sectors: [], leaves: [], missing, areaH, labelled: 0 };
    const w = (r: IndexRow) => weightOf(r, mode, !!activeZoom) as number;
    let data: Datum;
    if (activeZoom) {
      data = { name: activeZoom, children: sized.map((row) => ({ name: row.ticker, row })) };
    } else {
      const by = new Map<string, IndexRow[]>();
      for (const r of sized) by.set(r.sector, [...(by.get(r.sector) ?? []), r]);
      data = {
        name: "BVB",
        children: [...by].map(([name, list]) => ({ name, children: list.map((row) => ({ name: row.ticker, row })) })),
      };
    }
    const root = hierarchy(data)
      .sum((d) => (d.row ? w(d.row) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const t = treemap<Datum>().tile(treemapSquarify.ratio(1.2)).size([width, areaH]).round(true);
    if (activeZoom) t.paddingInner(1).paddingOuter(0);
    else t.paddingInner(1).paddingOuter(3).paddingTop(SECTOR_LABEL);
    const laid = t(root);
    const lv = laid.leaves() as HierarchyRectangularNode<Datum>[];
    const labelled = lv.filter((l) => l.x1 - l.x0 > 26 && l.y1 - l.y0 > 14).length;
    return {
      sectors: activeZoom ? [] : ((laid.children ?? []) as HierarchyRectangularNode<Datum>[]),
      leaves: lv,
      missing,
      areaH,
      labelled,
    };
  }, [rows, width, mapH, mode, activeZoom]);

  const sizeWords: Record<SizeMode, string> = {
    cap: "Suprafața este strict proporțională cu capitalizarea bursieră.",
    bal: "Suprafața este comprimată (capitalizare la puterea 0,45), deci NU este proporțională: acțiunile mici apar mai mari decât le este valoarea.",
    eq: "Fiecare acțiune are aceeași suprafață, indiferent de mărime.",
    turn: "Suprafața este proporțională cu rulajul de azi (volum × preț).",
  };
  const caption = `${sizeWords[mode]} Culoarea arată ${pOpt.words}; culoarea plină la ±${Math.round(full * 100)}%.${
    activeZoom ? ` Sector: ${activeZoom}.` : " Clic pe numele unui sector îl mărește."
  }`;

  const legendStops = `linear-gradient(90deg, rgb(${RED.join(",")}), rgb(${neutral.join(",")}), rgb(${GREEN.join(",")}))`;

  function tile(l: HierarchyRectangularNode<Datum>) {
    const r = l.data.row!;
    const w = l.x1 - l.x0;
    const h = l.y1 - l.y0;
    const pv = perfOf(r, period);
    const size = Math.max(10, Math.min(34, Math.min(w / Math.max(r.ticker.length * 0.72, 2.9), h / 2.6)));
    const label = w > 26 && h > 14;
    const turnover = r.volume && r.price ? r.volume * r.price : null;
    return (
      <a
        key={r.ticker}
        className="hm-cell"
        href={stockHref(r.ticker)}
        title={`${r.ticker} · ${r.name}\n${fmtPrice(r.price == null ? null : convert(r.price))} ${unit()}  ${pOpt.label}: ${fmtSignedPct(pv)}\nCapitalizare ${fmtBig(r.marketCap == null ? null : convert(r.marketCap))} ${unit()}\nRulaj azi ${fmtBig(turnover == null ? null : convert(turnover))} ${unit()}`}
        style={{ left: l.x0, top: l.y0, width: w, height: h, background: mix(pv, full, neutral), fontSize: size }}
      >
        {label && <b>{r.ticker}</b>}
        {label && h > size * 2.3 && <span>{fmtSignedPct(pv)}</span>}
      </a>
    );
  }

  const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.round(Math.abs(n) * 100)}%`;

  return (
    <div className="mapc">
      <style>{`
        .mapc-ctl { display:flex; flex-wrap:wrap; gap:8px 18px; align-items:center; margin-bottom:6px; }
        .mapc-ctl .grp { display:flex; align-items:center; gap:7px; }
        .mapc-ctl .grp > em { font-style:normal; color:var(--muted); font-size:12.5px; }
        .mapc-ctl .seg button { font-size:13px; padding:4px 10px; cursor:pointer; }
        .mapc-legend { display:flex; align-items:center; gap:6px; margin-left:auto; color:var(--muted); font-size:12px; }
        .mapc-legend i { display:block; width:120px; height:9px; border-radius:2px; border:1px solid var(--line); }
        .mapc-cap { color:var(--text-soft); font-size:12.5px; line-height:1.4; margin:0 0 8px; }
        .mapc-cap b { color:var(--text); }
        .mapc-stage { position:relative; width:100%; background:var(--bg-deep); border:1px solid var(--line); box-sizing:content-box; overflow:hidden; }
        .mapc-head { position:absolute; left:0; right:0; top:0; height:30px; display:flex; align-items:center; gap:12px; padding:0 8px; font-weight:700; color:var(--text); border-bottom:1px solid var(--line); }
        .mapc-head button { background:var(--bg-raised); border:1px solid var(--line); color:var(--text); border-radius:4px; padding:2px 9px; font-weight:700; cursor:pointer; }
        .mapc-head button:hover { border-color:var(--muted); }
        .mapc-sec { position:absolute; box-sizing:border-box; border:1px solid var(--line); pointer-events:none; }
        .mapc-sec button { pointer-events:auto; position:absolute; left:2px; top:1px; max-width:calc(100% - 4px); height:18px; line-height:18px; padding:0 4px; border:0; background:transparent; color:var(--text-soft); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:zoom-in; text-align:left; }
        .mapc-sec button:hover { color:var(--text); text-decoration:underline; }
        .mapc-miss { position:absolute; left:0; right:0; bottom:0; border-top:1px solid var(--line); padding:4px 8px; background:var(--bg); }
        .mapc-miss > span { display:block; font-size:11.5px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.03em; margin-bottom:3px; }
        .mapc-miss div { display:flex; flex-wrap:wrap; gap:3px; }
        .mapc-miss a { width:58px; height:27px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-size:11px; line-height:1.1; text-decoration:none; border-radius:2px; }
        .mapc-miss a b { font-size:11.5px; }
        .mapc-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--muted); }
      `}</style>

      <div className="mapc-ctl">
        <div className="grp">
          <em>Suprafață</em>
          <div className="seg">
            {SIZE_OPTS.map((o) => (
              <button key={o.id} className={mode === o.id ? "on" : ""} onClick={() => setMode(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grp">
          <em>Culoare</em>
          <div className="seg">
            {PERIOD_OPTS.map((o) => (
              <button key={o.id} className={period === o.id ? "on" : ""} onClick={() => setPeriod(o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mapc-legend" title={`Culoarea plină la ±${Math.round(full * 100)}%`}>
          <span>{pct(-full)}</span>
          <i style={{ background: legendStops }} />
          <span>{pct(full)}</span>
        </div>
      </div>
      <p className="mapc-cap">
        <b>{mode === "bal" ? "Echilibrat: " : ""}</b>
        {caption}
      </p>

      <div ref={ref} className="mapc-stage" style={{ height: mapH }}>
        {activeZoom && (
          <div className="mapc-head">
            <button onClick={() => setZoom(null)}>← Toate sectoarele</button>
            <span>{activeZoom}</span>
          </div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, top: activeZoom ? 30 : 0, height: areaH }}>
          {sectors.map((sec) => (
            <div
              key={sec.data.name}
              className="mapc-sec"
              style={{ left: sec.x0, top: sec.y0, width: sec.x1 - sec.x0, height: sec.y1 - sec.y0 }}
            >
              <button
                title={`${sec.data.name} · ${sec.children?.length ?? 0} acțiuni — clic pentru a mări`}
                onClick={() => setZoom(sec.data.name)}
              >
                {sec.data.name}
              </button>
            </div>
          ))}
          {leaves.map((l) => tile(l))}
          {!leaves.length && <div className="mapc-empty">Nicio acțiune cu date pentru această suprafață.</div>}
        </div>
        {missing.length > 0 && (
          <div className="mapc-miss">
            <span>
              {missingLabel} ({missing.length})
            </span>
            <div>
              {missing.map((r) => {
                const pv = perfOf(r, period);
                return (
                  <a
                    key={r.ticker}
                    href={stockHref(r.ticker)}
                    title={`${r.ticker} · ${r.name}\n${pOpt.label}: ${fmtSignedPct(pv)}\n(${missingLabel}: fără suprafață)`}
                    style={{ background: mix(pv, full, neutral) }}
                  >
                    <b>{r.ticker}</b>
                    <span>{fmtSignedPct(pv)}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <p className="mapc-cap" style={{ marginTop: 4 }} data-labelled={labelled}>
        {labelled} din {leaves.length} acțiuni au etichetă vizibilă
        {missing.length ? `, ${missing.length} fără suprafață` : ""}.
      </p>
    </div>
  );
}
