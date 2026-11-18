// React binding for the portfolio store (localStorage, shared by every component, synced across tabs).
import { useSyncExternalStore } from "react";
import { loadTransactions, PORTFOLIO_KEY, saveTransactions } from "./portfolio.ts";
import type { Tx } from "./portfolio.ts";

const listeners = new Set<() => void>();
let cache: Tx[] | null = null;

function read(): Tx[] {
  return (cache ??= loadTransactions());
}

export function setTransactions(next: Tx[]) {
  cache = next;
  saveTransactions(next);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PORTFOLIO_KEY) {
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

export function usePortfolio(): Tx[] {
  return useSyncExternalStore(subscribe, read);
}
