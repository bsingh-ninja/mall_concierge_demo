"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import Operator from "@/components/Operator";
import Shopper, { type Phase } from "@/components/Shopper";
import { AGENT_STYLE, agentOf, api, type AgentEvent, type Mall } from "@/lib/api";

const STEPS = ["Ask the concierge", "Agents plan the route", "Walk it", "Lunch gets busy, reroute", "See the mall's side"];
const stepOf = (p: Phase, rerouted: boolean) => (p === "welcome" ? 0 : p === "planning" || p === "plan" ? 1 : p === "walk" ? (rerouted ? 3 : 2) : 4);

export default function Home() {
  const [mall, setMall] = useState<Mall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"shopper" | "operator">("shopper");
  const [session, setSession] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [step, setStep] = useState(0);
  const [canSurge, setCanSurge] = useState(false);
  const [surgeSignal, setSurgeSignal] = useState(0);
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);

  useEffect(() => {
    api.mall().then(setMall).catch(() => setError("The concierge API on port 8004 isn't answering. Start the demo with ./start.sh."));
    fetch("/lan").then((r) => r.json()).then(async ({ url }) => {
      if (url) setQr({ url, svg: await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1f1f1f", light: "#0000" } }) });
    }).catch(() => null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "o" || e.key === "O") setMode((m) => (m === "shopper" ? "operator" : "shopper"));
      if ((e.key === "s" || e.key === "S") && canSurge) setSurgeSignal((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSurge]);

  const onEvents = useCallback((e: AgentEvent[]) => setEvents((prev) => [...prev, ...e].slice(-60)), []);
  const onSession = useCallback((sid: string | null) => { setSession(sid); if (!sid) setEvents([]); }, []);
  const onPhase = useCallback((p: Phase, rerouted: boolean, surgeable: boolean) => { setStep(stepOf(p, rerouted)); setCanSurge(surgeable); }, []);
  const toOperator = useCallback(() => setMode("operator"), []);

  if (error) return <main className="grid h-dvh place-items-center p-6 text-center text-muted">{error}</main>;
  if (!mall) return <main className="grid h-dvh place-items-center text-muted">Loading the map…</main>;

  return (
    <main className="flex h-dvh flex-col">
      <nav className="flex h-14 shrink-0 items-center gap-6 bg-white px-5 lg:px-8">
        <span className="hidden text-[15px] font-semibold md:block">{mall.name} Concierge</span>
        <div className="flex gap-5 text-[15px] md:ml-auto" role="tablist" aria-label="View">
          {(["shopper", "operator"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className={mode === m ? "font-semibold text-ink" : "text-muted hover:text-ink"}>
              {m === "shopper" ? "Shopper" : "Operator"}
            </button>
          ))}
        </div>
        <button className="ml-auto flex items-center gap-2 text-[13px] text-muted hover:text-ink disabled:cursor-default disabled:hover:text-muted md:ml-6" disabled={!canSurge}
          onClick={() => setSurgeSignal((n) => n + 1)} title="The lunch crowd arrives at the planned restaurant now">
          {canSurge ? <><span className="h-2 w-2 rounded-full bg-alert" />Simulate lunch surge</> : step >= 3 ? "Surge simulated" : "Surge: plan a visit first"}
        </button>
      </nav>

      <div className="relative min-h-0 flex-1">
        {/* Shopper stays mounted so the walk keeps running while the operator view is open. */}
        <div className={mode === "shopper" ? "h-full" : "hidden"}>
          <div className="grid h-full lg:grid-cols-[minmax(240px,1fr)_auto_minmax(300px,1fr)] lg:gap-16 lg:px-12 lg:py-8">
            <aside className="hidden min-h-0 flex-col lg:flex">
              <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">Mall offers and navigation</h1>
              <p className="mt-4 max-w-[340px] text-[15px] leading-relaxed text-muted">
                A shopper scans the code at the entrance and says what they need. Five agents plan the route with live offers and replan it when the crowd moves.
              </p>
              <ol className="mt-10 space-y-3 text-[15px]">
                {STEPS.map((s, i) => (
                  <li key={s} className={`flex gap-4 ${i === step ? "font-semibold text-ink" : i < step ? "text-ink" : "text-faint"}`}>
                    <span className="tnum w-4">{i + 1}</span>{s}
                  </li>
                ))}
              </ol>
              <p className="mt-10 text-[13px] text-faint">Press O to switch view, S to simulate the surge. All stores and figures are synthetic demo data.</p>
              {qr && (
                <div className="mt-auto flex items-center gap-5">
                  <div className="h-[72px] w-[72px] shrink-0" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                  <p className="text-[13px] text-muted">Open it on a phone on the same Wi-Fi.<br /><span className="tnum">{qr.url}</span></p>
                </div>
              )}
            </aside>

            <div className="h-full lg:grid lg:place-items-center">
              <Shopper mall={mall} surgeSignal={surgeSignal} onEvents={onEvents} onSession={onSession} onPhase={onPhase} onOperator={toOperator} />
            </div>

            <aside className="hidden min-h-0 flex-col lg:flex">
              <h2 className="text-[20px] font-semibold">What the agents are doing</h2>
              <ol className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                {events.length === 0 && <li className="text-[15px] text-faint">Waiting for the shopper&apos;s request.</li>}
                {[...events].reverse().map((e, i) => (
                  <li key={events.length - i} className={`grid grid-cols-[3rem_1fr] gap-3 text-[13px] ${i === 0 ? "rise" : ""}`}>
                    <span className="tnum text-faint">{e.time}</span>
                    <span className={e.alert ? "text-alert" : "text-ink"}><span className="font-medium">{AGENT_STYLE[agentOf(e.kind)].name}.</span> <span className={e.alert ? "" : "text-muted"}>{e.text}</span></span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>

        <div className={mode === "operator" ? "h-full" : "hidden"}>
          <Operator mall={mall} session={session} active={mode === "operator"} />
        </div>
      </div>
    </main>
  );
}
