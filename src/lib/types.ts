/** Daily bar: [YYYY-MM-DD, open, high, low, close, volume] */
export type DailyBar = [string, number, number, number, number, number];
/** Intraday (1h) bar: [epoch seconds shifted to Bucharest wall-clock time, open, high, low, close, volume] */
export type IntraBar = [number, number, number, number, number, number];

export interface BarsFile {
  d: DailyBar[];
  h: IntraBar[];
  /** 15-minute bars for the last ~60 days (Yahoo's limit). Absent in snapshots scraped before v2. */
  m?: IntraBar[];
}

export type Currency = "RON" | "EUR" | "USD";

/** public/data/fx.json — exchange rates expressed as RON per one unit of the foreign currency. */
export interface FxFile {
  updatedAt: string;
  latest: { EUR: number; USD: number };
  /** Daily closes, oldest first: [YYYY-MM-DD, RON per EUR, RON per USD] */
  daily: [string, number, number][];
}

/** public/data/market-news.json — market-wide headlines for the home page. */
export interface MarketNewsFile {
  updatedAt: string;
  items: NewsItem[];
}

export type Snapshot = Record<string, number | string | null>;

/** One reporting period of a financial statement; values are raw RON (not millions). */
export interface Period {
  date: string;
  v: Record<string, number>;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: string;
  /** BVB tickers the headline mentions (market news only). */
  tickers?: string[];
}

export interface Officer {
  name: string;
  title: string;
}

/** One input of the mechanical technical rating: vote is +1 (bullish), 0 or -1 (bearish). */
export interface TechVote {
  key: string;
  label: string;
  vote: -1 | 0 | 1;
  /** Short human-readable reading, e.g. "RSI 62,1". */
  detail: string;
}

export interface StockFile {
  ticker: string;
  yahoo: string;
  name: string;
  sector: string;
  industry: string;
  index: string | null;
  /** Trading currency — every price-like snapshot value is in it. */
  currency: string;
  /** Currency the financial statements (and snapshot `income` / `sales`) are reported in. Defaults to `currency`. */
  statementsCurrency?: string;
  /** Cash dividends, oldest first: [ex-date YYYY-MM-DD, amount per share] */
  dividends?: [string, number][];
  updatedAt: string;
  quoteTime: string | null;
  snapshot: Snapshot;
  /** Votes behind `snapshot.techScore`; absent when there are fewer than 200 daily bars. */
  techVotes?: TechVote[];
  profile: {
    description: string;
    website: string | null;
    city: string | null;
    officers: Officer[];
  };
  statements: {
    annual: Period[];
    quarterly: Period[];
    ttm: Period | null;
  };
  news: NewsItem[];
}

export interface IndexRow {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  index: string | null;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  pe: number | null;
  volume: number | null;
  relVol: number | null;
  perfW: number | null;
  perfM: number | null;
  perfYTD: number | null;
  perfY: number | null;
  rsi: number | null;
  divYield: number | null;
  /** Mean analyst recommendation, 1 (Strong Buy) .. 5 (Strong Sell). Null without coverage. */
  recom: number | null;
  /** Mean analyst price target, in the trading currency. */
  target: number | null;
  /** Mechanical technical score in [-1, 1]; null with fewer than 200 daily bars. */
  techScore: number | null;
  /** Price distance from SMA 200 (fraction). */
  sma200: number | null;
  /** Price vs 52-week high (<= 0, fraction). */
  high52Pct: number | null;
  /** Price vs 52-week low (>= 0, fraction). */
  low52Pct: number | null;
  spark: number[];
}

export interface IndexFile {
  updatedAt: string;
  rows: IndexRow[];
}
