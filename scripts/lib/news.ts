// Pure news helpers (no network): RSS parsing, relevance filtering, de-duplication, ticker tagging.

import type { NewsItem } from "../../src/lib/types.ts";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

const unescapeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&(?:(amp|lt|gt|quot|#39|apos|nbsp)|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, name?: string, dec?: string, hex?: string) =>
      name ? ENT[name] : String.fromCodePoint(dec ? Number(dec) : parseInt(hex as string, 16)),
    )
    .trim();

/** Lower-case, diacritics stripped, punctuation collapsed to single spaces. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True if the title contains any alias as a whole word / phrase (diacritic- and case-insensitive). */
export function isRelevant(title: string, aliases: string[]): boolean {
  const hay = ` ${normalizeTitle(title)} `;
  return aliases.some((a) => {
    const n = normalizeTitle(a);
    return n !== "" && hay.includes(` ${n} `);
  });
}

/** Collapse items with the same normalized title (earliest date wins); newest first. */
export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  for (const it of items) {
    const key = normalizeTitle(it.title);
    const cur = seen.get(key);
    if (!cur || it.date < cur.date) seen.set(key, it);
  }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Display name for a news source. Google News sometimes gives a site's URL or bare host instead of its name
 * ("https://www.goldring.ro/ro", "www.goldring.ro"): drop the scheme, a leading "www." and any path, so every
 * form of the same site reads "goldring.ro". Real names ("Ziarul Financiar", "Profit.ro") are only trimmed of
 * stray punctuation and whitespace.
 */
export function cleanSource(source: string): string {
  let s = source.replace(/\s+/g, " ").trim();
  const url = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([^\s/?#]+\.[a-z]{2,})(?:[/?#]\S*)?$/i.exec(s);
  if (url && (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^www\./i.test(s) || /[/?#]/.test(s))) return url[1].toLowerCase();
  s = s.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[\s:;,|–—-]+$/u, "").trim();
  return s;
}

export interface ParseOptions {
  /** Source for items that carry no <source> element (direct publication feeds). */
  source?: string;
  /** ISO date for items without any date (pubDate / dc:date); without it such items are skipped. */
  fallbackDate?: string;
}

/**
 * Parse an RSS 2.0 / RSS 1.0 document: Google News (title suffix " - Source", <source>, pubDate) and publication
 * feeds (CDATA titles, `dc:date` or no date at all, no source). Items without a title or link are skipped.
 */
export function parseRss(xml: string, opts: ParseOptions = {}): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>(.*?)<\/item>/gs)) {
    const pick = (tag: string) => new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)</${tag}>`, "s").exec(m[1])?.[1] ?? "";
    const rawSource = unescapeXml(pick("source")).replace(/\s+/g, " ") || opts.source || "";
    const source = cleanSource(rawSource);
    let title = unescapeXml(pick("title")).replace(/\s+/g, " ");
    for (const suffix of new Set([rawSource, source])) {
      if (suffix && title.endsWith(` - ${suffix}`)) {
        title = title.slice(0, -(suffix.length + 3));
        break;
      }
    }
    const raw = unescapeXml(pick("pubDate")) || unescapeXml(pick("dc:date"));
    const d = raw ? new Date(raw) : null;
    const date = d && !Number.isNaN(d.getTime()) ? d.toISOString() : (opts.fallbackDate ?? null);
    let link = unescapeXml(pick("link"));
    if (!link) {
      const guid = unescapeXml(pick("guid"));
      if (/^https?:\/\//.test(guid)) link = guid;
    }
    if (title && date && link) items.push({ title, link, source, date });
  }
  return items;
}

/** Tickers (in `defs` order) whose aliases appear in the title. */
export function tagTickers(title: string, defs: { t: string; aliases: string[] }[]): string[] {
  return defs.filter((d) => isRelevant(title, d.aliases)).map((d) => d.t);
}

const MARKET_TERMS = [
  "bursa", "bursei", "bursele", "burse", "bvb", "bet", "actiuni", "actiunile", "actiunilor", "indice", "indicele", "indicii", "indicilor",
  "dividend", "dividende", "dividendul", "dividendele", "listare", "listarea", "listeaza", "listat", "listata", "listate",
  "investitori", "investitorii", "investitor", "tranzactionare", "tranzactii", "capitalizare", "ipo", "asf",
];

/** Market-wide news filter: keep a headline only if it mentions a BVB ticker or ordinary market vocabulary (whole word). */
export function isMarketRelevant(title: string, tickers: string[]): boolean {
  return tickers.length > 0 || isRelevant(title, MARKET_TERMS);
}
