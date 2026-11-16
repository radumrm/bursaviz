import { useMemo, useState } from "react";
import { stockHref } from "../lib/router";
import { dayKey, fmtNewsDay, fmtSignedPct, fmtTime } from "../lib/format";
import type { DailyBar, NewsItem } from "../lib/types";

const FIRST_PAGE = 18;
const MOVE_WORTH_FLAGGING = 0.02;

/** `daily` flags stories that came with a big move; market-wide news (with `tickers`) has none. */
export function News({ news, daily = [], id = "news" }: { news: NewsItem[]; daily?: DailyBar[]; id?: string }) {
  const [all, setAll] = useState(false);

  // Close-to-close move of the stock on each trading day, to flag stories that came with a big move.
  const moveOn = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 1; i < daily.length; i++) m.set(daily[i][0], daily[i][4] / daily[i - 1][4] - 1);
    return m;
  }, [daily]);

  if (!news.length) {
    return (
      <section className="panel news" id={id}>
        <div className="empty">Nicio știre găsită pentru acest emitent.</div>
      </section>
    );
  }

  const now = new Date();
  const shown = all ? news : news.slice(0, FIRST_PAGE);
  let prevDay = "";
  const flagged = new Set<string>();

  return (
    <section className="panel news" id={id}>
      <ul>
        {shown.map((item) => {
          const d = new Date(item.date);
          const key = dayKey(d);
          const firstOfDay = key !== prevDay;
          prevDay = key;
          const move = moveOn.get(key);
          // One badge per day is enough — put it on that day's most recent story.
          const badge = move != null && Math.abs(move) >= MOVE_WORTH_FLAGGING && !flagged.has(key);
          if (badge) flagged.add(key);
          return (
            <li key={item.link}>
              <time dateTime={item.date}>
                {firstOfDay && <span className="day">{fmtNewsDay(d, now)}</span>}
                {fmtTime(d)}
              </time>
              <span className="story">
                <a href={item.link} target="_blank" rel="noreferrer noopener">{item.title}</a>
                {item.source && <span className="src">({item.source})</span>}
                {item.tickers?.map((t) => (
                  <a key={t} className="chip" href={stockHref(t)}>{t}</a>
                ))}
                {badge && (
                  <span className={`move ${move! > 0 ? "up" : "down"}`} title="Variația acțiunii în ziua știrii">
                    {fmtSignedPct(move)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {news.length > FIRST_PAGE && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? "Arată mai puține" : `Arată toate cele ${news.length} știri`}
        </button>
      )}
    </section>
  );
}
