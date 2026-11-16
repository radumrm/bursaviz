export const DASH = "-";

type N = number | null | undefined;
const ok = (x: N): x is number => typeof x === "number" && Number.isFinite(x);

export function fmtNum(x: N, digits = 2): string {
  if (!ok(x)) return DASH;
  return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Price with as many decimals as the BVB tick size needs (penny stocks trade in 0.0005 steps). */
export function fmtPrice(x: N): string {
  if (!ok(x)) return DASH;
  const a = Math.abs(x);
  return fmtNum(x, a >= 10 ? 2 : a >= 1 ? 3 : 4);
}

/** 46.61B / 17.02M / 62.33K */
export function fmtBig(x: N, digits = 2): string {
  if (!ok(x)) return DASH;
  const a = Math.abs(x);
  if (a >= 1e9) return fmtNum(x / 1e9, digits) + "B";
  if (a >= 1e6) return fmtNum(x / 1e6, digits) + "M";
  if (a >= 1e3) return fmtNum(x / 1e3, digits) + "K";
  return fmtNum(x, digits);
}

export function fmtInt(x: N): string {
  return ok(x) ? Math.round(x).toLocaleString("en-US") : DASH;
}

/** Fraction → percent: 0.7102 → "71.02%" */
export function fmtPct(x: N, digits = 2): string {
  return ok(x) ? fmtNum(x * 100, digits) + "%" : DASH;
}

export function fmtSignedPct(x: N, digits = 2): string {
  return ok(x) ? (x > 0 ? "+" : "") + fmtNum(x * 100, digits) + "%" : DASH;
}

export function signClass(x: N): string {
  return !ok(x) || x === 0 ? "" : x > 0 ? "pos" : "neg";
}

const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];

/** "16 nov 2026" */
export function fmtDate(isoStr: string | null | undefined): string {
  if (!isoStr) return DASH;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** News timestamp, FinViz style: date only on the first story of each day. */
export function fmtNewsDay(d: Date, now = new Date()): string {
  if (d.toDateString() === now.toDateString()) return "Azi";
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** Local YYYY-MM-DD key, used to match news days against daily bars. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** CSS class for a rating label: Buy / Strong Buy green, Sell / Strong Sell red, the rest neutral. */
export function ratingClass(label: string | null | undefined): string {
  return label == null ? "" : /buy/i.test(label) ? "pos" : /sell/i.test(label) ? "neg" : "";
}
