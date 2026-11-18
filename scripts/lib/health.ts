// Pure run-health helpers for the scraper: never let a failed answer replace good data, and turn a run's
// outcome into an honest exit code (the scheduled GitHub workflow commits data only after exit 0).

/** `fresh`, unless it is empty and the previous file had data — then the previous data, and `label` goes into `kept`. */
export function keepPrevious<T>(fresh: T[], previous: T[] | undefined | null, label: string, kept: string[]): T[] {
  if (fresh.length || !previous?.length) return fresh;
  kept.push(label);
  return previous;
}

export const EXIT = { ok: 0, usage: 1, rateLimited: 2, fx: 3, tooFew: 4, crash: 5 } as const;

/** Share of the attempted tickers that must refresh for a run to count as healthy. */
export const MIN_REFRESHED = 0.8;

export interface RunOutcome {
  /** Any Yahoo 429 during the run (FX, tickers or indices). */
  rateLimited: boolean;
  /** FX rates were fetched. */
  fxOk: boolean;
  /** Tickers the run tried (not skipped as fresh) and how many of those were written. */
  attempted: number;
  refreshed: number;
}

/** Exit code and reason; the first matching problem wins, in the order of the table. */
export function runExit(o: RunOutcome): { code: number; why: string } {
  if (o.rateLimited) return { code: EXIT.rateLimited, why: "Yahoo rate-limited this connection (429)" };
  if (!o.fxOk) return { code: EXIT.fx, why: "FX rates could not be fetched" };
  if (o.attempted > 0 && o.refreshed < MIN_REFRESHED * o.attempted) {
    return { code: EXIT.tooFew, why: `only ${o.refreshed} of ${o.attempted} tickers refreshed (< ${MIN_REFRESHED * 100}%)` };
  }
  return { code: EXIT.ok, why: "healthy" };
}
