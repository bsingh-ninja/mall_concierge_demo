export type Rect = { x: number; y: number; w: number; h: number };
export type StoreOffer = { id: string; title: string; price: number; was: number; discount_pct: number; funded_by: string };
export type Store = {
  id: string; unit: string; name: string; category: string; zone: string; rect: Rect; door: string; popularity: number;
  kpi: { sales_vs_target: number; footfall_today: number; conversion_pct: number; area_sqm: number };
  offers: StoreOffer[];
};
export type Mall = {
  name: string; viewBox: number[]; entrance: string; atrium: string;
  corridors: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  nodes: { id: string; x: number; y: number; kind: string; label?: string }[];
  stores: Store[];
  graph: { edges: { a: string; b: string; m: number }[]; walk_m_per_min: number };
};
export type Stop = {
  idx: number; store_id: string; name: string; purpose: "shop" | "play" | "meal" | "upsell"; node: string;
  dwell: number; offer_id: string | null; note: string; arrive: number; depart: number; x: number; y: number;
  replaces?: string; kpi_reason?: string;
};
export type Leg = { points: number[][]; metres: number; walk_min: number; depart: number; arrive: number };
export type Plan = { stops: Stop[]; legs: Leg[]; start_minute: number; end_minute: number; total_min: number; walk_m: number; walk_min: number };
export type Trace = { agent: AgentKey; title: string; detail: string; source?: string; ms?: number };
export type AgentKey = "intent" | "crowd" | "offers" | "upsell" | "route";
export type OfferCard = {
  id: string; store_id: string; title: string; price: number; was: number; discount_pct: number; funded_by: string;
  store_name: string; purpose: string; stop_idx?: number;
};
export type Intent = { time_budget_min: number; adults: number; kids: number; meal: string; summary: string; shopping: { label: string; max_price_aed: number }[] };
export type PlanResponse = { session_id: string; intent: Intent; plan: Plan; trace: Trace[]; offers: OfferCard[] };
export type ChatMsg = { role: "user" | "concierge"; text: string; suggestions?: string[]; source?: string };
export type ChatResponse = { reply: string; suggestions: string[]; ready: boolean; intent?: Intent; source: string; ms?: number };
export type AgentEvent = { kind: string; text: string; time: string; alert: boolean; session: string };
export type Coupon = {
  offer_id: string; store_id: string; store_name: string; unit: string; title: string; discount_pct: number; code: string;
  replaces: string; replaces_unit: string; planned_wait: number; planned_occupancy: number; new_wait: number; new_occupancy: number;
  metres: number; expires: string; budget_min: number; old_total_min: number; new_total_min: number;
};
export type TickResponse = { minute: number; events: AgentEvent[]; plan: Plan | null; coupon: Coupon | null; offers: OfferCard[] | null; note?: string };
export type LedgerRow = {
  id: string; unit: string; store: string; category: string; title: string; funded_by: string;
  impressions: number; claims: number; redemptions: number; revenue_aed: number; conversion: number; this_visit: boolean;
};
export type Underperformer = {
  id: string; unit: string; name: string; category: string; zone: string; sales_vs_target: number; footfall_today: number; conversion_pct: number;
  wing_gap_pct: number; occupancy: number; actions: string[]; on_route: boolean; boosted: boolean;
};
export type AgentTrace = { agent: string; at: string; input: unknown; output: unknown };
export type OperatorData = {
  clock: string; mall: string; minute: number;
  telemetry: { active_qr_sessions: number; redemption_rate_pct: number; redemptions: number; avg_dwell_min: number; rerouted_parties: number; revenue_aed: number };
  heat: Record<string, number>;
  surges: string[];
  ledger: { top: LedgerRow[]; lagging: LedgerRow[]; this_visit: LedgerRow[] };
  underperformers: Underperformer[];
  events: AgentEvent[];
  route: Plan | null;
  trace: AgentTrace[];
};

export type Deal = { store_id: string; store_name: string; category: string; title: string; price: number; was: number; discount_pct: number };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `Request failed (${r.status})`);
  return r.json();
}

export const api = {
  mall: () => call<Mall>("/api/mall"),
  deals: () => call<Deal[]>("/api/deals"),
  chat: (messages: ChatMsg[]) => call<ChatResponse>("/api/chat", { messages: messages.map(({ role, text }) => ({ role, text })) }),
  plan: (text: string, intent?: Intent, source?: string, turns?: number) => call<PlanResponse>("/api/plan", { text, intent, source, turns }),
  start: (sid: string) => call("/api/sessions/" + sid + "/start", {}),
  tick: (sid: string, minute: number) => call<TickResponse>(`/api/sessions/${sid}/tick`, { minute }),
  claim: (sid: string, offer_id: string) => call(`/api/sessions/${sid}/claim`, { offer_id }),
  surge: (sid: string) => call<TickResponse>(`/api/sessions/${sid}/surge`, {}),
  boost: (storeId: string, sid: string | null) => call(`/api/tenants/${storeId}/boost` + (sid ? `?session=${sid}` : ""), {}),
  operator: (sid: string | null) => call<OperatorData>("/api/operator" + (sid ? `?session=${sid}` : "")),
};

export const hhmm = (m: number) => {
  const r = Math.round(m);
  return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

export const AGENTS: Record<AgentKey, { name: string; role: string }> = {
  intent: { name: "Intent Parser", role: "Reads the request into time, party, items and budget" },
  crowd: { name: "Live-Crowd Agent", role: "Reads footfall sensors in all 60 units" },
  offers: { name: "Offer Matcher", role: "Filters live promotions by item, price cap and party" },
  upsell: { name: "KPI Upsell Agent", role: "Finds a tenant below target on the way" },
  route: { name: "A* Route Planner", role: "Shortest path on the corridor graph" },
};

export const AGENT_STYLE: Record<AgentKey | "concierge", { name: string; code: string }> = {
  concierge: { name: "Concierge (Gemini)", code: "CON" },
  intent: { name: "Intent Parser", code: "INT" },
  crowd: { name: "Live-Crowd Agent", code: "CRW" },
  offers: { name: "Offer Matcher", code: "OFR" },
  upsell: { name: "KPI Upsell Agent", code: "KPI" },
  route: { name: "A* Route Planner", code: "A*" },
};

/** Position along the plan at a given minute: walking (interpolated along the leg) or at a stop. */
export function positionAt(plan: Plan, minute: number): { x: number; y: number; leg: number | null; stop: number | null } {
  const legs = plan.legs;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (minute < l.depart) {
      const s = plan.stops[i - 1];
      return s ? { x: s.x, y: s.y, leg: null, stop: i - 1 } : { ...pt(l.points[0]), leg: null, stop: null };
    }
    if (minute < l.arrive) return { ...along(l.points, (minute - l.depart) / (l.arrive - l.depart)), leg: i, stop: null };
  }
  const last = legs[legs.length - 1].points;
  return { ...pt(last[last.length - 1]), leg: null, stop: null };
}

const pt = (p: number[]) => ({ x: p[0], y: p[1] });

function along(points: number[][], f: number) {
  const seg = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let d = f * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, d / seg[i]) : 1;
      return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * t, y: points[i][1] + (points[i + 1][1] - points[i][1]) * t };
    }
    d -= seg[i];
  }
  return pt(points[0]);
}

/** The route already walked by `minute`: finished legs plus the walked part of the current one. */
export function travelledAt(plan: Plan, minute: number): number[][] {
  const out: number[][] = [];
  for (const l of plan.legs) {
    if (minute <= l.depart) break;
    const pts = out.length ? l.points.slice(1) : l.points;
    if (minute >= l.arrive) { out.push(...pts); continue; }
    const f = (minute - l.depart) / (l.arrive - l.depart);
    const seg = l.points.slice(1).map((p, i) => Math.hypot(p[0] - l.points[i][0], p[1] - l.points[i][1]));
    let d = f * seg.reduce((a, b) => a + b, 0);
    if (!out.length) out.push(l.points[0]);
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i]) {
        const t = seg[i] ? d / seg[i] : 1;
        out.push([l.points[i][0] + (l.points[i + 1][0] - l.points[i][0]) * t, l.points[i][1] + (l.points[i + 1][1] - l.points[i][1]) * t]);
        break;
      }
      out.push(l.points[i + 1]);
      d -= seg[i];
    }
    break;
  }
  return out;
}

/** Which agent an event belongs to, for colour and naming in the timelines. */
export function agentOf(kind: string): AgentKey | "concierge" {
  if (kind.startsWith("concierge")) return "concierge";
  if (kind === "redeem" || kind === "claim") return "offers";
  return (["intent", "crowd", "offers", "upsell", "route"] as const).find((k) => k === kind) ?? "route";
}
