// Romanian financial publications read directly (RSS), alongside the Google News queries.
// Each feed only carries its latest 10-30 headlines, so this adds freshness, not history.
// Probed 2026-11-16: wall-street.ro (403), hotnews.ro (410), capital.ro (500), startupcafe.ro (404),
// goldring.ro and bursa.ro/rss (HTML, no feed) do not work and are left out.
// Agerpres (agerpres.ro/rss/economic) was dropped 2026-11-18: it redirects to a third-party proxy
// (api.allorigins.win → createfeed.bazqux.com) that answered HTTP 520 / 522 after 8-19 s and timed out on most runs.

export interface Publication {
  /** Shown as the news item's source (these feeds have no <source> element). */
  name: string;
  url: string;
}

export const PUBLICATIONS: Publication[] = [
  { name: "Ziarul Financiar", url: "https://www.zf.ro/rss" },
  { name: "Ziarul Financiar", url: "https://www.zf.ro/rss/burse-fonduri-mutuale" },
  { name: "Profit.ro", url: "https://www.profit.ro/rss" },
  { name: "Bursa.ro", url: "https://www.bursa.ro/_rss/?t=pcaps" },
  { name: "Economica.net", url: "https://www.economica.net/rss" },
  { name: "Financial Intelligence", url: "https://financialintelligence.ro/feed/" },
  { name: "Curs de Guvernare", url: "https://cursdeguvernare.ro/feed" },
  { name: "Digi24", url: "https://www.digi24.ro/rss/stiri/economie" },
  { name: "Forbes România", url: "https://www.forbes.ro/feed" },
  { name: "Piața Financiară", url: "https://www.piatafinanciara.ro/feed/" },
];
