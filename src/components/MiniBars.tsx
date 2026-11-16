import { fmtNum } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Period } from "../lib/types";

interface Point {
  label: string;
  value: number;
}

function niceStep(span: number, target = 5): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
}

function shortNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return fmtNum(v, 0);
  if (a >= 100) return fmtNum(v, 1);
  if (a >= 1) return fmtNum(v, 2);
  return fmtNum(v, a === 0 ? 0 : 3);
}

function BarChart({ title, points, color }: { title: string; points: Point[]; color: string }) {
  const W = 420;
  const H = 210;
  const m = { top: 30, right: 50, bottom: 26, left: 6 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  if (!points.length) {
    return (
      <figure className="minibar">
        <figcaption>{title}</figcaption>
        <div className="empty small">Fără date în Yahoo Finance</div>
      </figure>
    );
  }

  const lo = Math.min(0, ...points.map((p) => p.value));
  const hi = Math.max(0, ...points.map((p) => p.value));
  const step = niceStep(hi - lo || 1);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.ceil(hi / step) * step || step;
  const y = (v: number) => m.top + ih - ((v - y0) / (y1 - y0)) * ih;
  const ticks: number[] = [];
  for (let t = y0; t <= y1 + step / 2; t += step) ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);

  const slot = iw / points.length;
  const bw = Math.min(54, slot * 0.82);

  return (
    <figure className="minibar">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "axis" : "grid"} />
            <text x={m.left + iw + 8} y={y(t) + 4} className="tick">{shortNum(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = m.left + slot * i + (slot - bw) / 2;
          const top = Math.min(y(p.value), y(0));
          const h = Math.max(2, Math.abs(y(p.value) - y(0)));
          const inside = h > 22;
          const neg = p.value < 0;
          const ly = inside ? top + 15 : neg ? top + h + 13 : top - 5;
          return (
            <g key={p.label}>
              <rect x={x} y={top} width={bw} height={h} rx={2} fill={neg ? "var(--red)" : color} />
              <text x={x + bw / 2} y={ly} textAnchor="middle" className={inside ? "val in" : "val"}>{shortNum(p.value)}</text>
              <text x={x + bw / 2} y={H - 7} textAnchor="middle" className="tick">{p.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** `currency` is the currency the statements are reported in. */
export function MiniBars({ annual, currency }: { annual: Period[]; currency: string }) {
  const { convert, unit } = useSettings();
  const last = annual.slice(-6);
  /** `money`: convert from the statement currency at each period's own end date. */
  const series = (pick: (v: Record<string, number>) => number | undefined, scale = 1, money = false): Point[] =>
    last.flatMap((p) => {
      const v = pick(p.v);
      if (v == null) return [];
      return [{ label: p.date.slice(0, 4), value: (money ? convert(v, currency, p.date) : v) / scale }];
    });

  return (
    <section className="panel minibars">
      <BarChart title={`EPS (${unit(currency)})`} points={series((v) => v.dilutedEPS ?? v.basicEPS, 1, true)} color="var(--blue-bar)" />
      <BarChart title={`Sales (mln ${unit(currency)})`} points={series((v) => v.totalRevenue, 1e6, true)} color="var(--purple-bar)" />
      <BarChart
        title="Shares Outstanding (mln)"
        points={series((v) => v.ordinarySharesNumber ?? v.shareIssued ?? v.dilutedAverageShares, 1e6)}
        color="var(--teal-bar)"
      />
    </section>
  );
}
