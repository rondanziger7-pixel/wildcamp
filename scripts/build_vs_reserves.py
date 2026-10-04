#!/usr/bin/env python3
"""Build public/reserves-vs.json.gz: Valais sites protected by cantonal decision, classified from each decision's text.

Polygons come from the canton's ArcGIS layer Nature/MapServer/1101 (100 sites, LV95). Each site carries the number
of its protection decision on lex.vs.ch (a LexWork portal); the decision text is fetched from the portal's JSON API
and searched for camping or tenting clauses (French, German fallback):
  banned -> restricted: the decision prohibits camping/tenting
  entry  -> restricted: no camping term, but it prohibits entering the site (or leaving the paths)
  silent -> caution:    neither
  notext -> caution:    decision text could not be fetched

Usage: python3 scripts/build_vs_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely.
"""
import csv
import gzip
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

import shapely

LAYER = "https://sit.vs.ch/arcgis/rest/services/Nature/MapServer/1101"
PORTAL = "https://lex.vs.ch/api/{lang}/texts_of_law/{no}"
TERM = re.compile(
    r"(?i)\bcamper\b|\bcamping\b|\btentes?\b|bivouaqu|\bcaravanes?\b|\bcamp\b"  # French
    r"|campier|zelten|\bzelt\b|\bzelte\b|biwak|wohnwagen"  # German
)
PROHIBIT = re.compile(r"(?i)interdit|interdiction|prohib|verbot|untersag|nicht gestattet|nicht erlaubt|ne doit|ne peut")
# an authorisation right before the term ("la commune peut ... autoriser temporairement le camping") is not a ban
PERMISSIVE_BEFORE = re.compile(r"(?i)autoris|permet|peut\s")
# entering the site itself is prohibited; "la pénétration ... avec des véhicules" (vehicles only) does not count
ENTRY = re.compile(
    r"(?i)(?:la\s+)?p[ée]n[ée]tration\s+(?:dans|sur)\s+(?:le|la|les|l['’])\s*(?:bas-marais|haut-marais|marais|site|zone|r[ée]serve|p[ée]rim[eè]tre)(?![^;.]{0,50}v[ée]hicule)"
    r"|(?:interdit|interdiction)[^.]{0,200}?(?:de\s+p[ée]n[ée]trer\s+dans|d['’]acc[ée]der\s+(?:au|à))"
    r"|(?:betreten|zutritt)[^.]{0,120}?(?:verboten|untersagt)"
)


def to_text(x: str) -> str:
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", x)
    s = re.sub(r"(?i)<br\s*/?>|</(p|div|h\d|li|tr)>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", "", s))).strip()


def fetch_decision(no: str, cache: str) -> str:
    fn = f"{cache}/{no}.txt"
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    text = ""
    for lang in ("fr", "de"):
        try:
            url = PORTAL.format(lang=lang, no=urllib.parse.quote(no))
            with urllib.request.urlopen(url, timeout=60) as r:
                d = json.load(r)["text_of_law"]
            text = to_text(d["selected_version"]["xhtml_tol"])
            if len(text) > 200:
                break
        except Exception:
            time.sleep(1.5)
    time.sleep(0.6)
    open(fn, "w", encoding="utf-8").write(text)
    return text


def classify(t: str) -> tuple[str, str]:
    if len(t) < 200:
        return "notext", ""
    for m in TERM.finditer(t):
        if PERMISSIVE_BEFORE.search(t[max(0, m.start() - 80) : m.start()]):
            continue
        if PROHIBIT.search(t[max(0, m.start() - 1500) : m.end() + 300]):
            return "banned", t[max(0, m.start() - 110) : m.end() + 90]
    e = ENTRY.search(t)
    return ("entry", t[max(0, e.start() - 40) : e.end() + 60]) if e else ("silent", "")


def ring_ints(ring) -> list[int]:
    return [int(round(v)) for p in ring for v in p[:2]]


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/vs_decisions"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/reserves-vs.json.gz"
    evidence = sys.argv[3] if len(sys.argv) > 3 else "docs/sources/VS/reserves_decision_scan.csv"
    os.makedirs(cache, exist_ok=True)
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": "2056", "f": "json"})
    with urllib.request.urlopen(f"{LAYER}/query?{q}", timeout=120) as r:
        feats = json.load(r)["features"]
    nos = sorted({f["attributes"]["OBJET_NO"].strip() for f in feats})
    texts = {no: fetch_decision(no, cache) for no in nos}
    scan = {no: classify(texts[no]) for no in nos}
    reserves, rows = [], []
    for f in feats:
        a = f["attributes"]
        no = a["OBJET_NO"].strip()
        cls = scan[no][0]
        rings = []
        for ring in f["geometry"]["rings"]:
            poly = shapely.Polygon(ring).simplify(2.0, preserve_topology=True)
            coords = list(poly.exterior.coords) if not poly.is_empty else ring
            if len(coords) >= 4:
                rings.append(ring_ints(coords))
        reserves.append(
            {"id": a["OBJECTID"], "name": f"{a['NOM']} ({a['COMMUNE_GE']})", "level": "restricted" if cls in ("banned", "entry") else "caution",
             "decree": f"https://lex.vs.ch/app/fr/texts_of_law/{no}", "scan": cls, "rings": rings}
        )
    seen = {}
    for f in feats:
        a = f["attributes"]
        seen.setdefault(a["OBJET_NO"].strip(), a["NOM"])
    for no, nom in sorted(seen.items()):
        c, ex = scan[no]
        rows.append([no, nom, c, "restricted" if c in ("banned", "entry") else "caution", f"https://lex.vs.ch/app/fr/texts_of_law/{no}", ex])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "VS", "generated": time.strftime("%Y-%m-%d"), "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["decision_no", "site", "decision_scan", "app_level", "decision_url", "excerpt"])
        w.writerows(rows)
    n = lambda c: sum(1 for r in rows if r[2] == c)
    print(f"wrote {out}: {len(reserves)} polygons, {len(rows)} decisions; banned {n('banned')}, entry {n('entry')}, silent {n('silent')}, notext {n('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
