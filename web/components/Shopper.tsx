"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import MallMap, { type Camera } from "@/components/MallMap";
import { photo } from "@/lib/look";
import {
  AGENTS, api, hhmm, positionAt, travelledAt,
  type AgentEvent, type AgentKey, type ChatMsg, type Coupon, type Deal, type Intent, type Mall, type OfferCard, type Plan, type PlanResponse, type TickResponse,
} from "@/lib/api";

const SAMPLE = "I have 2 hours, kids with me, want sneakers under 400 and lunch.";
const ORDER: AgentKey[] = ["intent", "crowd", "offers", "upsell", "route"];
const PURPOSE: Record<string, string> = { shop: "Shopping", play: "Kids play", meal: "Lunch", upsell: "Suggested" };
const MS_WALK = 450, MS_DWELL = 55; // simulated clock: real ms per mall minute
const SHEET: Record<string, number> = { welcome: 0.5, planning: 0.5, plan: 0.54, walk: 0.3, reroute: 0.66, done: 0.5 };

export type Phase = "welcome" | "planning" | "plan" | "walk" | "done";

export default function Shopper({ mall, surgeSignal, onEvents, onSession, onPhase, onOperator }: {
  mall: Mall; surgeSignal: number;
  onEvents: (e: AgentEvent[]) => void; onSession: (sid: string | null) => void;
  onPhase: (p: Phase, rerouted: boolean, canSurge: boolean) => void; onOperator: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [input, setInput] = useState(SAMPLE);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [typing, setTyping] = useState(false);
  const [resp, setResp] = useState<PlanResponse | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [offers, setOffers] = useState<OfferCard[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [minute, setMinute] = useState(11 * 60 + 40);
  const [playing, setPlaying] = useState(true);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [reroute, setReroute] = useState<Coupon | null>(null);
  const [ghost, setGhost] = useState<number[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [deviceH, setDeviceH] = useState(800);
  const device = useRef<HTMLDivElement>(null);
  const sheetBody = useRef<HTMLDivElement>(null);
  const tickBusy = useRef(false);
  const lastTick = useRef(-1);
  const minuteRef = useRef(minute);
  minuteRef.current = minute;
  const planRef = useRef(plan);
  planRef.current = plan;

  const canSurge = !!resp && !reroute && (phase === "plan" || phase === "walk");
  useEffect(() => { onPhase(phase, !!reroute, canSurge); }, [phase, reroute, canSurge, onPhase]);
  useEffect(() => { api.deals().then(setDeals).catch(() => null); }, []);
  useEffect(() => {
    if (phase === "welcome" && chat.length === 0) api.chat([]).then((r) => setChat([{ role: "concierge", text: r.reply, suggestions: r.suggestions, source: r.source }])).catch((e) => setError((e as Error).message));
  }, [phase, chat.length]);
  useEffect(() => {
    const el = device.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDeviceH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setExpanded(false); sheetBody.current?.scrollTo({ top: 0 }); }, [phase, coupon]);

  const apply = useCallback((t: TickResponse) => {
    if (t.events.length) onEvents(t.events);
    const old = planRef.current;
    if (t.plan && t.coupon && old) {
      const mealIdx = old.stops.findIndex((s) => s.purpose === "meal");
      setGhost(old.legs[mealIdx]?.points ?? null);
      setPlan(t.plan); setCoupon(t.coupon); setReroute(t.coupon);
      if (t.offers) setOffers(t.offers);
    }
  }, [onEvents]);

  // Every request goes to the Gemini concierge; vague or empty ones get suggestions instead of a plan.
  async function send(t: string) {
    if (typing) return;
    if (phase !== "welcome") reset(false);
    const msg: ChatMsg = { role: "user", text: t.trim() };
    const history = [...(phase === "welcome" ? chat : chat.slice(0, 1)), msg];
    setChat(history); setTyping(true); setError(null);
    try {
      const r = await api.chat(history);
      setChat((c) => [...c, { role: "concierge", text: r.reply, suggestions: r.suggestions, source: r.source }]);
      onEvents([{ kind: `concierge-${r.source}`, text: (msg.text ? `“${msg.text}”: ` : "Empty request: ") + (r.ready ? "enough to plan, handing over to the agents" : r.reply), time: "11:40", alert: false, session: "" }]);
      if (r.ready && r.intent) {
        const said = history.filter((m) => m.role === "user" && m.text).map((m) => m.text);
        await planFrom(said.join(" "), r.intent, r.source, said.length);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTyping(false);
    }
  }

  async function planFrom(msg: string, intent: Intent, source: string, turns: number) {
    setPhase("planning"); setRevealed(0); setError(null); setGhost(null); setCoupon(null); setReroute(null);
    try {
      const r = await api.plan(msg, intent, source, turns);
      setResp(r); setPlan(r.plan); setOffers(r.offers); setMinute(r.plan.start_minute); setInput("");
      onSession(r.session_id);
      for (let i = 1; i <= ORDER.length; i++) {
        await sleep(420);
        setRevealed(i);
        const t = r.trace.find((x) => x.agent === ORDER[i - 1]);
        if (t) onEvents([{ kind: t.agent, text: t.title, time: hhmm(r.plan.start_minute), alert: false, session: r.session_id }]);
      }
      await sleep(500);
      setPhase("plan");
    } catch (e) {
      setError((e as Error).message); setPhase("welcome");
    }
  }

  async function startWalk() {
    if (!resp) return;
    await api.start(resp.session_id);
    lastTick.current = -1;
    setPlaying(true); setPhase("walk");
  }

  // The simulated walk: advance the clock and ask the backend agents what changed every 2 mall minutes.
  useEffect(() => {
    if (phase !== "walk" || !playing || coupon || !plan || !resp) return;
    let raf = 0, prev = performance.now();
    const loop = (now: number) => {
      const dt = now - prev; prev = now;
      const m = minuteRef.current;
      const walking = positionAt(plan, m).leg !== null;
      const next = Math.min(plan.end_minute, m + dt / (walking ? MS_WALK : MS_DWELL));
      setMinute(next);
      const bucket = Math.floor(next / 2);
      if (bucket !== lastTick.current && !tickBusy.current) {
        lastTick.current = bucket; tickBusy.current = true;
        api.tick(resp.session_id, next).then(apply).catch((e) => setError((e as Error).message)).finally(() => { tickBusy.current = false; });
      }
      if (next >= plan.end_minute) {
        api.tick(resp.session_id, next + 3).then((t) => t.events.length && onEvents(t.events));
        setPhase("done");
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, playing, coupon, plan, resp, apply, onEvents]);

  // Presenter pressed "Simulate lunch crowd surge".
  const lastSurge = useRef(surgeSignal);
  useEffect(() => {
    if (surgeSignal === lastSurge.current) return;
    lastSurge.current = surgeSignal;
    if (resp && !reroute) api.surge(resp.session_id).then(apply).catch((e) => setError((e as Error).message));
  }, [surgeSignal, resp, reroute, apply]);

  async function accept() {
    if (!resp || !coupon) return;
    await api.claim(resp.session_id, coupon.offer_id).catch(() => null);
    onEvents([{ kind: "claim", text: `Reroute accepted; ${coupon.code} claimed for ${coupon.store_name} (${coupon.unit})`, time: hhmm(minute), alert: false, session: resp.session_id }]);
    setCoupon(null);
  }

  function reset(clearChat = true) {
    setPhase("welcome"); setResp(null); setPlan(null); setGhost(null); setCoupon(null); setReroute(null); onSession(null);
    if (clearChat) { setChat([]); setInput(SAMPLE); }
  }

  const pos = plan && (phase === "walk" || phase === "done") ? positionAt(plan, minute) : null;
  const unit = (id: string) => mall.stores.find((s) => s.id === id)?.unit ?? "";
  const sheetKey = coupon ? "reroute" : phase;
  const sheetH = Math.round(deviceH * (expanded ? 0.9 : SHEET[sheetKey]));
  const topInset = 88;
  const cam: Camera = !plan || phase === "planning" ? { kind: "all", byWidth: true }
    : phase === "walk" && pos ? { kind: "follow", x: pos.x, y: pos.y, span: 420 }
    : { kind: "fit", points: plan.legs.flatMap((l) => l.points), pad: 95 };
  const lastReply = [...chat].reverse().find((m) => m.role === "concierge");
  const clock = hhmm(phase === "welcome" || phase === "planning" ? 11 * 60 + 40 : minute);

  return (
    <div ref={device} className="device">
      <MallMap mall={mall} orientation="portrait" labelIds={plan && phase !== "planning" ? plan.stops.map((s) => s.store_id) : []} camera={cam} cameraKey={`${phase}-${!!coupon}`} insetTop={topInset} insetBottom={sheetH}
        plan={phase === "planning" ? null : plan} travelled={pos ? travelledAt(plan!, minute) : null} ghost={ghost}
        pos={phase === "walk" ? pos : null} activeStop={pos?.stop ?? null} showGraph={graph} onToggleGraph={() => setGraph((g) => !g)}
        surges={reroute ? [{ id: mall.stores.find((s) => s.unit === reroute.replaces_unit)?.id ?? "", pct: reroute.planned_occupancy }] : []}
        controlsTop={topInset + 12} insetRight={phase === "walk" ? 0 : 60} compactControls={phase === "walk"} className="absolute inset-0" />

      {/* Top: where you are, and the request field (or the next step while walking) */}
      <div className={`absolute inset-x-0 top-0 px-4 pb-3 pt-4 ${phase === "walk" ? "" : "bg-white"}`}>
        {phase === "walk" && pos ? (
          <NextStep plan={plan!} minute={minute} pos={pos} clock={clock} />
        ) : (
          <form className="flex h-[52px] items-center gap-2 rounded-[26px] bg-page pl-5 pr-1.5" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="What do you need today?" placeholder={phase === "welcome" ? "What do you need today?" : "Plan something else"}
              className="min-w-0 flex-1 overflow-hidden text-ellipsis bg-transparent text-[15px] outline-none placeholder:text-faint" />
            <button type="submit" disabled={typing}
              className={`h-10 shrink-0 rounded-full px-5 text-[15px] font-semibold ${phase === "welcome" ? "bg-accent text-white" : "bg-white text-ink"} disabled:opacity-60`}>
              {typing ? "…" : phase === "welcome" ? "Plan" : "Replan"}
            </button>
          </form>
        )}
      </div>

      {/* Bottom sheet */}
      <section className="sheet" style={{ height: sheetH }} aria-label="Your visit">
        <button className="flex shrink-0 justify-center pb-3 pt-2.5" aria-label={expanded ? "Collapse" : "Expand"} onClick={() => setExpanded((x) => !x)}>
          <span className="grabber" />
        </button>
        <div ref={sheetBody} className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {coupon ? <Reroute c={coupon} onAccept={accept} />
            : phase === "welcome" ? (
              <div className="rise">
                {typing ? <div className="typing py-2"><span /><span /><span /></div>
                  : lastReply && <p className="text-[15px] leading-relaxed">{lastReply.text}</p>}
                {!typing && !!lastReply?.suggestions?.length && (
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {lastReply.suggestions.slice(0, 3).map((s) => (
                      <li key={s}><button className="link text-left text-[13px]" onClick={() => { setInput(s); send(s); }}>{s.length > 34 ? "2 hours, kids, sneakers, lunch" : s}</button></li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}
                <h2 className="mt-7 text-[15px] font-semibold">Offers near you</h2>
                <ul className="mt-1">
                  {deals.map((d) => (
                    <li key={d.store_id + d.title} className="flex items-center gap-3 py-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo(d.store_id, d.category)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">{d.store_name}</div>
                        <div className="truncate text-[13px] text-muted">{d.title}, unit {unit(d.store_id)}</div>
                      </div>
                      <div className="shrink-0 text-right tnum">
                        <div className="text-[15px] font-semibold">AED {d.price}</div>
                        <div className="text-[13px] text-faint line-through">{d.was}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[13px] text-muted">Demo data: stores, prices and crowds are synthetic.</p>
              </div>
            ) : phase === "planning" ? (
              <div className="rise">
                <h2 className="text-[20px] font-semibold">Planning your visit</h2>
                <ol className="mt-6 space-y-5">
                  {ORDER.map((k, i) => {
                    const t = resp?.trace.find((x) => x.agent === k);
                    const done = i < revealed, now = i === revealed;
                    return (
                      <li key={k} className={`flex gap-3 ${!done && !now ? "opacity-35" : ""}`}>
                        <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center">{done ? <Check size={16} className="text-ink" /> : now ? <span className="typing"><span /></span> : <span className="h-1.5 w-1.5 rounded-full bg-faint" />}</span>
                        <div>
                          <div className="text-[15px] font-medium">{AGENTS[k].name}</div>
                          <div className="text-[13px] text-muted">{done ? t?.title : AGENTS[k].role}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : plan && resp ? (
              <div className="rise">
                {phase === "plan" && <PlanHeader plan={plan} budget={resp.intent.time_budget_min} summary={resp.intent.summary} />}
                {phase === "walk" && pos && <WalkHeader plan={plan} minute={minute} pos={pos} playing={playing} onToggle={() => setPlaying((p) => !p)} />}
                {phase === "done" && <Done plan={plan} offers={offers} reroute={reroute} budget={resp.intent.time_budget_min} onOperator={onOperator} onReset={() => reset()} />}
                <Stops plan={plan} offers={offers} unit={unit} cat={(id) => mall.stores.find((s) => s.id === id)?.category ?? ""} minute={phase === "plan" ? null : minute} />
                {phase === "plan" && <Breakdown plan={plan} budget={resp.intent.time_budget_min} />}
                {phase === "plan" && (
                  <>
                    {offers.filter((o) => o.purpose === "extra").map((o) => (
                      <p key={o.id} className="mt-6 text-[13px] text-muted">Also at {o.store_name}: {o.title}, AED {o.price}.</p>
                    ))}
                    <button className="quiet mt-6 underline underline-offset-4" onClick={() => setShowTrace((s) => !s)}>{showTrace ? "Hide how this was planned" : "How was this planned?"}</button>
                    {showTrace && (
                      <ol className="mt-4 space-y-4">
                        {resp.trace.map((t) => (
                          <li key={t.agent} className="text-[13px]">
                            <div className="font-medium text-ink">{AGENTS[t.agent].name}</div>
                            <div className="text-muted">{t.title}</div>
                            <div className="text-faint">{t.detail}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            ) : null}
        </div>
        {phase === "plan" && !coupon && <div className="shrink-0 px-6 pb-6 pt-2"><button className="primary w-full" onClick={startWalk}>Start route</button></div>}
      </section>
    </div>
  );
}

function PlanHeader({ plan, budget, summary }: { plan: Plan; budget: number; summary: string }) {
  return (
    <>
      <h2 className="text-[20px] font-semibold">Your plan</h2>
      <p className="mt-1 text-[13px] text-muted">{summary}</p>
      <p className="tnum mt-3 text-[15px]">Back by <b>{hhmm(plan.end_minute)}</b>, {plan.walk_m} m on foot, {plan.total_min} of {budget} min</p>
    </>
  );
}

function Breakdown({ plan, budget }: { plan: Plan; budget: number }) {
  const dwell = (p: string[]) => plan.stops.filter((s) => p.includes(s.purpose)).reduce((a, s) => a + s.dwell, 0);
  const walk = plan.total_min - plan.stops.reduce((a, s) => a + s.dwell, 0);
  const parts: [string, number][] = [["walking", walk], ["shopping", dwell(["shop", "upsell"])], ["kids play", dwell(["play"])], ["lunch", dwell(["meal"])], ["spare", budget - plan.total_min]];
  return <p className="tnum mt-6 text-[13px] text-muted">Your {budget} minutes: {parts.filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(", ")}.</p>;
}

function Stops({ plan, offers, unit, cat, minute }: { plan: Plan; offers: OfferCard[]; unit: (id: string) => string; cat: (id: string) => string; minute: number | null }) {
  return (
    <ol className="mt-5">
      {plan.stops.map((s, i) => {
        const o = offers.find((x) => x.id === s.offer_id);
        const done = minute !== null && minute >= s.depart;
        const here = minute !== null && minute >= s.arrive && minute < s.depart;
        return (
          <li key={s.store_id + i} className={`grid grid-cols-[20px_44px_1fr_auto] items-start gap-x-3 py-2.5 ${done ? "opacity-40" : ""}`}>
            <span className={`tnum pt-2.5 text-[15px] font-semibold ${here ? "text-accent" : ""}`}>{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo(s.store_id, cat(s.store_id))} alt="" className="h-11 w-11 rounded-lg object-cover" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium">{s.name}</div>
              <div className="truncate text-[13px] text-muted">{PURPOSE[s.purpose]}, {s.dwell} min, unit {unit(s.store_id)}{s.replaces ? `, instead of ${s.replaces}` : ""}</div>
              {o && <div className="truncate text-[13px] text-muted">{o.title}</div>}
            </div>
            <div className="text-right tnum">
              <div className="text-[15px]">{hhmm(s.arrive)}</div>
              {o && (o.price ? <div className="text-[13px] font-semibold">AED {o.price}</div> : <div className="text-[13px] font-semibold">−{o.discount_pct}%</div>)}
            </div>
          </li>
        );
      })}
      <li className="grid grid-cols-[20px_44px_1fr_auto] gap-x-3 py-2.5 text-[13px] text-muted">
        <span /><span /><span>Back at the main entrance</span><span className="tnum">{hhmm(plan.end_minute)}</span>
      </li>
    </ol>
  );
}

function NextStep({ plan, minute, pos, clock }: { plan: Plan; minute: number; pos: ReturnType<typeof positionAt>; clock: string }) {
  let head: string, sub: string;
  if (pos.leg !== null) {
    const to = plan.stops[pos.leg];
    head = `Walk ${plan.legs[pos.leg].metres} m`;
    sub = to ? `to ${to.name}, ${Math.max(1, Math.round(plan.legs[pos.leg].arrive - minute))} min` : "back to the main entrance";
  } else if (pos.stop !== null) {
    const s = plan.stops[pos.stop];
    head = `At ${s.name}`;
    sub = `until ${hhmm(s.depart)}`;
  } else { head = "Leaving the entrance"; sub = "follow the blue line"; }
  return (
    <div className="rounded-[20px] bg-white px-5 py-4" role="status">
      <div className="flex items-baseline justify-between gap-3"><span className="text-[20px] font-semibold leading-tight">{head}</span><span className="tnum text-[13px] text-muted">{clock}</span></div>
      <div className="text-[15px] text-muted">{sub}</div>
    </div>
  );
}

function WalkHeader({ plan, minute, pos, playing, onToggle }: { plan: Plan; minute: number; pos: ReturnType<typeof positionAt>; playing: boolean; onToggle: () => void }) {
  const done = plan.stops.filter((s) => minute >= s.depart).length;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <h2 className="tnum text-[20px] font-semibold">Back by {hhmm(plan.end_minute)}</h2>
        <p className="tnum text-[13px] text-muted">{done} of {plan.stops.length} stops done{pos.stop !== null ? ", you are at a stop" : ""}</p>
      </div>
      <button className="quiet underline underline-offset-4" onClick={onToggle}>{playing ? "Pause" : "Resume"}</button>
    </div>
  );
}

function Reroute({ c, onAccept }: { c: Coupon; onAccept: () => void }) {
  const over = c.old_total_min - c.budget_min;
  return (
    <div className="rise">
      <p className="flex items-center gap-2 text-[13px] font-medium text-alert"><span className="h-2 w-2 rounded-full bg-alert" />{c.replaces} is {c.planned_occupancy}% full, {c.planned_wait} min wait</p>
      <h2 className="mt-3 text-[20px] font-semibold">Lunch moved to {c.store_name}</h2>
      <p className="mt-1 text-[15px] text-muted">{c.metres} m away, {c.new_occupancy}% full{c.new_wait ? `, ${c.new_wait} min wait` : ", no wait"}.</p>
      <dl className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <dt className="text-[13px] text-muted">If you wait</dt>
          <dd className="tnum text-[32px] font-semibold leading-tight text-faint">{c.old_total_min} min</dd>
          <dd className="tnum text-[13px] text-alert">{over > 0 ? `${over} min over your ${c.budget_min}` : "within budget"}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">New route</dt>
          <dd className="tnum text-[32px] font-semibold leading-tight">{c.new_total_min} min</dd>
          <dd className="tnum text-[13px] text-muted">{c.new_total_min <= c.budget_min ? "on time" : "over budget"}, {c.discount_pct}% off lunch</dd>
        </div>
      </dl>
      <p className="mt-8 text-[13px] text-muted">{c.title}. Code <span className="tnum font-semibold text-ink">{c.code}</span>, valid until <span className="tnum">{c.expires}</span>.</p>
      <button className="primary mt-6 w-full" onClick={onAccept}>Accept and claim {c.discount_pct}% off</button>
    </div>
  );
}

function Done({ plan, offers, reroute, budget, onOperator, onReset }: { plan: Plan; offers: OfferCard[]; reroute: Coupon | null; budget: number; onOperator: () => void; onReset: () => void }) {
  const saved = offers.filter((o) => o.purpose !== "extra").reduce((a, o) => a + (o.was ? o.was - o.price : Math.round((o.discount_pct / 100) * 180)), 0);
  const rows: [string, string][] = [
    ["Saved with offers", `AED ${saved}`],
    ...(reroute ? [[`Queue avoided at ${reroute.replaces}`, `${reroute.planned_wait} min`] as [string, string]] : []),
    ["Time used", `${plan.total_min} of ${budget} min`],
    ["Walked", `${plan.walk_m} m`],
  ];
  return (
    <div>
      <h2 className="text-[20px] font-semibold">Visit complete</h2>
      <dl className="mt-6 space-y-3">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 text-[15px]"><dt className="text-muted">{k}</dt><dd className="tnum font-semibold">{v}</dd></div>)}
      </dl>
      <button className="primary mt-8 w-full" onClick={onOperator}>Open the operator view</button>
      <button className="quiet mt-4 w-full underline underline-offset-4" onClick={onReset}>Start a new visit</button>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
