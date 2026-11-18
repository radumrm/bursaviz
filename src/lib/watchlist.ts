// The user's favourite tickers, kept in this browser (localStorage) and shared by every component.
import { useSyncExternalStore } from "react";

const KEY = "bv.watchlist";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === "string"))] : [];
  } catch {
    cache = []; // storage disabled or corrupted value
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // not fatal: the list just will not survive a reload
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab changed the list.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function toggleWatch(ticker: string) {
  const list = read();
  write(list.includes(ticker) ? list.filter((t) => t !== ticker) : [...list, ticker]);
}

export function setWatchlist(tickers: string[]) {
  write([...new Set(tickers)]);
}

/** Tickers in the order they were added. */
export function useWatchlist(): string[] {
  return useSyncExternalStore(subscribe, read);
}
