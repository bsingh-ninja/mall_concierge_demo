# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
NinjaTech presenters showing the demo to client executives (Dalma Mall / Al Hail group) in an owner meeting, on a laptop or projected screen. The shopper half may also be opened on a phone by scanning the on-screen QR code. The audience must grasp the story fast, with a presenter talking over it.

## Product Purpose
A two-sided mall demo. Shopper side: a visitor scans a QR code at the entrance, says what they need ("2 hours, kids, sneakers under 400, lunch"), and gets a walking route with matched offers that replans itself when the crowd moves. Operator side: the mall sees footfall, which offers converted, which tenants are underperforming, and what the agents did. Success is the executive seeing the cause-and-effect moment: lunch spot gets busy, shopper is rerouted next door with a coupon, an underperforming tenant gains a table.

## Positioning
Five cooperating agents (intent parser, offer matcher, A* route planner, live-crowd agent, KPI upsell agent) where every route, time, price and discount comes from code; Gemini only reads the shopper's words. The upsell agent serves mall-side KPIs (tenants below target) while the shopper still saves money.

## Operating Context
Presenter-led walkthrough: chat or prompt, plan, simulated walk, crowd surge (button or automatic), reroute and coupon, switch to operator console. Backend FastAPI :8004, web Next.js :3004 (LAN-reachable for the QR). Sessions in memory; restarting resets. Keys: O switches view, S simulates the surge.

## Capabilities and Constraints
- Scenario, agents, numbers, flows and features are fixed; the visual design and screen layout may be replaced completely.
- 60 invented stores, fictional floor plan, prices in AED; units U-01..U-60, play zone P-01.
- A* runs in the Python backend; the frontend draws its graph.
- Gemini concierge with rules fallback; ~4-8 s per Gemini call.

## Brand Commitments
Client name "Dalma Mall" may appear in copy. No client logos, no imitation of client brand colours; the demo uses its own visual identity.

## Evidence on Hand
- Store photos: `web/public/img` (Creative Commons via Openverse; attribution in `IMAGE_CREDITS.md`, must travel with the demo).
- All stores, offers, footfall and KPIs are synthetic (`backend/app/data/mall.json`); never present them as real Dalma Mall data.

## Product Principles
1. The story lands in one viewing: each screen makes one moment obvious.
2. Show the machinery: numbers and agent steps are inspectable, and nothing is faked.
3. Shopper side feels like a consumer product; operator side feels like a working tool.
4. Projector-proof: legible at a distance, calm under a presenter's narration.
