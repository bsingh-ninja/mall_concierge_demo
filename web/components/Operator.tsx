"use client";
import { useEffect, useState } from "react";
import MallMap from "@/components/MallMap";
import { AGENT_STYLE, agentOf, api, type LedgerRow, type Mall, type OperatorData } from "@/lib/api";
import { group } from "@/lib/look";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Operator({ mall, session, active }: { mall: Mall; session: string | null; active: boolean }) {
  const [data, setData] = useState<OperatorData | null>(null);
  const [tab, setTab] = useState<"top" | "lagging" | "this_visit">("top");
  const [selected, setSelected] = useState<string | null>(null);
  const [graph, setGraph] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () => api.operator(session).then((d) => alive && setData(d)).catch(() => null);
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [session, active, nonce]);

  if (!data) return <div className="grid h-full place-items-center text-muted">Loading the console…</div>;
  const t = data.telemetry;
  const flagged = data.underperformers.map((u) => u.id);
  const sel = mall.stores.find((s) => s.id === (selected ?? data.underperformers[0]?.id));
  const selUnder = data.underperformers.find((u) => u.id === sel?.id);
  const rows: LedgerRow[] = data.ledger[tab];
  const surges = data.surges.map((id) => ({ id, pct: Math.round((data.heat[id] ?? 0) * 100) }));

  async function boost(id: string) {
    await api.boost(id, session).catch(() => null);
    setNonce((n) => n + 1);
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-[1440px] px-8 pb-20 pt-10 lg:px-12">
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Operations</h1>
          <span className="tnum text-[15px] text-muted">{data.mall}, Saturday {data.clock}. Demo data, all figures synthetic.</span>
        </header>

        <div className="mt-10 grid gap-16 xl:grid-cols-[62fr_38fr]">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-[20px] font-semibold">Footfall now</h2>
              <p className="text-[13px] text-muted">Darker is busier. Dashed units are below their sales target. Click a unit to inspect it.</p>
            </div>
            <MallMap mall={mall} orientation="landscape" camera={{ kind: "all" }} heat={data.heat} flagged={flagged} surges={surges}
              plan={data.route} labelIds={[...flagged, ...(data.route?.stops.map((s) => s.store_id) ?? [])]} showGraph={graph} onToggleGraph={() => setGraph((g) => !g)} selected={sel?.id ?? null} onSelect={setSelected}
              insetRight={60} className="relative mt-6 aspect-[1200/700] w-full rounded-[20px]" />
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
              <Figure small label="QR sessions today" value={fmt(t.active_qr_sessions)} />
              <Figure small label="Offer redemption" value={`${t.redemption_rate_pct}%`} />
              <Figure small label="Average visit" value={`${t.avg_dwell_min} min`} />
              <Figure small label="Rerouted parties" value={fmt(t.rerouted_parties)} />
              <Figure small label="Revenue attributed" value={`AED ${fmt(Math.round(t.revenue_aed / 1000))}k`} />
            </dl>

            {sel && (
              <div className="mt-10">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <h3 className="text-[20px] font-semibold">{sel.name}</h3>
                  <span className="text-[13px] text-muted">Unit {sel.unit}, {group(sel.category)}</span>
                </div>
                <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                  <Figure small label="Sales vs target" value={`${sel.kpi.sales_vs_target}%`} alert={sel.kpi.sales_vs_target < 85} />
                  <Figure small label="Visitors today" value={fmt(sel.kpi.footfall_today)} />
                  <Figure small label="Who buy" value={`${sel.kpi.conversion_pct}%`} />
                  <Figure small label="Busy now" value={`${Math.round((data.heat[sel.id] ?? 0) * 100)}%`} />
                </dl>
                {sel.offers.length > 0 && (
                  <ul className="mt-6 space-y-2 text-[15px]">
                    {sel.offers.map((o) => (
                      <li key={o.id} className="flex justify-between gap-4">
                        <span>{o.title}{o.funded_by === "mall" ? <span className="text-muted">, funded by the mall</span> : null}</span>
                        <span className="tnum font-medium">{o.price ? `AED ${o.price}` : `−${o.discount_pct}%`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {selUnder && (
                  selUnder.boosted
                    ? <p className="mt-6 text-[15px] text-muted">Proximity boost is on. The upsell agent now favours {sel.name} on nearby routes.</p>
                    : <button className="primary mt-6" onClick={() => boost(sel.id)}>Boost {sel.name} on nearby routes</button>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-16">
            <section>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[20px] font-semibold">Offers</h2>
                <div className="flex gap-5 text-[13px]" role="tablist">
                  {(["top", "lagging", "this_visit"] as const).map((k) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      className={tab === k ? "font-semibold text-ink" : "text-muted hover:text-ink"}>
                      {k === "top" ? "Converting" : k === "lagging" ? "Lagging" : "This visit"}
                    </button>
                  ))}
                </div>
              </div>
              <table className="mt-6 w-full text-[13px]">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-3 font-normal">Store</th>
                    <th className="pb-3 text-right font-normal">Claimed</th>
                    <th className="pb-3 text-right font-normal">Redeemed</th>
                    <th className="pb-3 text-right font-normal">Rate</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {rows.length === 0 && <tr><td colSpan={4} className="py-3 text-muted">No offers used on this visit yet.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.id} title={r.title}>
                      <td className="py-2.5 pr-3">
                        <div className={`text-[15px] ${r.this_visit ? "font-semibold" : ""}`}>{r.store}</div>
                        <div className="text-muted">{r.title}</div>
                      </td>
                      <td className="py-2.5 text-right">{fmt(r.claims)}</td>
                      <td className="py-2.5 text-right">{fmt(r.redemptions)}</td>
                      <td className="py-2.5 text-right text-[15px] font-semibold">{r.conversion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="text-[20px] font-semibold">Tenants below target</h2>
              <ul className="mt-6 space-y-6">
                {data.underperformers.map((u) => (
                  <li key={u.id}>
                    <button className="w-full text-left" onClick={() => setSelected(u.id)}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className={`text-[15px] ${sel?.id === u.id ? "font-semibold" : "font-medium"}`}>{u.name}</span>
                        <span className="tnum text-[15px]">{u.sales_vs_target}%</span>
                      </div>
                      <div className="text-[13px] text-muted">
                        {u.wing_gap_pct < 0 ? `${-u.wing_gap_pct}% fewer visitors than its wing` : `${u.wing_gap_pct}% more visitors than its wing, but only ${u.conversion_pct}% buy`}
                        {u.boosted ? ". Boost on." : ""}
                      </div>
                    </button>
                    {u.actions.map((a, i) => <div key={i} className="mt-1 text-[13px] text-ink">{a}</div>)}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-[20px] font-semibold">What the agents did</h2>
              <p className="mt-1 text-[13px] text-muted">Every time, price and discount comes from code. Gemini only reads the request.</p>
              {data.events.length === 0 && <p className="mt-6 text-[15px] text-muted">Nothing yet. Plan a visit on the shopper side.</p>}
              <ol className="mt-6 space-y-3">
                {[...data.events].reverse().slice(0, 10).map((e, i) => (
                  <li key={i} className="grid grid-cols-[3rem_1fr] gap-3 text-[13px]">
                    <span className="tnum text-muted">{e.time}</span>
                    <span className={e.alert ? "text-alert" : ""}><span className="font-medium">{AGENT_STYLE[agentOf(e.kind)].name}.</span> {e.text}</span>
                  </li>
                ))}
              </ol>
              {data.trace.length > 0 && (
                <details className="mt-8">
                  <summary className="quiet cursor-pointer underline underline-offset-4">Show the inputs and outputs of each agent</summary>
                  <div className="mt-4 space-y-6">
                    {data.trace.map((x, i) => (
                      <div key={i}>
                        <div className="text-[13px] font-medium"><span className="tnum text-muted">{x.at}</span>  {x.agent}</div>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{JSON.stringify({ input: x.input, output: x.output }, null, 1)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, small, alert }: { label: string; value: string; small?: boolean; alert?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`tnum whitespace-nowrap font-semibold tracking-[-0.01em] ${small ? "text-[20px]" : "text-[32px]"} ${alert ? "text-alert" : ""}`}>{value}</dd>
    </div>
  );
}
