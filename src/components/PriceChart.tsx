import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AreaSeries, BarSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle,
  MismatchDirection, PriceScaleMode, createChart, createSeriesMarkers,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, LogicalRange, SeriesMarker, SeriesType, Time } from "lightweight-charts";
import { candleDay, candlesFor, futureSlots, heikinAshi, indexForDay, rangeStart, tfForRange } from "../lib/aggregate";
import type { Candle, RangePreset, Tf } from "../lib/aggregate";
import { atr, bollinger, ema, macd, obv, rsi, sma, stochastic, vwap } from "../lib/indicators";
import { dataUrl, useJson } from "../lib/data";
import { fmtBig, fmtNum, fmtSignedPct, signClass } from "../lib/format";
import { useRoute } from "../lib/router";
import { useSettings } from "../lib/settings";
import type { Theme } from "../lib/settings";
import type { BarsFile, ChartEvents, IndexFile } from "../lib/types";
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
const RANGES: { id: RangePreset; label: string; title: string }[] = [
  { id: "1L", label: "1L", title: "Ultima lună" },
  { id: "3L", label: "3L", title: "Ultimele 3 luni" },
  { id: "6L", label: "6L", title: "Ultimele 6 luni" },
  { id: "YTD", label: "YTD", title: "De la începutul anului" },
  { id: "1A", label: "1A", title: "Ultimul an" },
  { id: "5A", label: "5A", title: "Ultimii 5 ani" },
  { id: "MAX", label: "Max", title: "Tot istoricul" },
];
const INITIAL_BARS: Record<Tf, number> = { "15M": 200, "30M": 200, "1H": 170, "4H": 190, D: 230, W: 210, M: 400 };
const INTRADAY = new Set<Tf>(["15M", "30M", "1H", "4H"]);
/** How far past the last candle an upcoming event is still drawn, in candles. */
const FUTURE_MAX: Record<Tf, number> = { "15M": 0, "30M": 0, "1H": 0, "4H": 0, D: 25, W: 10, M: 4 };
const NO_M_DATA = "Fără date la 15 minute — rulează din nou `npm run scrape`";
const NO_H_DATA = "Fără date intraday pentru acest simbol";

const UP = "#3fbf6c";
const DOWN = "#f2555c";
const C_MAIN = "#5aa9f0";
const C_SMA20 = "#c05fc4";
const C_SMA50 = "#f0a23a";
const C_SMA200 = "#a39547";
const C_EMA9 = "#4fb8e8";
const C_EMA21 = "#e8678f";
const C_EMA50 = "#7cc24a";
const C_EMA200 = "#a98bf0";
const C_BB = "#7d8ce0";
const C_VWAP = "#26a69a";
const C_RSI = "#f0a23a";
const C_MACD = "#5aa9f0";
const C_SIGNAL = "#f0a23a";
const C_STOCH_K = "#5aa9f0";
const C_STOCH_D = "#f0a23a";
const C_ATR = "#d36fd6";
const C_OBV = "#26a69a";
const C_DIV = "#2f8fe0";
const C_EARN = "#e39a2b";
const C_CMP = ["#e0b100", "#e0529c"];
const PRICE_PANE = 500;
const SUB_PANE = 120;
const AXIS_GUESS = 28; // time-axis height, only used to split the box before panes can be measured

// ---------- chart type / scale ----------

type Kind = "candle" | "bar" | "ha" | "line" | "area";
const KINDS: { id: Kind; label: string }[] = [
  { id: "candle", label: "Lumânări" },
  { id: "bar", label: "Bare OHLC" },
  { id: "ha", label: "Heikin-Ashi" },
  { id: "line", label: "Linie" },
  { id: "area", label: "Arie" },
];
type Scale = "normal" | "log" | "pct";
const SCALES: { id: Scale; label: string; title: string }[] = [
  { id: "normal", label: "Normal", title: "Scală normală" },
  { id: "log", label: "Log", title: "Scală logaritmică" },
  { id: "pct", label: "%", title: "Scală procentuală (față de prima lumânare vizibilă)" },
];
const SCALE_MODE: Record<Scale, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  pct: PriceScaleMode.Percentage,
};

// ---------- indicator menu ----------

type IndId =
  | "sma20" | "sma50" | "sma200" | "ema9" | "ema21" | "ema50" | "ema200" | "bb" | "vwap"
  | "vol" | "rsi" | "macd" | "stoch" | "atr" | "obv";
type PaneId = "rsi" | "macd" | "stoch" | "atr" | "obv";
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
  { id: "ema50", label: "EMA 50", group: "over", color: C_EMA50 },
  { id: "ema200", label: "EMA 200", group: "over", color: C_EMA200 },
  { id: "bb", label: "Bollinger Bands (20, 2)", group: "over", color: C_BB },
  { id: "vwap", label: "VWAP", group: "over", color: C_VWAP },
  { id: "vol", label: "Volum", group: "under", color: "#7f8696" },
  { id: "rsi", label: "RSI 14", group: "under", color: C_RSI },
  { id: "macd", label: "MACD (12, 26, 9)", group: "under", color: C_MACD },
  { id: "stoch", label: "Stochastic (14, 3, 3)", group: "under", color: C_STOCH_K },
  { id: "atr", label: "ATR 14", group: "under", color: C_ATR },
  { id: "obv", label: "OBV", group: "under", color: C_OBV },
];
/** Sub-panes, top to bottom. */
const PANES: PaneId[] = ["rsi", "macd", "stoch", "atr", "obv"];
const KNOWN = new Set<string>(INDICATORS.map((d) => d.id));
const OVERLAY = new Set<IndId>(INDICATORS.filter((d) => d.group === "over").map((d) => d.id));
const DEFAULT_ON: IndId[] = ["sma20", "sma50", "sma200", "vol", "rsi"];
const KEY_IND = "bv.indicators";
const KEY_KIND = "bv.chartType";
const KEY_SCALE = "bv.chartScale";
const KEY_EVENTS = "bv.chartEvents";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode / storage disabled
  }
}
function writeKey(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // not fatal: the choice just will not survive a reload
  }
}
function loadChoice<T extends string>(key: string, allowed: readonly { id: T }[], fallback: T): T {
  const v = readKey(key);
  return allowed.some((a) => a.id === v) ? (v as T) : fallback;
}

function loadIndicators(): Set<IndId> {
  try {
    const raw = readKey(KEY_IND);
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const known = parsed.filter((x): x is IndId => typeof x === "string" && KNOWN.has(x));
        // An empty list is a real choice ("everything off"); a list of only unknown ids is not.
        if (known.length || parsed.length === 0) return new Set(known);
      }
    }
  } catch {
    // bad JSON → defaults
  }
  return new Set(DEFAULT_ON);
}
function saveIndicators(on: Set<IndId>) {
  writeKey(KEY_IND, JSON.stringify(INDICATORS.filter((d) => on.has(d.id)).map((d) => d.id)));
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

const digitsFor = (x: number) => (Math.abs(x) >= 10 ? 2 : Math.abs(x) >= 1 ? 3 : 4);
type Convert = (amount: number, from?: string, day?: string) => number;

/** Candles in the display currency, each at its own day's rate; volume stays in shares. */
function inCurrency(raw: Candle[], currency: string, convert: Convert): Candle[] {
  if (currency === "RON") return raw;
  const rates = new Map<string, number>();
  return raw.map((c) => {
    const day = candleDay(c.time);
    let r = rates.get(day);
    if (r === undefined) {
      r = convert(1, "RON", day);
      if (!Number.isFinite(r) || r <= 0) r = 1;
      rates.set(day, r);
    }
    return { ...c, open: c.open * r, high: c.high * r, low: c.low * r, close: c.close * r };
  });
}

/** Index of the first candle whose time is >= `t` (candle times share one type per interval). */
function firstAtOrAfter(candles: Candle[], t: string | number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

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
  e50: Series;
  e200: Series;
  bb: { mid: Series; upper: Series; lower: Series };
  vwap: Series;
  rsi: Series;
  macd: { macd: Series; signal: Series; hist: Series };
  stoch: { k: Series; d: Series };
  atr: Series;
  obv: Series;
}

interface EvItem {
  kind: "D" | "E";
  day: string;
  /** Dividend per share in the display currency. */
  amount?: number;
}
interface EventModel {
  /** Events by the candle (or future slot) time they are drawn on. */
  at: Map<string | number, EvItem[]>;
  /** Empty time slots after the last candle, up to the furthest upcoming event. */
  future: string[];
}

interface CompareLine {
  ticker: string;
  color: string;
  loading: boolean;
  candles: Candle[];
  byTime: Map<string | number, number>;
}

type Menu = "ind" | "more" | null;

export function PriceChart({ bars, initialTf, onTf, events }: Props) {
  const { theme, currency, convert, unit } = useSettings();
  const route = useRoute();
  const ticker = route.page === "stock" ? route.ticker : "";
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
  const [kind, setKindState] = useState<Kind>(() => loadChoice(KEY_KIND, KINDS, "candle"));
  const setKind = (k: Kind) => {
    setKindState(k);
    writeKey(KEY_KIND, k);
  };
  const [scale, setScaleState] = useState<Scale>(() => loadChoice(KEY_SCALE, SCALES, "normal"));
  const setScale = (s: Scale) => {
    setScaleState(s);
    writeKey(KEY_SCALE, s);
  };
  const [evOn, setEvOn] = useState<boolean>(() => readKey(KEY_EVENTS) !== "0");
  const [hoverTime, setHoverTime] = useState<string | number | null>(null);
  const [on, setOn] = useState<Set<IndId>>(loadIndicators);
  const [menu, setMenu] = useState<Menu>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const [preset, setPreset] = useState<RangePreset | null>(null);
  /** A preset's date range waiting to be applied by the chart built for `tf`. */
  const [rangeReq, setRangeReq] = useState<{ tf: Tf; start: string; id: number } | null>(null);
  const [firstVisTime, setFirstVisTime] = useState<string | number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Top of each sub-pane in px from the top of the chart box, measured after layout. */
  const [paneTops, setPaneTops] = useState<number[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Last visible range, so a rebuild (indicator / theme / currency change) keeps the user's zoom. */
  /** Kept as the first visible candle's time plus the gap after the last candle: a comparison line can add
   *  time points before or between our candles, which shifts every logical index. */
  const viewRef = useRef<{ tf: Tf; n: number; fromTime: string | number; fromFrac: number; afterLast: number } | null>(null);
  const appliedReq = useRef<number>(0);
  /** The range a preset set, to notice when the user scrolls or zooms away from it. */
  const presetRange = useRef<LogicalRange | null>(null);
  const presetSeen = useRef(false);

  const intraday = INTRADAY.has(tf);
  const mode: Scale = cmp.length ? "pct" : scale;
  // On the percent scale every line is measured from its own first visible value, so a moving average would be
  // drawn against a different base than the price: price overlays are left out there.
  const show = (id: IndId) => on.has(id) && (id !== "vwap" || intraday) && !(mode === "pct" && OVERLAY.has(id));
  const panes = PANES.filter((p) => show(p));
  const subPanes = panes.length;
  const marksOn = evOn && !intraday;

  const toggle = (id: IndId) => {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIndicators(next);
      return next;
    });
  };
  const toggleEvents = () => {
    setEvOn((v) => {
      writeKey(KEY_EVENTS, v ? "0" : "1");
      return !v;
    });
  };

  useEffect(() => {
    if (!menu) return;
    const ref = menu === "ind" ? indRef : moreRef;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!panelRef.current && document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const toggleFullscreen = () => {
    setMenu(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void panelRef.current?.requestFullscreen?.().catch(() => {});
  };

  const candles = useMemo(() => inCurrency(candlesFor(tf, bars), currency, convert), [tf, bars, currency, convert]);
  const shown = useMemo(() => (kind === "ha" ? heikinAshi(candles) : candles), [kind, candles]);

  const model = useMemo<Model>(() => {
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const none: Series = new Array(candles.length).fill(null);
    const want = (id: IndId) => on.has(id);
    return {
      candles,
      s20: want("sma20") ? sma(closes, 20) : none,
      s50: want("sma50") ? sma(closes, 50) : none,
      s200: want("sma200") ? sma(closes, 200) : none,
      e9: want("ema9") ? ema(closes, 9) : none,
      e21: want("ema21") ? ema(closes, 21) : none,
      e50: want("ema50") ? ema(closes, 50) : none,
      e200: want("ema200") ? ema(closes, 200) : none,
      bb: want("bb") ? bollinger(closes, 20, 2) : { mid: none, upper: none, lower: none },
      vwap:
        want("vwap") && INTRADAY.has(tf)
          ? vwap(highs, lows, closes, candles.map((c) => c.volume), candles.map((c) => Math.floor((c.time as number) / 86400)))
          : none,
      rsi: want("rsi") ? rsi(closes, 14) : none,
      macd: want("macd") ? macd(closes, 12, 26, 9) : { macd: none, signal: none, hist: none },
      stoch: want("stoch") ? stochastic(highs, lows, closes, 14, 3, 3) : { k: none, d: none },
      atr: want("atr") ? atr(highs, lows, closes, 14) : none,
      obv: want("obv") ? obv(closes, candles.map((c) => c.volume)) : none,
    };
  }, [candles, on, tf]);

  // Dividends and earnings, on the candle they fall in (daily and longer intervals only).
  const eventModel = useMemo<EventModel>(() => {
    const at = new Map<string | number, EvItem[]>();
    let future: string[] = [];
    if (INTRADAY.has(tf) || !candles.length) return { at, future };
    const times = candles.map((c) => c.time as string);
    const lastDay = times[times.length - 1];
    const place = (item: EvItem) => {
      const idx = indexForDay(tf, times, item.day);
      let key: string | null = idx >= 0 ? times[idx] : null;
      if (key == null && item.day > lastDay) {
        const slots = futureSlots(tf, lastDay, item.day, FUTURE_MAX[tf]);
        if (slots.length) {
          key = slots[slots.length - 1];
          if (slots.length > future.length) future = slots;
        }
      }
      if (key == null) return;
      const list = at.get(key) ?? [];
      list.push(item);
      at.set(key, list);
    };
    for (const [day, amount] of events?.dividends ?? []) {
      if (typeof day === "string" && Number.isFinite(amount)) place({ kind: "D", day, amount: convert(amount, "RON", day) });
    }
    for (const day of events?.earnings ?? []) {
      if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) place({ kind: "E", day });
    }
    return { at, future };
  }, [tf, candles, events, convert]);

  // Comparison tickers (up to two), loaded through the cached JSON hook.
  const index = useJson<IndexFile>(dataUrl("index.json"));
  const cmp0 = useJson<BarsFile>(cmp[0] ? dataUrl(`bars/${cmp[0]}.json`) : null);
  const cmp1 = useJson<BarsFile>(cmp[1] ? dataUrl(`bars/${cmp[1]}.json`) : null);
  const compare = useMemo<CompareLine[]>(() => {
    const loaded = [cmp0, cmp1];
    return cmp.map((t, k) => {
      const data = loaded[k].data;
      const cs = data ? inCurrency(candlesFor(tf, data), currency, convert) : [];
      return {
        ticker: t,
        color: C_CMP[k],
        loading: loaded[k].loading,
        candles: cs,
        byTime: new Map(cs.map((c) => [c.time, c.close])),
      };
    });
  }, [cmp, cmp0, cmp1, tf, currency, convert]);
  const compareKey = compare.map((c) => `${c.ticker}:${c.candles.length}`).join(",");

  useEffect(() => {
    const el = boxRef.current;
    const { candles } = model;
    if (!el || !candles.length) return;
    setHoverTime(null);

    const pal = PALETTES[theme] ?? PALETTES.dark;
    const lastClose = candles[candles.length - 1].close;
    const precision = digitsFor(lastClose);
    // The bottom margin reserved for volume can push the axis below zero on penny stocks;
    // a price is never negative, so those ticks are left unlabelled.
    const formatFor = (digits: number) => ({
      type: "custom" as const,
      minMove: 1 / 10 ** digits,
      formatter: (p: number) => (p < 0 ? "" : p.toFixed(digits)),
    });
    const priceFormat = formatFor(precision);
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
    chartRef.current = chart;

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

    const line = (values: (number | null)[], color: string, paneIndex = 0, style: LineStyle = LineStyle.Solid, format: object = priceFormat) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: style, priceFormat: format, ...quiet }, paneIndex);
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
    if (show("ema200")) line(model.e200, C_EMA200);
    if (show("ema50")) line(model.e50, C_EMA50);
    if (show("ema21")) line(model.e21, C_EMA21);
    if (show("ema9")) line(model.e9, C_EMA9);
    if (show("vwap")) line(model.vwap, C_VWAP);

    for (const c of compare) {
      if (!c.candles.length) continue;
      const s = chart.addSeries(LineSeries, {
        color: c.color, lineWidth: 2, priceFormat: formatFor(digitsFor(c.candles[c.candles.length - 1].close)),
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: c.ticker,
      });
      s.setData(c.candles.map((x) => ({ time: T(x.time), value: x.close })));
    }

    const ohlc = shown.map((c) => ({ time: T(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));
    const values = shown.map((c) => ({ time: T(c.time), value: c.close }));
    const main =
      kind === "candle" || kind === "ha"
        ? chart.addSeries(CandlestickSeries, {
            upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false, priceFormat,
          })
        : kind === "bar"
          ? chart.addSeries(BarSeries, { upColor: UP, downColor: DOWN, thinBars: false, priceFormat })
          : kind === "area"
            ? chart.addSeries(AreaSeries, {
                lineColor: C_MAIN, topColor: "rgba(90,169,240,0.32)", bottomColor: "rgba(90,169,240,0.02)", lineWidth: 2, priceFormat,
              })
            : chart.addSeries(LineSeries, { color: C_MAIN, lineWidth: 2, priceFormat });
    main.setData(kind === "line" || kind === "area" ? values : ohlc);
    chart.priceScale("right", 0).applyOptions({
      mode: SCALE_MODE[mode],
      scaleMargins: { top: 0.12, bottom: show("vol") ? 0.2 : 0.08 },
    });

    // Event marks: past ones on their candle, upcoming ones on an invisible copy of the close line that
    // runs on into the empty slots after the last candle (so they also sit right in percent mode).
    if (marksOn && eventModel.at.size) {
      const marks = (keep: (t: string | number) => boolean): SeriesMarker<Time>[] => {
        const out: SeriesMarker<Time>[] = [];
        const keys = [...eventModel.at.keys()].filter(keep).sort();
        for (const t of keys) {
          const list = eventModel.at.get(t) ?? [];
          if (list.some((e) => e.kind === "E")) out.push({ time: T(t), position: "aboveBar", shape: "circle", color: C_EARN, text: "E" });
          if (list.some((e) => e.kind === "D")) out.push({ time: T(t), position: "belowBar", shape: "circle", color: C_DIV, text: "D" });
        }
        return out;
      };
      const future = new Set<string | number>(eventModel.future);
      createSeriesMarkers(main, marks((t) => !future.has(t)));
      if (eventModel.future.length) {
        const ghost = chart.addSeries(LineSeries, {
          color: "rgba(0,0,0,0)", lineVisible: false, pointMarkersVisible: false, ...quiet,
          priceFormat, autoscaleInfoProvider: () => null,
        });
        ghost.setData([
          ...values,
          ...eventModel.future.map((t) => (eventModel.at.has(t) ? { time: T(t), value: lastClose } : { time: T(t) })),
        ]);
        createSeriesMarkers(ghost, marks((t) => future.has(t)).map((m) => ({ ...m, position: "inBar" as const })));
      }
    }

    let pane = 0;
    const level = (s: ISeriesApi<SeriesType>, price: number, color: string, style: LineStyle) =>
      s.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: false, title: "" });
    const range0to100 = () => ({ priceRange: { minValue: 0, maxValue: 100 } });
    const pctFormat = { type: "price" as const, precision: 2, minMove: 0.01 };
    const subFormat = { type: "price" as const, precision: precision + 1, minMove: 1 / 10 ** (precision + 1) };
    for (const id of PANES) {
      if (!show(id)) continue;
      pane += 1;
      if (id === "rsi") {
        const s = chart.addSeries(
          LineSeries,
          { color: C_RSI, lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: pctFormat, autoscaleInfoProvider: range0to100 },
          pane,
        );
        s.setData(points(model.rsi));
        level(s, 70, "rgba(192,95,196,0.75)", LineStyle.Solid);
        level(s, 50, "rgba(242,85,92,0.5)", LineStyle.Dashed);
        level(s, 30, "rgba(90,169,240,0.75)", LineStyle.Solid);
      } else if (id === "macd") {
        const hist = chart.addSeries(HistogramSeries, { priceFormat: subFormat, ...quiet }, pane);
        const histData: { time: Time; value: number; color: string }[] = [];
        model.macd.hist.forEach((v, i) => {
          if (v != null && Number.isFinite(v)) {
            histData.push({ time: T(candles[i].time), value: v, color: v >= 0 ? "rgba(63,191,108,0.6)" : "rgba(242,85,92,0.6)" });
          }
        });
        hist.setData(histData);
        const macdLine = line(model.macd.macd, C_MACD, pane, LineStyle.Solid, subFormat);
        line(model.macd.signal, C_SIGNAL, pane, LineStyle.Solid, subFormat);
        level(macdLine, 0, pal.separator, LineStyle.Dotted);
      } else if (id === "stoch") {
        const k = chart.addSeries(
          LineSeries,
          { color: C_STOCH_K, lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: pctFormat, autoscaleInfoProvider: range0to100 },
          pane,
        );
        k.setData(points(model.stoch.k));
        const d = chart.addSeries(
          LineSeries,
          { color: C_STOCH_D, lineWidth: 1, ...quiet, priceFormat: pctFormat, autoscaleInfoProvider: range0to100 },
          pane,
        );
        d.setData(points(model.stoch.d));
        level(k, 80, "rgba(192,95,196,0.75)", LineStyle.Solid);
        level(k, 20, "rgba(90,169,240,0.75)", LineStyle.Solid);
      } else if (id === "atr") {
        const s = chart.addSeries(LineSeries, { color: C_ATR, lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: subFormat }, pane);
        s.setData(points(model.atr));
      } else {
        const s = chart.addSeries(LineSeries, { color: C_OBV, lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: { type: "volume" } }, pane);
        s.setData(points(model.obv));
      }
    }
    // The scale mode is for the price pane only; sub-panes keep their own values.
    chart.panes().forEach((_, k) => k > 0 && chart.priceScale("right", k).applyOptions({ mode: PriceScaleMode.Normal }));
    // Stretch factors rather than setHeight: with autoSize the chart has no size yet at this point.
    // Price pane = 500 px of box minus the time axis; each sub-pane 120 px.
    chart.panes().forEach((p, k) => p.setStretchFactor(k === 0 ? PRICE_PANE - AXIS_GUESS : SUB_PANE));
    // Sub-pane labels follow the panes' real positions once the chart has laid out, and again after a resize
    // (full screen, window, a dragged pane separator).
    let frame = 0;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const tops = chart.panes().slice(1).map((p) => {
        const h = p.getHTMLElement();
        return h ? Math.round(h.getBoundingClientRect().top - top) : -1;
      });
      if (tops.some((t) => t <= 0)) frame = requestAnimationFrame(measure);
      else setPaneTops((prev) => (prev.length === tops.length && prev.every((v, k) => v === tops[k]) ? prev : tops));
    };
    frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(el);
    const onUp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener("pointerup", onUp);

    // Logical indices of candles: compare lines and future slots add time points, so ask the time scale.
    const ts = chart.timeScale();
    const n = candles.length;
    const idx = (k: number) => ts.timeToIndex(T(candles[k].time), true) ?? k;
    const lastIdx = idx(n - 1);
    const rightPad = Math.min(45, Math.max(6, eventModel.future.length + 2));
    const saved = viewRef.current;
    if (rangeReq && rangeReq.tf === tf && appliedReq.current !== rangeReq.id) {
      appliedReq.current = rangeReq.id;
      const found = candles.findIndex((c) => candleDay(c.time) >= rangeReq.start);
      const k = found < 0 ? n - 1 : found;
      const range = { from: idx(k) - 0.5, to: lastIdx + Math.max(3, eventModel.future.length + 2) } as LogicalRange;
      ts.setVisibleLogicalRange(range);
      presetRange.current = range;
      presetSeen.current = false;
    } else if (saved && saved.tf === tf && saved.n === n) {
      const from = ts.timeToIndex(T(saved.fromTime), true);
      if (from != null) {
        const range = { from: from + saved.fromFrac, to: lastIdx + saved.afterLast } as LogicalRange;
        ts.setVisibleLogicalRange(range);
        // A rebuild (chart type, indicator…) keeps an active preset: watch for leaving it from this range.
        if (presetRange.current) {
          presetRange.current = range;
          presetSeen.current = false;
        }
      }
    } else {
      ts.setVisibleLogicalRange({ from: idx(Math.max(0, n - INITIAL_BARS[tf])) - 0.5, to: lastIdx + rightPad });
    }

    ts.subscribeVisibleLogicalRangeChange((r) => {
      if (!r) return;
      const first = main.dataByIndex(Math.max(0, Math.ceil(r.from)), MismatchDirection.NearestRight);
      setFirstVisTime(first ? (first.time as string | number) : null);
      // Range events arrive late, so the first ones after a preset can still carry the old range: the preset
      // only counts as left once its own range has been seen.
      const p = presetRange.current;
      if (p) {
        // Layout (the price axis settling its width) nudges the range a little; only a real scroll / zoom counts.
        const tol = Math.max(2, (p.to - p.from) * 0.03);
        const same = Math.abs(p.from - r.from) <= tol && Math.abs(p.to - r.to) <= tol;
        if (same) presetSeen.current = true;
        else if (presetSeen.current) {
          presetRange.current = null;
          setPreset(null);
        }
      }
    });
    chart.subscribeCrosshairMove((p) => setHoverTime(p.time != null ? (p.time as string | number) : null));

    return () => {
      const range = ts.getVisibleLogicalRange();
      const first = range ? main.dataByIndex(Math.max(0, Math.ceil(range.from)), MismatchDirection.NearestRight) : null;
      const firstIdx = first ? ts.timeToIndex(first.time, false) : null;
      viewRef.current =
        range && first && firstIdx != null
          ? { tf, n, fromTime: first.time as string | number, fromFrac: range.from - firstIdx, afterLast: range.to - lastIdx }
          : null;
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("pointerup", onUp);
      chartRef.current = null;
      chart.remove();
    };
    // `show` / `marksOn` / `mode` derive from `on`, `tf`, `evOn`, `scale`, `cmp`, all listed; `compareKey` stands for `compare`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, shown, kind, tf, theme, on, evOn, eventModel, mode, compareKey, rangeReq]);

  const applyPreset = (p: RangePreset) => {
    if (!bars.d.length) return;
    const start = rangeStart(p, bars.d[bars.d.length - 1][0], bars.d[0][0]);
    const avail = TFS.filter((t) => !unavailable(t.id)).map((t) => ({ tf: t.id, candles: t.id === tf ? candles : candlesFor(t.id, bars) }));
    const next = tfForRange(tf, start, avail);
    presetRange.current = null;
    viewRef.current = null;
    setPreset(p);
    setRangeReq({ tf: next, start, id: Date.now() });
    if (next !== tf) setTf(next);
  };

  const addCompare = (t: string) => {
    if (!t || cmp.includes(t) || cmp.length >= 2) return;
    setCmp([...cmp, t]);
    setMenu(null);
  };
  const removeCompare = (t: string) => setCmp(cmp.filter((x) => x !== t));
  const tickers = useMemo(
    () => (index.data?.rows ?? []).filter((r) => r.ticker !== ticker).sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [index.data, ticker],
  );

  const savePng = () => {
    setMenu(null);
    const chart = chartRef.current;
    const panel = panelRef.current;
    const last = shown[shown.length - 1];
    if (!chart || !panel || !last) return;
    const shot = chart.takeScreenshot(true);
    const ratio = shot.width / Math.max(1, boxRef.current?.clientWidth ?? shot.width);
    const head = Math.round(34 * ratio);
    const out = document.createElement("canvas");
    out.width = shot.width;
    out.height = shot.height + head;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const css = getComputedStyle(panel);
    ctx.fillStyle = css.getPropertyValue("--bg").trim() || css.backgroundColor || "#22252e";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = css.getPropertyValue("--text").trim() || "#e9eaee";
    ctx.font = `700 ${Math.round(15 * ratio)}px Lato, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textBaseline = "middle";
    const tfTitle = TFS.find((t) => t.id === tf)?.title ?? tf;
    const d = digitsFor(last.close);
    const label = `${ticker || "BVB"} · ${tfTitle} · ${timeLabel(last.time)} · O ${fmtNum(last.open, d)}  H ${fmtNum(last.high, d)}  L ${fmtNum(last.low, d)}  C ${fmtNum(last.close, d)} ${unit("RON")} · bursaviz`;
    ctx.fillText(label, Math.round(12 * ratio), head / 2);
    ctx.drawImage(shot, 0, head);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticker || "grafic"}-${tf}-${candleDay(last.time)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  // ---------- legend ----------

  const indexOf = useMemo(() => new Map(candles.map((c, k) => [c.time, k])), [candles]);
  const hovered = hoverTime != null ? indexOf.get(hoverTime) : undefined;
  const i = hovered != null && hovered < candles.length ? hovered : candles.length - 1;
  const c = shown[i];
  const dir = c && c.close >= c.open ? "pos" : "neg";
  const digits = c ? digitsFor(c.close) : 2;
  const val = (v: number | null | undefined, d = digits) => (v != null && Number.isFinite(v) ? fmtNum(v, d) : "-");
  const row = (label: string, value: string, color: string) => (
    <div key={label} style={{ color }}>
      {label} <span className="dot">·</span> {value}
    </div>
  );
  const evKey = hoverTime != null && (hovered != null || eventModel.at.has(hoverTime)) ? hoverTime : candles[i]?.time;
  const evList = marksOn && evKey != null ? eventModel.at.get(evKey) ?? [] : [];
  const ccy = unit("RON");

  /** Change from the first visible candle, for the legend in percent mode. */
  const sinceFirst = (series: Candle[], at: string | number | undefined): number | null => {
    if (firstVisTime == null || at == null || !series.length) return null;
    const k = firstAtOrAfter(series, firstVisTime);
    const j = firstAtOrAfter(series, at);
    const base = series[k]?.close;
    const now = series[j]?.time === at ? series[j].close : null;
    return base && now != null ? now / base - 1 : null;
  };

  // Sub-pane labels sit at the top of their pane; estimated until the panes are measured.
  const labelStyle = (k: number): CSSProperties => {
    const measured = paneTops.length === subPanes ? paneTops[k] : undefined;
    return measured != null ? { top: measured + 6, bottom: "auto" } : { bottom: (subPanes - k) * SUB_PANE + AXIS_GUESS - 26 };
  };
  const boxStyle = { "--sub-panes": subPanes } as CSSProperties;
  const paneLabel: Record<PaneId, () => ReactNode> = {
    rsi: () => (
      <>
        <b>RSI 14</b>
        <span style={{ color: C_RSI }}>{val(model.rsi[i], 2)}</span>
      </>
    ),
    macd: () => (
      <>
        <b>MACD 12, 26, 9</b>
        <span style={{ color: C_MACD }}>{val(model.macd.macd[i], digits + 1)}</span>
        <span style={{ color: C_SIGNAL }}>{val(model.macd.signal[i], digits + 1)}</span>
        <span className={(model.macd.hist[i] ?? 0) >= 0 ? "pos" : "neg"}>{val(model.macd.hist[i], digits + 1)}</span>
      </>
    ),
    stoch: () => (
      <>
        <b>Stoch 14, 3, 3</b>
        <span style={{ color: C_STOCH_K }}>%K {val(model.stoch.k[i], 2)}</span>
        <span style={{ color: C_STOCH_D }}>%D {val(model.stoch.d[i], 2)}</span>
      </>
    ),
    atr: () => (
      <>
        <b>ATR 14</b>
        <span style={{ color: C_ATR }}>{val(model.atr[i], digits + 1)}</span>
      </>
    ),
    obv: () => (
      <>
        <b>OBV</b>
        <span style={{ color: C_OBV }}>{model.obv[i] != null ? fmtBig(model.obv[i]) : "-"}</span>
      </>
    ),
  };

  const menuGroup = (group: "over" | "under", title: string) => (
    <fieldset className="ind-group">
      <legend>{title}</legend>
      {INDICATORS.filter((d) => d.group === group).map((d) => {
        const disabled = d.id === "vwap" && !intraday;
        const hidden = mode === "pct" && group === "over";
        return (
          <label
            key={d.id}
            className={disabled || hidden ? "ind-item off" : "ind-item"}
            title={
              disabled
                ? "VWAP se calculează doar pe intervalele intraday (15M – 4H)"
                : hidden
                  ? "Ascuns pe scala procentuală (fiecare linie ar avea altă bază)"
                  : undefined
            }
          >
            <input type="checkbox" checked={on.has(d.id)} disabled={disabled} onChange={() => toggle(d.id)} />
            <span className="ind-swatch" style={{ background: d.color }} />
            {d.label}
          </label>
        );
      })}
    </fieldset>
  );

  const icon = (path: string) => (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );

  return (
    <section className={fullscreen ? "panel chart-panel is-fullscreen" : "panel chart-panel"} ref={panelRef}>
      <div className="chart-toolbar">
        <select className="chart-select chart-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tip grafic" title="Tip grafic">
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
        <div className="tfs" role="group" aria-label="Interval">
          {TFS.map((t) => {
            const why = unavailable(t.id);
            return (
              <button
                key={t.id}
                className={tf === t.id ? "on" : ""}
                title={why ?? t.title}
                disabled={!!why}
                onClick={() => {
                  setPreset(null);
                  presetRange.current = null;
                  setTf(t.id);
                }}
              >
                {t.id}
              </button>
            );
          })}
        </div>
        <div className="tfs ranges" role="group" aria-label="Perioadă">
          {RANGES.map((r) => (
            <button key={r.id} className={preset === r.id ? "on" : ""} title={r.title} onClick={() => applyPreset(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ind-menu" ref={indRef}>
          <div className="seg">
            <button
              className={menu === "ind" ? "on" : ""}
              aria-haspopup="true"
              aria-expanded={menu === "ind"}
              onClick={() => setMenu((m) => (m === "ind" ? null : "ind"))}
            >
              Indicatori <span className="ind-caret">▾</span>
            </button>
          </div>
          {menu === "ind" && (
            <div className="ind-pop" role="dialog" aria-label="Indicatori">
              {menuGroup("over", "Pe grafic")}
              {menuGroup("under", "Sub grafic")}
              <fieldset className="ind-group wide">
                <legend>Marcaje</legend>
                <label
                  className={intraday ? "ind-item off" : "ind-item"}
                  title={intraday ? "Evenimentele apar pe intervalele D, W și M" : "D = dividend (ex-date), E = earnings"}
                >
                  <input type="checkbox" checked={evOn} onChange={toggleEvents} />
                  <span className="ind-badge" style={{ background: C_DIV }}>D</span>
                  <span className="ind-badge" style={{ background: C_EARN }}>E</span>
                  Evenimente
                </label>
              </fieldset>
            </div>
          )}
        </div>
        <div className="more-menu" ref={moreRef}>
          <div className="seg more-btn">
            <button
              className={menu === "more" ? "on" : ""}
              aria-haspopup="true"
              aria-expanded={menu === "more"}
              onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
            >
              Mai mult <span className="ind-caret">▾</span>
            </button>
          </div>
          <div className={menu === "more" ? "more-pop open" : "more-pop"}>
            <div className="seg scale-seg" role="group" aria-label="Scală preț">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  className={mode === s.id ? "on" : ""}
                  title={cmp.length && s.id !== "pct" ? "Comparația folosește scala procentuală" : s.title}
                  disabled={cmp.length > 0 && s.id !== "pct"}
                  onClick={() => setScale(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <select
              className="chart-select cmp-select"
              value=""
              aria-label="Compară cu"
              disabled={cmp.length >= 2 || !tickers.length}
              title={cmp.length >= 2 ? "Cel mult două simboluri de comparat" : !tickers.length ? "Lista de simboluri nu e disponibilă" : undefined}
              onChange={(e) => addCompare(e.target.value)}
            >
              <option value="">Compară cu…</option>
              {tickers.map((r) => (
                <option key={r.ticker} value={r.ticker} disabled={cmp.includes(r.ticker)}>
                  {r.ticker} — {r.name}
                </option>
              ))}
            </select>
            <div className="seg tools-seg">
              {canFullscreen && (
                <button className={fullscreen ? "on" : ""} onClick={toggleFullscreen} title={fullscreen ? "Ieși din ecran complet" : "Ecran complet"} aria-label="Ecran complet">
                  {fullscreen ? icon("M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4") : icon("M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4")}
                  <span className="tool-txt">{fullscreen ? "Ieși" : "Ecran complet"}</span>
                </button>
              )}
              <button onClick={savePng} title="Descarcă graficul ca imagine PNG" aria-label="Descarcă PNG">
                {icon("M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11")}
                <span className="tool-txt">PNG</span>
              </button>
            </div>
          </div>
        </div>
        {cmp.length > 0 && (
          <div className="cmp-chips" aria-label="Simboluri comparate">
            {compare.map((x) => (
              <span key={x.ticker} className="cmp-chip">
                <span className="ind-swatch" style={{ background: x.color }} />
                {x.ticker}
                <button onClick={() => removeCompare(x.ticker)} title={`Elimină ${x.ticker} din comparație`} aria-label={`Elimină ${x.ticker}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="chart-note">Date Yahoo Finance · instantaneu, fără actualizare live</div>
      </div>

      <div className="chart-box" style={boxStyle}>
        {c && (
          <div className="chart-legend">
            <div className="ohlc">
              <span className="when">{timeLabel(c.time)}</span>
              {kind === "ha" && <span className="dim">HA</span>}
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
            {show("ema50") && row("EMA 50", val(model.e50[i]), C_EMA50)}
            {show("ema200") && row("EMA 200", val(model.e200[i]), C_EMA200)}
            {show("bb") &&
              row(
                "BB 20, 2",
                model.bb.mid[i] != null
                  ? `${val(model.bb.upper[i])} / ${val(model.bb.mid[i])} / ${val(model.bb.lower[i])}`
                  : "-",
                C_BB,
              )}
            {show("vwap") && row("VWAP", val(model.vwap[i]), C_VWAP)}
            {compare.length > 0 && (
              <div className="cmp-legend">
                <div>
                  <b className="cmp-name">{ticker || "Preț"}</b>{" "}
                  <span className={signClass(sinceFirst(candles, candles[i]?.time))}>{fmtSignedPct(sinceFirst(candles, candles[i]?.time))}</span>
                </div>
                {compare.map((x) => {
                  const at = candles[i]?.time;
                  const v = at != null ? x.byTime.get(at) : undefined;
                  const ch = sinceFirst(x.candles, at);
                  return (
                    <div key={x.ticker} style={{ color: x.color }}>
                      <b className="cmp-name">{x.ticker}</b>{" "}
                      {x.loading ? (
                        <span className="dim">se încarcă…</span>
                      ) : !x.candles.length ? (
                        <span className="dim">fără date pe acest interval</span>
                      ) : (
                        <>
                          {v != null ? fmtNum(v, digitsFor(v)) : "-"} <span className={signClass(ch)}>{fmtSignedPct(ch)}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {evList.map((e) =>
              e.kind === "D" ? (
                <div key={`D${e.day}`} className="ev-row">
                  <span className="ev-badge" style={{ background: C_DIV }}>D</span>
                  Dividend {e.amount != null ? fmtNum(e.amount, Math.abs(e.amount) >= 10 ? 2 : 4) : "-"} {ccy} / acțiune · ex-date {timeLabel(e.day)}
                </div>
              ) : (
                <div key={`E${e.day}`} className="ev-row">
                  <span className="ev-badge" style={{ background: C_EARN }}>E</span>
                  Earnings · {timeLabel(e.day)}
                </div>
              ),
            )}
          </div>
        )}
        {panes.map((p, k) => (
          <div key={p} className="rsi-label" style={labelStyle(k)}>
            {paneLabel[p]()}
          </div>
        ))}
        <div className="chart-canvas" ref={boxRef} />
      </div>
    </section>
  );
}
