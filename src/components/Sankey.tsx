import { useMemo, useState } from "react";
import { fmtBig } from "../lib/format";
import { useSettings } from "../lib/settings";
import type { Period } from "../lib/types";

type Tone = "rev" | "pos" | "neg";

interface FlowNode {
  id: string;
  label: string;
  value: number;
  col: number;
  tone: Tone;
}
interface FlowLink {
  from: string;
  to: string;
  value: number;
  tone: Tone;
}
interface Flow {
  nodes: FlowNode[];
  links: FlowLink[];
  cols: number;
}

const FILL: Record<Tone, string> = { rev: "var(--sk-fill-rev)", pos: "var(--sk-fill-pos)", neg: "var(--sk-fill-neg)" };
const RIBBON: Record<Tone, string> = { rev: "var(--sk-rib-rev)", pos: "var(--sk-rib-pos)", neg: "var(--sk-rib-neg)" };

const pos = (x: number | undefined): number => (x != null && x > 0 ? x : 0);

/**
 * Turn one income statement into a balanced flow:
 *   Revenue → Gross Profit / Cost of Revenue → Net Profit / Expenses → expense breakdown.
 * Banks and funds report no cost of revenue, so for them the gross-profit stage is skipped.
 * "Other income" and "Net loss" enter as extra sources so that every node's inflow equals its outflow.
 */
function buildFlow(v: Record<string, number>): Flow | null {
  const revenue = v.totalRevenue;
  const net = v.netIncome ?? v.netIncomeCommonStockholders;
  if (!(revenue > 0) || net == null) return null;

  const cost = pos(v.costOfRevenue);
  const hasGross = cost > 0 && cost < revenue;
  const gross = hasGross ? revenue - cost : revenue;
  const profit = pos(net);
  const loss = pos(-net);

  const parts: [string, number][] = hasGross
    ? [
        ["Selling, General & Admin", pos(v.sellingGeneralAndAdministration)],
        ["Research & Development", pos(v.researchAndDevelopment)],
        ["Other Operating", pos((v.operatingExpense ?? 0) - pos(v.sellingGeneralAndAdministration) - pos(v.researchAndDevelopment))],
        ["Interest Expense", pos(v.interestExpense)],
        ["Income Taxes", pos(v.taxProvision)],
      ]
    : [
        ["Operating Expenses", pos(v.operatingExpense ?? v.sellingGeneralAndAdministration)],
        ["Income Taxes", pos(v.taxProvision)],
      ];
  let comps = parts.filter(([, x]) => x > 0);

  // Whatever the named items do not explain is either unlisted expenses or non-operating income.
  const gap = gross + loss - profit - comps.reduce((s, [, x]) => s + x, 0);
  const otherIncome = pos(-gap);
  if (gap > revenue * 0.0005) comps = [...comps, ["Other Expenses", gap]];
  const expenses = comps.reduce((s, [, x]) => s + x, 0);
  const detailed = comps.length > 1;

  const c0 = hasGross ? 1 : 0; // column holding the gross-profit stage
  const srcId = hasGross ? "gross" : "revenue";
  const nodes: FlowNode[] = [{ id: "revenue", label: "Revenue", value: revenue, col: 0, tone: "rev" }];
  const links: FlowLink[] = [];

  if (hasGross) nodes.push({ id: "gross", label: "Gross Profit", value: gross, col: 1, tone: "pos" });
  if (otherIncome > 0) nodes.push({ id: "other", label: "Other Income", value: otherIncome, col: c0, tone: "pos" });
  if (loss > 0) nodes.push({ id: "loss", label: "Net Loss", value: loss, col: c0, tone: "neg" });
  if (hasGross) {
    nodes.push({ id: "cost", label: "Cost of Revenue", value: cost, col: 1, tone: "neg" });
    links.push({ from: "revenue", to: "gross", value: gross, tone: "pos" });
    links.push({ from: "revenue", to: "cost", value: cost, tone: "neg" });
  }

  if (profit > 0) nodes.push({ id: "profit", label: "Net Profit", value: profit, col: c0 + 1, tone: "pos" });
  if (expenses > 0) {
    nodes.push({ id: "exp", label: detailed ? "Expenses" : "Costs & Expenses", value: expenses, col: c0 + 1, tone: "neg" });
  }

  const grossToProfit = Math.min(gross, profit);
  const otherToProfit = profit - grossToProfit;
  if (grossToProfit > 0) links.push({ from: srcId, to: "profit", value: grossToProfit, tone: "pos" });
  if (gross - grossToProfit > 0) links.push({ from: srcId, to: "exp", value: gross - grossToProfit, tone: "neg" });
  if (otherToProfit > 0) links.push({ from: "other", to: "profit", value: otherToProfit, tone: "pos" });
  if (otherIncome - otherToProfit > 0) links.push({ from: "other", to: "exp", value: otherIncome - otherToProfit, tone: "neg" });
  if (loss > 0) links.push({ from: "loss", to: "exp", value: loss, tone: "neg" });

  if (detailed) {
    comps.forEach(([label, value], i) => {
      nodes.push({ id: `c${i}`, label, value, col: c0 + 2, tone: "neg" });
      links.push({ from: "exp", to: `c${i}`, value, tone: "neg" });
    });
  }

  return { nodes, links, cols: c0 + (detailed ? 3 : 2) };
}

const W = 1180;
const H = 540;
const NODE_W = 14;
const GAP = 52; // leaves room for the two-line label above each node
const TOP = 46;
const BOTTOM = 14;

function layout(flow: Flow) {
  const cols: FlowNode[][] = Array.from({ length: flow.cols }, () => []);
  for (const n of flow.nodes) cols[n.col].push(n);

  const avail = H - TOP - BOTTOM;
  const scale = Math.min(
    ...cols.map((c) => (avail - GAP * (c.length - 1)) / c.reduce((s, n) => s + n.value, 0)),
  );

  const box = new Map<string, { x: number; y: number; h: number; out: number; in: number }>();
  cols.forEach((c, ci) => {
    const x = flow.cols === 1 ? 0 : (ci * (W - NODE_W)) / (flow.cols - 1);
    const total = c.reduce((s, n) => s + Math.max(2, n.value * scale), 0) + GAP * (c.length - 1);
    let y = TOP + (avail - total) / 2;
    for (const n of c) {
      const h = Math.max(2, n.value * scale);
      box.set(n.id, { x, y, h, out: 0, in: 0 });
      y += h + GAP;
    }
  });

  const ribbons = flow.links.map((l) => {
    const a = box.get(l.from)!;
    const b = box.get(l.to)!;
    const t = Math.max(1, l.value * scale);
    const x0 = a.x + NODE_W;
    const x1 = b.x;
    const y0 = a.y + a.out;
    const y1 = b.y + b.in;
    a.out += t;
    b.in += t;
    const xm = (x0 + x1) / 2;
    return {
      key: `${l.from}-${l.to}`,
      tone: l.tone,
      d: `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + t}C${xm},${y1 + t} ${xm},${y0 + t} ${x0},${y0 + t}Z`,
    };
  });

  return { box, ribbons };
}

export function Sankey({ annual, currency }: { annual: Period[]; currency: string }) {
  const years = useMemo(() => annual.filter((p) => p.v.totalRevenue > 0).slice(-6), [annual]);
  const [picked, setPicked] = useState<string | null>(null);
  const period = years.find((p) => p.date === picked) ?? years[years.length - 1];
  const { convert, unit } = useSettings();
  // The statement is in `currency`; convert at the period-end rate (the flow is linear, so one factor scales it all).
  const factor = period ? convert(1, currency, period.date) : 1;
  const flow = useMemo(() => {
    if (!period) return null;
    const v: Record<string, number> = {};
    for (const [k, x] of Object.entries(period.v)) v[k] = x * factor;
    return buildFlow(v);
  }, [period, factor]);
  const laid = useMemo(() => (flow ? layout(flow) : null), [flow]);

  return (
    <section className="panel sankey" id="breakdown">
      <header className="panel-head">
        <h2>Revenue &amp; Expenses Breakdown <small>{unit(currency)}</small></h2>
        {years.length > 0 && (
          <div className="fy">
            <span>Fiscal Year</span>
            <div className="seg">
              {years.map((p) => (
                <button key={p.date} className={p === period ? "on" : ""} onClick={() => setPicked(p.date)}>
                  {p.date.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {!flow || !laid ? (
        <div className="empty">Yahoo Finance nu are un cont de profit și pierdere pentru acest emitent.</div>
      ) : (
        <div className="sankey-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fluxul veniturilor și cheltuielilor">
            {laid.ribbons.map((r) => (
              <path key={r.key} d={r.d} style={{ fill: RIBBON[r.tone] }} />
            ))}
            {flow.nodes.map((n) => {
              const b = laid.box.get(n.id)!;
              const first = n.col === 0;
              const last = n.col === flow.cols - 1;
              const tx = first ? b.x : last ? b.x + NODE_W : b.x + NODE_W / 2;
              const anchor = first ? "start" : last ? "end" : "middle";
              return (
                <g key={n.id}>
                  <rect x={b.x} y={b.y} width={NODE_W} height={b.h} style={{ fill: FILL[n.tone] }} />
                  <text x={tx} y={b.y - 23} textAnchor={anchor} className="sk-name">{n.label}</text>
                  <text x={tx} y={b.y - 7} textAnchor={anchor} className="sk-val">{fmtBig(n.value)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
