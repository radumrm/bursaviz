import { toggleWatch, useWatchlist } from "../lib/watchlist";
import "./star.css";

/** Toggle a ticker in the favourites list. */
export function Star({ ticker, small }: { ticker: string; small?: boolean }) {
  const on = useWatchlist().includes(ticker);
  const label = on ? `Scoate ${ticker} din favorite` : `Adaugă ${ticker} la favorite`;
  return (
    <button
      type="button"
      className={`star${on ? " on" : ""}${small ? " small" : ""}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleWatch(ticker);
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 1.8l2.5 5.3 5.7.7-4.2 4 1.1 5.7L10 14.7l-5.1 2.8L6 11.8l-4.2-4 5.7-.7z" />
      </svg>
    </button>
  );
}
