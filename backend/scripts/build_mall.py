"""Builds app/data/mall.json: floor plan (store rectangles), walking graph, 60 stores, offers and tenant KPIs.

Run from backend/:  python scripts/build_mall.py
Everything is deterministic (fixed seed), so rebuilding gives the same mall.
Coordinates are SVG units in a 1200 x 760 viewBox; 1 unit = 0.3 m.
"""
import json
import random
from pathlib import Path

rng = random.Random(7)
OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "mall.json"

# Corridor centre lines (walkable). Each is (x1, y1, x2, y2).
CORRIDORS = {
    "H1": (120, 200, 1080, 200),
    "H2": (120, 560, 1080, 560),
    "V1": (120, 200, 120, 560),
    "V2": (600, 200, 600, 560),
    "V3": (1080, 200, 1080, 560),
    "ENT": (40, 380, 120, 380),
}

# Rows of shop units: x range, y range, number of units, which corridor the doors open onto, door side.
ROWS = [
    ("N", (145, 1055), (60, 175), 14, "H1", "bottom"),
    ("WT", (145, 575), (225, 370), 7, "H1", "top"),
    ("WB", (145, 575), (390, 535), 7, "H2", "bottom"),
    ("ET", (625, 1055), (225, 370), 7, "H1", "top"),
    ("EB", (625, 1055), (390, 535), 7, "H2", "bottom"),
    ("S", (145, 1055), (585, 700), 14, "H2", "top"),
]
# Anchor units: rect (x, y, w, h), corridor, door point.
ANCHORS = {
    "AWN": ((20, 60, 75, 270), "V1", (95, 270)),
    "AWS": ((20, 430, 75, 270), "V1", (95, 490)),
    "AEN": ((1105, 60, 75, 310), "V3", (1105, 290)),
    "AES": ((1105, 390, 75, 310), "V3", (1105, 470)),
}

# name, category, slot, tags. Category drives colour and offer templates.
STORES = [
    # North row (H1)
    ("Urban Sole", "footwear", "N1"), ("Linen & Loom", "fashion", "N2"), ("Velvet Rose", "fashion", "N3"),
    ("Gentry Tailors", "fashion", "N4"), ("Denim District", "fashion", "N5"), ("Glow Beauty", "beauty", "N6"),
    ("Aura Fragrances", "beauty", "N7"), ("Pixel Point", "electronics", "N8"), ("Gadget Garage", "electronics", "N9"),
    ("Opal Optics", "eyewear", "N10"), ("Golden Thread Jewellers", "jewellery", "N11"), ("Timekeeper", "jewellery", "N12"),
    ("Silk Route Abayas", "fashion", "N13"), ("Bean & Bloom Café", "cafe", "N14"),
    # West block, top (H1)
    ("Paper Trail Books", "books", "WT1"), ("Little Explorers", "kids", "WT2"), ("Kicks Lab", "footwear", "WT3"),
    ("Tiny Toes", "kids", "WT4"), ("Brick Box Toys", "toys", "WT5"), ("Sweet Tooth", "cafe", "WT6"),
    ("Jungle Jam Play Zone", "play", "WT7"),
    # West block, bottom (H2)
    ("Casa Living", "home", "WB1"), ("Kitchen Craft", "home", "WB2"), ("Bloom Florist", "gifts", "WB3"),
    ("Pet Pantry", "pets", "WB4"), ("Phone Doctor", "electronics", "WB5"), ("Henna Lounge", "beauty", "WB6"),
    ("Gift Garden", "gifts", "WB7"),
    # East block, top (H1)
    ("Peak Outdoor", "sports", "ET1"), ("Stride Athletics", "sports", "ET2"), ("Fit Factory", "sports", "ET3"),
    ("Cycle Hub", "sports", "ET4"), ("Game Zone", "electronics", "ET5"), ("Snap Studio", "electronics", "ET6"),
    ("Dates & Co", "gifts", "ET7"),
    # East block, bottom (H2): food court
    ("Noodle Theory", "restaurant", "EB1"), ("Burger Barn", "restaurant", "EB2"), ("Saffron House", "restaurant", "EB3"),
    ("Olive & Ember", "restaurant", "EB4"), ("Sushi Wave", "restaurant", "EB5"), ("Shawarma Street", "restaurant", "EB6"),
    ("Pizza Piazza", "restaurant", "EB7"),
    # South row (H2)
    ("Kids Kingdom", "toys", "S1"), ("Mini Me", "kids", "S2"), ("Smart Tech", "electronics", "S3"),
    ("Beauty Box", "beauty", "S4"), ("Lens & Light", "eyewear", "S5"), ("Mobile Mart", "electronics", "S6"),
    ("Sporty Kids", "footwear", "S7"), ("Luxe Leather", "fashion", "S8"), ("Travel Trunk", "home", "S9"),
    ("Spice Souk", "gifts", "S10"), ("Healthy Bowl", "restaurant", "S11"), ("Karak Corner", "cafe", "S12"),
    ("Gelato Lab", "cafe", "S13"), ("Pharmacy Plus", "pharmacy", "S14"),
    # Anchors
    ("FreshMart Hypermarket", "grocery", "AWN"), ("Home Haven", "home", "AWS"),
    ("Starlight Cinemas", "cinema", "AEN"), ("Maison Department Store", "department", "AES"),
]
assert len(STORES) == 60

# Hand-written offers for the stores the story touches. Prices in AED.
KEY_OFFERS = {
    "Stride Athletics": [
        dict(title="Runner X trainers", item="sneakers", tags=["sneakers", "footwear", "sports"], price=349, was=449, kids=False),
        dict(title="Kids' Runner X, 2nd pair 30% off", item="kids sneakers", tags=["sneakers", "kids", "footwear"], price=189, was=269, kids=True),
    ],
    "Kicks Lab": [dict(title="Court Classic low-tops", item="sneakers", tags=["sneakers", "footwear"], price=389, was=409, kids=False)],
    "Urban Sole": [dict(title="Street Glide sneakers", item="sneakers", tags=["sneakers", "footwear"], price=429, was=499, kids=False)],
    "Sporty Kids": [dict(title="Junior trainers", item="kids sneakers", tags=["sneakers", "kids", "footwear"], price=159, was=199, kids=True)],
    "Tiny Toes": [dict(title="School shoes", item="kids shoes", tags=["kids", "footwear"], price=129, was=169, kids=True)],
    "Little Explorers": [dict(title="Weekend outfits 20% off", item="kids clothing", tags=["kids", "fashion"], price=96, was=120, kids=True, funded="mall")],
    "Jungle Jam Play Zone": [dict(title="1-hour play pass, 2 kids", item="play pass", tags=["play", "kids"], price=70, was=90, kids=True)],
    "Saffron House": [dict(title="Family thali for 4", item="lunch", tags=["lunch", "family", "indian"], price=165, was=190, kids=True)],
    "Olive & Ember": [dict(title="15% off lunch, kids eat free", item="lunch", tags=["lunch", "family", "grill"], price=0, was=0, kids=True, pct=15, funded="mall")],
    "Pizza Piazza": [dict(title="Kids' pizza + juice", item="lunch", tags=["lunch", "kids", "pizza"], price=35, was=45, kids=True)],
    "Gelato Lab": [dict(title="Two scoops, 3rd free", item="dessert", tags=["dessert", "kids"], price=28, was=42, kids=True)],
}

# Offer templates for everyone else: (title, item, tags, price range)
TEMPLATES = {
    "fashion": [("Season sale tops", "clothing", ["fashion"], (79, 249)), ("Denim 2 for 1", "jeans", ["fashion"], (149, 299))],
    "footwear": [("Leather loafers", "shoes", ["footwear"], (199, 399))],
    "beauty": [("Gift set with any purchase", "beauty", ["beauty", "gifts"], (89, 220))],
    "electronics": [("Wireless earbuds", "earbuds", ["electronics"], (149, 399)), ("Phone case + screen guard", "accessories", ["electronics"], (49, 99))],
    "eyewear": [("Sunglasses 25% off", "sunglasses", ["eyewear"], (199, 599))],
    "jewellery": [("No making charges", "jewellery", ["jewellery", "gifts"], (450, 1800))],
    "cafe": [("Coffee + pastry", "coffee", ["coffee", "snack"], (22, 35))],
    "books": [("3 for 2 on kids' books", "books", ["books", "kids"], (35, 90))],
    "kids": [("Kids' basics 2 for 1", "kids clothing", ["kids", "fashion"], (49, 129))],
    "toys": [("Building sets 20% off", "toys", ["toys", "kids"], (79, 299))],
    "home": [("Cookware bundle", "home", ["home"], (149, 499))],
    "gifts": [("Gift box", "gifts", ["gifts"], (59, 199))],
    "pets": [("Pet food 15% off", "pet food", ["pets"], (39, 149))],
    "sports": [("Training kit bundle", "sportswear", ["sports", "fashion"], (149, 349))],
    "restaurant": [("Lunch combo", "lunch", ["lunch"], (39, 79))],
    "pharmacy": [("Sunscreen 2 for 1", "pharmacy", ["pharmacy"], (45, 99))],
    "grocery": [("Weekend fresh deals", "groceries", ["grocery"], (10, 60))],
    "cinema": [("Family pack: 4 tickets + popcorn", "movie", ["cinema", "kids"], (159, 199))],
    "department": [("Extra 10% for app users", "department", ["fashion", "home"], (99, 499))],
    "play": [],
}

# Tenants the operator view should flag. sales_vs_target is % of monthly sales target.
UNDERPERFORMERS = {"Olive & Ember": 61, "Little Explorers": 68, "Snap Studio": 72, "Travel Trunk": 74, "Kitchen Craft": 79}
POPULAR = {"Saffron House": 0.95, "Stride Athletics": 0.8, "Jungle Jam Play Zone": 0.9, "Starlight Cinemas": 0.85,
           "FreshMart Hypermarket": 0.9, "Burger Barn": 0.75, "Olive & Ember": 0.45, "Pizza Piazza": 0.6, "Pixel Point": 0.75}

RESTAURANT_INFO = {  # seats, family-friendly, guest rating
    "Noodle Theory": (60, False, 4.4), "Burger Barn": (80, True, 4.1), "Saffron House": (90, True, 4.8),
    "Olive & Ember": (85, True, 4.3), "Sushi Wave": (50, False, 4.5), "Shawarma Street": (40, True, 4.0),
    "Pizza Piazza": (70, True, 4.2), "Healthy Bowl": (40, False, 4.2),
}


def slugify(name: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-").replace("--", "-")


def row_units():
    units = {}
    for prefix, (x0, x1), (y0, y1), n, corridor, side in ROWS:
        w = (x1 - x0) / n
        for i in range(n):
            x = x0 + i * w
            rect = (round(x + 2, 1), y0, round(w - 4, 1), y1 - y0)
            door = (round(x + w / 2, 1), y1 if side == "bottom" else y0)
            units[f"{prefix}{i + 1}"] = (rect, corridor, door)
    units.update(ANCHORS)
    return units


def build():
    units = row_units()
    nodes, edges = {}, set()

    def node(x, y, kind="walk", label=None):
        nid = f"n{round(x)}_{round(y)}"
        if nid not in nodes:
            nodes[nid] = {"id": nid, "x": round(x, 1), "y": round(y, 1), "kind": kind}
        if label:
            nodes[nid].update(kind=kind, label=label)
        return nid

    # Points on each corridor: endpoints, intersections, and the projection of every door.
    on_corridor = {k: set() for k in CORRIDORS}
    for k, (x1, y1, x2, y2) in CORRIDORS.items():
        on_corridor[k].update({(x1, y1), (x2, y2)})
    for k, (x1, y1, x2, y2) in CORRIDORS.items():
        for j, (a1, b1, a2, b2) in CORRIDORS.items():
            if k == j:
                continue
            # axis-aligned intersections
            if y1 == y2 and a1 == a2 and min(x1, x2) <= a1 <= max(x1, x2) and min(b1, b2) <= y1 <= max(b1, b2):
                on_corridor[k].add((a1, y1))
            if x1 == x2 and b1 == b2 and min(y1, y2) <= b1 <= max(y1, y2) and min(a1, a2) <= x1 <= max(a1, a2):
                on_corridor[k].add((x1, b1))

    on_corridor["V2"].add((600, 380))  # central atrium
    stores, offers = [], []
    for name, category, slot in STORES:
        rect, corridor, door = units[slot]
        x1, y1, x2, y2 = CORRIDORS[corridor]
        proj = (door[0], y1) if y1 == y2 else (x1, door[1])
        on_corridor[corridor].add(proj)
        sid = slugify(name)
        door_node = node(*door, kind="door")
        edges.add(tuple(sorted((door_node, node(*proj)))))
        sales = UNDERPERFORMERS.get(name, rng.randint(86, 121))
        pop = POPULAR.get(name, round(rng.uniform(0.25, 0.7), 2))
        store = {
            "id": sid, "name": name, "category": category, "slot": slot, "zone": slot.rstrip("0123456789"),
            "rect": {"x": rect[0], "y": rect[1], "w": rect[2], "h": rect[3]}, "door": door_node,
            "popularity": pop,
            "kpi": {
                "sales_vs_target": sales,
                "footfall_today": int(pop * rng.randint(1800, 2600)),
                "conversion_pct": round((sales / 100) * rng.uniform(9, 16) if category not in ("restaurant", "cafe") else rng.uniform(35, 60), 1),
                "area_sqm": int(rect[2] * rect[3] * 0.09),
            },
        }
        if name in RESTAURANT_INFO:
            seats, family, rating = RESTAURANT_INFO[name]
            store["restaurant"] = {"seats": seats, "family_friendly": family, "rating": rating}
        stores.append(store)

        specs = KEY_OFFERS.get(name)
        if specs is None:
            specs = []
            for title, item, tags, (lo, hi) in TEMPLATES[category][:1 + (rng.random() < 0.35)]:
                was = rng.randint(lo, hi)
                specs.append(dict(title=title, item=item, tags=tags, price=round(was * rng.uniform(0.7, 0.9)), was=was,
                                  kids="kids" in tags))
        for i, s in enumerate(specs):
            pct = s.get("pct") or (round(100 * (1 - s["price"] / s["was"])) if s["was"] else 0)
            impressions = int(pop * rng.randint(900, 1600))
            claims = int(impressions * rng.uniform(0.06, 0.16))
            redemptions = int(claims * (rng.uniform(0.25, 0.45) if name in UNDERPERFORMERS else rng.uniform(0.45, 0.75)))
            offers.append({
                "id": f"{sid}-{i + 1}", "store_id": sid, "title": s["title"], "item": s["item"], "tags": s["tags"],
                "price": s["price"], "was": s["was"], "discount_pct": pct, "kid_friendly": s["kids"],
                "funded_by": s.get("funded", "tenant"),
                "stats": {"impressions": impressions, "claims": claims, "redemptions": redemptions},
            })

    # Amenities on the graph.
    entrance = node(40, 380, kind="entrance", label="Main Entrance")
    node(600, 380, kind="atrium", label="Central Atrium")

    for k, pts in on_corridor.items():
        x1, y1, x2, y2 = CORRIDORS[k]
        ordered = sorted(pts, key=lambda p: p[0] if y1 == y2 else p[1])
        ids = [node(*p) for p in ordered]
        for a, b in zip(ids, ids[1:]):
            if a != b:
                edges.add(tuple(sorted((a, b))))
    # Atrium sits on V2.
    v2 = sorted([n for n in nodes.values() if n["x"] == 600 and 200 <= n["y"] <= 560], key=lambda n: n["y"])
    assert any(n["id"] == "n600_380" for n in v2)

    mall = {
        "name": "Dalma Mall",
        "viewBox": [0, 0, 1200, 760],
        "units_to_m": 0.3,
        "corridors": [{"id": k, "x1": c[0], "y1": c[1], "x2": c[2], "y2": c[3]} for k, c in CORRIDORS.items()],
        "entrance": entrance,
        "atrium": "n600_380",
        "nodes": list(nodes.values()),
        "edges": sorted(edges),
        "stores": stores,
        "offers": offers,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(mall, indent=1))
    print(f"{len(stores)} stores, {len(offers)} offers, {len(nodes)} nodes, {len(edges)} edges -> {OUT}")


if __name__ == "__main__":
    build()
