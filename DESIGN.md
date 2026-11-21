---
name: Dalma Mall Concierge
description: A calm, labelled indoor map with the plan, the walk and the reroute in a pull-up sheet; strict minimalism around one rich object.
colors:
  accent: "#1a73e8"
  accent-hover: "#1666d0"
  accent-soft: "#e8f0fe"
  alert: "#d93025"
  ink: "#1f1f1f"
  muted: "#6b6b6b"
  faint: "#767676"
  surface: "#ffffff"
  page: "#f4f4f4"
  wash: "#ececec"
  disabled: "#c9c9c9"
  grabber: "#dcdcdc"
  map-floor: "#e2e2e2"
  map-corridor: "#f6f6f6"
  map-icon: "#8a8a8a"
  map-travelled: "#a8a8a8"
  heat-mid: "#b7cff7"
  heat-high: "#1a5bbf"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  map-label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.15
  map-tag:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
rounded:
  focus: "4px"
  unit: "5px"
  thumb: "8px"
  panel: "20px"
  sheet: "24px"
  pill: "26px"
  device: "36px"
  full: "999px"
spacing:
  hairline: "4px"
  xs: "8px"
  row: "10px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "40px"
  column: "48px"
  gutter: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    height: "52px"
    padding: "0 24px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled}"
  prompt-field:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "52px"
    padding: "0 6px 0 20px"
  prompt-submit:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    height: "40px"
    padding: "0 20px"
  prompt-submit-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  map-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    size: "40px"
  map-control-pressed:
    textColor: "{colors.accent}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "0 24px 24px"
  turn-banner:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px 20px"
  map-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.map-tag}"
    rounded: "{rounded.full}"
  map-tag-alert:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.surface}"
  text-link:
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
  text-quiet:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
---

# Design System: Dalma Mall Concierge

## Overview

**Creative North Star: "The Quiet Floor Plan"**

The map is the app. A light grey floor, white units, grey line icons and store names wherever they fit: this is the one rich object on every screen, executed to the category standard of indoor mapping. Everything around it is distilled to strict minimalism. Neutral greys and white carry the chrome; one blue marks the single primary action and the route; one red appears only for a crowd surge, always beside words.

There are no cards, no drop shadows, no borders or dividers in the interface chrome. Hierarchy comes from whitespace and four type sizes alone. Lists are plain rows; secondary actions are underlined text; the plan, the walk and the reroute live in one flat white sheet pulled up over the map. The operator console reuses the same map as a footfall heat field and reads as a working tool: plain tables, large tabular figures, and the agent log as text.

Density is calm and projector-proof. Numbers are always tabular; every price, time and percentage aligns.

**Key Characteristics:**
- One labelled indoor map per screen, flat and full-bleed on the phone.
- Neutral greys and white; blue for the action and the route; red only for the surge, with text.
- Four interface sizes (13 / 15 / 20 / 32), weights 400 / 500 / 600, Inter with tabular figures.
- Flat white surfaces separated by space and tone, never by line or shadow.
- One filled primary action per screen; everything else is text.

## Colors

A neutral grey world with one blue voice and one red warning.

### Primary
- **Route Blue** (accent): the primary action button, the drawn route, numbered stop pins, the "you are here" dot, the current stop number, pressed map controls, focus rings and the text caret.
- **Route Blue, Pressed** (accent-hover): hover state of the primary action only.
- **Blue Mist** (accent-soft): text selection highlight.

### Secondary
- **Surge Red** (alert): the crowd surge. The surged unit's outline, its alert tag on the map, the ghost of the abandoned route (dotted), the surge sentence in the reroute sheet, over-budget figures, and alert lines in the agent log. Always paired with words; never a fill on its own without a label.

### Neutral
- **Ink** (ink): all primary text, map store names, dark map tags, the entrance marker, selected and below-target unit outlines on the operator map.
- **Graphite** (muted): secondary text, sublines, map control glyphs, quiet text actions.
- **Ash** (faint): placeholders, struck-through former prices, upcoming story steps, timestamps, the superseded figure in a before/after comparison.
- **White** (surface): the sheet, top bar, turn banner, map units and map controls.
- **Pale Grey** (page): the desktop stage background and the prompt field.
- **Wash** (wash): the phone device background and the operator map frame.
- **Floor Grey** (map-floor) and **Corridor White** (map-corridor): the map's floor slab and walkways.
- **Icon Grey** (map-icon): category icons on map units.
- **Walked Grey** (map-travelled): the part of the route already walked.
- **Disabled Grey** (disabled), **Grabber Grey** (grabber): disabled primary background; the sheet grabber.

### Footfall ramp
The operator map fills units on a three-stop ramp: White at quiet (0.2 and below), **Heat Mist** (heat-mid) at 0.6, **Deep Footfall Blue** (heat-high) at 0.95 and above, interpolated in RGB with a 700ms fill transition. Icons on a heated unit switch from Icon Grey to Ink.

### Named Rules
**The One Blue Rule.** Route Blue marks the one primary action, the route and the shopper's position. It is never decoration, never a heading colour, never a second button.

**The Red Speaks Rule.** Surge Red appears only for crowding and its consequences, and always next to a sentence that names the cause ("Saffron House is 98% full, 32 min wait").

## Typography

**Display Font:** Inter (with system-ui, sans-serif)
**Body Font:** Inter
**Label Font:** Inter

**Character:** One neutral grotesque at four sizes, doing all hierarchy work that borders and boxes would otherwise do. Tabular figures throughout for prices, times and counts.

### Hierarchy
- **Display** (600, 32px, 1.25, -0.02em): page titles on the desktop stage and operator ("Operations"), and headline figures (KPI values, before/after route minutes).
- **Headline** (600, 20px, 1.25): sheet and section titles ("Your plan", "Lunch moved to Olive & Ember"), the turn banner instruction, small KPI figures.
- **Body** (400, 15px, 1.5): concierge replies, prompt input, explanatory copy (desktop column max 340px).
- **Body Strong** (500 or 600, 15px): store names in rows (500), prices and the active story step (600), navigation tab of the current view (600), sub-section titles like "Offers near you" (600).
- **Label** (400, 13px): sublines, table headers, KPI labels, agent log, timestamps, quiet actions, the surge control.
- **Map Label** (500, 11px at base zoom, scaled with the map): store names on units, wrapped to two lines and dropped when they do not fit. Map tags use 600 at 11.5px; the Atrium label 600 at 11px in Graphite.

### Named Rules
**The Four Sizes Rule.** Interface text uses 13, 15, 20 or 32px and nothing else. Map labels live on the map's own scale and do not count.

**The Tabular Rule.** Every price, time, distance, count and percentage is set with tabular figures.

## Layout

**Phone (shopper):** the map is full-bleed. A white top strip (16px gutters) holds the prompt field; while walking it is replaced by a floating turn banner and the strip becomes transparent. Map controls stack on the right, 12px from the edge, 8px apart. The bottom sheet rises from the bottom edge at a height set per phase (welcome, planning, plan, walk, reroute, done), expanding to 90% on demand; its body has 24px side padding and scrolls. The map refits its camera into the area left uncovered by the field, sheet and controls.

**Desktop stage (1024px and up):** three columns `minmax(240px,1fr) | phone | minmax(300px,1fr)` with a 64px gap and 48px / 32px page padding. Left column: title, short description, numbered story steps, key hints and the QR code. Centre: the phone device at 412px wide, up to 880px tall, with 36px corners on the Wash background. Right column: the live agent log as plain text in a `3rem | 1fr` grid. A 56px white top bar carries the mall name, a text mode switch and the surge control.

**Operator:** a white scrolling page. The landscape footfall map sits on the left in a 20px-rounded Wash frame at a 1200:700 aspect, with KPI figures in a five-up row beneath; offers, tenants below target and the agent log stack on the right as plain tables.

**Rhythm:** a 4px base. Rows breathe at 10px vertical padding; groups separate at 24 to 40px; columns at 48 to 64px. Space, not lines, ends a section.

## Elevation & Depth

Flat by design. There are no box-shadows anywhere. Depth is conveyed by tone and stacking order alone: the white sheet and turn banner sit over the grey map, the map's white units sit on Floor Grey, and the route is lifted off the floor by a 10px white casing under its 6px blue stroke. The only animated depth is the location pulse, a 16%-opacity blue halo that scales out and fades.

### Named Rules
**The Flat Sheet Rule.** Surfaces over the map are separated from it by colour and position, never by shadow, border or blur.

## Shapes

Soft, generous rounding on everything the hand touches; small rounding on the map's grid. Pills (26px) for the primary action and the prompt field; full circles for map controls, pins' heads and the prompt submit; 24px top corners on the sheet; 20px on floating panels and the operator map frame; 8px on photo thumbnails; 5px on map units; 36px on the phone device. Stop pins are teardrop markers with a white numeral. Map tags are full pills.

The No-Lines doctrine covers interface chrome only. On the map, outlines are the native vocabulary of indoor wayfinding and carry state: a 2px blue outline for a route stop, 2px red for a surged unit, 2px ink for a selected unit, and a dashed 1.4px ink outline for a tenant below its sales target.

## Components

### Buttons
- **Shape:** pill (26px radius), 52px tall, 24px horizontal padding; full width inside the sheet.
- **Primary:** Route Blue fill, white 15px / 600 label. One per screen: Plan, Start route, Accept and claim, Open the operator view, Boost.
- **Hover / Focus:** hover darkens to Route Blue, Pressed over 150ms; focus shows a 2px Route Blue outline offset 3px.
- **Disabled:** Disabled Grey fill.
- **Everything else is text:** a **text link** (15px / 500 Ink, underlined in Disabled Grey with 4px offset, underline turns Ink on hover) for suggestions; a **quiet action** (13px Graphite, underlined, turns Ink on hover) for Pause, Start a new visit, "How was this planned?".

### Inputs / Fields
- **Prompt field:** a 52px pill on Pale Grey with no stroke; 15px text, Ash placeholder, Route Blue caret. The submit sits inside as a 40px full pill: Route Blue with white "Plan" on first use, white with Ink "Replan" afterwards (so the blue moves to the sheet's action).
- **Focus:** the global 2px Route Blue focus ring.

### Navigation
- **Mode switch:** two text tabs (Shopper / Operator) at 15px; the current one Ink 600, the other Graphite turning Ink on hover. No underline, pill or background.
- **Surge control:** 13px Graphite text with an 8px Surge Red dot; reads "Surge: plan a visit first" or "Surge simulated" when unavailable.

### Lists and rows
- **Offer / stop rows:** no card, no divider. A 40 to 44px photo thumbnail (8px radius), store name 15px / 500, subline 13px Graphite, right-aligned tabular price 15px / 600 with the former price struck through in Ash. Stop rows lead with a tabular number that turns Route Blue for the current stop; completed rows drop to 40% opacity.
- **Planning steps:** a check for done, three typing dots for in progress, a small Ash dot for pending (pending rows at 35% opacity).

### Bottom Sheet (signature)
White, 24px top corners, a 36 x 4px Grabber Grey handle, height animated over 320ms on `cubic-bezier(0.2, 0.8, 0.2, 1)`. It holds one phase at a time: welcome (reply, suggestion links, offers), planning, plan, walk, reroute, done.

### Turn Banner
A white 20px-rounded panel floating at the top while walking: the instruction in 20px / 600 ("Walk 67 m"), the destination and time below in 15px Graphite, the clock at right in 13px tabular Graphite.

### Reroute comparison
Surge sentence in 13px / 500 Surge Red with a dot; headline in 20px; then two columns: the superseded total in 32px Ash with an over-budget note in red, the new total in 32px Ink with its outcome in Graphite. One primary action below.

### Indoor Map (signature)
- **Floor:** Floor Grey slab (18px radius), Corridor White walkways (44px round-capped strokes) and a circular atrium labelled in Graphite.
- **Units:** White with 5px corners and a 1.5px inset gap; a grey Lucide line icon (up to 16px) above the store name where it fits, name only or icon only when space is tight, nothing when a label would collide.
- **Route:** 6px Route Blue line on a 10px white casing, drawn on over 1.4s; walked portion in Walked Grey; the abandoned route as a dotted red ghost.
- **Pins and position:** blue teardrop stop pins with white numerals; the shopper as an 8px blue dot with a 3px white ring and a pulsing halo; the entrance as an Ink disc with a white door icon.
- **Tags:** Ink pills with white 11.5px / 600 names, placed beside pins or on their units by collision search, dropped rather than stacked. Surge tags are Surge Red ("Saffron House, 98% full").
- **Controls:** 40px white circles on the right (zoom in, zoom out, recenter, A* graph), Graphite glyphs at 18px, Route Blue when pressed. While walking only recenter remains, and only after the shopper pans.
- **A* graph overlay:** Route Blue edges at 55% opacity with metre labels, white nodes with blue rings.

### KPI Figures
A 13px Graphite label over a 32px (or 20px small) tabular 600 figure with -0.01em tracking; the figure turns Surge Red when below target.

## Do's and Don'ts

### Do:
- **Do** keep the labelled map visible on every shopper screen; the sheet covers part of it, never all of it.
- **Do** use exactly one filled Route Blue pill per screen and make every other action text.
- **Do** separate sections with 24 to 40px of space and type size, not with lines or boxes.
- **Do** set every number in tabular figures.
- **Do** pair every use of Surge Red with a sentence naming the crowding.
- **Do** use outlines on map units to carry state (stop, surge, selected, below target); that is the map's native language.
- **Do** honour reduced motion: the route appears fully drawn and animations collapse to instant.

### Don't:
- **Don't** add cards, drop shadows, borders or dividers to the interface chrome.
- **Don't** use Route Blue for headings, decoration or a second button.
- **Don't** introduce type sizes outside 13 / 15 / 20 / 32 in the interface, or weights above 600.
- **Don't** fill map units with category colours; units are white, identity comes from the grey icon and the name.
- **Don't** stack map tags or labels; a tag with no clear spot is dropped.
