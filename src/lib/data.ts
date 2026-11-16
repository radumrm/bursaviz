import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

export function dataUrl(rel: string): string {
  return `${import.meta.env.BASE_URL}data/${rel}`;
}

export function loadJson<T>(url: string): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p as Promise<T>;
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useJson<T>(url: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T> & { url: string | null }>({ url, data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadJson<T>(url).then(
      (data) => alive && setState({ url, data, error: null, loading: false }),
      (e) => alive && setState({ url, data: null, error: String(e?.message ?? e), loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  // A different url than the one we hold means the fetch for it has not landed yet.
  if (state.url !== url) return { data: null, error: null, loading: !!url };
  return state;
}
