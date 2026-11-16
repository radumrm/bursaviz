import { useMemo, useState } from "react";
import { fmtSignedPct, signClass } from "../lib/format";
import { groupPerf, PERIODS } from "../lib/screener";
import type { IndexRow } from "../lib/types";

/** Market-cap-weighted performance per sector as horizontal bars from a zero line; a click picks the sector. */
export function Groups({ rows, active, onPick }: { rows: IndexRow[]; active: string; onPick: (sector: string) => void }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("d");
  const key = PERIODS.find((p) => p.id === period)!.key;
  const groups = useMemo(() => groupPerf(rows, key), [rows, key]);
  const max = Math.max(0.0001, ...groups.map((g) => Math.abs(g.perf)));

  return (
    <div className="panel groups">
      <div className="groups-head">
        <h2>Grupuri <small>pe sectoare, ponderat cu capitalizarea</small></h2>
        <div className="seg" role="group" aria-label="Perioadă">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? "on" : ""} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
      </div>
      <ul>
        {groups.map((g) => {
          const w = (Math.abs(g.perf) / max) * 50;
          return (
            <li key={g.sector}>
              <button
                className={active === g.sector ? "on" : ""}
                onClick={() => onPick(active === g.sector ? "" : g.sector)}
                title={`${g.sector}: ${g.count} acțiuni · click pentru a filtra tabelul`}
                aria-pressed={active === g.sector}
              >
                <span className="g-name">{g.sector}</span>
                <span className="g-track" aria-hidden="true">
                  <i className={g.perf < 0 ? "neg" : "pos"} style={g.perf < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }} />
                </span>
                <span className={`g-val ${signClass(g.perf)}`}>{fmtSignedPct(g.perf)}</span>
                <span className="g-n">{g.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {groups.length === 0 && <div className="empty small">Fără date pentru această perioadă</div>}
    </div>
  );
}
