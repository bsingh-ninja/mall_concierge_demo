"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Moon, Pause, Play, RotateCcw, Sun } from "lucide-react";
import Operator from "@/components/Operator";
import Shopper, { AGENT_CODE, AGENT_COLOR, type Command, type Phase, type ShopperState } from "@/components/Shopper";
import { AGENTS, AGENT_STYLE, agentOf, api, hhmm, type AgentEvent, type AgentKey, type Mall } from "@/lib/api";

const CHAPTERS = ["Ask", "Agents plan", "Walk", "Lunch rush", "Mall's view"];
const ORDER: AgentKey[] = ["intent", "crowd", "offers", "upsell", "route"];
const SAMPLE = "I have 2 hours, kids with me, want sneakers under 400 and lunch.";
const stepOf = (p: Phase, rerouted: boolean) => (p === "welcome" ? 0 : p === "planning" || p === "plan" ? 1 : p === "walk" ? (rerouted ? 3 : 2) : 3);
type Theme = "day" | "dusk";
const EMPTY: ShopperState = { phase: "welcome", rerouted: false, canSurge: false, couponOpen: false, busy: false, request: "", resp: null, plan: null, offers: [], coupon: null, revealed: 0 };

/** What the presenter's Next button does in each state of the story. */
function nextAction(mode: "shopper" | "operator", s: ShopperState) {
  if (mode === "operator") return { label: "Back to the shopper", kind: "shopper" as const };
  if (s.busy || s.phase === "planning") return { label: "Agents are working…", kind: "wait" as const };
  if (s.phase === "welcome") return { label: "Send the shopper's request", kind: "plan" as const };
  if (s.phase === "plan") return { label: "Start the walk", kind: "start" as const };
  if (s.couponOpen) return { label: "Accept the reroute", kind: "accept" as const };
  if (s.phase === "walk" && s.canSurge) return { label: "Trigger the lunch rush", kind: "surge" as const };
  return { label: "See the mall's view", kind: "operator" as const };
}
// Autoplay pauses (ms) before each step; it stops at the reroute so the presenter can explain it.
const AUTO_DELAY: Record<string, number> = { plan: 1800, start: 5000, surge: 9000, operator: 4000 };

export default function Home() {
  const [mall, setMall] = useState<Mall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"shopper" | "operator">("shopper");
  const [session, setSession] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [shopper, setShopper] = useState<ShopperState>(EMPTY);
  const [surgeSignal, setSurgeSignal] = useState(0);
  const [command, setCommand] = useState<Command | null>(null);
  const [theme, setTheme] = useState<Theme>("day");
  const [auto, setAuto] = useState(false);
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);

  useEffect(() => {
    api.mall().then(setMall).catch(() => setError("api"));
    fetch("/lan").then((r) => r.json()).then(async ({ url }) => {
      if (url) setQr({ url, svg: await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#10233a", light: "#0000" } }) });
    }).catch(() => null);
    setTheme(document.documentElement.dataset.theme === "dusk" ? "dusk" : "day");
  }, []);

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t);
    if (t === "dusk") document.documentElement.dataset.theme = "dusk"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("mc-theme", t); } catch { /* storage unavailable */ }
  }, []);

  const step = mode === "operator" ? 4 : stepOf(shopper.phase, shopper.rerouted);
  const action = nextAction(mode, shopper);
  const send = useCallback((kind: Command["kind"]) => setCommand((c) => ({ kind, n: (c?.n ?? 0) + 1 })), []);

  const next = useCallback(() => {
    switch (action.kind) {
      case "plan": case "start": case "accept": send(action.kind); break;
      case "surge": setSurgeSignal((n) => n + 1); break;
      case "operator": setMode("operator"); break;
      case "shopper": setMode("shopper"); break;
    }
  }, [action.kind, send]);
  const reset = useCallback(() => { setMode("shopper"); setAuto(false); send("reset"); }, [send]);

  // Autoplay: runs the story hands-free and stops at the reroute (and after opening the operator view).
  useEffect(() => {
    if (!auto) return;
    if (action.kind === "accept" || action.kind === "shopper") { setAuto(false); return; }
    const d = AUTO_DELAY[action.kind];
    if (!d) return;
    const t = setTimeout(next, d);
    return () => clearTimeout(t);
  }, [auto, action.kind, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "o") setMode((m) => (m === "shopper" ? "operator" : "shopper"));
      else if (k === "s" && shopper.canSurge) setSurgeSignal((n) => n + 1);
      else if (k === "t") applyTheme(theme === "day" ? "dusk" : "day");
      else if (k === "r") reset();
      else if (k === "a") setAuto((a) => !a);
      else if (k === "f") { if (document.fullscreenElement) document.exitFullscreen().catch(() => null); else document.documentElement.requestFullscreen().catch(() => null); }
      else if (k === " " || k === "arrowright") { if (tag === "BUTTON" && k === " ") return; e.preventDefault(); next(); }
      else if (k === "arrowleft" && mode === "operator") setMode("shopper");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shopper.canSurge, theme, applyTheme, reset, next, mode]);

  const onEvents = useCallback((e: AgentEvent[]) => setEvents((prev) => [...prev, ...e].slice(-60)), []);
  const onSession = useCallback((sid: string | null) => { setSession(sid); if (!sid) setEvents([]); }, []);
  const onPhase = useCallback((s: ShopperState) => setShopper(s), []);
  const toOperator = useCallback(() => setMode("operator"), []);

  if (error) return <ApiDown />;
  if (!mall) return <main className="stage-bg grid h-dvh place-items-center text-smuted">Loading the mall…</main>;

  return (
    <main className={`stage-bg flex h-dvh flex-col ${step === 3 && mode === "shopper" ? "surge-wash" : ""}`}>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-4 pt-[env(safe-area-inset-top)] lg:h-16 lg:gap-6 lg:px-8">
        <span className="flex min-w-0 items-center gap-2.5 font-display text-[17px] font-extrabold tracking-[-0.01em] lg:text-[18px]">
          <Star /><span className="hidden truncate min-[420px]:inline">{mall.name}</span><span className="hidden font-sans text-[13px] font-medium text-smuted sm:inline">{mode === "operator" ? "Operations" : "Concierge"}</span>
        </span>
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Demo chapters">
          {CHAPTERS.map((c, i) => (
            <span key={c} className={`chap ${i < step ? "done" : ""} ${i === step ? "on" : ""} ${i === 3 ? "alert" : ""}`} aria-current={i === step ? "step" : undefined}>
              <b>{i + 1}</b>{c}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <div className="seg" role="tablist" aria-label="View">
            {(["shopper", "operator"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{m === "shopper" ? "Shopper" : "Operator"}</button>
            ))}
          </div>
          <button className="sbtn surge hidden lg:inline-flex" disabled={!shopper.canSurge} onClick={() => setSurgeSignal((n) => n + 1)}
            title="The lunch crowd arrives at the planned restaurant now">
            {shopper.canSurge ? <><i />Trigger lunch rush <kbd>S</kbd></> : step >= 3 ? "Lunch rush done" : "Lunch rush: plan first"}
          </button>
          <button className="sbtn !px-2.5" onClick={() => applyTheme(theme === "day" ? "dusk" : "day")} aria-label={theme === "day" ? "Switch to the dark theme" : "Switch to the light theme"} title="Theme (T)">
            {theme === "day" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="sbtn hidden !px-2.5 lg:inline-flex" onClick={reset} aria-label="Reset the demo" title="Reset (R)"><RotateCcw size={16} /></button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Shopper stays mounted so the walk keeps running while the operator view is open. */}
        <div className={mode === "shopper" ? "h-full" : "hidden"}>
          <div className="grid h-full lg:grid-cols-[minmax(260px,1fr)_auto_minmax(300px,1fr)] lg:gap-10 lg:px-10 lg:py-6 xl:gap-14">
            <aside className="hidden min-h-0 flex-col overflow-y-auto pr-1 lg:flex">
              <ChapterPanel step={step} s={shopper} mall={mall} events={events} />
              {qr && step === 0 && (
                <div className="card mt-auto flex items-center gap-5 p-4">
                  <div className="h-[72px] w-[72px] shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                  <p className="text-[13px] text-smuted">Try it on your phone (same Wi-Fi).<br /><span className="tnum font-mono text-[12px] text-sand">{qr.url}</span></p>
                </div>
              )}
            </aside>

            <div className="h-full lg:grid lg:place-items-center">
              <div className="device-frame">
                <Shopper mall={mall} surgeSignal={surgeSignal} command={command} onEvents={onEvents} onSession={onSession} onPhase={onPhase} onOperator={toOperator} />
              </div>
            </div>

            <aside className="hidden min-h-0 flex-col lg:flex">
              <SidePanel step={step} s={shopper} mall={mall} events={events} />
            </aside>
          </div>
        </div>

        <div className={mode === "operator" ? "h-full" : "hidden"}>
          <Operator mall={mall} session={session} active={mode === "operator"} />
        </div>
      </div>

      {/* Presenter bar (desktop): one big Next, Back, autoplay and the keys. */}
      <footer className="hidden h-16 shrink-0 items-center gap-3 border-t border-line bg-panel/80 px-8 backdrop-blur lg:flex">
        <button className="sbtn" onClick={() => setMode("shopper")} disabled={mode === "shopper"}>← Back</button>
        <button className="next-btn" onClick={next} disabled={action.kind === "wait"}>Next: {action.label} →</button>
        <button className={`sbtn ${auto ? "!border-teal !text-teal" : ""}`} onClick={() => setAuto((a) => !a)} aria-pressed={auto} title="Autoplay (A): runs the story and pauses at the reroute">
          {auto ? <Pause size={15} /> : <Play size={15} />}{auto ? "Autoplay on" : "Autoplay"}
        </button>
        <div className="ml-2 h-1 w-36 overflow-hidden rounded-full bg-panel-2" aria-hidden>
          <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${((step + 1) / 5) * 100}%` }} />
        </div>
        <div className="ml-auto hidden items-center gap-4 text-[12.5px] text-smuted xl:flex">
          <span><kbd>Space</kbd> next</span><span><kbd>S</kbd> lunch rush</span><span><kbd>O</kbd> operator</span>
          <span><kbd>A</kbd> autoplay</span><span><kbd>T</kbd> theme</span><span><kbd>R</kbd> reset</span><span><kbd>F</kbd> fullscreen</span>
        </div>
      </footer>
    </main>
  );
}

/* ---------- left column: one headline per chapter ---------- */

function ChapterPanel({ step, s, mall, events }: { step: number; s: ShopperState; mall: Mall; events: AgentEvent[] }) {
  const offersCount = mall.stores.reduce((a, st) => a + st.offers.length, 0);
  const used = s.offers.filter((o) => o.purpose !== "extra");
  const saved = used.reduce((a, o) => a + (o.was ? o.was - o.price : 0), 0);
  const C = [
    { eyebrow: "Ask", title: "Say what you need. Get a plan.", lede: "A shopper scans the QR code at the entrance and types one sentence. The concierge understands it and hands it to five agents." },
    { eyebrow: "The agents plan", title: "One sentence in. A timed route out.", lede: "Five agents read the request, check live crowds, match today's offers and draw the shortest walk." },
    { eyebrow: "Walk it", title: "The route plays out, minute by minute.", lede: "Every two mall-minutes the agents re-check crowds and queues along the route. Offers count as redeemed when the shopper arrives." },
    { eyebrow: "Lunch rush", title: "The lunch spot filled up. The route fixed itself.", lede: "" },
  ][Math.min(step, 3)];
  const alert = step === 3;
  return (
    <div key={step} className="rise">
      <div className={`font-mono text-[12px] font-semibold uppercase tracking-[0.14em] ${alert ? "text-coral" : "text-teal"}`}>Chapter {step + 1} of 5 · {C.eyebrow}</div>
      <h1 className="mt-3 text-balance font-display text-[40px] font-extrabold leading-[1.03] tracking-[-0.03em] xl:text-[48px]">{C.title}</h1>
      {C.lede && <p className="mt-4 max-w-[420px] text-[16px] leading-relaxed text-smuted">{C.lede}</p>}

      {step <= 1 && (
        <figure className="card mt-7 p-5">
          <figcaption className="flex items-center gap-2.5 text-[13px] text-smuted"><i className="h-7 w-7 rounded-full bg-gradient-to-br from-brass to-[#b0743a]" />{step === 0 ? "Try this request" : "Shopper at the Main Entrance, 11:40"}</figcaption>
          <blockquote className="mt-3 font-display text-[21px] font-semibold leading-snug tracking-[-0.01em]">“{highlight(s.request || SAMPLE)}”</blockquote>
        </figure>
      )}
      {step === 0 && <Facts items={[[`${mall.stores.length}`, "stores mapped"], [`${offersCount}`, "live offers today"], ["5", "agents on every request"]]} />}
      {step === 1 && s.plan && s.resp && <Facts items={[[`${offersCount}`, "offers checked"], [`${s.plan.walk_m} m`, `shortest walk, ${s.plan.stops.length} stops`], [`AED ${saved}`, "saved with offers", true]]} />}
      {step === 2 && s.plan && <Facts items={[[hhmm(s.plan.end_minute), "back at the entrance"], [`${s.plan.stops.length}`, "stops on the route"], [`AED ${saved}`, "in offers on the way", true]]} />}
      {step === 3 && s.coupon && (
        <>
          <div className="mt-6 rounded-[20px] border border-coral/30 bg-coral/10 p-5">
            <div className="flex items-center gap-2.5 text-[13px] font-semibold text-a-crowd"><i className="h-2.5 w-2.5 rounded-full bg-coral shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-coral)_25%,transparent)]" />Live-Crowd Agent · watching {s.coupon.replaces} ({s.coupon.replaces_unit})</div>
            <div className="tnum mt-3 flex items-end gap-7">
              <div><div className="font-display text-[60px] font-extrabold leading-[0.9] tracking-[-0.04em] text-coral">{s.coupon.planned_occupancy}%</div><div className="mt-1.5 text-[13px] text-smuted">capacity</div></div>
              <div><div className="whitespace-nowrap font-display text-[42px] font-extrabold leading-[0.9] tracking-[-0.03em] text-coral">{s.coupon.planned_wait} min</div><div className="mt-1.5 text-[13px] text-smuted">queue at the door</div></div>
            </div>
          </div>
          <ol className="mt-5 space-y-2.5">
            {events.slice(Math.max(0, events.findLastIndex((e) => e.alert))).filter((e) => ["crowd", "route", "upsell", "claim"].includes(e.kind)).slice(0, 4).map((e, i) => <FeedRow key={i} e={e} />)}
          </ol>
        </>
      )}
    </div>
  );
}

function Facts({ items }: { items: [string, string, boolean?][] }) {
  return (
    <dl className="tnum mt-7 grid grid-cols-3 gap-4">
      {items.map(([v, l, money]) => (
        <div key={l} className="min-w-0"><dd className={`whitespace-nowrap font-display text-[24px] font-extrabold leading-none tracking-[-0.02em] xl:text-[30px] 2xl:text-[34px] ${money ? "text-brass" : ""}`}>{v}</dd><dt className="mt-2 text-[13px] text-smuted">{l}</dt></div>
      ))}
    </dl>
  );
}

const highlight = (t: string) => t.split(/(\d+\s*(?:hours?|hrs?|minutes?|mins?)|kids?(?: with me)?|children|(?:sneakers|shoes|toys|a gift)(?: under \d+)?|lunch|dinner)/i)
  .map((part, i) => (i % 2 ? <mark key={i} className="bg-transparent text-brass">{part}</mark> : part));

/* ---------- right column: agent relay, winners, live feed ---------- */

function SidePanel({ step, s, mall, events }: { step: number; s: ShopperState; mall: Mall; events: AgentEvent[] }) {
  if (step === 1 && s.resp) {
    const total = s.resp.trace.reduce((a, t) => a + (t.ms ?? 0), 0);
    return (
      <div className="rise flex min-h-0 flex-col">
        <h2 className="flex items-baseline justify-between font-display text-[24px] font-extrabold tracking-[-0.015em]">Agent relay {total > 0 && <span className="tnum font-sans text-[13px] font-medium text-smuted">{(total / 1000).toFixed(1)} s</span>}</h2>
        <ol className="relative mt-4 space-y-1">
          <span className="absolute bottom-8 left-[21px] top-8 w-0.5 opacity-50" style={{ background: "linear-gradient(var(--color-a-intent), var(--color-a-crowd), var(--color-a-offers), var(--color-a-upsell), var(--color-a-route))" }} aria-hidden />
          {ORDER.map((k, i) => {
            const t = s.resp!.trace.find((x) => x.agent === k);
            const done = i < s.revealed || s.phase === "plan", live = done && (i === s.revealed - 1 || (s.phase === "plan" && i === 4));
            return (
              <li key={k} className={`relative grid grid-cols-[44px_1fr] gap-3.5 rounded-2xl py-2.5 pr-3 transition-opacity ${done ? "" : "opacity-35"}`}
                style={live ? { background: "linear-gradient(90deg, color-mix(in srgb, var(--color-teal) 13%, transparent), transparent 85%)" } : undefined}>
                <span className="badge h-11 w-11 text-[12px]" style={{ background: AGENT_COLOR[k], boxShadow: live ? `0 0 0 6px color-mix(in srgb, ${AGENT_COLOR[k]} 22%, transparent)` : undefined }}>{AGENT_CODE[k]}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-[15px] font-bold">{AGENTS[k].name}
                    {t?.source && <span className="shrink-0 font-mono text-[11px] font-normal text-sfaint">{t.source === "gemini" ? "Gemini" : t.source === "rules" ? "rules mode" : t.source}{t.ms ? ` · ${(t.ms / 1000).toFixed(1)} s` : ""}</span>}</div>
                  <div className="mt-0.5 text-[14px] leading-snug text-smuted">{done ? <span className="text-sand">{t?.title}</span> : AGENTS[k].role}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 rounded-2xl border border-dashed border-brass/45 px-4 py-3 text-[13px] text-smuted"><b className="text-brass">✦</b> Gemini only reads the words. Every price, minute and metre comes from code.</p>
      </div>
    );
  }
  if (step === 3 && s.coupon && s.plan) {
    const c = s.coupon, st = mall.stores.find((x) => x.id === c.store_id);
    const funded = st?.offers.find((o) => o.id === c.offer_id)?.funded_by;
    return (
      <div className="rise flex min-h-0 flex-col">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.015em]">One reroute, three winners</h2>
        <div className="mt-4 space-y-3">
          <Win who="Shopper" color="var(--color-teal)" num={`−${c.old_total_min - c.new_total_min} min`} text={<>Back <b className="text-sand">on time</b> instead of {Math.max(0, c.old_total_min - c.budget_min)} min over, with <b className="text-sand">{c.discount_pct}% off</b> lunch.</>} />
          <Win who="Tenant" color="var(--color-a-upsell)" num="+1 table" text={<><b className="text-sand">{c.store_name}</b> is at {st?.kpi.sales_vs_target ?? "?"}% of its sales target. It just gained this party.</>} />
          <Win who="Mall" color="var(--color-brass)" num="0 lost" text={<>The party stays in the mall. The voucher is {funded === "mall" ? <b className="text-sand">mall-funded</b> : "tenant-funded"} and tracked to redemption.</>} />
        </div>
        <Feed events={events} title="Live from the agents" className="mt-6" />
      </div>
    );
  }
  return <Feed events={events} title="What the agents are doing" />;
}

function Win({ who, color, num, text }: { who: string; color: string; num: string; text: React.ReactNode }) {
  return (
    <div className="card grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 px-5 py-4">
      <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>{who}</span>
      <span className="tnum row-span-2 text-right font-display text-[32px] font-extrabold leading-none tracking-[-0.03em]" style={{ color }}>{num}</span>
      <p className="text-[14px] leading-snug text-smuted">{text}</p>
    </div>
  );
}

function Feed({ events, title, className = "" }: { events: AgentEvent[]; title: string; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <h2 className="font-display text-[22px] font-extrabold tracking-[-0.015em]">{title}</h2>
      <ol className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-2">
        {events.length === 0 && <li className="text-[15px] text-sfaint">Waiting for the shopper&apos;s request.</li>}
        {[...events].reverse().map((e, i) => <FeedRow key={events.length - i} e={e} fresh={i === 0} />)}
      </ol>
    </div>
  );
}

function FeedRow({ e, fresh }: { e: AgentEvent; fresh?: boolean }) {
  const a = agentOf(e.kind);
  const color = a === "concierge" ? "var(--color-sand)" : AGENT_COLOR[a];
  const code = a === "concierge" ? "CON" : AGENT_CODE[a];
  return (
    <li className={`grid grid-cols-[2.8rem_2.6rem_1fr] items-baseline gap-2 text-[13.5px] leading-snug ${fresh ? "rise" : ""}`}>
      <span className="tnum font-mono text-[11.5px] text-sfaint">{e.time}</span>
      <span className="badge h-5 rounded-md text-[10px]" style={{ background: color, color: a === "concierge" ? "var(--color-stage)" : undefined }}>{code}</span>
      <span className={e.alert ? "font-semibold text-coral" : "text-smuted"}><span className={e.alert ? "" : "font-semibold text-sand"}>{AGENT_STYLE[a].name}.</span> {e.text}</span>
    </li>
  );
}

function Star() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M12 1.5l3 6.2 6.9 1-5 4.8 1.2 6.9L12 17.2l-6.1 3.2 1.2-6.9-5-4.8 6.9-1z" fill="none" stroke="var(--color-brass)" strokeWidth="1.6" />
      <circle cx="12" cy="11.5" r="2.2" fill="var(--color-teal)" />
    </svg>
  );
}

function ApiDown() {
  return (
    <main className="stage-bg grid h-dvh place-items-center p-6">
      <div className="card max-w-[520px] p-8">
        <div className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-coral">Can&apos;t reach the concierge API</div>
        <h1 className="mt-3 font-display text-[30px] font-extrabold leading-tight tracking-[-0.02em]">Start the backend on port 8004</h1>
        <p className="mt-3 text-[15px] text-smuted">In a terminal, from the project folder:</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-panel-2 p-4 font-mono text-[13px] text-sand">{`cd backend
.venv\\Scripts\\python -m uvicorn app.main:app --port 8004 --reload`}</pre>
        <button className="next-btn mt-6" onClick={() => location.reload()}>Try again</button>
      </div>
    </main>
  );
}
