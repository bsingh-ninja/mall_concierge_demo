"""The five concierge agents. Only the intent parser calls an LLM; the rest is plain code over mall.json.

Times are minutes after midnight on a Saturday; the demo starts at 11:40.
"""
import hashlib
import re
import time
from itertools import permutations

from app import llm
from app.mall import MALL, NODES, OFFERS, OFFERS_BY_STORE, STORES, astar, metres, walk_minutes

START_MINUTE = 11 * 60 + 40
TAGS = ["sneakers", "footwear", "fashion", "kids", "toys", "electronics", "beauty", "books", "gifts", "home",
        "eyewear", "jewellery", "sports", "grocery", "coffee", "dessert", "cinema", "pets", "pharmacy"]
DWELL = {"shop": 20, "play": 30, "meal": 40, "upsell": 10}
UNDERPERFORMING = 85  # % of sales target below which a tenant is flagged
BOOSTED: set[str] = set()  # tenants the operator gave a proximity boost; the upsell agent favours them


def hhmm(minute: float) -> str:
    m = int(round(minute))
    return f"{m // 60:02d}:{m % 60:02d}"


# ── 1. Intent parser ────────────────────────────────────────────────────────────────────────────────

INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "time_budget_min": {"type": "integer"},
        "adults": {"type": "integer"},
        "kids": {"type": "integer"},
        "shopping": {"type": "array", "items": {"type": "object", "properties": {
            "label": {"type": "string"}, "tag": {"type": "string", "enum": TAGS},
            "max_price_aed": {"type": "number"}}, "required": ["label", "tag", "max_price_aed"]}},
        "meal": {"type": "string", "enum": ["none", "breakfast", "lunch", "dinner", "snack"]},
        "cuisine": {"type": "string"},
        "wants_play_area": {"type": "boolean"},
        "summary": {"type": "string"},
    },
    "required": ["time_budget_min", "adults", "kids", "shopping", "meal", "cuisine", "wants_play_area", "summary"],
}
INTENT_SYSTEM = (
    "You read a shopper's message typed into a mall concierge in the UAE and return their intent as JSON. "
    "Prices are AED. time_budget_min defaults to 120. adults defaults to 1. If kids are mentioned but not counted, use 2. "
    "max_price_aed is 0 when no limit is given. Pick the closest tag for each thing they want to buy. "
    "wants_play_area is true when kids are with them, unless they say otherwise. cuisine is empty unless stated. "
    "summary is one short friendly sentence in second person restating the plan, under 20 words."
)

KEYWORDS = [  # (regex, label, tag) for the rules fallback
    (r"sneakers?|trainers?|kicks|running shoes", "sneakers", "sneakers"),
    (r"\bshoes?\b", "shoes", "footwear"),
    (r"toys?|lego", "toys", "toys"),
    (r"phone|headphones?|earbuds|laptop|gadget", "electronics", "electronics"),
    (r"perfume|makeup|beauty|skincare", "beauty", "beauty"),
    (r"books?", "books", "books"),
    (r"gifts?|present", "a gift", "gifts"),
    (r"sunglasses|glasses", "sunglasses", "eyewear"),
    (r"jeans|dress|shirt|clothes|outfit", "clothes", "fashion"),
]


def _parse_rules(text: str) -> dict:
    t = text.lower()
    budget = 120
    if m := re.search(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", t):
        budget = int(float(m.group(1)) * 60)
    elif m := re.search(r"(\d+)\s*(?:minutes?|mins?)\b", t):
        budget = int(m.group(1))
    elif "an hour" in t:
        budget = 60
    kids = 0
    if m := re.search(r"(\d+|two|three|one)\s*(?:kids|children|boys|girls)", t):
        kids = {"one": 1, "two": 2, "three": 3}.get(m.group(1)) or int(m.group(1))
    elif re.search(r"\b(kids?|children|son|daughter|toddler)\b", t):
        kids = 2 if re.search(r"kids|children", t) else 1
    adults = 2 if re.search(r"\b(wife|husband|partner|we)\b", t) else 1
    shopping = []
    for pattern, label, tag in KEYWORDS:
        if (m := re.search(pattern, t)) and tag not in {s["tag"] for s in shopping}:
            if tag == "footwear" and any(s["tag"] == "sneakers" for s in shopping):
                continue
            price = re.search(r"(?:under|below|less than|max|up to|<)\s*(?:aed|dhs?)?\s*(\d+)", t[m.end():m.end() + 30])
            shopping.append({"label": label, "tag": tag, "max_price_aed": float(price.group(1)) if price else 0})
    meal = next((w for w in ("breakfast", "lunch", "dinner") if w in t), "snack" if re.search(r"coffee|snack|ice cream", t) else "none")
    parts = [f"{budget // 60} hours" if budget % 60 == 0 else f"{budget} minutes"]
    if kids:
        parts.append("kids in tow")
    summary = "You have " + ", ".join(parts) + (": " + ", ".join(s["label"] for s in shopping) if shopping else "") + \
              (f", then {meal}" if meal != "none" else "") + "."
    return {"time_budget_min": budget, "adults": adults, "kids": kids, "shopping": shopping, "meal": meal, "cuisine": "",
            "wants_play_area": kids > 0, "summary": summary}


def parse_intent(text: str) -> tuple[dict, dict]:
    t0 = time.time()
    try:
        intent, tokens = llm.generate_json(text, INTENT_SYSTEM, INTENT_SCHEMA)
        source, detail = "gemini", f"Gemini read the message ({tokens} tokens)"
    except Exception as e:  # noqa: BLE001 - any failure falls back to rules so the demo never stalls
        intent = _parse_rules(text)
        source, detail = "rules", f"Rules parser used ({e})"
    return normalize_intent(intent), intent_trace(intent, detail, source, int((time.time() - t0) * 1000))


def normalize_intent(intent: dict) -> dict:
    intent["shopping"] = [s for s in intent.get("shopping", []) if s.get("tag") in TAGS]
    intent["time_budget_min"] = max(30, min(int(intent.get("time_budget_min") or 120), 360))
    intent["adults"] = max(1, int(intent.get("adults") or 1))
    intent["kids"] = max(0, int(intent.get("kids") or 0))
    intent.setdefault("cuisine", "")
    intent.setdefault("summary", "")
    if intent.get("meal") not in ("none", "breakfast", "lunch", "dinner", "snack"):
        intent["meal"] = "none"
    return intent


def intent_trace(intent: dict, detail: str, source: str, ms: int = 0) -> dict:
    bits = [f"{intent['time_budget_min']} min", f"{intent['adults']} adult{'s' if intent['adults'] != 1 else ''}"]
    if intent["kids"]:
        bits.append(f"{intent['kids']} kid{'s' if intent['kids'] != 1 else ''}")
    for s in intent["shopping"]:
        bits.append(s["label"] + (f" ≤ AED {s['max_price_aed']:.0f}" if s["max_price_aed"] else ""))
    if intent["meal"] != "none":
        bits.append(intent["meal"])
    return {"agent": "intent", "title": ", ".join(bits), "detail": detail, "source": source, "ms": ms}


# ── 2. Live crowd (simulated footfall) ───────────────────────────────────────────────────────────────

def _noise(key: str, minute: float) -> float:
    h = hashlib.md5(f"{key}{int(minute) // 5}".encode()).digest()[0]
    return (h / 255 - 0.5) * 0.1


def _curve(category: str, minute: float) -> float:
    if category in ("restaurant", "cafe"):
        # lunch peak 12:30-13:45
        if minute < 12 * 60:
            return 0.35 + 0.4 * (minute - 11 * 60) / 60
        if minute < 12 * 60 + 30:
            return 0.75 + 0.15 * (minute - 12 * 60) / 30
        return 0.9 if minute < 13 * 60 + 45 else 0.7
    return min(1.0, 0.6 + 0.3 * (minute - 11 * 60) / 180)


def occupancy(store_id: str, minute: float, surges: dict | None = None) -> float:
    if surges and store_id in surges and minute >= surges[store_id]:
        return 0.98
    s = STORES[store_id]
    return round(max(0.05, min(0.97, s["popularity"] * _curve(s["category"], minute) + _noise(store_id, minute))), 2)


def wait_minutes(store_id: str, minute: float, surges: dict | None = None) -> int:
    if surges and store_id in surges and minute >= surges[store_id]:
        return 32
    return max(0, round((occupancy(store_id, minute) - 0.6) * 40))


def crowd_snapshot(minute: float, surges: dict | None = None) -> dict[str, float]:
    return {sid: occupancy(sid, minute, surges) for sid in STORES}


# ── 3. Offer matcher ────────────────────────────────────────────────────────────────────────────────

def match_offers(intent: dict, minute: float) -> tuple[list[dict], dict | None, dict]:
    """Returns (shopping picks, restaurant pick, trace). Each pick: store, offer, alternatives, rejected."""
    kids = intent["kids"] > 0
    picks, notes = [], []
    for want in intent["shopping"]:
        cap = want["max_price_aed"] or 1e9
        tagged = [o for o in OFFERS.values() if want["tag"] in o["tags"] and o["price"] > 0
                  and ("kids" not in o["tags"] or want["tag"] in ("kids", "toys"))]
        fits = [o for o in tagged if o["price"] <= cap]
        over = sorted([o for o in tagged if o["price"] > cap], key=lambda o: o["price"])

        def score(o):
            s = STORES[o["store_id"]]
            kid_range = kids and any(x["kid_friendly"] for x in OFFERS_BY_STORE[o["store_id"]] if x is not o)
            return o["discount_pct"] + (12 if kid_range else 0) + 10 * s["popularity"] - 10 * occupancy(s["id"], minute)

        ranked = sorted(fits, key=score, reverse=True)
        if not ranked:
            notes.append(f"No {want['label']} under AED {cap:.0f} today")
            continue
        best = ranked[0]
        extra = next((x for x in OFFERS_BY_STORE[best["store_id"]] if x is not best and x["kid_friendly"]), None) if kids else None
        picks.append({"want": want, "store_id": best["store_id"], "offer_id": best["id"], "extra_offer_id": extra and extra["id"],
                      "alternatives": [o["id"] for o in ranked[1:3]], "rejected": [o["id"] for o in over[:2]]})
        line = f"{want['label']}: {STORES[best['store_id']]['name']} AED {best['price']} (was {best['was']})"
        if over:
            line += f"; skipped {STORES[over[0]['store_id']]['name']} at AED {over[0]['price']}, over budget"
        notes.append(line)

    restaurant = None
    if intent["meal"] in ("lunch", "dinner", "breakfast"):
        arrive = minute + 60
        cands = [s for s in STORES.values() if "restaurant" in s and (s["restaurant"]["family_friendly"] or not kids)]

        def rscore(s):
            offer = max((o["discount_pct"] for o in OFFERS_BY_STORE.get(s["id"], [])), default=0)
            cuisine = 15 if intent["cuisine"] and intent["cuisine"].lower() in " ".join(
                t for o in OFFERS_BY_STORE.get(s["id"], []) for t in o["tags"]) else 0
            return 30 * (s["restaurant"]["rating"] - 4) + 0.4 * offer + cuisine - 0.6 * wait_minutes(s["id"], arrive)

        best = max(cands, key=rscore)
        restaurant = {"store_id": best["id"], "offer_id": OFFERS_BY_STORE[best["id"]][0]["id"], "forecast_wait": wait_minutes(best["id"], arrive)}
        notes.append(f"{intent['meal']}: {best['name']} (rated {best['restaurant']['rating']}, ~{restaurant['forecast_wait']} min wait forecast)")

    n_checked = sum(1 for _ in OFFERS)
    trace = {"agent": "offers", "title": f"{len(picks)} match{'es' if len(picks) != 1 else ''} from {n_checked} live offers across {len(STORES)} stores",
             "detail": "; ".join(notes)}
    return picks, restaurant, trace


# ── 4. Route planner (A* on the corridor graph) ──────────────────────────────────────────────────────

def _stop(store_id: str, purpose: str, dwell: int, offer_id: str | None = None, note: str = "") -> dict:
    s = STORES[store_id]
    return {"store_id": store_id, "name": s["name"], "purpose": purpose, "node": s["door"], "dwell": dwell,
            "offer_id": offer_id, "note": note}


def _walk_total(seq: list[dict], start: str, end: str) -> float:
    nodes = [start, *[s["node"] for s in seq], end]
    return sum(astar(a, b)[1] for a, b in zip(nodes, nodes[1:]))


def order_stops(stops: list[dict], start: str, end: str) -> list[dict]:
    """Shortest walking order; the meal always comes last."""
    meal = [s for s in stops if s["purpose"] == "meal"]
    rest = [s for s in stops if s["purpose"] != "meal"]
    best = min(permutations(rest), key=lambda p: _walk_total([*p, *meal], start, end)) if rest else ()
    return [*best, *meal]


def build_timeline(stops: list[dict], start: str, end: str, start_minute: float, fixed: list[dict] | None = None) -> dict:
    """Times every stop and walking leg. `fixed` stops (already visited) keep their times; walking resumes after the last."""
    fixed = fixed or []
    timed, legs = [dict(s) for s in fixed], []
    for i in range(len(fixed) - 1):
        legs.append(_leg(fixed[i]["node"], fixed[i + 1]["node"], fixed[i]["depart"]))
    if fixed:
        legs.insert(0, _leg(start, fixed[0]["node"], start_minute))
    cur_node = fixed[-1]["node"] if fixed else start
    clock = fixed[-1]["depart"] if fixed else start_minute
    for s in stops:
        leg = _leg(cur_node, s["node"], clock)
        legs.append(leg)
        s = dict(s, arrive=leg["arrive"], depart=leg["arrive"] + s["dwell"])
        timed.append(s)
        cur_node, clock = s["node"], s["depart"]
    exit_leg = _leg(cur_node, end, clock)
    legs.append(exit_leg)
    for i, s in enumerate(timed):
        s["idx"] = i
        s["x"], s["y"] = NODES[s["node"]]["x"], NODES[s["node"]]["y"]
    walk_units = sum(leg["units"] for leg in legs)
    return {"stops": timed, "legs": legs, "start_minute": start_minute, "end_minute": exit_leg["arrive"],
            "total_min": round(exit_leg["arrive"] - start_minute), "walk_m": metres(walk_units),
            "walk_min": round(walk_minutes(walk_units)), "start": start, "end": end}


def _leg(a: str, b: str, depart: float) -> dict:
    path, units = astar(a, b)
    mins = round(walk_minutes(units), 1)
    return {"from": a, "to": b, "points": [[NODES[n]["x"], NODES[n]["y"]] for n in path], "units": units,
            "metres": metres(units), "walk_min": mins, "depart": depart, "arrive": round(depart + max(mins, 0.5), 1)}


def plan_route(stops: list[dict], budget: int, start_minute: float) -> tuple[dict, dict]:
    start = end = MALL["entrance"]
    stops = order_stops(stops, start, end)
    plan = build_timeline(stops, start, end, start_minute)
    adjustments = []
    # Fit the time budget: shorten play, then drop the suggested stop, then shorten the meal.
    for purpose, floor in (("play", 20), ("upsell", 0), ("meal", 30)):
        over = plan["total_min"] - budget
        if over <= 0:
            break
        for s in stops:
            if s["purpose"] == purpose:
                cut = min(over, s["dwell"] - floor)
                s["dwell"] -= cut
                adjustments.append(f"{s['name']} {'dropped' if s['dwell'] == 0 else f'-{cut:.0f} min'}")
        stops = [s for s in stops if s["dwell"] > 0]
        plan = build_timeline(stops, start, end, start_minute)
    order = " → ".join(s["name"] for s in plan["stops"])
    trace = {"agent": "route", "title": f"{len(plan['stops'])} stops, {plan['walk_m']} m walking, back at the entrance by {hhmm(plan['end_minute'])}",
             "detail": f"A* on {len(NODES)} graph nodes; order {order}" + (f"; trimmed to fit: {', '.join(adjustments)}" if adjustments else "")}
    return plan, trace


# ── 5. Upsell (mall-side KPIs) ───────────────────────────────────────────────────────────────────────

def pick_upsell(intent: dict, stops: list[dict], budget: int, start_minute: float) -> tuple[dict | None, dict]:
    """A nearby offer from an underperforming tenant that suits this party and costs at most 3 minutes of walking."""
    start = end = MALL["entrance"]
    used = {s["store_id"] for s in stops}
    base_walk = _walk_total(order_stops(stops, start, end), start, end)
    base_total = build_timeline(order_stops(stops, start, end), start, end, start_minute)["total_min"]
    best = None
    for o in OFFERS.values():
        s = STORES[o["store_id"]]
        if o["store_id"] in used or s["kpi"]["sales_vs_target"] >= UNDERPERFORMING or "restaurant" in s:
            continue
        if intent["kids"] and not o["kid_friendly"]:
            continue
        cand = _stop(o["store_id"], "upsell", DWELL["upsell"], o["id"])
        detour = walk_minutes(_walk_total(order_stops([*stops, cand], start, end), start, end) - base_walk)
        if detour > 3 or base_total + detour + DWELL["upsell"] > budget:
            continue
        gap = UNDERPERFORMING - s["kpi"]["sales_vs_target"]
        score = gap - 5 * detour + (10 if o["funded_by"] == "mall" else 0) + (25 if o["store_id"] in BOOSTED else 0)
        if not best or score > best[0]:
            best = (score, cand, detour, o, s)
    if not best:
        return None, {"agent": "upsell", "title": "No suggestion fits this visit", "detail": "No underperforming tenant within a 3-minute detour"}
    _, cand, detour, o, s = best
    cand["note"] = "Right on your way" if detour < 1 else f"{detour:.0f} min detour"
    cand["kpi_reason"] = (f"{s['name']} is at {s['kpi']['sales_vs_target']}% of sales target; "
                          f"{'mall-funded' if o['funded_by'] == 'mall' else 'tenant'} offer, +{detour:.1f} min walk")
    trace = {"agent": "upsell", "title": f"Suggest {s['name']}: {o['title']}", "detail": cand["kpi_reason"]}
    return cand, trace


# ── Reroute (crowd agent + upsell agent working together mid-visit) ──────────────────────────────────

def pick_alternative(planned_id: str, minute: float, surges: dict, kids: bool) -> dict:
    planned = STORES[planned_id]
    best = None
    for s in STORES.values():
        if "restaurant" not in s or s["id"] == planned_id or (kids and not s["restaurant"]["family_friendly"]):
            continue
        dist = astar(planned["door"], s["door"])[1]
        wait = wait_minutes(s["id"], minute, surges)
        offer = OFFERS_BY_STORE[s["id"]][0]
        score = -dist / 10 - 1.5 * wait + (20 if offer["funded_by"] == "mall" else 0) + 10 * (s["restaurant"]["rating"] - 4)
        if not best or score > best[0]:
            best = (score, s, dist, wait, offer)
    _, s, dist, wait, offer = best
    return {"store": s, "metres": metres(dist), "wait": wait, "offer": offer}
