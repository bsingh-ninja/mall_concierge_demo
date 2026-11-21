"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, MapPin, X } from "lucide-react";
import MallMap, { queueMin, type Camera } from "@/components/MallMap";
import { group, look, photo } from "@/lib/look";
import {
  AGENTS, api, hhmm, positionAt, travelledAt,
  type AgentEvent, type AgentKey, type ChatMsg, type Coupon, type Deal, type Intent, type Mall, type OfferCard, type Plan, type PlanResponse, type Store, type TickResponse,
} from "@/lib/api";

const SAMPLE = "I have 2 hours, kids with me, want sneakers under 400 and lunch.";
const ORDER: AgentKey[] = ["intent", "crowd", "offers", "upsell", "route"];
const PURPOSE: Record<string, string> = { shop: "Shopping", play: "Kids play", meal: "Lunch", upsell: "On your way" };
const MS_WALK = 450, MS_DWELL = 55; // simulated clock: real ms per mall minute
// Default sheet height per screen (share of the phone). Smaller than v1 so the map stays the hero;
// the sheet also snaps to a slim strip (full map) and to tall, by drag or tap on its handle.
const SHEET: Record<string, number> = { welcome: 0.4, planning: 0.42, plan: 0.46, walk: 0.27, reroute: 0.58, done: 0.5, store: 0.38 };
const SHEET_MIN = 92, SHEET_MAX = 0.88;
type Snap = "min" | "mid" | "max";
export const AGENT_COLOR: Record<AgentKey, string> = {
  intent: "var(--color-a-intent)", crowd: "var(--color-a-crowd)", offers: "var(--color-a-offers)", upsell: "var(--color-a-upsell)", route: "var(--color-a-route)",
};
export const AGENT_CODE: Record<AgentKey, string> = { intent: "INT", crowd: "CRW", offers: "OFR", upsell: "KPI", route: "A*" };

export type Phase = "welcome" | "planning" | "plan" | "walk" | "done";
/** Presenter commands sent from the stage (Next button, keys). `n` changes on every send. */
export type Command = { kind: "plan" | "start" | "accept" | "reset"; n: number };
/** What the stage needs to know about the shopper's visit (no per-frame values, so the stage does not re-render every frame). */
export type ShopperState = {
  phase: Phase; rerouted: boolean; canSurge: boolean; couponOpen: boolean; busy: boolean;
  request: string; resp: PlanResponse | null; plan: Plan | null; offers: OfferCard[]; coupon: Coupon | null; revealed: number;
};

type Layers = { deals: boolean; crowds: boolean; focus: "food" | "kids" | null };

export default function Shopper({ mall, surgeSignal, command, onEvents, onSession, onPhase, onOperator }: {
  mall: Mall; surgeSignal: number; command: Command | null;
  onEvents: (e: AgentEvent[]) => void; onSession: (sid: string | null) => void;
  onPhase: (s: ShopperState) => void; onOperator: () => void;
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
  const [snap, setSnap] = useState<Snap>("mid");
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [deviceH, setDeviceH] = useState(800);
  const [layers, setLayers] = useState<Layers>({ deals: false, crowds: false, focus: null });
  const [heat, setHeat] = useState<Record<string, number> | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [preview, setPreview] = useState<number[][] | null>(null);
  const [request, setRequest] = useState("");
  const device = useRef<HTMLDivElement>(null);
  const sheetBody = useRef<HTMLDivElement>(null);
  const tickBusy = useRef(false);
  const lastTick = useRef(-1);
  const minuteRef = useRef(minute);
  minuteRef.current = minute;
  const planRef = useRef(plan);
  planRef.current = plan;

  const canSurge = !!resp && !reroute && (phase === "plan" || phase === "walk");
  useEffect(() => {
    onPhase({ phase, rerouted: !!reroute, canSurge, couponOpen: !!coupon, busy: typing, request, resp, plan, offers, coupon: reroute, revealed });
  }, [phase, reroute, canSurge, coupon, typing, request, resp, plan, offers, revealed, onPhase]);
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
  useEffect(() => { setSnap("mid"); sheetBody.current?.scrollTo({ top: 0 }); }, [phase, coupon, store]);

  // Live crowd layer: real occupancy from the crowd agent (via the operator endpoint), refreshed while it is on.
  const sessionId = resp?.session_id ?? null;
  const needHeat = layers.crowds || !!store;
  useEffect(() => {
    if (!needHeat) return;
    let alive = true;
    const load = () => api.operator(sessionId).then((d) => alive && setHeat(d.heat)).catch(() => null);
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [needHeat, sessionId]);

  const apply = useCallback((t: TickResponse) => {
    if (t.events.length) onEvents(t.events);
    const old = planRef.current;
    if (t.plan && t.coupon && old) {
      const mealIdx = old.stops.findIndex((s) => s.purpose === "meal");
      setGhost(old.legs[mealIdx]?.points ?? null);
      setPlan(t.plan); setCoupon(t.coupon); setReroute(t.coupon);
      if (t.offers) setOffers(t.offers);
      setStore(null); setPreview(null);
    }
  }, [onEvents]);

  // Every request goes to the Gemini concierge; vague or empty ones get suggestions instead of a plan.
  async function send(t: string) {
    if (typing) return;
    if (phase !== "welcome") reset(false);
    const msg: ChatMsg = { role: "user", text: t.trim() };
    const history = [...(phase === "welcome" ? chat : chat.slice(0, 1)), msg];
    setChat(history); setTyping(true); setError(null); setStore(null); setPreview(null);
    try {
      const r = await api.chat(history);
      setChat((c) => [...c, { role: "concierge", text: r.reply, suggestions: r.suggestions, source: r.source }]);
      onEvents([{ kind: `concierge-${r.source}`, text: (msg.text ? `“${msg.text}”: ` : "Empty request: ") + (r.ready ? "enough to plan, handing over to the agents" : r.reply), time: "11:40", alert: false, session: "" }]);
      if (r.ready && r.intent) {
        const said = history.filter((m) => m.role === "user" && m.text).map((m) => m.text);
        setRequest(said.join(" "));
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
    setStore(null); setPreview(null);
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

  // Presenter pressed "Trigger lunch rush" (button, S key or Next).
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
    setStore(null); setPreview(null); setRequest("");
    if (clearChat) { setChat([]); setInput(SAMPLE); }
  }

  // Presenter commands. Handlers live in a ref so the effect always calls the latest closures.
  const handlers = useRef({ send, startWalk, accept, reset, input, phase });
  handlers.current = { send, startWalk, accept, reset, input, phase };
  const lastCommand = useRef(command?.n ?? 0);
  useEffect(() => {
    if (!command || command.n === lastCommand.current) return;
    lastCommand.current = command.n;
    const h = handlers.current;
    if (command.kind === "plan" && h.phase === "welcome") h.send(h.input.trim() || SAMPLE);
    if (command.kind === "start") h.startWalk();
    if (command.kind === "accept") h.accept();
    if (command.kind === "reset") h.reset();
  }, [command]);

  const pos = plan && (phase === "walk" || phase === "done") ? positionAt(plan, minute) : null;
  const cat =(id: string) => mall.stores.find((s) => s.id === id)?.category ?? "";

  function selectStore(id: string) {
    const s = mall.stores.find((x) => x.id === id);
    if (!s || coupon) return;
    setStore(s); setPreview(null);
  }
  const from = pos ? nearestNode(mall, pos.x, pos.y) : mall.entrance;
  const way = store ? walkPath(mall, from, store.door) : null;

  const sheetKey = coupon ? "reroute" : store ? "store" : phase;
  const snapH = { min: SHEET_MIN, mid: Math.round(deviceH * SHEET[sheetKey]), max: Math.round(deviceH * SHEET_MAX) };
  const sheetH = dragH ?? snapH[snap];
  // Handle: drag to resize and snap to the nearest of slim / default / tall; a tap toggles slim and default.
  const onHandleDown = (e: React.PointerEvent) => { dragRef.current = { y: e.clientY, h: sheetH, moved: false }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(SHEET_MIN, Math.min(snapH.max, d.h - dy)));
  };
  const minLabel = coupon ? "Lunch moved: tap for the coupon" : store ? store.name : phase === "welcome" ? "Ask the concierge · today's deals"
    : phase === "plan" && plan ? `Back by ${hhmm(plan.end_minute)} · ${plan.stops.length} stops` : phase === "done" ? "Visit complete" : "Show details";
  const onHandleUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setSnap((s) => (s === "mid" ? "min" : "mid")); return; }
    const h = dragH ?? d.h;
    const nearest = (Object.entries(snapH) as [Snap, number][]).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0];
    setSnap(nearest); setDragH(null);
  };
  const showChips = phase !== "walk" && phase !== "planning" && !coupon;
  const topInset = showChips ? 128 : 88;
  // During the reroute, frame where the shopper is, the abandoned leg and the new lunch spot together.
  const newMeal = coupon && plan ? plan.stops.find((s) => s.purpose === "meal") : null;
  const cam: Camera = coupon && newMeal && pos ? { kind: "fit", points: [[pos.x, pos.y], [newMeal.x, newMeal.y], ...(ghost ?? [])], pad: 70 }
    : preview ? { kind: "fit", points: preview, pad: 90 }
    : store ? { kind: "fit", points: [[store.rect.x, store.rect.y], [store.rect.x + store.rect.w, store.rect.y + store.rect.h]], pad: 140 }
    : !plan || phase === "planning" ? { kind: "all", byWidth: true }
    : phase === "walk" && pos ? { kind: "follow", x: pos.x, y: pos.y, span: 420 }
    : { kind: "fit", points: plan.legs.flatMap((l) => l.points), pad: 95 };
  const lastReply = [...chat].reverse().find((m) => m.role === "concierge");
  const clock = hhmm(phase === "welcome" || phase === "planning" ? 11 * 60 + 40 : minute);
  const mapLayers = { deals: layers.deals, crowds: layers.crowds ? heat : null, focus: layers.focus };

  return (
    <div ref={device} className="device">
      <MallMap mall={mall} orientation="portrait" labelIds={plan && phase !== "planning" ? plan.stops.map((s) => s.store_id) : []} camera={cam}
        cameraKey={`${phase}-${!!coupon}-${store?.id ?? ""}-${!!preview}`} insetTop={topInset} insetBottom={sheetH}
        plan={phase === "planning" ? null : plan} travelled={pos ? travelledAt(plan!, minute) : null} ghost={ghost}
        pos={phase === "walk" ? pos : null} activeStop={pos?.stop ?? null} showGraph={graph} onToggleGraph={() => setGraph((g) => !g)}
        surges={reroute ? [{ id: mall.stores.find((s) => s.unit === reroute.replaces_unit)?.id ?? "", pct: reroute.planned_occupancy }] : []}
        layers={mapLayers} preview={preview} legLabels={phase === "plan" && !store} selected={store?.id ?? null} onSelect={selectStore}
        onPan={() => { if (!coupon) setSnap("min"); }}
        controlsTop={topInset + 4} insetRight={phase === "walk" ? 0 : 60} compactControls={phase === "walk"} className="absolute inset-0" />

      {/* Top: the request field (or the next turn while walking), then the map layers */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-3 [&>*]:pointer-events-auto">
        {phase === "walk" && pos ? (
          <NextStep plan={plan!} minute={minute} pos={pos} clock={clock} />
        ) : (
          <form className="flex h-[52px] items-center gap-2 rounded-[26px] bg-white pl-5 pr-1.5 shadow-[0_2px_12px_rgba(16,35,58,.12)]" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="What do you need today?" placeholder={phase === "welcome" ? "What do you need today?" : "Plan something else"}
              className="min-w-0 flex-1 overflow-hidden text-ellipsis bg-transparent text-[16px] outline-none placeholder:text-faint" />
            <button type="submit" disabled={typing}
              className={`h-10 shrink-0 rounded-full px-5 text-[15px] font-bold transition ${phase === "welcome" ? "bg-accent text-white" : "bg-page text-ink"} disabled:opacity-60`}>
              {typing ? "…" : phase === "welcome" ? "Plan" : "Replan"}
            </button>
          </form>
        )}
        {showChips && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 pr-14 [scrollbar-width:none]" role="toolbar" aria-label="Map layers">
            <button className="chip" aria-pressed={layers.deals} onClick={() => setLayers((l) => ({ ...l, deals: !l.deals }))}><i style={{ background: "#b7832a" }} />Deals</button>
            <button className="chip" aria-pressed={layers.crowds} onClick={() => setLayers((l) => ({ ...l, crowds: !l.crowds }))}><i style={{ background: "#e5484d" }} />Crowds</button>
            <button className="chip" aria-pressed={layers.focus === "food"} onClick={() => setLayers((l) => ({ ...l, focus: l.focus === "food" ? null : "food" }))}><i style={{ background: "#e0602f" }} />Food</button>
            <button className="chip" aria-pressed={layers.focus === "kids"} onClick={() => setLayers((l) => ({ ...l, focus: l.focus === "kids" ? null : "kids" }))}><i style={{ background: "#2e9a55" }} />Kids</button>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <section className="sheet z-10" style={{ height: sheetH, transition: dragH !== null ? "none" : undefined }} aria-label="Your visit">
        <button className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-1 pb-2 pt-2.5 active:cursor-grabbing" aria-label={snap === "min" ? "Show the details" : "Show the full map"}
          title={snap === "min" ? "Tap or drag up for details" : "Tap or drag down for the full map"}
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          onKeyDown={(e) => { if (e.key === "ArrowUp") setSnap((s) => (s === "min" ? "mid" : "max")); if (e.key === "ArrowDown") setSnap((s) => (s === "max" ? "mid" : "min")); }}>
          <span className="grabber" />
          {snap === "min" && <span className="text-[12px] font-semibold text-muted">{minLabel}</span>}
        </button>
        <div ref={sheetBody} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {coupon ? <Reroute c={coupon} onAccept={accept} />
            : store ? <StoreCard s={store} heat={heat} way={way} onWay={() => way && setPreview(way.points)} showing={!!preview} onClose={() => { setStore(null); setPreview(null); }} />
            : phase === "welcome" ? (
              <div className="rise">
                <div className="space-y-2.5">
                  {chat.slice(-4).map((m, i) => (
                    <p key={i} className={`max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-snug ${m.role === "user" ? "ml-auto rounded-br-md bg-ink text-white" : "rounded-bl-md bg-accent-soft"}`}>{m.text}</p>
                  ))}
                  {typing && <div className="w-16 rounded-[18px] rounded-bl-md bg-accent-soft px-4 py-3"><div className="typing"><span /><span /><span /></div></div>}
                </div>
                {!typing && !!lastReply?.suggestions?.length && (
                  <ul className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" aria-label="Suggestions">
                    {lastReply.suggestions.slice(0, 4).map((s) => (
                      <li key={s} className="shrink-0"><button className="max-w-[260px] truncate rounded-full border-[1.5px] border-ink px-3 py-1.5 text-left text-[13px] font-semibold hover:bg-ink hover:text-white" title={s} onClick={() => { setInput(s); send(s); }}>{s}</button></li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}
                <h2 className="mt-6 flex items-baseline justify-between font-display text-[16px] font-extrabold">Today&apos;s best deals <span className="font-sans text-[12px] font-semibold text-accent">tap a store on the map</span></h2>
                <ul className="-mx-5 mt-2.5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                  {deals.map((d) => (
                    <li key={d.store_id + d.title} className="w-[150px] shrink-0">
                      <button className="w-full overflow-hidden rounded-2xl border border-[#ece7de] bg-white text-left" onClick={() => selectStore(d.store_id)}>
                        <span className="relative block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo(d.store_id, d.category)} alt="" className="h-[84px] w-full object-cover" />
                          <span className="absolute bottom-1.5 right-1.5 rounded-lg bg-[#f5a623] px-1.5 py-0.5 font-display text-[11px] font-extrabold text-ink">−{d.discount_pct}%</span>
                        </span>
                        <span className="block px-2.5 py-2">
                          <span className="block truncate text-[13px] font-bold">{d.store_name}</span>
                          <span className="tnum block truncate text-[12px] text-muted">AED {d.price} · <s>{d.was}</s></span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12px] text-faint">Demo data: stores, prices and crowds are synthetic.</p>
              </div>
            ) : phase === "planning" ? (
              <div className="rise">
                <h2 className="font-display text-[22px] font-extrabold tracking-[-0.015em]">Planning your visit</h2>
                <ol className="mt-5 space-y-4">
                  {ORDER.map((k, i) => {
                    const t = resp?.trace.find((x) => x.agent === k);
                    const done = i < revealed, now = i === revealed;
                    return (
                      <li key={k} className={`flex gap-3 transition-opacity ${!done && !now ? "opacity-40" : ""}`}>
                        <span className="badge h-9 w-9 text-[11px]" style={{ background: AGENT_COLOR[k] }}>{done ? <Check size={16} /> : AGENT_CODE[k]}</span>
                        <div className="min-w-0">
                          <div className="text-[15px] font-bold">{AGENTS[k].name}</div>
                          <div className="text-[13px] text-muted">{done ? t?.title : now ? <span className="typing"><span /><span /><span /></span> : AGENTS[k].role}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : plan && resp ? (
              <div className="rise">
                {phase === "plan" && <PlanHeader plan={plan} intent={resp.intent} />}
                {phase === "walk" && pos && <WalkHeader plan={plan} minute={minute} pos={pos} playing={playing} onToggle={() => setPlaying((p) => !p)} />}
                {phase === "done" && <Done plan={plan} offers={offers} reroute={reroute} budget={resp.intent.time_budget_min} onOperator={onOperator} onReset={() => reset()} />}
                <Stops plan={plan} offers={offers} cat={cat} minute={phase === "plan" ? null : minute} onPick={selectStore} />
                {phase === "plan" && (
                  <>
                    {offers.filter((o) => o.purpose === "extra").map((o) => (
                      <p key={o.id} className="mt-3 rounded-xl bg-[#fff4dc] px-3 py-2 text-[13px] text-[#6b4a12]">Also at {o.store_name}: {o.title}, <b>AED {o.price}</b>.</p>
                    ))}
                    <button className="quiet mt-5 underline underline-offset-4" onClick={() => setShowTrace((s) => !s)}>{showTrace ? "Hide how this was planned" : "How was this planned?"}</button>
                    {showTrace && (
                      <ol className="mt-4 space-y-4">
                        {resp.trace.map((t) => (
                          <li key={t.agent} className="flex gap-3 text-[13px]">
                            <span className="badge h-7 w-7 text-[10px]" style={{ background: AGENT_COLOR[t.agent] }}>{AGENT_CODE[t.agent]}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-ink">{AGENTS[t.agent].name}</div>
                              <div className="text-muted">{t.title}</div>
                              <div className="text-faint">{t.detail}</div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            ) : null}
        </div>
        {phase === "plan" && !coupon && !store && snap !== "min" && <div className="shrink-0 px-5 pb-5 pt-2"><button className="primary w-full" onClick={startWalk}>Start my route →</button></div>}
      </section>
    </div>
  );
}

/* ---------- walking graph helpers (client-side shortest path for "Show me the way") ---------- */

function nearestNode(mall: Mall, x: number, y: number) {
  let best = mall.entrance, d = Infinity;
  for (const n of mall.nodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < d) { d = dd; best = n.id; } }
  return best;
}

function walkPath(mall: Mall, a: string, b: string) {
  const adj: Record<string, [string, number][]> = {};
  for (const e of mall.graph.edges) { (adj[e.a] ??= []).push([e.b, e.m]); (adj[e.b] ??= []).push([e.a, e.m]); }
  const dist: Record<string, number> = { [a]: 0 }, prev: Record<string, string> = {}, seen = new Set<string>();
  const queue: [number, string][] = [[0, a]];
  while (queue.length) {
    queue.sort((p, q) => p[0] - q[0]);
    const [d, u] = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    if (u === b) break;
    for (const [v, w] of adj[u] ?? []) if (d + w < (dist[v] ?? Infinity)) { dist[v] = d + w; prev[v] = u; queue.push([dist[v], v]); }
  }
  const nodes = Object.fromEntries(mall.nodes.map((n) => [n.id, n]));
  const ids: string[] = [];
  for (let c: string | undefined = b; c; c = prev[c]) ids.unshift(c);
  const m = Math.round(dist[b] ?? 0);
  return { points: ids.map((id) => [nodes[id].x, nodes[id].y]), m, min: Math.max(1, Math.round(m / mall.graph.walk_m_per_min)) };
}

/* ---------- sheet content ---------- */

function StoreCard({ s, heat, way, onWay, showing, onClose }: { s: Store; heat: Record<string, number> | null; way: { m: number; min: number } | null; onWay: () => void; showing: boolean; onClose: () => void }) {
  const best = [...s.offers].sort((a, b) => b.discount_pct - a.discount_pct)[0];
  const occ = heat?.[s.id];
  const food = look(s.category).group === "Dining";
  return (
    <div className="rise">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo(s.id, s.category)} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.01em]">{s.name}</h2>
            <button className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-page" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="text-[13px] text-muted">Unit {s.unit} · {group(s.category)}</div>
          {best && <div className="mt-1 text-[13.5px]">{best.title}{best.price ? <> · <b className="text-money">AED {best.price}</b> <s className="text-faint">{best.was}</s></> : <> · <b className="text-money">−{best.discount_pct}%</b></>}</div>}
        </div>
      </div>
      <dl className="tnum mt-4 grid grid-cols-3 gap-2">
        <Fact label="Busy now" value={occ === undefined ? "…" : `${Math.round(occ * 100)}%`} alert={(occ ?? 0) > 0.85} />
        <Fact label={food ? "Queue" : "Walk"} value={food ? (occ === undefined ? "…" : queueMin(occ) ? `${queueMin(occ)} min` : "none") : way ? `${way.min} min` : "…"} />
        <Fact label="From you" value={way ? `${way.m} m` : "…"} />
      </dl>
      <button className="primary mt-4 w-full gap-2" onClick={onWay} disabled={!way}><MapPin size={17} />{showing ? "Showing the way" : "Show me the way"}</button>
    </div>
  );
}

function Fact({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-[#ece7de] bg-white px-3 py-2">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className={`text-[16px] font-bold ${alert ? "text-alert" : ""}`}>{value}</dd>
    </div>
  );
}

function PlanHeader({ plan, intent }: { plan: Plan; intent: Intent }) {
  const budget = intent.time_budget_min;
  const dwell = (p: string[]) => plan.stops.filter((s) => p.includes(s.purpose)).reduce((a, s) => a + s.dwell, 0);
  const walk = plan.total_min - plan.stops.reduce((a, s) => a + s.dwell, 0);
  const parts: [string, number, string][] = [["walk", walk, "#9aa3b2"], ["shop", dwell(["shop", "upsell"]), "#0f9d8f"], ["play", dwell(["play"]), "#f2b84b"], ["lunch", dwell(["meal"]), "#e9835f"], ["spare", budget - plan.total_min, "#e6e1d7"]];
  const chips = [
    `${budget >= 60 && budget % 60 === 0 ? `${budget / 60} hours` : `${budget} min`}`,
    ...(intent.kids ? [`${intent.kids} kid${intent.kids > 1 ? "s" : ""}`] : []),
    ...intent.shopping.map((s) => s.label + (s.max_price_aed ? ` ≤ AED ${s.max_price_aed}` : "")),
    ...(intent.meal !== "none" ? [intent.meal[0].toUpperCase() + intent.meal.slice(1)] : []),
  ];
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="tnum font-display text-[24px] font-extrabold tracking-[-0.015em]">Back by {hhmm(plan.end_minute)}</h2>
        <span className="tnum text-[13px] text-muted">{plan.total_min} of {budget} min · {plan.walk_m} m</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="pill">{c}</span>)}</div>
      <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {parts.filter(([, v]) => v > 0).map(([k, v, c]) => <i key={k} style={{ flex: v, background: c }} />)}
      </div>
      <p className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
        {parts.filter(([, v]) => v > 0).map(([k, v, c]) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{v} {k}</span>)}
      </p>
    </>
  );
}

function Stops({ plan, offers, cat, minute, onPick }: { plan: Plan; offers: OfferCard[]; cat: (id: string) => string; minute: number | null; onPick: (id: string) => void }) {
  return (
    <ol className="mt-3">
      {plan.stops.map((s, i) => {
        const o = offers.find((x) => x.id === s.offer_id);
        const done = minute !== null && minute >= s.depart;
        const here = minute !== null && minute >= s.arrive && minute < s.depart;
        return (
          <li key={s.store_id + i}>
            <button className={`grid w-full grid-cols-[24px_42px_1fr_auto] items-center gap-x-2.5 rounded-xl py-2 text-left transition-opacity hover:bg-page ${done ? "opacity-40" : ""}`} onClick={() => onPick(s.store_id)}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white ${here ? "bg-ink ring-4 ring-accent-soft" : "bg-accent"}`}>{done ? <Check size={13} /> : i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(s.store_id, cat(s.store_id))} alt="" className="h-[42px] w-[42px] rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 truncate text-[14.5px] font-bold">{s.name}
                  {s.purpose === "upsell" && <span className="rounded-md bg-[#e8f6ec] px-1.5 py-px text-[10px] font-bold text-[#23864a]">On your way</span>}</span>
                <span className="tnum block truncate text-[12px] text-muted">{hhmm(s.arrive)} · {PURPOSE[s.purpose]}{o ? ` · ${o.title}` : ""}{s.replaces ? ` · instead of ${s.replaces}` : ""}</span>
              </span>
              <span className="tnum text-right">
                {o && (o.price ? <><b className="block text-[13.5px]">AED {o.price}</b>{o.was ? <s className="text-[11px] text-faint">{o.was}</s> : null}</> : <b className="text-[13.5px] text-money">−{o.discount_pct}%</b>)}
              </span>
            </button>
          </li>
        );
      })}
      <li className="grid grid-cols-[24px_42px_1fr_auto] gap-x-2.5 py-2 text-[12.5px] text-muted">
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
    sub = to ? `to ${to.name} · ${Math.max(1, Math.round(plan.legs[pos.leg].arrive - minute))} min` : "back to the main entrance";
  } else if (pos.stop !== null) {
    const s = plan.stops[pos.stop];
    head = `At ${s.name}`;
    sub = `until ${hhmm(s.depart)}`;
  } else { head = "Leaving the entrance"; sub = "follow the teal line"; }
  return (
    <div className="flex items-center gap-3 rounded-[22px] bg-ink px-4 py-3.5 text-white shadow-[0_10px_24px_rgba(16,35,58,.3)]" role="status">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#f0c46a] text-ink">{pos.stop !== null ? <Check size={20} /> : <ArrowUp size={20} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3"><span className="truncate font-display text-[19px] font-extrabold leading-tight">{head}</span><span className="tnum text-[12px] opacity-70">{clock}</span></div>
        <div className="truncate text-[13px] opacity-80">{sub}</div>
      </div>
    </div>
  );
}

function WalkHeader({ plan, minute, pos, playing, onToggle }: { plan: Plan; minute: number; pos: ReturnType<typeof positionAt>; playing: boolean; onToggle: () => void }) {
  const done = plan.stops.filter((s) => minute >= s.depart).length;
  const pct = Math.min(100, ((minute - plan.start_minute) / (plan.end_minute - plan.start_minute)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="tnum font-display text-[22px] font-extrabold tracking-[-0.015em]">Back by {hhmm(plan.end_minute)}</h2>
        <button className="rounded-full border border-[#e2ddd3] px-3.5 py-1.5 text-[13px] font-semibold" onClick={onToggle}>{playing ? "Pause" : "Resume"}</button>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#ece7de]"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
      <p className="tnum mt-1.5 text-[12.5px] text-muted">{done} of {plan.stops.length} stops done{pos.stop !== null ? " · you are at a stop" : ""}</p>
    </div>
  );
}

function Reroute({ c, onAccept }: { c: Coupon; onAccept: () => void }) {
  const over = c.old_total_min - c.budget_min;
  const max = Math.max(c.old_total_min, c.new_total_min, c.budget_min);
  return (
    <div className="rise">
      <p className="flex items-center gap-2 text-[13px] font-bold text-alert"><span className="h-2 w-2 rounded-full bg-alert shadow-[0_0_0_4px_rgba(229,72,77,.2)]" />{c.replaces} is {c.planned_occupancy}% full, {c.planned_wait} min wait</p>
      <h2 className="mt-2 font-display text-[24px] font-extrabold leading-tight tracking-[-0.015em]">Lunch moved next door</h2>
      <p className="mt-1 text-[14px] text-muted">{c.store_name}, unit {c.unit} · {c.metres} m away · {c.new_occupancy}% full{c.new_wait ? `, ${c.new_wait} min wait` : ", no wait"}</p>
      <div className="relative mt-4 grid grid-cols-[1fr_auto] gap-x-3 rounded-2xl bg-gradient-to-br from-[#fff4dc] to-[#fbe6bb] px-4 py-3.5 before:absolute before:-left-2 before:top-1/2 before:h-4 before:w-4 before:-translate-y-1/2 before:rounded-full before:bg-[#fbfaf7] after:absolute after:-right-2 after:top-1/2 after:h-4 after:w-4 after:-translate-y-1/2 after:rounded-full after:bg-[#fbfaf7]">
        <div>
          <div className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] text-[#8a5a12]">{c.discount_pct}% off lunch</div>
          <div className="mt-1 text-[13px] font-semibold text-[#5d4313]">{c.title}</div>
        </div>
        <div className="self-center border-l-2 border-dashed border-[#8a5a12]/35 pl-3 text-center">
          <b className="block font-mono text-[15px] tracking-[0.06em] text-ink">{c.code}</b>
          <span className="tnum text-[11px] text-[#8a6a35]">until {c.expires}</span>
        </div>
      </div>
      <div className="tnum mt-4 space-y-2.5">
        <Bar label="If you wait" value={c.old_total_min} max={max} budget={c.budget_min} color="#f2a19c" strong="text-alert" />
        <Bar label="New route" value={c.new_total_min} max={max} budget={c.budget_min} color="#0f9d8f" strong="text-ink" />
        <p className="text-[12px] text-muted">The black line is your {c.budget_min} min. {over > 0 ? `Waiting puts you ${over} min over.` : "Both fit, the new route is quicker."}</p>
      </div>
      <button className="primary mt-5 w-full" onClick={onAccept}>Accept and claim {c.discount_pct}% off</button>
    </div>
  );
}

function Bar({ label, value, max, budget, color, strong }: { label: string; value: number; max: number; budget: number; color: string; strong: string }) {
  return (
    <div className="grid grid-cols-[76px_1fr_58px] items-center gap-2 text-[12.5px] text-muted">
      <span>{label}</span>
      <span className="relative h-3 rounded-full bg-[#efebe3]">
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${(value / max) * 100}%`, background: color }} />
        <span className="absolute -inset-y-1.5 w-0.5 bg-ink" style={{ left: `${(budget / max) * 100}%` }} />
      </span>
      <b className={`text-right text-[13.5px] ${strong}`}>{value} min</b>
    </div>
  );
}

function Done({ plan, offers, reroute, budget, onOperator, onReset }: { plan: Plan; offers: OfferCard[]; reroute: Coupon | null; budget: number; onOperator: () => void; onReset: () => void }) {
  const used = offers.filter((o) => o.purpose !== "extra");
  const saved = used.reduce((a, o) => a + (o.was ? o.was - o.price : Math.round((o.discount_pct / 100) * 180)), 0);
  const rows: [string, string][] = [
    ...(reroute ? [[`Queue avoided at ${reroute.replaces}`, `${reroute.planned_wait} min`] as [string, string]] : []),
    ["Time used", `${plan.total_min} of ${budget} min`],
    ["Walked", `${plan.walk_m} m`],
    ["Offers used", `${used.length}`],
  ];
  return (
    <div className="mb-2">
      <h2 className="font-display text-[24px] font-extrabold tracking-[-0.015em]">Visit complete</h2>
      <div className="relative mt-3 rounded-2xl bg-[#fff4dc] p-4">
        {plan.total_min <= budget && <span className="absolute -top-3 right-3 grid h-14 w-14 rotate-[-12deg] place-items-center rounded-full border-[2.5px] border-accent bg-white text-center font-display text-[10px] font-extrabold leading-tight text-accent">ON<br />TIME</span>}
        <div className="text-[12.5px] text-muted">You saved</div>
        <div className="tnum font-display text-[36px] font-extrabold leading-none tracking-[-0.03em]">AED {saved}</div>
        {reroute && <div className="mt-1 text-[12.5px] text-muted">including {reroute.discount_pct}% off lunch at {reroute.store_name}</div>}
        <dl className="tnum mt-3">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-t-[1.5px] border-dashed border-[#10233a]/15 py-2 text-[14px]"><dt className="text-muted">{k}</dt><dd className="font-bold">{v}</dd></div>)}
        </dl>
      </div>
      <button className="primary mt-4 w-full" onClick={onOperator}>Open the operator view</button>
      <button className="quiet mt-3 w-full underline underline-offset-4" onClick={onReset}>Start a new visit</button>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
