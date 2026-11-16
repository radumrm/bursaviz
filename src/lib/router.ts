import { useSyncExternalStore } from "react";

export type Route = { page: "home" } | { page: "stock"; ticker: string; tf: string | null };

function parse(hash: string): Route {
  const m = /^#\/stock\/([A-Za-z0-9]+)(?:\?tf=([A-Za-z0-9]+))?/.exec(hash);
  return m ? { page: "stock", ticker: m[1].toUpperCase(), tf: m[2]?.toUpperCase() ?? null } : { page: "home" };
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
