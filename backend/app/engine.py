"""Shopper sessions: plan a visit, advance the simulated clock, reroute when the crowd agent sees a queue, and
aggregate everything into the operator console. State lives in memory; restarting the API resets the demo.

Every agent step is also recorded as JSON (input -> output) so the console can prove that times, prices and
discounts come from code, not from the language model."""
import statistics
import uuid

from app import agents
from app.agents import DWELL, START_MINUTE, hhmm
from app.mall import MALL, OFFERS, STORES, UNIT, WALK_M_PER_MIN, astar, metres

SESSIONS: dict[str, dict] = {}
# Activity earlier today, so the console isn't empty before the first demo visit.
SEED = {"sessions": 1284, "rerouted": 41, "dwell_min": 112}


def create_plan(text: str, intent: dict | None = None, source: str = "gemini", turns: int = 1) -> dict:
    """Plan from free text, or from an intent the concierge already built (no second LLM call)."""
    minute = START_MINUTE
    if intent:
        intent = agents.normalize_intent(intent)
        how = "Gemini read the request" if source == "gemini" else "Rules parser read the request"
        t_intent = agents.intent_trace(intent, f"{how} ({turns} message{'s' if turns != 1 else ''})", source)
    else:
        intent, t_intent = agents.parse_intent(text)
    snapshot = agents.crowd_snapshot(minute)
    busiest = sorted(snapshot.items(), key=lambda kv: -kv[1])[:3]
    t_crowd = {"agent": "crowd", "title": "Busiest now: " + ", ".join(f"{STORES[s]['name']} {int(v * 100)}%" for s, v in busiest),
               "detail": "Simulated footfall sensors in all 60 units, refreshed every 5 minutes"}
    picks, restaurant, t_offers = agents.match_offers(intent, minute)

    stops = [agents._stop(p["store_id"], "shop", DWELL["shop"], p["offer_id"], f"For {p['want']['label']}") for p in picks]
    if intent["wants_play_area"]:
        play = next(s for s in STORES.values() if s["category"] == "play")
        stops.append(agents._stop(play["id"], "play", DWELL["play"], next(o["id"] for o in OFFERS.values() if o["store_id"] == play["id"]),
                                  "Kids play while you take a break"))
    if restaurant:
        stops.append(agents._stop(restaurant["store_id"], "meal", DWELL["meal"], restaurant["offer_id"],
                                  f"{intent['meal'].capitalize()}, ~{restaurant['forecast_wait']} min wait"))
    upsell, t_upsell = agents.pick_upsell(intent, stops, intent["time_budget_min"], minute)
    if upsell:
        stops.append(upsell)
    plan, t_route = agents.plan_route(stops, intent["time_budget_min"], minute)

    sid = uuid.uuid4().hex[:8]
    sess = {
        "id": sid, "text": text, "intent": intent, "plan": plan, "picks": picks, "minute": minute,
        "surges": {}, "rerouted": False, "force_surge": False, "claimed": set(), "redeemed": set(),
        "shown": {s["offer_id"] for s in plan["stops"] if s["offer_id"]}, "events": [], "coupon": None, "trace": [],
    }
    SESSIONS[sid] = sess
    _trace(sess, "Intent Parser", {"text": text, "source": source}, intent)
    _trace(sess, "Live-Crowd Agent", {"minute": hhmm(minute)},
           {"busiest": {UNIT[s]: round(v, 2) for s, v in busiest},
            "restaurant_forecast_wait_min": restaurant and restaurant["forecast_wait"]})
    _trace(sess, "Offer Matcher", {"wants": intent["shopping"], "meal": intent["meal"], "kids": intent["kids"]},
           {"picks": [{"unit": UNIT[p["store_id"]], "store": STORES[p["store_id"]]["name"], "offer": OFFERS[p["offer_id"]]["title"],
                       "price_aed": OFFERS[p["offer_id"]]["price"], "cap_aed": p["want"]["max_price_aed"] or None,
                       "rejected_over_cap": [f"{STORES[OFFERS[o]['store_id']]['name']} AED {OFFERS[o]['price']}" for o in p["rejected"]]} for p in picks],
            "restaurant": restaurant and {"unit": UNIT[restaurant["store_id"]], "store": STORES[restaurant["store_id"]]["name"]}})
    _trace(sess, "KPI Upsell Agent", {"rule": f"tenant below {agents.UNDERPERFORMING}% of target, detour <= 3 min, fits budget"},
           upsell and {"unit": UNIT[upsell["store_id"]], "store": upsell["name"], "reason": upsell.get("kpi_reason")})
    _trace(sess, "A* Route Planner", {"stops": [UNIT[s["store_id"]] for s in stops], "budget_min": intent["time_budget_min"], "walk_m_per_s": 1.2},
           _route_summary(plan))
    return {"session_id": sid, "intent": intent, "plan": plan, "trace": [t_intent, t_crowd, t_offers, t_upsell, t_route],
            "offers": _offer_cards(sess)}


def _route_summary(plan: dict) -> dict:
    return {"order": [UNIT[s["store_id"]] for s in plan["stops"]],
            "legs": [{"to": UNIT.get(plan["stops"][i]["store_id"]) if i < len(plan["stops"]) else "Entrance",
                      "metres": leg["metres"], "walk_min": leg["walk_min"]} for i, leg in enumerate(plan["legs"])],
            "walk_m": plan["walk_m"], "total_min": plan["total_min"], "back_at": hhmm(plan["end_minute"])}


def _trace(sess: dict, agent: str, inp, out) -> None:
    sess["trace"].append({"agent": agent, "at": hhmm(sess["minute"]), "input": inp, "output": out})


def _offer_cards(sess: dict) -> list[dict]:
    cards = []
    for s in sess["plan"]["stops"]:
        if s["offer_id"]:
            cards.append({**OFFERS[s["offer_id"]], "store_name": s["name"], "purpose": s["purpose"], "stop_idx": s["idx"]})
    for p in sess["picks"]:
        if p["extra_offer_id"]:
            cards.append({**OFFERS[p["extra_offer_id"]], "store_name": STORES[p["store_id"]]["name"], "purpose": "extra"})
    return cards


def start(sid: str) -> dict:
    sess = SESSIONS[sid]
    sess["claimed"] |= sess["shown"]
    _event(sess, "route", f"Route accepted; {len(sess['shown'])} offers saved to wallet")
    return {"ok": True}


def tick(sid: str, minute: float) -> dict:
    """Advance the shopper's clock. Returns new events, and a new plan if the route changed."""
    sess = SESSIONS[sid]
    sess["minute"] = max(sess["minute"], minute)
    new_events, new_plan = [], None
    stops = sess["plan"]["stops"]
    meal_i = next((i for i, s in enumerate(stops) if s["purpose"] == "meal"), None)

    # The crowd agent watches the planned restaurant while the shopper is at the stop before it,
    # or immediately when the operator simulates the lunch surge.
    if meal_i and not sess["rerouted"] and stops[meal_i]["arrive"] > sess["minute"]:
        prev = stops[meal_i - 1]
        trigger = prev["arrive"] + min(8, prev["dwell"] / 2)
        if sess["force_surge"] or sess["minute"] >= trigger:
            new_events, new_plan = _reroute(sess, meal_i, sess["minute"])

    for s in sess["plan"]["stops"]:
        if s["offer_id"] in sess["claimed"] and s["arrive"] + 2 <= sess["minute"] and s["offer_id"] not in sess["redeemed"]:
            sess["redeemed"].add(s["offer_id"])
            new_events.append(_event(sess, "redeem", f"{OFFERS[s['offer_id']]['title']} redeemed at {s['name']}"))
    return {"minute": sess["minute"], "events": new_events, "plan": new_plan, "coupon": sess["coupon"] if new_plan else None,
            "offers": _offer_cards(sess) if new_plan else None}


def surge(sid: str) -> dict:
    """Operator button: the lunch crowd arrives now. Reroutes at once if lunch is still ahead."""
    sess = SESSIONS[sid]
    if sess["rerouted"]:
        return {"minute": sess["minute"], "events": [], "plan": None, "coupon": None, "offers": None, "note": "Already rerouted"}
    sess["force_surge"] = True
    return tick(sid, sess["minute"])


def _reroute(sess: dict, meal_i: int, minute: float) -> tuple[list[dict], dict]:
    stops = sess["plan"]["stops"]
    planned = stops[meal_i]
    budget = sess["intent"]["time_budget_min"]
    sess["surges"][planned["store_id"]] = minute
    wait = agents.wait_minutes(planned["store_id"], minute, sess["surges"])
    occ_planned = agents.occupancy(planned["store_id"], minute, sess["surges"])
    alt = agents.pick_alternative(planned["store_id"], minute, sess["surges"], sess["intent"]["kids"] > 0)
    s, offer = alt["store"], alt["offer"]
    old_total = sess["plan"]["total_min"] + wait  # staying means queueing first, which pushes everything after it back

    new_meal = agents._stop(s["id"], "meal", planned["dwell"], offer["id"], "Lunch, " + (f"{alt['wait']} min wait" if alt["wait"] else "no wait"))
    new_meal["replaces"] = planned["name"]
    fixed = stops[:meal_i]
    tail = [new_meal, *stops[meal_i + 1:]]
    plan = agents.build_timeline(tail, sess["plan"]["start"], sess["plan"]["end"], sess["plan"]["start_minute"], fixed=fixed)
    new_total = plan["total_min"] + alt["wait"]
    sess["plan"], sess["rerouted"], sess["force_surge"] = plan, True, False
    sess["shown"].add(offer["id"])
    occ_alt = agents.occupancy(s["id"], minute, sess["surges"])
    events = [
        _event(sess, "crowd", f"{planned['name']} ({UNIT[planned['store_id']]}) at {round(occ_planned * 100)}% capacity, {wait} min wait", alert=True),
        _event(sess, "route", f"Rerouted lunch to {s['name']} ({UNIT[s['id']]}), {alt['metres']} m away, {round(occ_alt * 100)}% capacity"),
        _event(sess, "upsell", f"Pushed {offer['discount_pct']}% lunch voucher for {s['name']} "
                               f"({s['kpi']['sales_vs_target']}% of sales target, {offer['funded_by']}-funded)"),
    ]
    sess["coupon"] = {"offer_id": offer["id"], "store_id": s["id"], "store_name": s["name"], "unit": UNIT[s["id"]], "title": offer["title"],
                      "discount_pct": offer["discount_pct"], "code": "DALMA15", "replaces": planned["name"], "replaces_unit": UNIT[planned["store_id"]],
                      "planned_wait": wait, "planned_occupancy": round(occ_planned * 100), "new_wait": alt["wait"],
                      "new_occupancy": round(occ_alt * 100), "metres": alt["metres"], "expires": hhmm(minute + 90),
                      "budget_min": budget, "old_total_min": old_total, "new_total_min": new_total}
    _trace(sess, "Live-Crowd Agent", {"watching": UNIT[planned["store_id"]], "minute": hhmm(minute)},
           {"occupancy": round(occ_planned, 2), "wait_min": wait, "route_with_queue_min": old_total, "budget_min": budget,
            "breaks_budget": old_total > budget})
    _trace(sess, "A* Route Planner", {"avoid": UNIT[planned["store_id"]], "from": UNIT[stops[meal_i - 1]["store_id"]] if meal_i else "Entrance"},
           {"new_lunch": UNIT[s["id"]], "metres_from_planned": alt["metres"], **_route_summary(plan), "total_with_wait_min": new_total})
    _trace(sess, "KPI Upsell Agent", {"tenant": UNIT[s["id"]], "sales_vs_target_pct": s["kpi"]["sales_vs_target"]},
           {"voucher": "DALMA15", "discount_pct": offer["discount_pct"], "funded_by": offer["funded_by"]})
    return events, plan


def claim(sid: str, offer_id: str) -> dict:
    sess = SESSIONS[sid]
    sess["claimed"].add(offer_id)
    _event(sess, "claim", f"Voucher claimed: {OFFERS[offer_id]['title']}")
    return {"ok": True}


def boost(store_id: str, sid: str | None) -> dict:
    """Operator action: the upsell agent favours this tenant in the next plans."""
    agents.BOOSTED.add(store_id)
    sess = SESSIONS.get(sid) if sid else None
    text = f"Proximity boost on for {STORES[store_id]['name']} ({UNIT[store_id]}); the KPI Upsell Agent will favour it on nearby routes"
    if sess:
        _event(sess, "upsell", text)
    else:
        BOOST_LOG.append({"kind": "upsell", "text": text, "time": hhmm(13 * 60), "alert": False, "session": ""})
    return {"ok": True, "boosted": sorted(agents.BOOSTED)}


BOOST_LOG: list[dict] = []


def _event(sess: dict, kind: str, text: str, alert: bool = False) -> dict:
    e = {"kind": kind, "text": text, "time": hhmm(sess["minute"]), "alert": alert, "session": sess["id"]}
    sess["events"].append(e)
    return e


def operator(sid: str | None) -> dict:
    sess = SESSIONS.get(sid) if sid else None
    minute = sess["minute"] if sess else 13 * 60
    surges = sess["surges"] if sess else {}
    occ = agents.crowd_snapshot(minute, surges)

    def live(o):
        st = dict(o["stats"])
        st["claims"] += sum(o["id"] in s["claimed"] for s in SESSIONS.values())
        st["redemptions"] += sum(o["id"] in s["redeemed"] for s in SESSIONS.values())
        st["impressions"] += sum(o["id"] in s["shown"] for s in SESSIONS.values())
        return st

    ledger = []
    for o in OFFERS.values():
        st = live(o)
        store = STORES[o["store_id"]]
        ledger.append({"id": o["id"], "unit": UNIT[o["store_id"]], "store": store["name"], "category": store["category"], "title": o["title"],
                       "funded_by": o["funded_by"], **st, "revenue_aed": st["redemptions"] * (o["price"] or 140),
                       "conversion": round(100 * st["redemptions"] / max(1, st["claims"]), 1),
                       "this_visit": bool(sess) and (o["id"] in sess["claimed"] or o["id"] in sess["redeemed"])})
    ranked = sorted((o for o in ledger if o["claims"] >= 30), key=lambda o: -o["conversion"])
    top, lagging = ranked[:6], ranked[-4:][::-1]
    live_rows = [o for o in ledger if o["this_visit"] and o not in top and o not in lagging]

    # Wing benchmark: average footfall of the tenant's wing (floorplan row).
    wings: dict[str, list[int]] = {}
    for s in STORES.values():
        wings.setdefault(s["zone"], []).append(s["kpi"]["footfall_today"])
    session_stores = {s["store_id"] for s in sess["plan"]["stops"]} if sess else set()
    under = []
    for s in sorted(STORES.values(), key=lambda s: s["kpi"]["sales_vs_target"]):
        if s["kpi"]["sales_vs_target"] >= agents.UNDERPERFORMING:
            break
        bench = statistics.mean(wings[s["zone"]])
        actions = list(dict.fromkeys(e["text"] for e in (sess["events"] if sess else []) if s["name"] in e["text"] and e["kind"] in ("upsell", "redeem", "route")))
        under.append({"id": s["id"], "unit": UNIT[s["id"]], "name": s["name"], "category": s["category"], **s["kpi"], "zone": s["zone"],
                      "wing_gap_pct": round(100 * (s["kpi"]["footfall_today"] - bench) / bench), "occupancy": occ[s["id"]],
                      "actions": actions, "on_route": s["id"] in session_stores, "boosted": s["id"] in agents.BOOSTED})

    impressions = sum(o["impressions"] for o in ledger)
    redemptions = sum(o["redemptions"] for o in ledger)
    live_dwell = [s["plan"]["total_min"] for s in SESSIONS.values()]
    dwell = (SEED["dwell_min"] * SEED["sessions"] + sum(live_dwell)) / (SEED["sessions"] + len(live_dwell))
    events = sorted([e for s in SESSIONS.values() for e in s["events"]] + BOOST_LOG, key=lambda e: e["time"])
    return {
        "minute": minute, "clock": hhmm(minute), "mall": MALL["name"],
        "telemetry": {
            "active_qr_sessions": SEED["sessions"] + len(SESSIONS),
            "redemption_rate_pct": round(100 * redemptions / max(1, impressions), 1),
            "redemptions": redemptions,
            "avg_dwell_min": round(dwell),
            "rerouted_parties": SEED["rerouted"] + sum(1 for s in SESSIONS.values() if s["rerouted"]),
            "revenue_aed": sum(o["revenue_aed"] for o in ledger),
        },
        "heat": {sid_: v for sid_, v in occ.items()},
        "surges": list(surges),
        "ledger": {"top": top, "lagging": lagging, "this_visit": live_rows},
        "underperformers": under,
        "events": events[-24:],
        "route": sess["plan"] if sess else None,
        "trace": sess["trace"] if sess else [],
    }


def graph() -> dict:
    """Corridor graph with edge weights in metres, for the 'Show A* graph' overlay."""
    return {"edges": [{"a": a, "b": b, "m": metres(astar(a, b)[1])} for a, b in MALL["edges"]], "walk_m_per_min": WALK_M_PER_MIN}
