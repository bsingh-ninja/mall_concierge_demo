"""The mall as data: stores, offers and the walking graph, plus A* over that graph."""
import heapq
import json
import math
from functools import lru_cache
from pathlib import Path

MALL = json.loads((Path(__file__).parent / "data" / "mall.json").read_text())
NODES = {n["id"]: n for n in MALL["nodes"]}
STORES = {s["id"]: s for s in MALL["stores"]}
OFFERS = {o["id"]: o for o in MALL["offers"]}
OFFERS_BY_STORE: dict[str, list[dict]] = {}
for _o in MALL["offers"]:
    OFFERS_BY_STORE.setdefault(_o["store_id"], []).append(_o)

# Unit numbers as printed on the floorplan: U-01..U-60 in floorplan order; the play zone is node P-01.
UNIT = {s["id"]: ("P-01" if s["category"] == "play" else f"U-{i + 1:02d}") for i, s in enumerate(MALL["stores"])}

ADJ: dict[str, list[str]] = {n: [] for n in NODES}
for _a, _b in MALL["edges"]:
    ADJ[_a].append(_b)
    ADJ[_b].append(_a)

UNIT_M = MALL["units_to_m"]
WALK_M_PER_MIN = 72  # 1.2 m/s: a family walking with kids


def _dist(a: str, b: str) -> float:
    na, nb = NODES[a], NODES[b]
    return math.hypot(na["x"] - nb["x"], na["y"] - nb["y"])


@lru_cache(maxsize=4096)
def astar(start: str, goal: str) -> tuple[tuple[str, ...], float]:
    """Shortest path on the corridor graph. Returns (node ids, length in SVG units)."""
    frontier = [(_dist(start, goal), 0.0, start)]
    came: dict[str, str | None] = {start: None}
    cost = {start: 0.0}
    while frontier:
        _, g, cur = heapq.heappop(frontier)
        if cur == goal:
            break
        if g > cost[cur]:
            continue
        for nxt in ADJ[cur]:
            ng = g + _dist(cur, nxt)
            if ng < cost.get(nxt, math.inf):
                cost[nxt] = ng
                came[nxt] = cur
                heapq.heappush(frontier, (ng + _dist(nxt, goal), ng, nxt))
    path, cur = [], goal
    while cur is not None:
        path.append(cur)
        cur = came[cur]
    return tuple(reversed(path)), cost[goal]


def walk_minutes(units: float) -> float:
    return units * UNIT_M / WALK_M_PER_MIN


def metres(units: float) -> int:
    return round(units * UNIT_M)
