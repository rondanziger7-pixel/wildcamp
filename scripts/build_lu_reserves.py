#!/usr/bin/env python3
"""Build public/reserves-lu.json.gz: Lucerne protection-ordinance areas, classified from each ordinance's text.

Polygons: the canton's OGD WFS layer Schutzverordnungen__Perimeter (20 ordinances in force, LV95). Each record names its
ordinance in the systematic law collection (srl.lu.ch, a LexWork portal); the text is fetched from the portal's JSON API
and classified like the Bern decrees (camping/tenting prohibited, entering prohibited, or silent).

Usage: python3 scripts/build_lu_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely.
"""
import csv
import gzip
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(__file__))
from build_be_reserves import classify_text  # noqa: E402
from fetch_lexwork import to_text  # noqa: E402

WFS = "https://public.geo.lu.ch/ogd/services/managed/SVOXXXXX_COL_V2_MP/MapServer/WFSServer"
UA = {"User-Agent": "wildcamp-research/0.1"}


def fetch_ordinance(num: str, cache: str) -> str:
    fn = f"{cache}/{num}.txt"
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    text = ""
    for _ in range(3):
        try:
            url = f"https://srl.lu.ch/api/de/texts_of_law/{urllib.parse.quote(num)}"
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                text = to_text(json.load(r)["text_of_law"]["selected_version"]["xhtml_tol"])
            break
        except Exception:
            time.sleep(2)
    time.sleep(0.6)
    open(fn, "w", encoding="utf-8").write(text)
    return text


def ints(coords) -> list[int]:
    return [int(round(v)) for p in coords for v in p[:2]]


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lu_ordinances"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/reserves-lu.json.gz"
    evidence = sys.argv[3] if len(sys.argv) > 3 else "docs/sources/LU/reserves_ordinance_scan.csv"
    os.makedirs(cache, exist_ok=True)
    q = urllib.parse.urlencode({"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature", "TYPENAMES": "esri:Schutzverordnungen__Perimeter", "OUTPUTFORMAT": "GEOJSON", "SRSNAME": "EPSG:2056"})
    with urllib.request.urlopen(urllib.request.Request(f"{WFS}?{q}", headers=UA), timeout=180) as r:
        feats = json.load(r)["features"]
    feats = [f for f in feats if str(f["properties"].get("Rechtsstatus")) == "1"]
    nums = sorted({f["properties"]["Nummer_syst._Rechtssammlung"] for f in feats})
    scan = {n: classify_text(fetch_ordinance(n, cache)) if len(fetch_ordinance(n, cache)) > 200 else ("notext", "") for n in nums}
    reserves, rows = [], []
    for f in feats:
        p = f["properties"]
        n = p["Nummer_syst._Rechtssammlung"]
        cls = scan[n][0]
        geom = shape(f["geometry"])
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        rings = []
        for poly in polys:
            s = poly.simplify(2.0, preserve_topology=True)
            s = poly if s.is_empty else s
            rings.append(ints(s.exterior.coords))
            rings.extend(ints(h.coords) for h in s.interiors)
        reserves.append(
            {"id": int(p["OBJECTID"]), "name": p["Kurzname_Schutzverordnung"], "level": "restricted" if cls in ("banned", "entry") else "caution",
             "decree": f"https://srl.lu.ch/app/de/texts_of_law/{n}", "scan": cls, "rings": rings}
        )
    for f in feats:
        p = f["properties"]
        n = p["Nummer_syst._Rechtssammlung"]
        c, ex = scan[n]
        rows.append([n, p["Name_Schutzverordnung"], c, "restricted" if c in ("banned", "entry") else "caution", f"https://srl.lu.ch/app/de/texts_of_law/{n}", ex])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "LU", "generated": time.strftime("%Y-%m-%d"), "label": "Lucerne protected area",
                   "notes": {"restricted": "The protection ordinance prohibits camping or tenting, or prohibits entering the area.",
                             "caution": "Area under a Lucerne protection ordinance. The ordinance does not prohibit camping by name, so check it."},
                   "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["ordinance_no", "name", "scan", "app_level", "url", "excerpt"])
        w.writerows(rows)
    c = lambda k: sum(1 for r in rows if r[2] == k)
    print(f"wrote {out}: {len(reserves)} areas; banned {c('banned')}, entry {c('entry')}, silent {c('silent')}, notext {c('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
