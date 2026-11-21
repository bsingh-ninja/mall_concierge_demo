# Design System: Dalma Mall Concierge (v2)

**Direction:** "Desert Day" by default, with "Desert Dusk" as an optional dark theme. Both use the same layout and components; only the colour tokens change. A presenter **stage** frames a bright, consumer-grade **phone**, and the operator console is a working tool in the same family.

All tokens live in `web/app/globals.css`. Components never hard-code stage colours.

## Themes
- **Desert Day** (default): cool-white stage with a soft teal spotlight and a faint eight-point-star pattern. Built for lit rooms and weak projectors.
- **Desert Dusk:** `html[data-theme="dusk"]`, toggled with **T** or the moon/sun button and saved in `localStorage` (`mc-theme`). Dark navy stage for dimmed rooms.
- **The phone screen is always light.** `.device` pins the light map and phone tokens.

## Colour roles (never mixed)
| Role | Day | Dusk | Used for |
|---|---|---|---|
| Teal | `#0b8f82` (phone `#0f9d8f`) | `#2ad1bf` | Route, primary action, "you", Next button |
| Brass | `#a2690f` | `#e3b45e` | Money: savings, offers, revenue |
| Coral | `#d6392f` (phone `#e5484d`) | `#ff6b5e` | Crowd surge only, always next to words naming the cause |

**Agent colours**, used on every agent mention with a 3-letter mono badge:
- Intent Parser: INT, violet
- Live-Crowd Agent: CRW, orange
- Offer Matcher: OFR, amber
- KPI Upsell Agent: KPI, green
- A\* Route Planner: A\*, teal

The concierge uses CON.

**Map tokens (`--map-*`, `--tint-*`, `--heat-*`):**
- Category tints: food warm, kids green, tech blue, style lilac, sport aqua, home sand.
- Footfall ramp: unit colour → sea-glass → amber → coral.
- The operator map follows the theme; the phone map stays light.

## Type
- **Bricolage Grotesque** (display, 800): headlines, big figures, sheet titles.
- **Instrument Sans:** UI and body text.
- **JetBrains Mono:** eyebrows, timestamps, badges, codes.

Every number uses tabular figures. Sizes jump sharply, e.g. 13 / 15 / 22 / 40–48 px, and 60 px for the surge figures.

## Layout
- **Desktop stage (≥1024 px):**
  - top bar: mall name, chapter rail 1–5, Shopper/Operator switch, lunch-rush button, theme, reset
  - three columns: chapter panel | phone in a device frame | agent relay or live feed
  - presenter bar: Back, **Next: …**, Autoplay, progress, key hints
- **Phone (<1024 px):** the phone UI fills the screen and the stage chrome is hidden (for visitors who open it via the QR code).
- **Operator:** KPI tiles (2 → 3 → 5 columns), heatmap card with the selected-tenant strip, and a right column with the agent feed, tenants below target and offers.

## Story chapters
1. **Ask:** the request as a quote, plus mall facts.
2. **Agents plan:** the agent relay lights up step by step, with three facts (offers checked, metres, AED saved).
3. **Walk:** facts for the walk.
4. **Lunch rush:**
   - coral wash on the stage
   - Live-Crowd detection card (capacity %, queue minutes)
   - "One reroute, three winners": shopper, tenant, mall
5. **Mall's view:** the operator console.

## Components
- **Buttons:** stage controls use `.sbtn`, `.seg` and `.next-btn`. The phone has one `.primary` per screen.
- **Phone screens:**
  - chat bubbles and suggestion chips
  - deal cards with discount badges
  - plan header with request chips and a segmented time-budget bar
  - stop rows (tap one to open its store)
  - dark turn-by-turn banner
  - coupon ticket with "wait vs new route" bars against the budget line
  - savings receipt with an ON TIME stamp
- **Map:**
  - category tints and icons
  - pins drop in order, and the route draws itself
  - leg labels ("121 m · 2 min")
  - the surged unit pulses coral; the abandoned leg becomes a dotted coral ghost
  - layer chips: Deals, Crowds (live occupancy and queue badges), Food, Kids
  - tap any store for a card (offer, busy %, queue, distance) with **Show me the way**, which runs a client-side shortest path on the backend's graph
  - the walking-graph overlay is still available
- **Operator:**
  - KPI tiles with context lines; sparklines appear only after 3 or more different values polled in this session (never invented)
  - heat legend; tenant strip with a sales-vs-target meter (85% goal line) and Boost
  - colour-coded agent feed plus the JSON trace
  - tenants plotted as bars against the 85% line
  - offers table with conversion bars

## Interaction and keys
- **Keys:** Space or → next, ← back (from the operator), S lunch rush, O switch view, A autoplay, T theme, R reset, F fullscreen.
- **Autoplay** runs the story on its own and stops at the reroute so the presenter can explain it.

## Motion
- `rise` entrance on each chapter and sheet change
- route draw-on and staggered pin drop
- sheet height easing
- surge pulse; marching dashes on the "show me the way" path
- glow on KPI values that change

`prefers-reduced-motion` makes all of these instant.

## Rules
- Data honesty:
  - Every figure comes from the API.
  - Sparklines use only values polled during the session.
  - Queue minutes use the backend's own rule.
- Keep the "synthetic demo data" disclaimers on both views, and keep photo credits (`IMAGE_CREDITS.md`).
- No client logos and no imitation of client brand colours.
