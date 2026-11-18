import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { IndexFile } from "../lib/types";
import { useSettings } from "../lib/settings";
import { stockHref } from "../lib/router";
import { compute, newId, parseImport, serialize, sortTx, todayISO, validateDelete, validateTx } from "../lib/portfolio.ts";
import type { Holding, MarketInfo, Tx } from "../lib/portfolio.ts";
import { setTransactions, usePortfolio } from "../lib/usePortfolio";
import { fmtDate, fmtNum, fmtPct, fmtPrice, fmtSignedPct, signClass } from "../lib/format";
import "./portfolio.css";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
const signed = (x: number | null) => (x == null ? "-" : (x > 0 ? "+" : "") + fmtNum(x));

interface Slice {
  label: string;
  value: number;
}
const COLORS = ["#4f8cff", "#2fb67c", "#f0a43a", "#a06cd5", "#e8627c", "#36b5c9", "#c9b23a", "#8a93a6"];

function Donut({ title, slices, fmt }: { title: string; slices: Slice[]; fmt: (v: number) => string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const top = slices.slice(0, 7);
  const rest = slices.slice(7).reduce((s, x) => s + x.value, 0);
  const parts = rest > 0 ? [...top, { label: "Altele", value: rest }] : top;
  let acc = 0;
  return (
    <div className="pf-donut">
      <h3>{title}</h3>
      <div className="pf-donut-body">
        <svg viewBox="0 0 42 42" role="img" aria-label={title}>
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--line-soft)" strokeWidth="6" />
          {parts.map((p, i) => {
            const pct = (p.value / total) * 100;
            const el = (
              <circle
                key={p.label}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth="6"
                strokeDasharray={`${Math.max(pct - 0.4, 0.1)} ${100 - Math.max(pct - 0.4, 0.1)}`}
                strokeDashoffset={25 - acc}
              >
                <title>{`${p.label}: ${fmtNum(pct, 1)}% (${fmt(p.value)})`}</title>
              </circle>
            );
            acc += pct;
            return el;
          })}
        </svg>
        <ul>
          {parts.map((p, i) => (
            <li key={p.label}>
              <i style={{ background: COLORS[i % COLORS.length] }} />
              <span>{p.label}</span>
              <b>{fmtNum((p.value / total) * 100, 1)}%</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type Confirm = null | { kind: "clear" } | { kind: "import"; txs: Tx[] };

export function Portfolio({ index }: { index: IndexFile | null }) {
  const { convert, unit } = useSettings();
  const txs = usePortfolio();
  const rows = index?.rows;
  const byTicker = useMemo(() => new Map((rows ?? []).map((r) => [r.ticker, r])), [rows]);
  const known = useMemo(() => new Set(byTicker.keys()), [byTicker]);

  const market = (t: string): MarketInfo | undefined => {
    const r = byTicker.get(t);
    return r ? { name: r.name, sector: r.sector, price: r.price, changePct: r.changePct, divYield: r.divYield } : undefined;
  };
  const data = useMemo(() => compute(txs, market), [txs, byTicker]); // eslint-disable-line react-hooks/exhaustive-deps
  const { holdings, totals } = data;

  const blank = { type: "buy", ticker: "", date: todayISO(), qty: "", price: "", fee: "" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof blank>) => setForm((f) => ({ ...f, ...p }));

  const money = (x: number | null) => (x == null ? "-" : fmtNum(convert(x)));
  const signedMoney = (x: number | null) => (x == null ? "-" : signed(convert(x)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!rows) {
      setErrors(["Datele de piață nu sunt încărcate încă."]);
      return;
    }
    const input = { type: form.type, ticker: form.ticker.trim().toUpperCase(), date: form.date, qty: num(form.qty), price: num(form.price), fee: form.fee.trim() === "" ? 0 : num(form.fee) };
    const errs = validateTx(input, txs, known, todayISO(), editing ?? undefined);
    setErrors(errs);
    if (errs.length) return;
    const t: Tx = { id: editing ?? newId(), type: input.type as "buy" | "sell", ticker: input.ticker, date: input.date, qty: input.qty, price: input.price, fee: input.fee };
    setTransactions(editing ? txs.map((x) => (x.id === editing ? t : x)) : [...txs, t]);
    setForm({ ...blank, type: form.type });
    setEditing(null);
    setMsg(null);
  };

  const startEdit = (t: Tx) => {
    setEditing(t.id);
    setErrors([]);
    setForm({ type: t.type, ticker: t.ticker, date: t.date, qty: String(t.qty), price: String(t.price), fee: t.fee ? String(t.fee) : "" });
    document.getElementById("pf-form")?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const cancelEdit = () => {
    setEditing(null);
    setErrors([]);
    setForm(blank);
  };
  const del = (t: Tx) => {
    const err = validateDelete(t.id, txs);
    if (err) {
      setMsg({ ok: false, text: err });
      return;
    }
    setTransactions(txs.filter((x) => x.id !== t.id));
    if (editing === t.id) cancelEdit();
    setMsg(null);
  };

  const exportFile = () => {
    const blob = new Blob([serialize(txs)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bursaviz-portofoliu-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const r = parseImport(text, rows ? known : undefined);
    if (!r.ok) {
      setMsg({ ok: false, text: `Import eșuat: ${r.error}` });
      return;
    }
    if (txs.length === 0) {
      setTransactions(r.transactions);
      setMsg({ ok: true, text: `Importate ${r.transactions.length} tranzacții.` });
    } else {
      setConfirm({ kind: "import", txs: r.transactions });
      setMsg(null);
    }
  };

  const sectorSlices = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) if (h.value) m.set(h.sector, (m.get(h.sector) ?? 0) + h.value);
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [holdings]);
  const holdSlices = holdings.filter((h) => h.value).map((h) => ({ label: h.ticker, value: h.value as number }));
  const fmtMoney = (v: number) => `${fmtNum(convert(v))} ${unit()}`;

  const realisedRows = Object.entries(data.realisedByTicker);
  const history = [...sortTx(txs)].reverse();

  return (
    <main className="wrap stack portfolio">
      <div className="sec-head">
        <h1>Portofoliu</h1>
        <p>Datele rămân doar în acest browser (localStorage); nu există cont sau server. Instrument personal de urmărire, pe date întârziate, nu sfat de investiții.</p>
      </div>

      {txs.length > 0 && (
        <div className="pf-cards">
          <div className="pf-card">
            <span>Valoare de piață</span>
            <b>{money(totals.value)} <small>{unit()}</small></b>
            <em className="dim">Cost {money(totals.cost)}</em>
          </div>
          <div className="pf-card">
            <span>Azi</span>
            <b className={signClass(totals.dayChange)}>{signedMoney(totals.dayChange)}</b>
            <em className={signClass(totals.dayChangePct)}>{fmtSignedPct(totals.dayChangePct)}</em>
          </div>
          <div className="pf-card">
            <span>P/L nerealizat</span>
            <b className={signClass(totals.pl)}>{signedMoney(totals.pl)}</b>
            <em className={signClass(totals.plPct)}>{fmtSignedPct(totals.plPct)}</em>
          </div>
          <div className="pf-card">
            <span>P/L realizat (vânzări)</span>
            <b className={signClass(data.realised)}>{signedMoney(data.realised)}</b>
            <em className="dim">{realisedRows.length ? realisedRows.map(([t, v]) => `${t} ${signedMoney(v)}`).join(" · ") : "Nicio vânzare"}</em>
          </div>
          <div className="pf-card">
            <span>Dividende anuale (estimare)</span>
            <b>{money(totals.dividend)} <small>{unit()}</small></b>
            <em className="dim">valoare × Dividend Yield</em>
          </div>
        </div>
      )}

      <form id="pf-form" className="panel pf-form" onSubmit={submit} noValidate>
        <div className="panel-head">
          <h2>{editing ? "Modifică tranzacția" : "Adaugă tranzacție"}</h2>
          <span className="dim">Prețurile și comisioanele se introduc în RON</span>
        </div>
        <div className="pf-fields">
          <div className="seg" role="group" aria-label="Tip tranzacție">
            <button type="button" className={form.type === "buy" ? "on" : ""} onClick={() => set({ type: "buy" })}>Cumpărare</button>
            <button type="button" className={form.type === "sell" ? "on" : ""} onClick={() => set({ type: "sell" })}>Vânzare</button>
          </div>
          <label>
            Simbol
            <input list="pf-tickers" value={form.ticker} onChange={(e) => set({ ticker: e.target.value.toUpperCase() })} placeholder="ex. TLV" autoComplete="off" spellCheck={false} />
            <datalist id="pf-tickers">
              {(rows ?? []).map((r) => (
                <option key={r.ticker} value={r.ticker}>{r.name}</option>
              ))}
            </datalist>
          </label>
          <label>
            Data
            <input type="date" value={form.date} max={todayISO()} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label>
            Cantitate
            <input inputMode="decimal" value={form.qty} onChange={(e) => set({ qty: e.target.value })} placeholder="0" />
          </label>
          <label>
            Preț / acțiune (RON)
            <input
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
              placeholder={byTicker.get(form.ticker.trim().toUpperCase())?.price != null ? String(byTicker.get(form.ticker.trim().toUpperCase())?.price) : "0.00"}
            />
          </label>
          <label>
            Comision (RON, opțional)
            <input inputMode="decimal" value={form.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0" />
          </label>
          <div className="pf-submit">
            <button type="submit" className="primary">{editing ? "Salvează" : "Adaugă"}</button>
            {editing && <button type="button" onClick={cancelEdit}>Renunță</button>}
          </div>
        </div>
        {errors.length > 0 && (
          <ul className="pf-errors" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </form>

      {msg && (
        <div className={`pf-msg ${msg.ok ? "ok" : "bad"}`} role="status">
          {msg.text}
        </div>
      )}

      {txs.length === 0 ? (
        <div className="panel empty">
          <h2 className="pf-empty-h">Portofoliul este gol</h2>
          <p>Adaugă prima cumpărare mai sus sau importă un fișier exportat anterior. Poziția medie, profitul și alocarea se calculează automat.</p>
        </div>
      ) : (
        <>
          <div className="panel pf-table">
            <div className="panel-head">
              <h2>Poziții <small>{holdings.length}</small></h2>
              <span className="dim">Cost mediu ponderat, comisioane incluse · sume în {unit()}</span>
            </div>
            {holdings.length === 0 ? (
              <div className="empty small">Nicio poziție deschisă: toate acțiunile au fost vândute.</div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Simbol</th>
                      <th>Companie</th>
                      <th className="num">Cant.</th>
                      <th className="num">Cost mediu</th>
                      <th className="num">Preț curent</th>
                      <th className="num">Valoare</th>
                      <th className="num">Azi</th>
                      <th className="num">Azi %</th>
                      <th className="num">P/L</th>
                      <th className="num">P/L %</th>
                      <th className="num">Pondere</th>
                      <th className="num" title="Estimare: valoare × Dividend Yield">Div. est./an</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h: Holding) => (
                      <tr key={h.ticker}>
                        <td><a href={stockHref(h.ticker)}>{h.ticker}</a></td>
                        <td className="co">{h.name}</td>
                        <td className="num">{fmtNum(h.qty, h.qty % 1 ? 4 : 0)}</td>
                        <td className="num">{fmtPrice(convert(h.avgCost))}</td>
                        <td className="num">{fmtPrice(h.price == null ? null : convert(h.price))}</td>
                        <td className="num"><b>{money(h.value)}</b></td>
                        <td className={`num ${signClass(h.dayChange)}`}>{signedMoney(h.dayChange)}</td>
                        <td className={`num ${signClass(h.dayChangePct)}`}>{fmtSignedPct(h.dayChangePct)}</td>
                        <td className={`num ${signClass(h.pl)}`}>{signedMoney(h.pl)}</td>
                        <td className={`num ${signClass(h.plPct)}`}>{fmtSignedPct(h.plPct)}</td>
                        <td className="num">{fmtPct(h.weight, 1)}</td>
                        <td className="num">{money(h.dividend)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td />
                      <td className="num">{money(totals.cost)}</td>
                      <td />
                      <td className="num">{money(totals.value)}</td>
                      <td className={`num ${signClass(totals.dayChange)}`}>{signedMoney(totals.dayChange)}</td>
                      <td className={`num ${signClass(totals.dayChangePct)}`}>{fmtSignedPct(totals.dayChangePct)}</td>
                      <td className={`num ${signClass(totals.pl)}`}>{signedMoney(totals.pl)}</td>
                      <td className={`num ${signClass(totals.plPct)}`}>{fmtSignedPct(totals.plPct)}</td>
                      <td className="num">{totals.value > 0 ? "100%" : "-"}</td>
                      <td className="num">{money(totals.dividend)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {totals.missingPrice && <div className="pf-warn">Unele poziții nu au preț curent în date și sunt excluse din totaluri.</div>}
          </div>

          {sectorSlices.length > 0 && (
            <div className="panel pf-alloc">
              <div className="panel-head">
                <h2>Alocare</h2>
                <span className="dim">după valoarea de piață curentă</span>
              </div>
              <div className="pf-donuts">
                <Donut title="După sector" slices={sectorSlices} fmt={fmtMoney} />
                <Donut title="După poziție" slices={holdSlices} fmt={fmtMoney} />
              </div>
            </div>
          )}

          <div className="panel pf-table">
            <div className="panel-head">
              <h2>Tranzacții <small>{txs.length}</small></h2>
              <span className="dim">Prețurile și comisioanele în {unit()}</span>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tip</th>
                    <th>Simbol</th>
                    <th className="num">Cant.</th>
                    <th className="num">Preț</th>
                    <th className="num">Comision</th>
                    <th className="num">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id} className={editing === t.id ? "editing" : ""}>
                      <td>{fmtDate(t.date)}</td>
                      <td className={t.type === "buy" ? "pos" : "neg"}>{t.type === "buy" ? "Cumpărare" : "Vânzare"}</td>
                      <td>
                        {byTicker.has(t.ticker) ? <a href={stockHref(t.ticker)}>{t.ticker}</a> : <span title="Simbolul nu mai există în date">{t.ticker}</span>}
                      </td>
                      <td className="num">{fmtNum(t.qty, t.qty % 1 ? 4 : 0)}</td>
                      <td className="num">{fmtPrice(convert(t.price))}</td>
                      <td className="num">{t.fee ? fmtNum(convert(t.fee)) : "-"}</td>
                      <td className="num">{fmtNum(convert(t.qty * t.price + (t.type === "buy" ? t.fee : -t.fee)))}</td>
                      <td className="act">
                        <button type="button" onClick={() => startEdit(t)} aria-label={`Modifică tranzacția ${t.ticker} din ${t.date}`}>Modifică</button>
                        <button type="button" className="rm" onClick={() => del(t)} aria-label={`Șterge tranzacția ${t.ticker} din ${t.date}`}>Șterge</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="panel pf-data">
        <div className="panel-head">
          <h2>Datele tale</h2>
        </div>
        <div className="pf-data-body">
          <button type="button" onClick={exportFile} disabled={txs.length === 0}>Exportă JSON</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Importă JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          {confirm?.kind !== "clear" && (
            <button type="button" className="danger" onClick={() => setConfirm({ kind: "clear" })} disabled={txs.length === 0}>Șterge tot</button>
          )}
        </div>
        {confirm?.kind === "clear" && (
          <div className="pf-confirm" role="alertdialog" aria-label="Confirmare ștergere">
            <span>Ștergi toate cele {txs.length} tranzacții din acest browser? Nu se poate anula (exportă mai întâi dacă vrei o copie).</span>
            <button type="button" className="danger" onClick={() => { setTransactions([]); setConfirm(null); cancelEdit(); }}>Da, șterge tot</button>
            <button type="button" onClick={() => setConfirm(null)}>Renunță</button>
          </div>
        )}
        {confirm?.kind === "import" && (
          <div className="pf-confirm" role="alertdialog" aria-label="Confirmare import">
            <span>Fișierul conține {confirm.txs.length} tranzacții. Înlocuiești cele {txs.length} existente?</span>
            <button type="button" className="danger" onClick={() => { setTransactions(confirm.txs); setConfirm(null); cancelEdit(); setMsg({ ok: true, text: `Importate ${confirm.txs.length} tranzacții.` }); }}>Da, înlocuiește</button>
            <button type="button" onClick={() => setConfirm(null)}>Renunță</button>
          </div>
        )}
      </div>
    </main>
  );
}
