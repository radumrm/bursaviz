import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
} from "lightweight-charts";
import type { LogicalRange, Time } from "lightweight-charts";
import { candlesFor } from "../lib/aggregate";
import type { Candle, Tf } from "../lib/aggregate";
import { bollinger, ema, macd, rsi, sma, vwap } from "../lib/indicators";
import { fmtBig, fmtNum } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Theme } from "../lib/settings";
import type { BarsFile, ChartEvents } from "../lib/types";
import "./chart.css";

const TFS: { id: Tf; title: string }[] = [
  { id: "15M", title: "15 minute" },
  { id: "30M", title: "30 de minute" },
  { id: "1H", title: "1 oră" },
  { id: "4H", title: "4 ore" },
  { id: "D", title: "Zilnic" },
  { id: "W", title: "Săptămânal" },
  { id: "M", title: "Lunar" },
];
const INITIAL_BARS: Record<Tf, number> = { "15M": 200, "30M": 200, "1H": 170, "4H": 190, D: 230, W: 210, M: 400 };
const INTRADAY = new Set<Tf>(["15M", "30M", "1H", "4H"]);
const NO_M_DATA = "Fără date la 15 minute — rulează din nou `npm run scrape`";
const NO_H_DATA = "Fără date intraday pentru acest simbol";

const UP = "#3fbf6c";
const DOWN = "#f2555c";
const C_SMA20 = "#c05fc4";
const C_SMA50 = "#f0a23a";
const C_SMA200 = "#a39547";
const C_EMA9 = "#4fb8e8";
const C_EMA21 = "#e8678f";
const C_BB = "#7d8ce0";
const C_VWAP = "#26a69a";
const C_RSI = "#f0a23a";
const C_MACD = "#5aa9f0";
const C_SIGNAL = "#f0a23a";
const PRICE_PANE = 500;
const SUB_PANE = 120;
const AXIS_GUESS = 28; // time-axis height, only used to split the box before panes can be measured

// ---------- indicator menu ----------

type IndId = "sma20" | "sma50" | "sma200" | "ema9" | "ema21" | "bb" | "vwap" | "vol" | "rsi" | "macd";
interface IndDef {
  id: IndId;
  label: string;
  group: "over" | "under";
  color: string;
}
const INDICATORS: IndDef[] = [
  { id: "sma20", label: "SMA 20", group: "over", color: C_SMA20 },
  { id: "sma50", label: "SMA 50", group: "over", color: C_SMA50 },
  { id: "sma200", label: "SMA 200", group: "over", color: C_SMA200 },
  { id: "ema9", label: "EMA 9", group: "over", color: C_EMA9 },
  { id: "ema21", label: "EMA 21", group: "over", color: C_EMA21 },
  { id: "bb", label: "Bollinger Bands (20, 2)", group: "over", color: C_BB },
  { id: "vwap", label: "VWAP", group: "over", color: C_VWAP },
  { id: "vol", label: "Volum", group: "under", color: "#7f8696" },
  { id: "rsi", label: "RSI 14", group: "under", color: C_RSI },
  { id: "macd", label: "MACD (12, 26, 9)", group: "under", color: C_MACD },
];
const KNOWN = new Set<string>(INDICATORS.map((d) => d.id));
const DEFAULT_ON: IndId[] = ["sma20", "sma50", "sma200", "vol", "rsi"];
const KEY_IND = "bv.indicators";

function loadIndicators(): Set<IndId> {
  try {
    const raw = window.localStorage.getItem(KEY_IND);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const known = parsed.filter((x): x is IndId => typeof x === "string" && KNOWN.has(x));
        // An empty list is a real choice ("everything off"); a list of only unknown ids is not.
        if (known.length || parsed.length === 0) return new Set(known);
      }
    }
  } catch {
    // unreadable storage or bad JSON → defaults
  }
  return new Set(DEFAULT_ON);
}
function saveIndicators(on: Set<IndId>) {
  try {
    window.localStorage.setItem(KEY_IND, JSON.stringify(INDICATORS.filter((d) => on.has(d.id)).map((d) => d.id)));
  } catch {
    // not fatal: the choice just will not survive a reload
  }
}

// ---------- theme ----------

interface Palette {
  text: string;
  grid: string;
  crosshair: string;
  crosshairLabel: string;
  separator: string;
  separatorHover: string;
}
const PALETTES: Record<Theme, Palette> = {
  dark: {
    text: "#9aa1b0",
    grid: "rgba(255,255,255,0.045)",
    crosshair: "#5b6373",
    crosshairLabel: "#3a4050",
    separator: "#353a47",
    separatorHover: "rgba(90,169,240,0.25)",
  },
  light: {
    text: "#4b5563",
    grid: "rgba(0,0,0,0.06)",
    crosshair: "#9ca3af",
    crosshairLabel: "#6b7280",
    separator: "#d7dbe2",
    separatorHover: "rgba(61,139,232,0.25)",
  },
};

// ---------- helpers ----------

const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function timeLabel(t: string | number): string {
  if (typeof t === "string") {
    const [y, m, d] = t.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const d = new Date(t * 1000); // stored as Bucharest wall clock, so read it back as UTC
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The candle's calendar day, 'YYYY-MM-DD' (intraday times are wall-clock epochs, so read as UTC). */
function dayOf(t: string | number): string {
  return typeof t === "string" ? t : new Date(t * 1000).toISOString().slice(0, 10);
}

const digitsFor = (x: number) => (x >= 10 ? 2 : x >= 1 ? 3 : 4);

interface Props {
  bars: BarsFile;
  /** Interval requested by the URL, if any. */
  initialTf?: string | null;
  onTf?: (tf: Tf) => void;
  /** Dividends and earnings dates to mark on the chart. */
  events?: ChartEvents;
}

type Series = (number | null)[];
interface Model {
  candles: Candle[];
  s20: Series;
  s50: Series;
  s200: Series;
  e9: Series;
  e21: Series;
  bb: { mid: Series; upper: Series; lower: Series };
  vwap: Series;
  rsi: Series;
  macd: { macd: Series; signal: Series; hist: Series };
}

export function PriceChart({ bars, initialTf, onTf }: Props) {
  const { theme, currency, convert } = useSettings();
  const hasIntraday = bars.h.length > 20;
  const hasM = (bars.m?.length ?? 0) > 20;
  const unavailable = (id: Tf): string | null =>
    id === "15M" || id === "30M" ? (hasM ? null : NO_M_DATA) : id === "1H" || id === "4H" ? (hasIntraday ? null : NO_H_DATA) : null;

  const [tf, setTfState] = useState<Tf>(() => {
    const asked = TFS.find((t) => t.id === initialTf)?.id;
    return asked && !unavailable(asked) ? asked : "D";
  });
  const setTf = (next: Tf) => {
    setTfState(next);
    onTf?.(next);
  };
  const [kind, setKind] = useState<"candle" | "line">("candle");
  const [hover, setHover] = useState<number | null>(null);
  const [on, setOn] = useState<Set<IndId>>(loadIndicators);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Top of each sub-pane (RSI, MACD) in px from the top of the chart box, measured after layout. */
  const [paneTops, setPaneTops] = useState<number[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Last visible range, so a rebuild (indicator / theme / currency change) keeps the user's zoom. */
  const viewRef = useRef<{ tf: Tf; n: number; range: LogicalRange } | null>(null);

  const intraday = INTRADAY.has(tf);
  const show = (id: IndId) => on.has(id) && (id !== "vwap" || intraday);
  const showRsi = show("rsi");
  const showMacd = show("macd");
  const subPanes = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);

  const toggle = (id: IndId) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIndicators(next);
      return next;
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Candles in the display currency (each at its own day's rate); volume stays in shares.
  const candles = useMemo(() => {
    const raw = candlesFor(tf, bars);
    if (currency === "RON") return raw;
    const rates = new Map<string, number>();
    return raw.map((c) => {
      const day = dayOf(c.time);
      let r = rates.get(day);
      if (r === undefined) {
        r = convert(1, "RON", day);
        if (!Number.isFinite(r) || r <= 0) r = 1;
        rates.set(day, r);
      }
      return { ...c, open: c.open * r, high: c.high * r, low: c.low * r, close: c.close * r };
    });
  }, [tf, bars, currency, convert]);

  const model = useMemo<Model>(() => {
    const closes = candles.map((c) => c.close);
    const none: Series = new Array(candles.length).fill(null);
    const want = (id: IndId) => on.has(id);
    return {
      candles,
      s20: want("sma20") ? sma(closes, 20) : none,
      s50: want("sma50") ? sma(closes, 50) : none,
      s200: want("sma200") ? sma(closes, 200) : none,
      e9: want("ema9") ? ema(closes, 9) : none,
      e21: want("ema21") ? ema(closes, 21) : none,
      bb: want("bb") ? bollinger(closes, 20, 2) : { mid: none, upper: none, lower: none },
      vwap:
        want("vwap") && INTRADAY.has(tf)
          ? vwap(
              candles.map((c) => c.high),
              candles.map((c) => c.low),
              closes,
              candles.map((c) => c.volume),
              candles.map((c) => Math.floor((c.time as number) / 86400)),
            )
          : none,
      rsi: want("rsi") ? rsi(closes, 14) : none,
      macd: want("macd") ? macd(closes, 12, 26, 9) : { macd: none, signal: none, hist: none },
    };
  }, [candles, on, tf]);

  useEffect(() => {
    const el = boxRef.current;
    const { candles } = model;
    if (!el || !candles.length) return;
    setHover(null);

    const pal = PALETTES[theme] ?? PALETTES.dark;
    const lastClose = candles[candles.length - 1].close;
    const precision = digitsFor(lastClose);
    // The bottom margin reserved for volume can push the axis below zero on penny stocks;
    // a price is never negative, so those ticks are left unlabelled.
    const priceFormat = {
      type: "custom" as const,
      minMove: 1 / 10 ** precision,
      formatter: (p: number) => (p < 0 ? "" : p.toFixed(precision)),
    };
    const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: pal.text,
        fontFamily: "Lato, -apple-system, 'Segoe UI', sans-serif",
        fontSize: 12,
        panes: { separatorColor: pal.separator, separatorHoverColor: pal.separatorHover, enableResize: true },
      },
      grid: { vertLines: { visible: false }, horzLines: { color: pal.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: INTRADAY.has(tf), secondsVisible: false, rightOffset: 6 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.crosshair, labelBackgroundColor: pal.crosshairLabel },
        horzLine: { color: pal.crosshair, labelBackgroundColor: pal.crosshairLabel },
      },
      localization: { locale: "ro-RO" },
    });

    const T = (t: string | number) => t as Time;
    const points = (values: (number | null)[]) => {
      const data: { time: Time; value: number }[] = [];
      values.forEach((v, i) => v != null && Number.isFinite(v) && data.push({ time: T(candles[i].time), value: v }));
      return data;
    };

    if (show("vol")) {
      const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", ...quiet });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
      volume.setData(
        candles.map((c) => ({ time: T(c.time), value: c.volume, color: c.close >= c.open ? "rgba(63,191,108,0.42)" : "rgba(242,85,92,0.42)" })),
      );
    }

    const line = (values: (number | null)[], color: string, paneIndex = 0, style: LineStyle = LineStyle.Solid) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: style, priceFormat, ...quiet }, paneIndex);
      s.setData(points(values));
      return s;
    };
    if (show("bb")) {
      line(model.bb.upper, C_BB);
      line(model.bb.lower, C_BB);
      line(model.bb.mid, C_BB, 0, LineStyle.Dashed);
    }
    if (show("sma200")) line(model.s200, C_SMA200);
    if (show("sma50")) line(model.s50, C_SMA50);
    if (show("sma20")) line(model.s20, C_SMA20);
    if (show("ema21")) line(model.e21, C_EMA21);
    if (show("ema9")) line(model.e9, C_EMA9);
    if (show("vwap")) line(model.vwap, C_VWAP);

    const main =
      kind === "candle"
        ? chart.addSeries(CandlestickSeries, {
            upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false, priceFormat,
          })
        : chart.addSeries(LineSeries, { color: "#5aa9f0", lineWidth: 2, priceFormat });
    if (kind === "candle") {
      main.setData(candles.map((c) => ({ time: T(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      main.setData(candles.map((c) => ({ time: T(c.time), value: c.close })));
    }
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.12, bottom: show("vol") ? 0.2 : 0.08 } });

    let pane = 0;
    if (showRsi) {
      pane += 1;
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: C_RSI, lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        pane,
      );
      rsiSeries.setData(points(model.rsi));
      const level = (price: number, color: string, style: LineStyle) =>
        rsiSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: false, title: "" });
      level(70, "rgba(192,95,196,0.75)", LineStyle.Solid);
      level(50, "rgba(242,85,92,0.5)", LineStyle.Dashed);
      level(30, "rgba(90,169,240,0.75)", LineStyle.Solid);
    }
    if (showMacd) {
      pane += 1;
      const macdFormat = { type: "price" as const, precision: precision + 1, minMove: 1 / 10 ** (precision + 1) };
      const hist = chart.addSeries(HistogramSeries, { priceFormat: macdFormat, ...quiet }, pane);
      const histData: { time: Time; value: number; color: string }[] = [];
      model.macd.hist.forEach((v, i) => {
        if (v != null && Number.isFinite(v)) {
          histData.push({ time: T(candles[i].time), value: v, color: v >= 0 ? "rgba(63,191,108,0.6)" : "rgba(242,85,92,0.6)" });
        }
      });
      hist.setData(histData);
      const macdLine = chart.addSeries(LineSeries, { color: C_MACD, lineWidth: 1, priceFormat: macdFormat, ...quiet }, pane);
      macdLine.setData(points(model.macd.macd));
      const signalLine = chart.addSeries(LineSeries, { color: C_SIGNAL, lineWidth: 1, priceFormat: macdFormat, ...quiet }, pane);
      signalLine.setData(points(model.macd.signal));
      macdLine.createPriceLine({ price: 0, color: pal.separator, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
    }
    // Stretch factors rather than setHeight: with autoSize the chart has no size yet at this point.
    // Price pane = 500 px of box minus the time axis; each sub-pane 120 px.
    const panes = chart.panes();
    panes.forEach((p, k) => p.setStretchFactor(k === 0 ? PRICE_PANE - AXIS_GUESS : SUB_PANE));
    // Sub-pane labels follow the panes' real positions once the chart has laid out.
    let frame = requestAnimationFrame(function measure() {
      const top = el.getBoundingClientRect().top;
      const tops = chart.panes().slice(1).map((p) => {
        const h = p.getHTMLElement();
        return h ? h.getBoundingClientRect().top - top : -1;
      });
      if (tops.some((t) => t <= 0)) frame = requestAnimationFrame(measure);
      else setPaneTops(tops);
    });

    const n = candles.length;
    const saved = viewRef.current;
    if (saved && saved.tf === tf && saved.n === n) chart.timeScale().setVisibleLogicalRange(saved.range);
    else chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - INITIAL_BARS[tf]) - 0.5, to: n + 5 });

    const indexOf = new Map<string | number, number>();
    candles.forEach((c, i) => indexOf.set(c.time, i));
    chart.subscribeCrosshairMove((p) => {
      const i = p.time != null ? indexOf.get(p.time as string | number) : undefined;
      setHover(i ?? null);
    });

    return () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      viewRef.current = range ? { tf, n, range } : null;
      cancelAnimationFrame(frame);
      chart.remove();
    };
    // `show` is derived from `on` and `tf`, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, kind, tf, theme, on]);

  const i = hover != null && hover < candles.length ? hover : candles.length - 1;
  const c = candles[i];
  const dir = c && c.close >= c.open ? "pos" : "neg";
  const digits = c ? digitsFor(c.close) : 2;
  const val = (v: number | null | undefined, d = digits) => (v != null && Number.isFinite(v) ? fmtNum(v, d) : "-");
  const row = (label: string, value: string, color: string) => (
    <div key={label} style={{ color }}>
      {label} <span className="dot">·</span> {value}
    </div>
  );

  // Sub-pane labels sit at the top of their pane (RSI above MACD); estimated until the panes are measured.
  const labelStyle = (k: number): CSSProperties => {
    const measured = paneTops.length === subPanes ? paneTops[k] : undefined;
    return measured != null ? { top: measured + 6, bottom: "auto" } : { bottom: (subPanes - k) * SUB_PANE + AXIS_GUESS - 26 };
  };
  const boxStyle = { "--sub-panes": subPanes } as CSSProperties;

  const menuGroup = (group: "over" | "under", title: string) => (
    <fieldset className="ind-group">
      <legend>{title}</legend>
      {INDICATORS.filter((d) => d.group === group).map((d) => {
        const disabled = d.id === "vwap" && !intraday;
        return (
          <label
            key={d.id}
            className={disabled ? "ind-item off" : "ind-item"}
            title={disabled ? "VWAP se calculează doar pe intervalele intraday (15M – 4H)" : undefined}
          >
            <input type="checkbox" checked={on.has(d.id)} disabled={disabled} onChange={() => toggle(d.id)} />
            <span className="ind-swatch" style={{ background: d.color }} />
            {d.label}
          </label>
        );
      })}
    </fieldset>
  );

  return (
    <section className="panel chart-panel">
      <div className="chart-toolbar">
        <div className="seg" role="group" aria-label="Tip grafic">
          <button className={kind === "candle" ? "on" : ""} onClick={() => setKind("candle")}>Lumânări</button>
          <button className={kind === "line" ? "on" : ""} onClick={() => setKind("line")}>Linie</button>
        </div>
        <div className="tfs" role="group" aria-label="Interval">
          {TFS.map((t) => {
            const why = unavailable(t.id);
            return (
              <button
                key={t.id}
                className={tf === t.id ? "on" : ""}
                title={why ?? t.title}
                disabled={!!why}
                onClick={() => setTf(t.id)}
              >
                {t.id}
              </button>
            );
          })}
        </div>
        <div className="ind-menu" ref={menuRef}>
          <div className="seg">
            <button
              className={menuOpen ? "on" : ""}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              Indicatori <span className="ind-caret">▾</span>
            </button>
          </div>
          {menuOpen && (
            <div className="ind-pop" role="dialog" aria-label="Indicatori">
              {menuGroup("over", "Pe grafic")}
              {menuGroup("under", "Sub grafic")}
            </div>
          )}
        </div>
        <div className="chart-note">Date Yahoo Finance · instantaneu, fără actualizare live</div>
      </div>

      <div className="chart-box" style={boxStyle}>
        {c && (
          <div className="chart-legend">
            <div className="ohlc">
              <span className="when">{timeLabel(c.time)}</span>
              <span>O<b className={dir}>{fmtNum(c.open, digits)}</b></span>
              <span>H<b className={dir}>{fmtNum(c.high, digits)}</b></span>
              <span>L<b className={dir}>{fmtNum(c.low, digits)}</b></span>
              <span>C<b className={dir}>{fmtNum(c.close, digits)}</b></span>
              <span>Vol<b className={dir}>{fmtBig(c.volume)}</b></span>
            </div>
            {show("sma20") && row("SMA 20", val(model.s20[i]), C_SMA20)}
            {show("sma50") && row("SMA 50", val(model.s50[i]), C_SMA50)}
            {show("sma200") && row("SMA 200", val(model.s200[i]), C_SMA200)}
            {show("ema9") && row("EMA 9", val(model.e9[i]), C_EMA9)}
            {show("ema21") && row("EMA 21", val(model.e21[i]), C_EMA21)}
            {show("bb") &&
              row(
                "BB 20, 2",
                model.bb.mid[i] != null
                  ? `${val(model.bb.upper[i])} / ${val(model.bb.mid[i])} / ${val(model.bb.lower[i])}`
                  : "-",
                C_BB,
              )}
            {show("vwap") && row("VWAP", val(model.vwap[i]), C_VWAP)}
          </div>
        )}
        {showRsi && (
          <div className="rsi-label" style={labelStyle(0)}>
            <b>RSI 14</b>
            <span style={{ color: C_RSI }}>{val(model.rsi[i], 2)}</span>
          </div>
        )}
        {showMacd && (
          <div className="rsi-label" style={labelStyle(showRsi ? 1 : 0)}>
            <b>MACD 12, 26, 9</b>
            <span style={{ color: C_MACD }}>{val(model.macd.macd[i], digits + 1)}</span>
            <span style={{ color: C_SIGNAL }}>{val(model.macd.signal[i], digits + 1)}</span>
            <span className={(model.macd.hist[i] ?? 0) >= 0 ? "pos" : "neg"}>{val(model.macd.hist[i], digits + 1)}</span>
          </div>
        )}
        <div className="chart-canvas" ref={boxRef} />
      </div>
    </section>
  );
}
