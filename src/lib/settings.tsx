// Site-wide display settings: colour theme and display currency.
// Everything that shows money goes through `convert` / `unit`, so a currency switch reaches every panel.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { dataUrl, useJson } from "./data";
import type { Currency, FxFile } from "./types";

export type Theme = "dark" | "light";
export const CURRENCIES: Currency[] = ["RON", "EUR", "USD"];

export interface Settings {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Currency amounts are shown in. Stays "RON" until fx.json has loaded (or if it is missing). */
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** False while fx.json is loading or absent — the currency picker should be disabled. */
  fxReady: boolean;
  /**
   * Convert `amount` from `from` (default "RON") into the display currency.
   * With `day` ('YYYY-MM-DD') the rate of that day is used — for charts and historical statements;
   * without it, the latest rate. Amounts in a currency we have no rate for come back unchanged.
   */
  convert: (amount: number, from?: string, day?: string) => number;
  /** The currency code `convert(x, from)` actually returns: the display currency, or `from` when it cannot be converted. */
  unit: (from?: string) => string;
}

const KEY_THEME = "bv.theme";
const KEY_CURRENCY = "bv.currency";

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode / storage disabled
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // not fatal: the choice just will not survive a reload
  }
}

function initialTheme(): Theme {
  const saved = stored(KEY_THEME);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function initialCurrency(): Currency {
  const saved = stored(KEY_CURRENCY);
  return CURRENCIES.includes(saved as Currency) ? (saved as Currency) : "RON";
}

/** Last FX row dated on or before `day`; the first row if `day` predates the history. */
function rowOn(fx: FxFile, day: string): [string, number, number] | null {
  const rows = fx.daily;
  if (!rows.length) return null;
  let lo = 0;
  let hi = rows.length - 1;
  if (day <= rows[0][0]) return rows[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rows[mid][0] <= day) lo = mid;
    else hi = mid - 1;
  }
  return rows[lo];
}

const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [wanted, setWanted] = useState<Currency>(initialCurrency);
  const fx = useJson<FxFile>(dataUrl("fx.json")).data;
  const fxReady = !!fx && fx.latest?.EUR > 0 && fx.latest?.USD > 0;
  const currency: Currency = fxReady ? wanted : "RON";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    store(KEY_THEME, next);
  }, []);
  const setCurrency = useCallback((next: Currency) => {
    setWanted(next);
    store(KEY_CURRENCY, next);
  }, []);

  const value = useMemo<Settings>(() => {
    /** RON per one unit of `ccy`, or null when we have no rate for it. */
    const ronPer = (ccy: string, day?: string): number | null => {
      if (ccy === "RON") return 1;
      if (!fxReady || !fx || (ccy !== "EUR" && ccy !== "USD")) return null;
      const row = day ? rowOn(fx, day) : null;
      const rate = row ? (ccy === "EUR" ? row[1] : row[2]) : fx.latest[ccy];
      return rate > 0 ? rate : fx.latest[ccy];
    };
    const convert = (amount: number, from = "RON", day?: string): number => {
      if (from === currency) return amount;
      const a = ronPer(from, day);
      const b = ronPer(currency, day);
      return a == null || b == null ? amount : (amount * a) / b;
    };
    const unit = (from = "RON"): string =>
      from === currency || (ronPer(from) != null && ronPer(currency) != null) ? currency : from;
    return { theme, setTheme, currency, setCurrency, fxReady, convert, unit };
  }, [theme, currency, fx, fxReady, setTheme, setCurrency]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Settings {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSettings must be used inside <SettingsProvider>");
  return s;
}
