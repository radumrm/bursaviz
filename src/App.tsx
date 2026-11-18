import { Header } from "./components/Header";
import { dataUrl, useJson } from "./lib/data";
import { useRoute } from "./lib/router";
import { Calendar } from "./pages/Calendar";
import { Compare } from "./pages/Compare";
import { Home } from "./pages/Home";
import { NewsPage } from "./pages/NewsPage";
import { Portfolio } from "./pages/Portfolio";
import { Watchlist } from "./pages/Watchlist";
import { Stock } from "./pages/Stock";
import type { IndexFile } from "./lib/types";

export function App() {
  const route = useRoute();
  const index = useJson<IndexFile>(dataUrl("index.json"));

  return (
    <>
      <Header index={index.data} />
      {route.page === "stock" ? (
        <Stock ticker={route.ticker} tf={route.tf} index={index.data} />
      ) : route.page === "watchlist" ? (
        <Watchlist index={index.data} />
      ) : route.page === "portfolio" ? (
        <Portfolio index={index.data} />
      ) : route.page === "compare" ? (
        <Compare index={index.data} />
      ) : route.page === "calendar" ? (
        <Calendar index={index.data} />
      ) : route.page === "news" ? (
        <NewsPage index={index.data} />
      ) : (
        <Home index={index.data} error={index.error} />
      )}
      <footer className="site-foot">
        <div className="wrap">
          Date: Yahoo Finance (prețuri, indicatori, situații financiare), Google News și publicații financiare românești (știri), descărcate cu{" "}
          <code>npm run scrape</code>. Instantaneu static, cu întârziere — nu este un flux în timp real și nu reprezintă
          o recomandare de investiții.
        </div>
      </footer>
    </>
  );
}
