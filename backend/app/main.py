from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app import concierge, engine
from app.mall import MALL, OFFERS_BY_STORE, UNIT

app = FastAPI(title="Mall Concierge API")


class PlanIn(BaseModel):
    text: str
    intent: dict | None = None  # from the concierge chat; skips a second parse
    source: str = "gemini"
    turns: int = 1


class ChatMsg(BaseModel):
    role: str
    text: str


class ChatIn(BaseModel):
    messages: list[ChatMsg]


class TickIn(BaseModel):
    minute: float


class ClaimIn(BaseModel):
    offer_id: str


def _session(sid: str):
    if sid not in engine.SESSIONS:
        raise HTTPException(404, "Session expired; the API was restarted. Plan again.")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/mall")
def mall():
    out = {k: MALL[k] for k in ("name", "viewBox", "corridors", "entrance", "atrium", "nodes")}
    out["stores"] = [{**s, "unit": UNIT[s["id"]], "offers": OFFERS_BY_STORE.get(s["id"], [])} for s in MALL["stores"]]
    out["graph"] = engine.graph()
    return out


@app.get("/api/deals")
def deals():
    """Best current offers, for the home screen's photo cards."""
    from app.mall import OFFERS, STORES
    best = sorted((o for o in OFFERS.values() if o["was"] and 20 <= o["price"] < 500), key=lambda o: -o["discount_pct"])[:6]
    return [{"store_id": o["store_id"], "store_name": STORES[o["store_id"]]["name"], "category": STORES[o["store_id"]]["category"],
             "title": o["title"], "price": o["price"], "was": o["was"], "discount_pct": o["discount_pct"]} for o in best]


@app.post("/api/plan")
def plan(body: PlanIn):
    return engine.create_plan(body.text.strip() or concierge.SAMPLE, body.intent, body.source, body.turns)


@app.post("/api/chat")
def chat(body: ChatIn):
    return concierge.chat([m.model_dump() for m in body.messages])


@app.post("/api/sessions/{sid}/start")
def start(sid: str):
    _session(sid)
    return engine.start(sid)


@app.post("/api/sessions/{sid}/tick")
def tick(sid: str, body: TickIn):
    _session(sid)
    return engine.tick(sid, body.minute)


@app.post("/api/sessions/{sid}/surge")
def surge(sid: str):
    _session(sid)
    return engine.surge(sid)


@app.post("/api/tenants/{store_id}/boost")
def boost(store_id: str, session: str | None = None):
    if store_id not in engine.STORES:
        raise HTTPException(404, "Unknown tenant")
    return engine.boost(store_id, session)


@app.post("/api/sessions/{sid}/claim")
def claim(sid: str, body: ClaimIn):
    _session(sid)
    return engine.claim(sid, body.offer_id)


@app.get("/api/operator")
def operator(session: str | None = None):
    return engine.operator(session)
