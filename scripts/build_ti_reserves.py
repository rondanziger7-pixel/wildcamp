#!/usr/bin/env python3
"""Build public/reserves-ti.json.gz: Ticino protection-decree areas with a per-decree camping classification.

Polygons come from the canton's WFS layer ti_002_1_v1_0_decreti_protezione (351 polygons in force, LV95); each
polygon links its decree text (26 distinct PDFs). A camping term counts as a prohibition only when a prohibition
wording (vietato/divieto/non ammesso) stands in the 1,800 characters before it or it opens a lettered list item, never
in the table of contents.
  banned -> restricted: the decree prohibits camping ("il campeggio", often except in areas authorised for occasional
                        camping under Art. 5 of the Ticino camping law)
  silent -> caution:    no camping prohibition in the decree text

Usage: python3 scripts/build_ti_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely, pdftotext (poppler).
"""
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

WFS = "https://wfs.geo.ti.ch/service"
LAYER = "ti_002_1_v1_0_decreti_protezione"
TERM = re.compile(r"(?i)campegg|accampar|bivacc|roulotte")
PROHIBIT = re.compile(r"(?i)vietat|divieto|non (?:è|sono) ammess|è proibit|sono proibit|non è consentit")
# a lettered or bulleted item that starts with the term: "o. il campeggio al di fuori delle aree autorizzate ..."
ITEM = re.compile(r"(?:^|[\s;:])(?:[a-z][\.\)]|[−•\-])\s*(?:il\s+|ogni\s+|l['’])?campegg", re.I)

# Exceptions read from the decrees (matched on the decree title)
EXCEPTIONS = {
    "golene della Valle Maggia": "Camping is banned outside areas authorised for occasional camping (Art. 5 of the camping law).",
    "golene della Valle Bedretto": "Camping is banned outside areas authorised for occasional camping (Art. 5 of the camping law).",
    "golene del Brenno": "Camping is banned outside areas authorised for occasional camping (Art. 5 of the camping law); existing areas without fixed structures are tolerated in the buffer zone.",
    "Bolle di Magadino": "Exception: sectors of zone C with a cantonal authorisation.",
    "torbiere di importanza nazionale": "Banned in the core zones; in buffer zones banned outside the signposted areas.",
}


def fetch_features() -> list[dict]:
    q = urllib.parse.urlencode(
        {"SERVICE": "WFS", "VERSION": "1.1.0", "REQUEST": "GetFeature", "TYPENAME": LAYER,
         "OUTPUTFORMAT": "application/json", "SRSNAME": "EPSG:2056"}
    )
    with urllib.request.urlopen(f"{WFS}?{q}", timeout=180) as r:
        return json.load(r)["features"]


def download(url: str, cache: str, idx: int) -> tuple[str, str]:
    fn = f"{cache}/{idx:02d}.pdf"
    if not os.path.exists(fn) or os.path.getsize(fn) < 500:
        for cand in ([url] if url.lower().endswith(".pdf") else [url + ".pdf", url]):
            try:
                req = urllib.request.Request(cand, headers={"User-Agent": "wildcamp-research/0.1"})
                data = urllib.request.urlopen(req, timeout=120).read()
                if data[:4] == b"%PDF":
                    open(fn, "wb").write(data)
                    open(fn + ".url", "w").write(cand)
                    break
            except Exception:
                time.sleep(1)
        time.sleep(0.4)
    subprocess.run(["pdftotext", "-layout", fn, fn[:-4] + ".txt"], capture_output=True)
    link = open(fn + ".url").read() if os.path.exists(fn + ".url") else url
    return fn[:-4] + ".txt", link


def classify(txt_path: str) -> tuple[str, str]:
    """Returns (class, quoted excerpt of the first prohibition found)."""
    try:
        t = re.sub(r"\s+", " ", open(txt_path, encoding="utf-8", errors="replace").read())
    except FileNotFoundError:
        return "notext", ""
    if len(t) < 500:
        return "notext", ""
    for m in TERM.finditer(t):
        ctx = t[max(0, m.start() - 260) : m.end() + 320]
        if "....." in ctx:  # table of contents
            continue
        # a prohibition header earlier in the same article, "vietato" right next to the term, or an enumerated item
        if PROHIBIT.search(t[max(0, m.start() - 1800) : m.start() + 120]) or ITEM.search(t[max(0, m.start() - 14) : m.end()]):
            return "banned", t[max(0, m.start() - 110) : m.end() + 90]
    return "silent", ""


def ring_ints(coords) -> list[int]:
    return [int(round(v)) for p in coords for v in p[:2]]


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ti_decrees"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/reserves-ti.json.gz"
    evidence = sys.argv[3] if len(sys.argv) > 3 else "docs/sources/TI/reserves_decree_scan.csv"
    os.makedirs(cache, exist_ok=True)
    feats = fetch_features()
    urls = sorted({f["properties"]["testo_nel_web"] for f in feats})
    info = {u: download(u, cache, i) for i, u in enumerate(urls)}
    scan = {u: classify(info[u][0]) for u in urls}
    cls = {u: v[0] for u, v in scan.items()}
    reserves, rows = [], []
    for f in feats:
        p = f["properties"]
        u = p["testo_nel_web"]
        c = cls[u]
        geom = shape(f["geometry"])
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        rings = []
        for poly in polys:
            simple = poly.simplify(2.0, preserve_topology=True)
            if simple.is_empty:
                simple = poly
            rings.append(ring_ints(simple.exterior.coords))
            rings.extend(ring_ints(i.coords) for i in simple.interiors)
        exception = next((v for k, v in EXCEPTIONS.items() if k in p["titolo"]), None)
        if exception and "Bolle di Magadino" in p["titolo"] and not str(p.get("zona_protetta")).startswith("C"):
            exception = None  # the zone C exception only applies to zone C
        name = p["nome_area_protetta"] + (f" ({p['zona_protetta']})" if p.get("zona_protetta") not in (None, "None") else "")
        reserves.append(
            {"id": int(p["ogc_fid"]), "name": name, "level": "restricted" if c == "banned" else "caution",
             "decree": info[u][1], "scan": c, **({"exception": exception} if exception and c == "banned" else {}), "rings": rings}
        )
    for u in urls:
        titles = sorted({f["properties"]["titolo"] for f in feats if f["properties"]["testo_nel_web"] == u})
        rows.append([titles[0], cls[u], "restricted" if cls[u] == "banned" else "caution", info[u][1], scan[u][1]])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "TI", "generated": time.strftime("%Y-%m-%d"), "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["decree_title", "decree_scan", "app_level", "decree_url", "excerpt"])
        w.writerows(rows)
    n = lambda c: sum(1 for r in reserves if r["scan"] == c)
    print(f"wrote {out}: {len(reserves)} polygons, {len(urls)} decrees; banned {n('banned')}, silent {n('silent')}, notext {n('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
