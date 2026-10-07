#!/usr/bin/env python3
"""Build public/campsites.json.gz: the official campsite areas of Switzerland, for the "where instead" suggestion.

Source: swisstopo swissNAMES3D (ch.swisstopo.swissnames3d), objects "Campingplatzareal" (campsite area) and "Standplatzareal"
(area for bungalows and caravans with permanent use; many campgrounds have both). The layer says nothing about opening times,
pitches, services or whether tents are taken, so the app only suggests "an official campsite is mapped here".
Polygons of one campground (same name, within 600 m) are merged into one point (the area-weighted centre).

Output: {"asOf": "...", "source": "...", "sites": [[name, lat, lon, "c"|"s"], ...]}  ("c" = Campingplatzareal, "s" = only Standplatzareal)

Usage: python3 scripts/build_campsites.py [out.json.gz]
Needs: shapely
"""
import gzip
import json
import math
import sys
import time
import urllib.parse
import urllib.request

from shapely.geometry import shape

API = "https://api3.geo.admin.ch/rest/services/api/MapServer/find"
UA = {"User-Agent": "wildcamp-research/0.1"}
MERGE_M = 600


def fetch(kind):
    q = urllib.parse.urlencode({
        "layer": "ch.swisstopo.swissnames3d", "searchText": kind, "searchField": "objektart", "contains": "false",
        "returnGeometry": "true", "geometryFormat": "geojson", "sr": "2056",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=120) as r:
                return json.load(r)["results"]
        except Exception as e:  # noqa: BLE001
            print("retry", kind, e, file=sys.stderr)
            time.sleep(2 ** attempt)
    raise SystemExit("could not fetch " + kind)


def lv95_to_wgs84(e, n):
    """swisstopo's approximate formulas (about 1 m)."""
    y = (e - 2600000) / 1e6
    x = (n - 1200000) / 1e6
    lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return lat * 100 / 36, lon * 100 / 36


def collect(kind, code):
    seen = {}
    for r in fetch(kind):
        fid = r.get("id") or r.get("featureId")
        if fid in seen:
            continue
        name = (r.get("properties") or r.get("attributes") or {}).get("name", "").strip()
        geom = shape(r["geometry"])
        c = geom.centroid
        seen[fid] = {"name": name, "e": c.x, "n": c.y, "area": max(geom.area, 1.0), "kind": code}
    return list(seen.values())


def merge(items):
    """Same name within MERGE_M: one entry at the area-weighted centre; 'c' wins over 's'."""
    out = []
    for it in sorted(items, key=lambda i: -i["area"]):
        for o in out:
            if o["name"].lower() == it["name"].lower() and math.hypot(o["e"] - it["e"], o["n"] - it["n"]) <= MERGE_M:
                w = o["area"] + it["area"]
                o["e"] = (o["e"] * o["area"] + it["e"] * it["area"]) / w
                o["n"] = (o["n"] * o["area"] + it["n"] * it["area"]) / w
                o["area"] = w
                if it["kind"] == "c":
                    o["kind"] = "c"
                break
        else:
            out.append(dict(it))
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "public/campsites.json.gz"
    items = collect("Campingplatzareal", "c") + collect("Standplatzareal", "s")
    merged = merge(items)
    # a Standplatzareal inside or beside a Campingplatzareal of another name is the same campground: keep the campsite only
    camps = [m for m in merged if m["kind"] == "c"]
    keep = [m for m in merged if m["kind"] == "c" or not any(math.hypot(m["e"] - c["e"], m["n"] - c["n"]) <= MERGE_M for c in camps)]
    sites = []
    for m in sorted(keep, key=lambda m: (m["n"], m["e"])):
        lat, lon = lv95_to_wgs84(m["e"], m["n"])
        sites.append([m["name"] or "", round(lat, 5), round(lon, 5), m["kind"]])
    doc = {"asOf": time.strftime("%Y-%m-%d"), "source": "swisstopo swissNAMES3D (Campingplatzareal, Standplatzareal)", "sites": sites}
    with gzip.open(out_path, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(items)} polygons -> {len(sites)} sites ({sum(1 for s in sites if s[3] == 'c')} campsites, {sum(1 for s in sites if s[3] == 's')} caravan-only) -> {out_path}")


if __name__ == "__main__":
    main()
