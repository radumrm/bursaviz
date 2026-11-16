import { Header } from "./components/Header";
import { dataUrl, useJson } from "./lib/data";
import { useRoute } from "./lib/router";
import { Home } from "./pages/Home";
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
      ) : (
        <Home index={index.data} error={index.error} />
      )}
      <footer className="site-foot">
        <div className="wrap">
          Date: Yahoo Finance (prețuri, indicatori, situații financiare) și Google News (știri), descărcate cu{" "}
          <code>npm run scrape</code>. Instantaneu static, cu întârziere — nu este un flux în timp real și nu reprezintă
          o recomandare de investiții.
        </div>
      </footer>
    </>
  );
}
