import { useSyncExternalStore } from "react";

export type PageId = "watchlist" | "portfolio" | "compare" | "calendar" | "news";
export type Route =
  | { page: "home" }
  | { page: "stock"; ticker: string; tf: string | null }
  | { page: PageId };

const PAGES: PageId[] = ["watchlist", "portfolio", "compare", "calendar", "news"];

function parse(hash: string): Route {
  const m = /^#\/stock\/([A-Za-z0-9]+)(?:\?tf=([A-Za-z0-9]+))?/.exec(hash);
  if (m) return { page: "stock", ticker: m[1].toUpperCase(), tf: m[2]?.toUpperCase() ?? null };
  const p = /^#\/([a-z]+)/.exec(hash)?.[1] as PageId | undefined;
  return p && PAGES.includes(p) ? { page: p } : { page: "home" };
}

export const pageHref = (page: PageId) => `#/${page}`;
/** `#/compare?t=TLV,SNP` */
export const compareHref = (tickers: string[]) => `#/compare?t=${tickers.join(",")}`;

/** Replace the query of a sub-page's hash (e.g. the compare list) without adding a history entry. */
export function writePageQuery(page: PageId, params: URLSearchParams) {
  // Commas are safe in a hash and keep ticker lists readable: #/compare?t=TLV,SNP rather than TLV%2CSNP.
  const q = params.toString().replace(/%2C/gi, ",");
  window.history.replaceState(null, "", `#/${page}${q ? `?${q}` : ""}`);
}

/** Remember the chosen chart interval in the URL (shareable) without adding a history entry. */
export function rememberTf(ticker: string, tf: string) {
  window.history.replaceState(null, "", `#/stock/${ticker}?tf=${tf}`);
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Hash routing keeps the site a plain folder of static files — no server rewrites needed. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export const stockHref = (ticker: string) => `#/stock/${ticker}`;

export function go(href: string) {
  window.location.hash = href.replace(/^#/, "");
}

/** The `?a=b&c=d` part of the current hash (empty when none). Used by the home-page screener. */
export function readHashQuery(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i < 0 ? "" : h.slice(i + 1));
}

/** Store the screener state in the hash (shareable) without adding a history entry. */
export function writeHashQuery(params: URLSearchParams) {
  const q = params.toString();
  window.history.replaceState(null, "", `#/${q ? `?${q}` : ""}`);
}
