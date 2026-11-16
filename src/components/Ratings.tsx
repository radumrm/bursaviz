import { fmtNum, fmtPrice, fmtSignedPct, ratingClass, signClass } from "../lib/format";
import { analystLabel, techLabel } from "../lib/indicators";
import { useSettings } from "../lib/settings";
import type { StockFile } from "../lib/types";

const SEGMENTS = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"];

/** Five-segment scale, Strong Buy on the left; `pos` is the marker position 0..1. */
function Scale({ pos }: { pos: number | null }) {
  return (
    <div className="scale" aria-hidden="true">
      {SEGMENTS.map((s, i) => (
        <span key={s} className={`seg-${i}`} />
      ))}
      {pos != null && <b style={{ left: `${Math.min(1, Math.max(0, pos)) * 100}%` }} />}
    </div>
  );
}

const VOTE = { 1: "+1", 0: "0", [-1]: "−1" } as const;

export function Ratings({ stock }: { stock: StockFile }) {
  const { convert, unit } = useSettings();
  const sn = stock.snapshot;
  const recom = typeof sn.recom === "number" ? sn.recom : null;
  const targetRaw = typeof sn.target === "number" ? sn.target : null;
  const priceRaw = typeof sn.price === "number" ? sn.price : null;
  const analyst = analystLabel(recom);
  const upside = targetRaw != null && priceRaw ? targetRaw / priceRaw - 1 : null;
  const score = typeof sn.techScore === "number" ? sn.techScore : null;
  const tech = techLabel(score);
  const votes = stock.techVotes ?? [];

  return (
    <section className="panel ratings" aria-label="Ratings">
      <div className="rt-col">
        <h2>Analyst rating</h2>
        {analyst && recom != null ? (
          <>
            <div className="rt-main">
              <strong className={ratingClass(analyst)}>{analyst}</strong>
              <span>medie {fmtNum(recom, 2)} din 5</span>
            </div>
            <Scale pos={(recom - 1) / 4} />
            <div className="scale-ends"><span>Strong Buy</span><span>Strong Sell</span></div>
            <dl className="rt-target">
              <div>
                <dt>Preț țintă (mediu)</dt>
                <dd>{targetRaw != null ? `${fmtPrice(convert(targetRaw, stock.currency))} ${unit(stock.currency)}` : "-"}</dd>
              </div>
              <div>
                <dt>Potențial față de preț</dt>
                <dd className={signClass(upside)}>{fmtSignedPct(upside, 1)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="rt-none">Fără acoperire de analiști</p>
        )}
      </div>

      <div className="rt-col">
        <h2>Technical rating</h2>
        {tech && score != null ? (
          <>
            <div className="rt-main">
              <strong className={ratingClass(tech)}>{tech}</strong>
              <span>scor {score > 0 ? "+" : score < 0 ? "−" : ""}{fmtNum(Math.abs(score), 2)} din ±1</span>
            </div>
            <Scale pos={(1 - score) / 2} />
            <div className="scale-ends"><span>Strong Buy</span><span>Strong Sell</span></div>
            {votes.length > 0 && (
              <ul className="votes">
                {votes.map((v) => (
                  <li key={v.key}>
                    <span>{v.label}</span>
                    <em>{v.detail}</em>
                    <b className={v.vote > 0 ? "pos" : v.vote < 0 ? "neg" : ""}>{VOTE[v.vote]}</b>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="rt-none">Istoric insuficient (sub 200 de zile de tranzacționare)</p>
        )}
      </div>

      <p className="rt-note">
        Technical rating este calculat mecanic din indicatori (medii mobile, RSI, MACD, performanța pe o lună); Analyst
        rating este consensul raportat de Yahoo Finance. Niciunul nu reprezintă o recomandare de investiții.
      </p>
    </section>
  );
}
