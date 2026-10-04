#!/usr/bin/env python3
"""Build public/reserves-be.json.gz: Bern cantonal nature reserves with a per-reserve camping classification.

Polygons come from the canton's geoservice (layer NSG_NSGP, 244 reserves, LV95). Each reserve record links
its protection decree (PDF on the canton's ÖREB file store). The decree text is searched for camping or
tenting provisions:
  restricted = the decree text prohibits camping/tenting (or allows it only at designated places)
  caution    = the readable text has no camping or tenting term, or the decree is a scan with no text layer

Usage: python3 scripts/build_be_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely, pdftotext (poppler). Decree PDFs are cached in cache_dir.
Limits: decrees are old scans with OCR text; terms garbled beyond recognition are missed (those reserves
stay 'caution'); there is no OCR for the scans that have no text layer.
"""
import concurrent.futures as cf
import csv
import gzip
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import shape

LAYER = "https://www.geoservice.apps.be.ch/geoservice3/rest/services/a42geo/of_environment01_de_ms_wms/MapServer/14278"
TERM = re.compile(r"(?i)campier|kampier|zelten|zelt\b|zelte\b|biwak|wildcamp|camping")
# Designated-place exceptions found by reading the decrees (reserve number -> note)
EXCEPTIONS = {
    55: "Camping is prohibited outside places set by the municipalities with the nature promotion office.",
    58: "Camping is only allowed at specially designated places agreed with the landowners.",
}


def fetch_features() -> list[dict]:
    q = urllib.parse.urlencode(
        {"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": "2056", "f": "json"}
    )
    with urllib.request.urlopen(f"{LAYER}/query?{q}", timeout=120) as r:
        return json.load(r)["features"]


def download(nr: int, url: str, cache: str) -> str:
    fn = f"{cache}/{nr}.pdf"
    if not os.path.exists(fn) or os.path.getsize(fn) < 500:
        for _ in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "wildcamp-research/0.1"})
                open(fn, "wb").write(urllib.request.urlopen(req, timeout=60).read())
                break
            except Exception:
                time.sleep(1.5)
    subprocess.run(["pdftotext", "-layout", fn, fn[:-4] + ".txt"], capture_output=True)
    return fn[:-4] + ".txt"


def classify(txt_path: str) -> str:
    try:
        t = open(txt_path, encoding="utf-8", errors="replace").read()
    except FileNotFoundError:
        return "notext"
    if len(re.sub(r"\s+", "", t)) < 300:
        return "notext"
    flat = re.sub(r"\s+", " ", t)
    despaced = re.sub(r"(?<=\b\w) (?=\w\b)", "", flat)  # OCR spaced letters like "Z e l t e n"
    return "banned" if TERM.search(flat) or TERM.search(despaced) else "silent"


def ring_to_ints(ring: list[list[float]]) -> list[int]:
    return [int(round(v)) for p in ring for v in p[:2]]


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/be_decrees"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/reserves-be.json.gz"
    evidence = sys.argv[3] if len(sys.argv) > 3 else "docs/sources/BE/reserves_decree_scan.csv"
    os.makedirs(cache, exist_ok=True)
    feats = fetch_features()
    print(f"{len(feats)} reserves", file=sys.stderr)
    items = [(f["attributes"]["NSG_NR"], f["attributes"]["URL_BESCHL"]) for f in feats]
    with cf.ThreadPoolExecutor(4) as ex:
        texts = dict(zip([i[0] for i in items], ex.map(lambda it: download(it[0], it[1], cache), items)))
    reserves, rows = [], []
    for f in feats:
        a = f["attributes"]
        nr, name, url = a["NSG_NR"], a["NSG_NAME"], a["URL_BESCHL"]
        cls = classify(texts[nr])
        level = "restricted" if cls == "banned" else "caution"
        rings = []
        for ring in f["geometry"]["rings"]:
            simple = shapely.Polygon(ring).simplify(2.0, preserve_topology=True)
            coords = list(simple.exterior.coords) if not simple.is_empty else ring
            if len(coords) >= 4:
                rings.append(ring_to_ints(coords))
        reserves.append(
            {"id": nr, "name": name, "level": level, "decree": url, "scan": cls,
             **({"exception": EXCEPTIONS[nr]} if nr in EXCEPTIONS else {}), "rings": rings}
        )
        rows.append([nr, name, cls, level, url])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "BE", "generated": time.strftime("%Y-%m-%d"), "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["nsg_nr", "name", "decree_scan", "app_level", "decree_url"])
        w.writerows(sorted(rows))
    n = lambda c: sum(1 for r in rows if r[2] == c)
    print(f"wrote {out}: banned {n('banned')}, silent {n('silent')}, notext {n('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
