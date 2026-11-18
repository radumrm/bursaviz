import { useMemo } from "react";
import { dataUrl, useJson } from "../lib/data";
import { DASH, fmtNum, fmtSignedPct, signClass } from "../lib/format";
import type { IndexSeries, IndicesFile } from "../lib/types";
import "./indexstrip.css";

const SPARK_DAYS = 126; // about six months of trading days
const W = 120;
const H = 34;

function Spark({ d }: { d: [string, number][] }) {
  const path = useMemo(() => {
    const pts = d.slice(-SPARK_DAYS).map((p) => p[1]).filter((v) => Number.isFinite(v));
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as const);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    return { line, area: `${line}L${W},${H}L0,${H}Z`, up: pts[pts.length - 1] >= pts[0] };
  }, [d]);
  if (!path) return <div className="ix-spark ix-spark-none" aria-hidden="true" />;
  return (
    <svg className={`ix-spark ${path.up ? "up" : "down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ix-area" d={path.area} />
      <path className="ix-line" d={path.line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Perf({ label, v }: { label: string; v: number | null }) {
  return (
    <span className="ix-perf">
      <i>{label}</i>
      <b className={`num ${signClass(v)}`}>{v == null ? DASH : fmtSignedPct(v, 1)}</b>
    </span>
  );
}

function Card({ ix }: { ix: IndexSeries }) {
  return (
    <article className="ix-card">
      <header>
        <h3>{ix.id}</h3>
        <span className="ix-name" title={ix.name}>{ix.name}</span>
        {ix.source === "computed" && (
          <span
            className="ix-est"
            tabIndex={0}
            title="Estimat: indicele este reconstruit de noi din componente și nu este indicele oficial."
          >
            estimat
          </span>
        )}
      </header>
      <div className="ix-main">
        <div>
          <div className="ix-last num">{fmtNum(ix.last)}</div>
          <div className={`ix-chg num ${signClass(ix.changePct)}`}>
            {ix.changePct == null ? DASH : fmtSignedPct(ix.changePct)}
          </div>
        </div>
        <Spark d={ix.d} />
      </div>
      <div className="ix-perfs">
        <Perf label="1W" v={ix.perfW} />
        <Perf label="1M" v={ix.perfM} />
        <Perf label="YTD" v={ix.perfYTD} />
        <Perf label="1Y" v={ix.perfY} />
      </div>
    </article>
  );
}

/** Compact row of index cards above the market map. Renders nothing when indices.json is missing. */
export function IndexStrip() {
  const { data } = useJson<IndicesFile>(dataUrl("indices.json"));
  if (!data?.indices?.length) return null;
  return (
    <section className="ix-strip" aria-label="Indici">
      {data.indices.map((ix) => (
        <Card key={ix.id} ix={ix} />
      ))}
    </section>
  );
}
