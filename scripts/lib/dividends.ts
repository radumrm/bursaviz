// Pure dividend maths over the per-share history taken from Yahoo's daily chart events
// (ex-date in Bucharest, amount in the trading currency). No network, no files.

/** Same day `years` earlier as YYYY-MM-DD (29 Feb → 28 Feb when needed). */
function yearsBefore(day: string, years: number): string {
  const y = Number(day.slice(0, 4)) - years;
  const rest = day.slice(4);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}${rest === "-02-29" && !leap ? "-02-28" : rest}`;
}

/**
 * Trailing-twelve-month dividend per share: the sum of the amounts whose ex-date is after the same day one year
 * before `asOf` and not after `asOf`. Null without a history (unknown), 0 with a history but nothing in the window.
 *
 * Yahoo's own `trailingAnnualDividendRate` cannot be trusted for issuers that report in another currency
 * (DIGI: 0.098 = the 0.50 RON dividend expressed in EUR, set against a RON price), so the history wins.
 */
export function ttmDividend(divs: [string, number][] | undefined | null, asOf: string): number | null {
  if (!divs?.length) return null;
  const from = yearsBefore(asOf, 1);
  let sum = 0;
  for (const [day, amount] of divs) if (day > from && day <= asOf && amount > 0) sum += amount;
  return Math.round(sum * 1e6) / 1e6;
}

/** CAGR of dividends summed per calendar year: `lastYear` vs `years` earlier. Null unless both sums > 0. */
export function divCagr(divs: [string, number][], years: number, lastYear: number): number | null {
  const sums = new Map<number, number>();
  for (const [day, amt] of divs) sums.set(Number(day.slice(0, 4)), (sums.get(Number(day.slice(0, 4))) ?? 0) + amt);
  const a = sums.get(lastYear) ?? 0;
  const b = sums.get(lastYear - years) ?? 0;
  return a > 0 && b > 0 ? Math.pow(a / b, 1 / years) - 1 : null;
}

export interface DividendFields {
  divTTM: number | null;
  divTTMYield: number | null;
  divEstYield: number | null;
}

/**
 * Snapshot dividend fields made consistent with the trading-currency history:
 *  - `divTTM` / `divTTMYield` from the history when there is one (sum of the last 12 months, ÷ price);
 *    Yahoo's values only when the history is empty;
 *  - `divEstYield` = `divEst` ÷ price when Yahoo gives a forward rate but a zero or missing yield (PE: 0.60 / 0%).
 */
export function dividendFields(
  divs: [string, number][] | undefined | null,
  asOf: string,
  price: number | null,
  yahoo: { divTTM: number | null; divTTMYield: number | null; divEst: number | null; divEstYield: number | null },
): DividendFields {
  const hist = ttmDividend(divs, asOf);
  const okPrice = price != null && price > 0 ? price : null;
  const divTTM = hist ?? yahoo.divTTM;
  const divTTMYield = hist != null ? (okPrice ? Math.round((hist / okPrice) * 1e8) / 1e8 : null) : yahoo.divTTMYield;
  const divEstYield =
    yahoo.divEst != null && yahoo.divEst > 0 && !(yahoo.divEstYield != null && yahoo.divEstYield > 0) && okPrice
      ? Math.round((yahoo.divEst / okPrice) * 1e8) / 1e8
      : yahoo.divEstYield;
  return { divTTM, divTTMYield, divEstYield };
}
