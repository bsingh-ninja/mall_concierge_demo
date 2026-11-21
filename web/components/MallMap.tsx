"use client";
import { useEffect, useRef, useState } from "react";
import { DoorOpen, Locate, Minus, Network, Plus } from "lucide-react";
import type { Mall, Plan } from "@/lib/api";
import { look } from "@/lib/look";

/*
  Indoor map in the style people already know from everyday map apps: calm grey floor, white walkways,
  stores tinted by category with an icon and their name wherever it fits, a blue route with numbered pins.
  Drag to pan, scroll or use the buttons to zoom, recenter to hand the camera back to the app.
  "portrait" turns the plan a quarter turn so the mall's long axis runs up a phone, entrance at the bottom.
*/
export type Orientation = "landscape" | "portrait";
export type Camera = { kind: "all"; byWidth?: boolean } | { kind: "fit"; points: number[][]; pad?: number; byWidth?: boolean } | { kind: "follow"; x: number; y: number; span: number };

// Colours come from CSS tokens (--map-*), so the phone map stays light and the operator map follows the theme.
const BLUE = "var(--map-route)", RED = "var(--map-alert)", INK = "var(--map-ink)", MUTED = "var(--map-muted)";

// Category identity: a soft tint per store group, with a matching icon colour.
const TINT: Record<string, [string, string]> = {
  "Dining": ["var(--tint-food)", "#c2521f"], "Kids & toys": ["var(--tint-kids)", "#2e8a4f"], "Electronics": ["var(--tint-tech)", "#3b6fb0"],
  "Apparel": ["var(--tint-style)", "#6a5bd8"], "Footwear": ["var(--tint-style)", "#6a5bd8"], "Beauty & health": ["var(--tint-style)", "#9a4f8f"],
  "Sports": ["var(--tint-sport)", "#1f8597"], "Home & gifts": ["var(--tint-home)", "#9a7a3c"], "Leisure": ["var(--tint-home)", "#9a7a3c"], "Services": ["var(--tint-home)", "#9a7a3c"],
};
const tint = (category: string) => TINT[look(category).group] ?? TINT["Services"];
const isFood = (c: string) => look(c).group === "Dining";
const isKids = (c: string) => look(c).group === "Kids & toys";
/** Queue at a restaurant from its occupancy (same rule as the backend's crowd agent). */
export const queueMin = (occ: number) => Math.max(0, Math.round((occ - 0.6) * 40));
export type MapLayers = { deals?: boolean; crowds?: Record<string, number> | null; focus?: "food" | "kids" | null };

const tp = (o: Orientation, x: number, y: number): [number, number] => (o === "landscape" ? [x, y] : [y, 1240 - x]);
const tr = (o: Orientation, r: { x: number; y: number; w: number; h: number }) =>
  o === "landscape" ? r : { x: r.y, y: 1240 - (r.x + r.w), w: r.h, h: r.w };

// Footfall ramp: the unit colour (quiet) to sea-glass, amber, then coral (packed). Works on light and dark floors.
export function heatColor(v: number) {
  const pct = (a: number, b: number) => Math.round(Math.max(0, Math.min(1, (v - a) / (b - a))) * 100);
  if (v <= 0.55) return `color-mix(in srgb, var(--heat-1) ${pct(0.15, 0.55)}%, var(--map-unit))`;
  if (v <= 0.8) return `color-mix(in srgb, var(--heat-2) ${pct(0.55, 0.8)}%, var(--heat-1))`;
  return `color-mix(in srgb, var(--heat-3) ${pct(0.8, 0.97)}%, var(--heat-2))`;
}

type Props = {
  mall: Mall;
  orientation: Orientation;
  camera: Camera;
  cameraKey?: string; // changing it hands the camera back to the app after the user panned
  plan?: Plan | null;
  travelled?: number[][] | null;
  ghost?: number[][] | null;
  pos?: { x: number; y: number } | null;
  activeStop?: number | null;
  surges?: { id: string; pct?: number }[];
  heat?: Record<string, number>;
  flagged?: string[];
  labelIds?: string[]; // stores always named with a tag, whatever the zoom
  showGraph?: boolean;
  onToggleGraph?: () => void;
  selected?: string | null;
  onSelect?: (storeId: string) => void;
  onPan?: () => void; // the user started dragging the map (the phone collapses its sheet for a full map)
  layers?: MapLayers;
  preview?: number[][] | null; // "show me the way" path, in mall coordinates
  legLabels?: boolean; // metres and minutes on each walking leg
  controlsTop?: number;
  compactControls?: boolean; // only the recenter button (the camera follows the shopper)
  insetTop?: number; // px covered by floating UI at the top; the camera frames the area between the insets
  insetBottom?: number; // px covered by the bottom sheet
  insetRight?: number; // px covered by the map controls
  className?: string;
};

export default function MallMap(p: Props) {
  const { mall, orientation: o, plan, travelled, ghost, pos, activeStop, surges = [], heat, flagged = [], showGraph, selected, onSelect } = p;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 400 });
  const [user, setUser] = useState<number[] | null>(null); // a view the user panned or zoomed to
  const drag = useRef<{ x: number; y: number; vb: number[]; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setUser(null); }, [p.cameraKey]);

  const small = size.h < 260;
  const it = p.insetTop ?? 0, ib = p.insetBottom ?? 0, ir = heat && size.w < 600 ? 0 : p.insetRight ?? 0;
  const visH = Math.max(80, size.h - it - ib), visW = Math.max(80, size.w - ir);
  const fitted = camera(p.camera, o, visW / visH);
  // Grow the fitted view so it sits in the uncovered area (clear of sheet, field and controls) and still fills the frame.
  const auto = [fitted[0], fitted[1] - (it / visH) * fitted[3], (size.w / visW) * fitted[2], (size.h / visH) * fitted[3]];
  const vb = user ?? auto;
  const k = vb[2] / size.w; // map units per screen pixel
  const T = (x: number, y: number) => tp(o, x, y);
  const nodes = Object.fromEntries(mall.nodes.map((n) => [n.id, n]));
  const stopIds = new Set(plan?.stops.map((s) => s.store_id));
  const surgeIds = new Set(surges.map((s) => s.id));
  const route = plan ? plan.legs.flatMap((l, i) => (i ? l.points.slice(1) : l.points)) : [];
  const line = (pts: number[][]) => pts.map(([x, y]) => T(x, y).join(",")).join(" ");
  const floor = tr(o, { x: 12, y: 50, w: 1176, h: 662 });
  const ent = T(nodes[mall.entrance].x, nodes[mall.entrance].y);
  const atr = T(nodes[mall.atrium].x, nodes[mall.atrium].y);

  // Fixed labels: the entrance tag and the atrium name. Tags must not land on them.
  const entPill = { x: ent[0] + (o === "portrait" ? -60 : 40) * k, y: ent[1] + (o === "portrait" ? 0 : 30) * k };
  const entW = "Main entrance".length * 11.5 * k * 0.56 + 14 * k;
  const entBox = { x0: entPill.x - entW / 2 - 13 * k, y0: entPill.y - 13 * k, x1: entPill.x + entW / 2 + 13 * k, y1: entPill.y + 13 * k };
  const atrBox = { x0: atr[0] - 26 * k, y0: atr[1] - 9 * k, x1: atr[0] + 26 * k, y1: atr[1] + 9 * k };
  // Pins and tags first, so the names inside units can make way for them.
  const pins = (plan?.stops ?? []).map((s, i) => {
    const [x, y] = T(s.x, s.y);
    const r = (activeStop === i ? 14 : 12) * k, lift = r * 2.2;
    return { i, x, y, r, lift, box: { x0: x - r, y0: y - lift - r, x1: x + r, y1: y } };
  });
  // Metres and minutes at the middle of each leg (plan view only).
  const legTags = (p.legLabels && plan && !travelled ? plan.legs : []).flatMap((leg) => {
    const pts = leg.points.map(([x, y]) => T(x, y));
    const seg = pts.slice(1).map((q, j) => Math.hypot(q[0] - pts[j][0], q[1] - pts[j][1]));
    const L = seg.reduce((a, b) => a + b, 0);
    if (L / k < 90) return [];
    let d = L / 2, j = 0;
    while (j < seg.length - 1 && d > seg[j]) { d -= seg[j]; j++; }
    const f = seg[j] ? d / seg[j] : 0, x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
    const text = `${leg.metres} m · ${Math.max(1, Math.round(leg.walk_min))} min`, w = text.length * 11.5 * k * 0.56 + 14 * k;
    return [{ x, y, text, box: { x0: x - w / 2, y0: y - 12 * k, x1: x + w / 2, y1: y + 12 * k } }];
  });
  const tagReqs: { id: string; text: string; tone: Tone }[] = [
    ...surges.flatMap((g) => { const st = mall.stores.find((x) => x.id === g.id); return st ? [{ id: st.id, text: `${st.name}, ${g.pct ?? ""}% full`, tone: "alert" as const }] : []; }),
    ...[...new Set(p.labelIds ?? [])].filter((id) => !surgeIds.has(id)).flatMap((id) => { const st = mall.stores.find((x) => x.id === id); return st ? [{ id, text: st.name, tone: "ink" as const }] : []; })
      .sort((a, b) => Number(!!plan?.stops.find((x) => x.store_id === b.id)?.replaces) - Number(!!plan?.stops.find((x) => x.store_id === a.id)?.replaces)),
  ];
  const layers = p.layers ?? {};
  const focusOn = (c: string) => !layers.focus || (layers.focus === "food" ? isFood(c) : isKids(c));
  if (layers.crowds) for (const st of mall.stores) {
    const q = isFood(st.category) && !surgeIds.has(st.id) ? queueMin(layers.crowds[st.id] ?? 0) : 0;
    if (q > 0 && focusOn(st.category)) tagReqs.push({ id: st.id, text: `${q} min queue`, tone: q > 15 ? "alert" : "warn" });
  }
  if (layers.deals) for (const st of mall.stores) {
    const best = [...st.offers].sort((a, b) => b.discount_pct - a.discount_pct)[0];
    if (best && best.discount_pct >= 20 && focusOn(st.category) && !tagReqs.some((t) => t.id === st.id)) tagReqs.push({ id: st.id, text: `−${best.discount_pct}%`, tone: "money" });
  }
  const narrow = size.w < 500 && !!heat;
  const isMust = (id: string, tone: string) => (tone === "alert" && surgeIds.has(id)) || !!plan?.stops.find((x) => x.store_id === id)?.replaces;
  tagReqs.sort((a, b) => Number(isMust(b.id, b.tone)) - Number(isMust(a.id, a.tone)));
  const tags = placeTags(tagReqs.filter((t) => !narrow || t.tone === "alert" || !!plan?.stops.find((x) => x.store_id === t.id)?.replaces).map((t) => {
    const st = mall.stores.find((x) => x.id === t.id)!;
    const pin = pins.find((q) => plan?.stops[q.i].store_id === t.id);
    const must = isMust(t.id, t.tone);
    return { ...t, must, rect: tr(o, st.rect), pin: pin ? { x: pin.x, y: pin.y - pin.lift, r: pin.r } : null };
  }), [...pins.map((q) => q.box), entBox, ...legTags.map((l) => l.box)], k, [vb[0], vb[1] + it * k, vb[2] - ir * k, vb[3] - (it + ib) * k]);
  const blocked = [...tags.map((t) => t.box), ...pins.map((q) => q.box)];
  const hits = (b: Box) => blocked.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);

  function zoom(f: number, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) {
    const w = Math.min(2400, Math.max(160, vb[2] * f)), h = w * (vb[3] / vb[2]);
    setUser([cx - (cx - vb[0]) * (w / vb[2]), cy - (cy - vb[1]) * (h / vb[3]), w, h]);
  }

  return (
    <div ref={box} className={`${p.className ?? "relative"} touch-none select-none overflow-hidden`} style={{ background: "var(--map-bg)" }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3 * k) { d.moved = true; p.onPan?.(); }
        if (d.moved) setUser([d.vb[0] - dx, d.vb[1] - dy, d.vb[2], d.vb[3]]);
      }}
      onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
      onPointerLeave={() => { drag.current = null; }}
      onWheel={(e) => {
        const r = box.current!.getBoundingClientRect();
        zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, vb[0] + (e.clientX - r.left) * k, vb[1] + (e.clientY - r.top) * k);
      }}>
      <svg viewBox={vb.join(" ")} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${mall.name} map`} className="block">
        <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} rx={22} fill="var(--map-floor)" />
        {mall.corridors.map((c) => {
          const [x1, y1] = T(c.x1, c.y1), [x2, y2] = T(c.x2, c.y2);
          return <line key={c.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--map-corridor)" strokeWidth={44} strokeLinecap="round" />;
        })}
        <circle cx={atr[0]} cy={atr[1]} r={46} fill="var(--map-corridor)" />

        {mall.stores.map((s) => {
          const r = tr(o, s.rect);
          const isSurge = surgeIds.has(s.id), isSel = selected === s.id, isFlag = flagged.includes(s.id), isStop = stopIds.has(s.id);
          const occ = heat ?? layers.crowds;
          const dim = !focusOn(s.category) && !isStop && !isSel;
          return (
            <rect key={s.id} x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} rx={6} className={isSurge ? "surge-pulse" : undefined}
              fill={occ ? heatColor(occ[s.id] ?? 0) : tint(s.category)[0]} opacity={dim ? 0.28 : 1}
              style={{ transition: "fill 700ms ease, opacity 300ms ease", cursor: onSelect ? "pointer" : undefined }}
              stroke={isSurge ? RED : isSel ? INK : isStop ? BLUE : isFlag ? INK : "var(--map-unit-line)"} strokeWidth={(isSurge || isSel ? 2.6 : isStop ? 2.2 : isFlag ? 1.4 : 1) * k}
              strokeDasharray={isFlag && !isSel ? `${4 * k} ${3 * k}` : undefined}
              onClick={() => { if (!drag.current?.moved) onSelect?.(s.id); }}>
              <title>{`${s.unit} ${s.name}`}</title>
            </rect>
          );
        })}

        {/* icons and names wherever they fit at this zoom */}
        {mall.stores.map((s) => {
          const r = tr(o, s.rect);
          const wpx = r.w / k, hpx = r.h / k;
          if (Math.min(wpx, hpx) < 12 || narrow || (!focusOn(s.category) && !stopIds.has(s.id))) return null;
          const lk = look(s.category);
          const Icon = lk.icon;
          const fs = 11 * k, iconPx = Math.min(16, Math.min(wpx, hpx) - 2);
          let lines = fitName(s.name, (wpx - 6) / 6.1, hpx > 54 ? 2 : hpx > 36 ? 1 : 0);
          let showIcon = true;
          if (!lines.length) { lines = fitName(s.name, (wpx - 4) / 6.1, hpx > 34 ? 2 : hpx > 15 ? 1 : 0); showIcon = !lines.length; }
          const block = (showIcon ? iconPx * k : 0) + (lines.length ? (showIcon ? 3 * k : 0) + lines.length * fs * 1.15 : 0);
          const cx = r.x + r.w / 2, top = r.y + r.h / 2 - block / 2;
          if (hits({ x0: r.x + 4 * k, y0: top, x1: r.x + r.w - 4 * k, y1: top + block })) return null;
          const textTop = top + (showIcon ? iconPx * k + 3 * k : 0);
          return (
            <g key={"lbl" + s.id} pointerEvents="none">
              {showIcon && <Icon x={cx - (iconPx * k) / 2} y={top} width={iconPx * k} height={iconPx * k} color={heat || layers.crowds ? INK : tint(s.category)[1]} strokeWidth={2} />}
              {lines.map((ln, i) => (
                <text key={i} x={cx} y={textTop + fs * (i + 0.85) * 1.15} textAnchor="middle" fontSize={fs} fontWeight={600} fill={INK}>{ln}</text>
              ))}
            </g>
          );
        })}


        {showGraph && (
          <g pointerEvents="none">
            {mall.graph.edges.map((e) => {
              const [x1, y1] = T(nodes[e.a].x, nodes[e.a].y), [x2, y2] = T(nodes[e.b].x, nodes[e.b].y);
              return (
                <g key={e.a + e.b}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BLUE} strokeOpacity={0.55} strokeWidth={1.2 * k} />
                  {Math.hypot(x2 - x1, y2 - y1) / k > 38 && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3 * k} fontSize={9.5 * k} textAnchor="middle" fill={BLUE} fontWeight={600} className="tnum" paintOrder="stroke" stroke="#ffffff" strokeWidth={3 * k}>{e.m} m</text>}
                </g>
              );
            })}
            {mall.nodes.map((n) => { const [x, y] = T(n.x, n.y); return <circle key={n.id} cx={x} cy={y} r={(n.kind === "door" ? 2 : 3.2) * k} fill="#ffffff" stroke={BLUE} strokeWidth={1.2 * k} />; })}
          </g>
        )}

        {p.preview && p.preview.length > 1 && <polyline points={line(p.preview)} fill="none" stroke="var(--map-preview)" strokeWidth={5 * k} strokeDasharray={`${10 * k} ${8 * k}`} strokeLinecap="round" strokeLinejoin="round" className="march" pointerEvents="none" />}
        {ghost && <polyline points={line(ghost)} fill="none" stroke={RED} strokeWidth={4 * k} strokeDasharray={`${2 * k} ${7 * k}`} strokeLinecap="round" />}
        {route.length > 1 && (
          <g pointerEvents="none">
            <polyline points={line(route)} fill="none" stroke="var(--map-casing)" strokeWidth={11 * k} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={line(route)} fill="none" stroke={BLUE} strokeWidth={6 * k} strokeLinejoin="round" strokeLinecap="round" className={travelled ? undefined : "route-draw"} pathLength={travelled ? undefined : 1} />
            {travelled && travelled.length > 1 && <polyline points={line(travelled)} fill="none" stroke="var(--map-walked)" strokeWidth={6 * k} strokeLinejoin="round" strokeLinecap="round" />}
          </g>
        )}

        <g pointerEvents="none">
          {!tags.some((t) => t.box.x0 < atrBox.x1 && t.box.x1 > atrBox.x0 && t.box.y0 < atrBox.y1 && t.box.y1 > atrBox.y0) && <text x={atr[0]} y={atr[1] + 4 * k} textAnchor="middle" fontSize={11 * k} fontWeight={600} fill={MUTED} paintOrder="stroke" stroke="var(--map-corridor)" strokeWidth={4 * k} letterSpacing={1.2 * k}>ATRIUM</text>}
          <circle cx={ent[0]} cy={ent[1]} r={11 * k} fill={INK} />
          <DoorOpen x={ent[0] - 6.5 * k} y={ent[1] - 6.5 * k} width={13 * k} height={13 * k} color="var(--map-casing)" strokeWidth={2.2} />
          <Pill x={entPill.x} y={entPill.y} k={k} text="Main entrance" tone="ink" />
        </g>

        {legTags.map((l, i) => <Pill key={"leg" + i} x={l.x} y={l.y} k={k} text={l.text} tone="light" />)}
        {pins.map(({ i, x, y, r, lift }) => (
          <g key={"pin" + i} pointerEvents="none" className="pin-drop" style={{ animationDelay: `${i * 140}ms` }}>
            <path d={`M${x} ${y} C ${x - r * 0.4} ${y - r * 0.9}, ${x - r} ${y - lift + r * 0.9}, ${x - r} ${y - lift} A ${r} ${r} 0 1 1 ${x + r} ${y - lift} C ${x + r} ${y - lift + r * 0.9}, ${x + r * 0.4} ${y - r * 0.9}, ${x} ${y} Z`} fill={BLUE} stroke="var(--map-casing)" strokeWidth={2 * k} />
            <text x={x} y={y - lift + r * 0.4} textAnchor="middle" fontSize={r * 1.1} fontWeight={800} fill="#ffffff">{i + 1}</text>
          </g>
        ))}
        {tags.map((t) => <Pill key={"tag" + t.id} x={t.x} y={t.y} k={k} text={t.text} tone={t.tone} />)}

        {pos && (() => {
          const [x, y] = T(pos.x, pos.y);
          return (
            <g pointerEvents="none">
              <circle cx={x} cy={y} r={22 * k} fill={BLUE} opacity={0.22} className="me-pulse" />
              <circle cx={x} cy={y} r={9 * k} fill={BLUE} stroke="#ffffff" strokeWidth={3.5 * k} />
            </g>
          );
        })()}
      </svg>

      {!narrow && <div className="absolute right-3 flex flex-col gap-2" style={{ top: p.controlsTop ?? 12 }}>
        {!p.compactControls && <button className="map-btn" aria-label="Zoom in" onClick={() => zoom(1 / 1.4)}><Plus size={18} /></button>}
        {!p.compactControls && <button className="map-btn" aria-label="Zoom out" onClick={() => zoom(1.4)}><Minus size={18} /></button>}
        {(!p.compactControls || user) && !(small && !user) && <button className="map-btn" aria-label="Recenter" aria-pressed={!!user} onClick={() => setUser(null)}><Locate size={18} /></button>}
        {p.onToggleGraph && !p.compactControls && !small && (
          <button className="map-btn" aria-label="Show the walking graph" aria-pressed={!!showGraph} title="Show the walking graph (A* nodes and metres)" onClick={p.onToggleGraph}><Network size={18} /></button>
        )}
      </div>}
    </div>
  );
}

type Tone = "ink" | "alert" | "warn" | "money" | "light";
const PILL: Record<Tone, [string, string]> = {
  ink: ["var(--map-tag)", "var(--map-tag-text)"], alert: [RED, "#ffffff"], warn: ["#e0602f", "#ffffff"], money: ["#b7832a", "#ffffff"], light: ["var(--map-casing)", "var(--map-ink)"],
};
function Pill({ x, y, k, text, tone }: { x: number; y: number; k: number; text: string; tone: Tone }) {
  const fs = 11.5 * k, w = text.length * fs * 0.56 + 14 * k;
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y - fs} width={w} height={fs * 2} rx={fs} fill={PILL[tone][0]} stroke={tone === "light" ? "var(--map-unit-line)" : "none"} strokeWidth={k} />
      <text x={x} y={y + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={700} fill={PILL[tone][1]}>{text}</text>
    </g>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
  Place each tag where it collides with nothing already placed: beside its own pin (right or left) for a
  route stop, otherwise on its own unit. A tag with no clear spot is dropped (the stop list still names it),
  except the story tags (surge, reroute), which go first and sit on their own unit.
*/
function placeTags(reqs: { id: string; must?: boolean; rect: { x: number; y: number; w: number; h: number }; text: string; tone: Tone; pin: { x: number; y: number; r: number } | null }[], obstacles: Box[], k: number, vb: number[]) {
  const fs = 11.5 * k, h = fs * 2;
  const taken = [...obstacles];
  const out: { id: string; x: number; y: number; text: string; tone: Tone; box: Box }[] = [];
  for (const t of reqs) {
    const w = t.text.length * fs * 0.56 + 14 * k;
    const gap = 6 * k;
    const onUnit: [number, number][] = [[t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2]];
    const unitEdges: [number, number][] = [[t.rect.x + t.rect.w / 2, t.rect.y - h / 2], [t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h + h / 2]];
    const besidePin: [number, number][] = t.pin ? [[t.pin.x + t.pin.r + gap + w / 2, t.pin.y], [t.pin.x - t.pin.r - gap - w / 2, t.pin.y]] : [];
    const cands = t.pin ? [...besidePin, ...(t.must ? [...onUnit, ...unitEdges] : [])] : t.must ? [...onUnit, ...unitEdges] : onUnit;
    let placed = false;
    for (const [x, y] of cands) {
      const box = { x0: x - w / 2 - 2 * k, y0: y - h / 2 - 2 * k, x1: x + w / 2 + 2 * k, y1: y + h / 2 + 2 * k };
      const inView = box.x0 >= vb[0] && box.x1 <= vb[0] + vb[2] && box.y0 >= vb[1] && box.y1 <= vb[1] + vb[3];
      if (inView && !taken.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0)) {
        taken.push(box); out.push({ id: t.id, x, y, text: t.text, tone: t.tone, box });
        placed = true;
        break;
      }
    }
    if (!placed && t.must) {
      // A story tag sits on its own unit even when crowded (it goes first, so it rarely is). Off-screen: skip.
      const x = t.rect.x + t.rect.w / 2, y = t.rect.y + t.rect.h / 2;
      const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
      if (box.y0 >= vb[1] && box.y1 <= vb[1] + vb[3]) { taken.push(box); out.push({ id: t.id, x, y, text: t.text, tone: t.tone, box }); }
    }
  }
  return out;
}

/** Wrap a store name into at most `max` lines of `chars` characters; empty when it will not fit. */
function fitName(name: string, chars: number, max: number): string[] {
  if (max === 0 || chars < 4) return [];
  if (name.length <= chars) return [name];
  if (max < 2) return [];
  const words = name.split(" "), out: string[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + " " + w).length <= chars) out[out.length - 1] = last + " " + w;
    else out.push(w);
  }
  return out.length <= max && out.every((l) => l.length <= chars) ? out : [];
}

function camera(c: Camera, o: Orientation, aspect: number): number[] {
  if (c.kind === "follow") {
    const [x, y] = tp(o, c.x, c.y);
    const w = c.span, h = w / aspect;
    return [x - w / 2, y - h * 0.45, w, h];
  }
  const all = [[12, 50], [1188, 50], [1188, 712], [12, 712]];
  const pts = (c.kind === "all" ? all : c.points).map(([x, y]) => tp(o, x, y));
  const pad = c.kind === "all" ? 14 : c.pad ?? 60;
  let x0 = Math.min(...pts.map((q) => q[0])) - pad, x1 = Math.max(...pts.map((q) => q[0])) + pad;
  let y0 = Math.min(...pts.map((q) => q[1])) - pad, y1 = Math.max(...pts.map((q) => q[1])) + pad;
  if (c.byWidth) {
    // Phone: fit the width so names stay readable; centre vertically and let the rest run under the sheet.
    const w = x1 - x0, h = w / aspect, cy = (y0 + y1) / 2;
    return [x0, cy - h / 2, w, h];
  }
  const w = x1 - x0, h = y1 - y0;
  if (w / h > aspect) { const nh = w / aspect; y0 -= (nh - h) / 2; y1 = y0 + nh; } else { const nw = h * aspect; x0 -= (nw - w) / 2; x1 = x0 + nw; }
  return [x0, y0, x1 - x0, y1 - y0];
}
