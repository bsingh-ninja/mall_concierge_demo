"use client";
import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import MallMap from "@/components/MallMap";
import { AGENT_CODE, AGENT_COLOR } from "@/components/Shopper";
import { AGENT_STYLE, agentOf, api, type LedgerRow, type Mall, type OperatorData } from "@/lib/api";
import { group } from "@/lib/look";

const fmt = (n: number) => n.toLocaleString("en-US");
type Telemetry = OperatorData["telemetry"];
const KPIS: { key: keyof Telemetry; label: string; show: (t: Telemetry) => string; color: string }[] = [
  { key: "active_qr_sessions", label: "QR sessions today", show: (t) => fmt(t.active_qr_sessions), color: "var(--color-teal)" },
  { key: "redemption_rate_pct", label: "Offer redemption", show: (t) => `${t.redemption_rate_pct}%`, color: "var(--color-teal)" },
  { key: "avg_dwell_min", label: "Average visit", show: (t) => `${t.avg_dwell_min} min`, color: "var(--color-teal)" },
  { key: "rerouted_parties", label: "Parties rerouted", show: (t) => fmt(t.rerouted_parties), color: "var(--color-coral)" },
  { key: "revenue_aed", label: "Revenue from offers", show: (t) => `AED ${fmt(Math.round(t.revenue_aed / 1000))}k`, color: "var(--color-brass)" },
];

export default function Operator({ mall, session, active }: { mall: Mall; session: string | null; active: boolean }) {
  const [data, setData] = useState<OperatorData | null>(null);
  const [tab, setTab] = useState<"top" | "lagging" | "this_visit">("top");
  const [selected, setSelected] = useState<string | null>(null);
  const [graph, setGraph] = useState(false);
  const [nonce, setNonce] = useState(0);
  // History of each KPI as polled during this session: the only source for sparklines (nothing invented).
  const hist = useRef<Record<string, number[]>>({});
  const first = useRef<Telemetry | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () => api.operator(session).then((d) => {
      if (!alive) return;
      first.current ??= d.telemetry;
      for (const k of KPIS) {
        const h = (hist.current[k.key] ??= []);
        if (h[h.length - 1] !== d.telemetry[k.key]) h.push(d.telemetry[k.key]);
        if (h.length > 30) h.shift();
      }
      setData(d);
    }).catch(() => null);
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [session, active, nonce]);

  if (!data) return <div className="grid h-full place-items-center text-smuted">Loading the console…</div>;
  const t = data.telemetry;
  const flagged = data.underperformers.map((u) => u.id);
  const sel = mall.stores.find((s) => s.id === (selected ?? data.underperformers[0]?.id));
  const selUnder = data.underperformers.find((u) => u.id === sel?.id);
  const rows: LedgerRow[] = data.ledger[tab];
  const surges = data.surges.map((id) => ({ id, pct: Math.round((data.heat[id] ?? 0) * 100) }));
  const delta = (k: keyof Telemetry) => (first.current ? t[k] - first.current[k] : 0);
  const context: Record<string, string> = {
    active_qr_sessions: delta("active_qr_sessions") > 0 ? `+${delta("active_qr_sessions")} in this demo` : "today, all entrances",
    redemption_rate_pct: `${fmt(t.redemptions)} redeemed`,
    avg_dwell_min: "per visit, today",
    rerouted_parties: delta("rerouted_parties") > 0 ? `+${delta("rerouted_parties")} just now` : "around crowded stores",
    revenue_aed: "attributed today",
  };

  async function boost(id: string) {
    await api.boost(id, session).catch(() => null);
    setNonce((n) => n + 1);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-a-upsell">
              <i className="h-2 w-2 rounded-full bg-a-upsell shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-a-upsell)_22%,transparent)]" />Live · Saturday {data.clock}
            </div>
            <h1 className="mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] lg:text-[40px]">Operations</h1>
          </div>
          <span className="text-[13px] text-smuted">{data.mall}. Demo data, all figures synthetic.</span>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {KPIS.map((k) => (
            <div key={k.key} className="card grid grid-cols-[1fr_auto] items-end gap-x-2 px-4 py-3.5">
              <dt className="col-span-2 text-[12.5px] text-smuted">{k.label}</dt>
              <div className="min-w-0">
                <dd key={t[k.key]} className="tnum glow mt-1 whitespace-nowrap rounded-md font-display text-[22px] font-extrabold leading-none tracking-[-0.02em] sm:text-[26px] lg:text-[30px]" style={{ color: k.key === "revenue_aed" ? k.color : undefined }}>{k.show(t)}</dd>
                <dd className="mt-1.5 truncate font-mono text-[11px] font-semibold sm:text-[11.5px]" style={{ color: k.key === "rerouted_parties" && delta("rerouted_parties") > 0 ? "var(--color-coral)" : "var(--color-a-upsell)" }}>{context[k.key]}</dd>
              </div>
              <span className="hidden sm:block"><Spark values={hist.current[k.key] ?? []} color={k.color} /></span>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-5 xl:grid-cols-[62fr_38fr]">
          <section className="card min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[20px] font-extrabold tracking-[-0.01em]">Footfall now</h2>
              <span className="flex items-center gap-2 text-[12px] text-smuted">quiet<i className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, var(--map-unit), var(--heat-1), var(--heat-2), var(--heat-3))" }} />busy</span>
              <span className="text-[12.5px] text-smuted">Dashed = below sales target · click a unit</span>
            </div>
            <MallMap mall={mall} orientation="landscape" camera={{ kind: "all" }} heat={data.heat} flagged={flagged} surges={surges}
              plan={data.route} labelIds={[...flagged, ...(data.route?.stops.map((s) => s.store_id) ?? [])]} showGraph={graph} onToggleGraph={() => setGraph((g) => !g)} selected={sel?.id ?? null} onSelect={setSelected}
              insetRight={60} className="relative mt-4 aspect-[1200/700] w-full rounded-2xl" />

            {sel && (
              <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-[1.2fr_1fr_1fr_1fr] md:items-center">
                <div>
                  <h3 className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{sel.name}</h3>
                  <div className="text-[13px] text-smuted">Unit {sel.unit} · {group(sel.category)}</div>
                </div>
                <Stat label="Sales vs target" value={`${sel.kpi.sales_vs_target}%`} alert={sel.kpi.sales_vs_target < 85}>
                  <span className="relative mt-2 block h-1.5 rounded-full bg-panel-2">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, sel.kpi.sales_vs_target / 1.2)}%`, background: sel.kpi.sales_vs_target < 85 ? "var(--color-coral)" : "var(--color-teal)" }} />
                    <span className="absolute -inset-y-1 w-0.5 bg-sand" style={{ left: `${85 / 1.2}%` }} title="85% goal" />
                  </span>
                </Stat>
                <Stat label="Visitors today" value={fmt(sel.kpi.footfall_today)} sub={selUnder ? (selUnder.wing_gap_pct < 0 ? `${-selUnder.wing_gap_pct}% fewer than its wing` : `${selUnder.wing_gap_pct}% more than its wing`) : `${sel.kpi.conversion_pct}% buy`} />
                <Stat label="Busy now" value={`${Math.round((data.heat[sel.id] ?? 0) * 100)}%`} sub={selUnder?.on_route ? "on the live route" : undefined} />
                {sel.offers.length > 0 && (
                  <ul className="space-y-1.5 text-[14px] md:col-span-3">
                    {sel.offers.map((o) => (
                      <li key={o.id} className="flex justify-between gap-4">
                        <span className="min-w-0 truncate">{o.title}{o.funded_by === "mall" ? <span className="text-smuted"> · mall-funded</span> : null}</span>
                        <span className="tnum shrink-0 font-semibold">{o.price ? `AED ${o.price}` : `−${o.discount_pct}%`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {selUnder && (selUnder.boosted
                  ? <p className="rounded-2xl border border-teal/40 bg-teal/10 px-4 py-3 text-[13.5px] font-semibold text-teal">Boost on: the upsell agent now favours {sel.name} on nearby routes.</p>
                  : <button className="next-btn justify-center" onClick={() => boost(sel.id)}><Zap size={16} />Boost on nearby routes</button>)}
              </div>
            )}
          </section>

          <aside className="grid min-w-0 content-start gap-5">
            <section className="card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold tracking-[-0.01em]">What the agents did</h2>
                <span className="text-[12px] text-smuted">newest first</span>
              </div>
              {data.events.length === 0 && <p className="mt-4 text-[14px] text-smuted">Nothing yet. Plan a visit on the shopper side.</p>}
              <ol className="mt-4 space-y-2.5">
                {[...data.events].reverse().slice(0, 8).map((e, i) => {
                  const a = agentOf(e.kind);
                  return (
                    <li key={i} className="grid grid-cols-[2.8rem_2.6rem_1fr] items-baseline gap-2 text-[13.5px] leading-snug">
                      <span className="tnum font-mono text-[11.5px] text-sfaint">{e.time}</span>
                      <span className="badge h-5 rounded-md text-[10px]" style={{ background: a === "concierge" ? "var(--color-sand)" : AGENT_COLOR[a], color: a === "concierge" ? "var(--color-stage)" : undefined }}>{a === "concierge" ? "CON" : AGENT_CODE[a]}</span>
                      <span className={e.alert ? "font-semibold text-coral" : "text-smuted"}><span className={e.alert ? "" : "font-semibold text-sand"}>{AGENT_STYLE[a].name}.</span> {e.text}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[12.5px] text-sfaint">Every time, price and discount comes from code. Gemini only reads the request.</p>
              {data.trace.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[13px] font-semibold text-teal underline underline-offset-4">Show the inputs and outputs of each agent</summary>
                  <div className="mt-3 space-y-4">
                    {data.trace.map((x, i) => (
                      <div key={i}>
                        <div className="text-[13px] font-semibold"><span className="tnum font-mono text-sfaint">{x.at}</span> · {x.agent}</div>
                        <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-panel-2 p-3 font-mono text-[12px] leading-relaxed text-smuted">{JSON.stringify({ input: x.input, output: x.output }, null, 1)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>

            <section className="card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold tracking-[-0.01em]">Tenants below target</h2>
                <span className="text-[12px] text-smuted">line = 85% goal</span>
              </div>
              <ul className="mt-4 space-y-1">
                {data.underperformers.map((u) => (
                  <li key={u.id}>
                    <button className={`grid w-full grid-cols-[1fr_110px_44px] items-center gap-3 rounded-xl px-2 py-2 text-left text-[14px] hover:bg-panel-2 ${sel?.id === u.id ? "bg-panel-2" : ""}`} onClick={() => setSelected(u.id)}>
                      <span className="min-w-0">
                        <span className={`block truncate ${sel?.id === u.id ? "font-bold text-teal" : "font-semibold"}`}>{u.name}{u.boosted ? <span className="ml-1.5 rounded bg-teal/15 px-1.5 text-[10.5px] font-bold text-teal">BOOST</span> : null}</span>
                        <span className="block truncate text-[12px] text-smuted">{u.wing_gap_pct < 0 ? `${-u.wing_gap_pct}% fewer visitors than its wing` : `${u.wing_gap_pct}% more visitors, ${u.conversion_pct}% buy`}</span>
                      </span>
                      <span className="relative h-1.5 rounded-full bg-panel-2">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-coral" style={{ width: `${(u.sales_vs_target / 120) * 100}%` }} />
                        <span className="absolute -inset-y-1 w-0.5 bg-sand/70" style={{ left: `${(85 / 120) * 100}%` }} />
                      </span>
                      <span className="tnum text-right font-bold">{u.sales_vs_target}%</span>
                    </button>
                    {u.actions.map((a, i) => <div key={i} className="ml-2 mt-0.5 text-[12.5px] text-teal">↳ {a}</div>)}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold tracking-[-0.01em]">Offers</h2>
                <div className="seg" role="tablist">
                  {(["top", "lagging", "this_visit"] as const).map((k) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k === "top" ? "Converting" : k === "lagging" ? "Lagging" : "This visit"}</button>
                  ))}
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[360px] text-[13px]">
                  <thead><tr className="text-left text-smuted"><th className="pb-2 font-normal">Store</th><th className="pb-2 text-right font-normal">Claimed</th><th className="pb-2 text-right font-normal">Redeemed</th><th className="w-28 pb-2 text-right font-normal">Rate</th></tr></thead>
                  <tbody className="tnum">
                    {rows.length === 0 && <tr><td colSpan={4} className="py-3 text-smuted">No offers used on this visit yet.</td></tr>}
                    {rows.map((r) => (
                      <tr key={r.id} title={r.title} className="border-t border-line">
                        <td className="py-2.5 pr-3"><div className={`text-[14px] ${r.this_visit ? "font-bold text-teal" : "font-semibold"}`}>{r.store}</div><div className="truncate text-smuted">{r.title}</div></td>
                        <td className="py-2.5 text-right">{fmt(r.claims)}</td>
                        <td className="py-2.5 text-right">{fmt(r.redemptions)}</td>
                        <td className="py-2.5 pl-3">
                          <div className="flex items-center justify-end gap-2"><span className="h-1.5 w-12 overflow-hidden rounded-full bg-panel-2"><span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, r.conversion)}%` }} /></span><b className="w-11 text-right text-[14px]">{r.conversion}%</b></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, alert, children }: { label: string; value: string; sub?: string; alert?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12.5px] text-smuted">{label}</div>
      <div className={`tnum font-display text-[24px] font-extrabold leading-tight tracking-[-0.01em] ${alert ? "text-coral" : ""}`}>{value}</div>
      {sub && <div className="text-[12px] text-smuted">{sub}</div>}
      {children}
    </div>
  );
}

/** Sparkline of values polled during this session; hidden until there are at least 3 different readings. */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 3) return null;
  const lo = Math.min(...values), hi = Math.max(...values), w = 72, h = 30;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={`${d} V${h} H0 Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}
