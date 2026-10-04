#!/usr/bin/env python3
"""Build public/reserves-<canton>.json.gz for cantons whose nature reserves are published as WFS or ArcGIS layers.

Each source below names the service, the layer and how to classify a feature:
  restricted -> "Not allowed": a legal text (cited in `legal`) prohibits camping or all activities in these reserves
  caution    -> "Caution":     a protected area whose camping rules were not checked
The set carries its own zone wording (`notes`), so the app needs no per-canton code.

Usage: python3 scripts/build_cantonal_reserves.py GE GL ...      (writes public/reserves-ge.json.gz, ...)
Needs: shapely.
"""
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import shape

UA = {"User-Agent": "wildcamp-research/0.1"}
GENERIC_CAUTION = (
    "Cantonal nature reserve. Camping rules were not checked for this reserve; "
    "many cantonal reserve rules prohibit camping (for example in Bern, Ticino and Lucerne), so check before going."
)

SOURCES = {
    "GE": dict(
        label="Geneva nature reserve",
        kind="arcgis",
        url="https://vector.sitg.ge.ch/arcgis/rest/services/FFP_RES_NAT_PLAN_SITE/FeatureServer/0",
        name=lambda p: p["NOM_SITE"],
        keep=lambda p: p.get("STATUT") == "Approuvé",
        restricted=lambda p: p.get("TYPE_PROTECTION") == "Réserve naturelle",
        legal="https://silgeneve.ch/legis/data/rsg_l4_05p11.htm",
        notes=dict(
            restricted="Under the cantonal regulation on nature reserves (RPPMF Art. 19) all activities are prohibited in nature reserves except management, and entering is allowed only for pedestrians on the signed paths, so camping is prohibited.",
            caution="Protected site in Geneva that is not a nature reserve in the regulation's sense. Camping rules were not checked; check before going.",
        ),
    ),
    "FR": dict(
        label="Fribourg nature reserve",
        kind="arcgis",
        url="https://maps.fr.ch/ags/rest/services/opendata/Reserves_naturelles_cantonales/FeatureServer/0",
        name=lambda p: p["NOM_RES"],
        keep=lambda p: True,
        restricted=lambda p: False,
        legal="https://fr.ch/diaf/sfn/sommaire/les-reserves-naturelles-du-canton-de-fribourg",
        notes=dict(restricted="", caution=GENERIC_CAUTION),
    ),
    "GL": dict(
        label="Glarus nature reserve",
        kind="wfs",
        url="https://wfs.geo.gl.ch/",
        typename="ch.gl.natureprotection.nsg-perimeter",
        name=lambda p: p["schutzgebietsname"],
        keep=lambda p: str(p.get("rechtsstatus", "")).startswith("rechtskr"),
        restricted=lambda p: False,
        legal="https://www.gl.ch/verwaltung/bau-und-umwelt/hochbau/raumentwicklung-und-geoinformation/geoportal-kanton-glarus.html/808",
        notes=dict(restricted="", caution=GENERIC_CAUTION),
    ),
}


def fetch(src: dict) -> list[dict]:
    if src["kind"] == "wfs":
        q = urllib.parse.urlencode(
            {"SERVICE": "WFS", "VERSION": "1.1.0", "REQUEST": "GetFeature", "TYPENAME": src["typename"],
             "OUTPUTFORMAT": "application/json", "SRSNAME": "EPSG:2056"}
        )
        with urllib.request.urlopen(urllib.request.Request(f"{src['url']}?{q}", headers=UA), timeout=180) as r:
            return [{"p": f["properties"], "g": shape(f["geometry"])} for f in json.load(r)["features"]]
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "true", "outSR": "2056", "f": "json"})
    with urllib.request.urlopen(urllib.request.Request(f"{src['url']}/query?{q}", headers=UA), timeout=180) as r:
        feats = json.load(r)["features"]
    out = []
    for f in feats:
        rings = f["geometry"]["rings"]
        out.append({"p": f["attributes"], "g": shapely.MultiPolygon([shapely.Polygon(r) for r in rings]) if len(rings) > 1 else shapely.Polygon(rings[0])})
    return out


def ints(coords) -> list[int]:
    return [int(round(v)) for p in coords for v in p[:2]]


def build(code: str) -> None:
    src = SOURCES[code]
    feats = [f for f in fetch(src) if src["keep"](f["p"])]
    reserves = []
    for i, f in enumerate(feats):
        polys = list(f["g"].geoms) if f["g"].geom_type == "MultiPolygon" else [f["g"]]
        rings = []
        for poly in polys:
            s = poly.simplify(2.0, preserve_topology=True)
            s = poly if s.is_empty else s
            rings.append(ints(s.exterior.coords))
            rings.extend(ints(h.coords) for h in s.interiors)
        restricted = src["restricted"](f["p"])
        reserves.append(
            {"id": i + 1, "name": str(src["name"](f["p"])), "level": "restricted" if restricted else "caution",
             "decree": src["legal"], "scan": "law" if restricted else "unchecked", "rings": rings}
        )
    out = f"public/reserves-{code.lower()}.json.gz"
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": code, "generated": time.strftime("%Y-%m-%d"), "label": src["label"], "notes": src["notes"], "reserves": reserves}, g, separators=(",", ":"))
    r = sum(1 for x in reserves if x["level"] == "restricted")
    print(f"{code}: wrote {out}: {len(reserves)} areas ({r} restricted, {len(reserves) - r} caution)", file=sys.stderr)


if __name__ == "__main__":
    for c in sys.argv[1:]:
        build(c)
        time.sleep(1)
