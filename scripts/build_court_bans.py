#!/usr/bin/env python3
"""Build public/bans-court.json.gz: areas where landowners hold a court prohibition (Art. 258 ZPO) that covers camping and bivouacking.

Only places whose prohibition is publicly documented are listed here, and the perimeter of such an order is
normally not published (it is posted on signs), so each area is the water body plus a buffer, and says so.

Oeschinensee (Kandersteg BE): the lakeside operator's outdoor guidelines state that camping, bivouacking and
overnight stays in hammocks are prohibited by court order; local press names the landowner (Alpgenossenschaft
Oeschinenholz) and the Regional Court Oberland. Inside 400 m of the lake the app treats the spot as banned,
from 400 m to 1.5 km as "may be inside the posted area".

Usage: python3 scripts/build_court_bans.py [out.json.gz]
Needs: shapely
"""
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request

from shapely.geometry import shape
from shapely.ops import unary_union

API = "https://api3.geo.admin.ch/rest/services/api/MapServer/identify"
UA = {"User-Agent": "wildcamp-research/0.1"}

# name, lake centre (LV95), operator page documenting the order, inner and outer buffer in metres
AREAS = [
    {
        "id": 1,
        "name": "Oeschinensee (Kandersteg)",
        "e": 2622111,
        "n": 1149712,
        "link": "https://www.oeschinensee.ch/en/outdoor-guidelines/",
        "inner": 400,
        "outer": 1500,
    },
]


def lakes_near(e: float, n: float, tol_m: int) -> list:
    q = urllib.parse.urlencode({
        "geometryType": "esriGeometryPoint", "geometry": f"{e},{n}", "sr": 2056,
        "layers": "all:ch.swisstopo.swisstlm3d-gewaessernetz", "tolerance": tol_m,
        "mapExtent": f"{e - 500},{n - 500},{e + 500},{n + 500}", "imageDisplay": "1000,1000,96",
        "returnGeometry": "true", "geometryFormat": "geojson", "lang": "en",
    })
    with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=90) as r:
        return [f for f in json.load(r)["results"] if f["properties"].get("objektart") == 101]


def ints(coords) -> list[int]:
    return [int(round(v)) for p in coords for v in p[:2]]


def rings_of(geom) -> list[list[int]]:
    polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for p in polys:
        p = p.simplify(3.0, preserve_topology=True)
        out.append(ints(p.exterior.coords))
        out.extend(ints(h.coords) for h in p.interiors)
    return out


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "public/bans-court.json.gz"
    reserves = []
    for a in AREAS:
        lakes = lakes_near(a["e"], a["n"], 600)
        if not lakes:
            raise SystemExit(f"no lake polygon found near {a['name']}")
        lake = unary_union([shape(f["geometry"]) for f in lakes])
        print(f"{a['name']}: {len(lakes)} lake polygon(s), area {lake.area / 1e6:.2f} km2", file=sys.stderr)
        inner = lake.buffer(a["inner"])
        outer = lake.buffer(a["outer"]).difference(inner)
        reserves.append({"id": a["id"] * 10 + 1, "name": f"{a['name']}, lakeshore", "level": "restricted", "decree": a["link"], "scan": "law", "rings": rings_of(inner)})
        reserves.append({"id": a["id"] * 10 + 2, "name": f"{a['name']}, wider area", "level": "caution", "decree": a["link"], "scan": "law", "rings": rings_of(outer)})
    data = {
        "canton": "COURT",
        "generated": time.strftime("%Y-%m-%d"),
        "label": "Landowners' court prohibition",
        "notes": {
            "restricted": "The landowners hold a court prohibition (Art. 258 ZPO) that, as the lakeside operator publishes it, covers camping, bivouacking and overnight stays in hammocks; breaches can be fined up to CHF 2,000. The order's exact perimeter is not published, so this shape is the lake plus 400 m: read the signs on site.",
            "caution": "Close to a lake where the landowners hold a court prohibition on camping, bivouacking and overnight stays in hammocks (Art. 258 ZPO). The order's exact perimeter is not published, so this spot may or may not lie inside the posted area: read the signs on site.",
        },
        "reserves": reserves,
    }
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump(data, g, separators=(",", ":"))
    print(f"wrote {out}: {len(reserves)} areas", file=sys.stderr)


if __name__ == "__main__":
    main()
