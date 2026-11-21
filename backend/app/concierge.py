"""Concierge chat: the first thing the shopper talks to. Gemini chats with them, grounded in the mall's real stores,
offers and crowd, until it knows enough to plan; then it hands a structured intent to the planner.
Vague or empty messages get concrete suggestions instead of a plan. Rules fallback if Gemini is unavailable."""
import time

from app import agents, llm
from app.agents import INTENT_SCHEMA, START_MINUTE, hhmm
from app.mall import MALL, OFFERS, OFFERS_BY_STORE, STORES

SAMPLE = "I have 2 hours, kids with me, want sneakers under 400 and lunch."

CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "suggestions": {"type": "array", "items": {"type": "string"}},
        "ready": {"type": "boolean"},
        "intent": INTENT_SCHEMA,
    },
    "required": ["reply", "suggestions", "ready", "intent"],
}


def _mall_context(minute: float) -> str:
    lines = []
    for s in STORES.values():
        offers = "; ".join(f"{o['title']}" + (f" AED {o['price']} (was {o['was']})" if o["price"] else "")
                           for o in OFFERS_BY_STORE.get(s["id"], []))
        extra = ""
        if "restaurant" in s:
            extra = f" [rated {s['restaurant']['rating']}, {'family-friendly, ' if s['restaurant']['family_friendly'] else ''}wait now {agents.wait_minutes(s['id'], minute)} min]"
        lines.append(f"- {s['name']} ({s['category']}){extra}: {offers or 'no offer'}")
    return "\n".join(lines)


SYSTEM = """You are the concierge chat of {mall}, on a shopper's phone after they scanned the QR code at the Main Entrance.
It is Saturday {clock}. Prices are AED.

Your job is to understand what the shopper wants so the route planner can map their visit.
- The welcome message was already shown: never greet or say "welcome" again.
- Replies: warm, concrete, at most 2 short sentences (under 40 words). Name real stores and offers from MALL DATA. Never invent stores, prices or offers.
- If the message is empty or vague ("hi", "what's good?", "just looking"), do NOT plan: suggest 2-3 specific things, preferring HIGHLIGHTS (best deals, play zone, restaurants with no queue) and ask what they fancy.
- Set ready=true as soon as you know at least one concrete thing they want (something to buy, a meal, the play zone, a movie). Do not ask about time: it defaults to 120 minutes. Ask at most one clarifying question in the whole chat; if you have already asked one, be ready.
- When ready, the reply confirms in one short sentence what you'll plan, without naming stores (the planner picks them), e.g. "Perfect, mapping sneakers, play time and lunch for you."
- suggestions: 2-4 short tap-to-send replies written in the shopper's voice that follow from your reply (under 8 words each). Empty when ready.
- intent: your best reading of the whole chat so far. time_budget_min defaults to 120, adults to 1; kids mentioned but not counted means 2; max_price_aed 0 means no limit; wants_play_area true when kids are along; summary is one friendly second-person sentence restating the plan.

HIGHLIGHTS:
{highlights}

MALL DATA (store (category): offers):
{context}"""


def _highlights(minute: float) -> str:
    deals = sorted((o for o in OFFERS.values() if o["was"] and 20 <= o["price"] < 500), key=lambda o: -o["discount_pct"])[:5]
    quiet = sorted((s for s in STORES.values() if "restaurant" in s), key=lambda s: agents.wait_minutes(s["id"], minute))[:3]
    return "\n".join([*(f"- {o['title']} at {STORES[o['store_id']]['name']}: AED {o['price']} (was {o['was']}, {o['discount_pct']}% off)" for o in deals),
                      "- Jungle Jam Play Zone: 1-hour play pass for 2 kids AED 70",
                      *(f"- {s['name']} ({s['category']}): no queue right now" for s in quiet)])


def greeting() -> dict:
    """Instant, data-driven opener (no LLM call, so the screen never waits on load)."""
    minute = START_MINUTE
    return {
        "reply": f"Welcome to {MALL['name']}! It's {hhmm(minute)} and the food court is still quiet. "
                 f"Tell me how long you have and what you're after, and I'll map your visit with today's offers.",
        "suggestions": [SAMPLE, "What deals are on today?", "Somewhere for the kids to play", "Lunch with no queue"],
        "ready": False, "source": "live data",
    }


def chat(messages: list[dict]) -> dict:
    """messages: [{role: 'user'|'concierge', text}]. Returns reply, suggestions, ready, intent (when ready), source."""
    if not messages:
        return greeting()
    t0 = time.time()
    last = messages[-1]["text"].strip() if messages[-1]["role"] == "user" else ""
    transcript = "\n".join(f"{'Shopper' if m['role'] == 'user' else 'Concierge'}: {m['text'].strip() or '(sent an empty message)'}"
                           for m in messages[-12:])
    system = SYSTEM.format(mall=MALL["name"], clock=hhmm(START_MINUTE), context=_mall_context(START_MINUTE), highlights=_highlights(START_MINUTE))
    try:
        out, tokens = llm.generate_json(f"Conversation so far:\n{transcript}\n\nRespond to the shopper's last message.", system, CHAT_SCHEMA)
        out["source"], out["tokens"] = "gemini", tokens
        if not last and out.get("ready"):
            out["ready"] = _has_goal(agents.normalize_intent(out["intent"]))  # an empty message alone never starts a plan
    except Exception as e:  # noqa: BLE001 - never stall on stage
        out = _fallback(messages, last)
        out["source"], out["error"] = "rules", str(e)
    out["suggestions"] = [s for s in out.get("suggestions", []) if s.strip()][:4]
    if out["ready"]:
        out["intent"] = agents.normalize_intent(out["intent"])
        out["ready"] = _has_goal(out["intent"])
    if not out["ready"]:
        out.pop("intent", None)
        if not out["suggestions"]:
            out["suggestions"] = greeting()["suggestions"]
    out["ms"] = int((time.time() - t0) * 1000)
    return out


def _has_goal(intent: dict) -> bool:
    return bool(intent["shopping"]) or intent["meal"] != "none" or intent.get("wants_play_area", False)


def _fallback(messages: list[dict], last: str) -> dict:
    said = " ".join(m["text"] for m in messages if m["role"] == "user")
    intent = agents._parse_rules(said)
    if last and _has_goal(intent):
        return {"reply": "Got it, mapping that out for you now.", "suggestions": [], "ready": True, "intent": intent}
    deals = sorted((o for o in OFFERS.values() if o["was"] and o["price"] < 500), key=lambda o: -o["discount_pct"])[:2]
    ideas = ", ".join(f"{o['title']} at {STORES[o['store_id']]['name']} ({o['discount_pct']}% off)" for o in deals)
    reply = (f"Happy to help! Popular right now: {ideas}, and Jungle Jam Play Zone if the kids are with you. What do you fancy?"
             if not last else "I can plan shopping, lunch or play time. What are you after today?")
    return {"reply": reply, "suggestions": [SAMPLE, "Show me sneaker deals", "Just lunch, kids with me", "A gift under 200"], "ready": False}
