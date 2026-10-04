#!/usr/bin/env python3
"""Build public/reserves-so.json.gz: Solothurn nature reserves, classified from their binding legal documents.

Polygons and document links: the canton's WFS layer ch.so.arp.naturreservate.reservate (101 reserves, LV95). Each reserve
lists documents; those marked as legal provisions (rechtsvorschrift) and in force (RRB decisions, special building
provisions) and available as PDF are downloaded, OCR'd if they are scans, and classified together like the Bern decrees.

Usage: python3 scripts/build_so_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely, pdftotext/pdftoppm; optional rapidocr_onnxruntime for scans.
"""
import concurrent.futures as cf
import csv
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from shapely.geometry import shape

sys.path.insert(0, os.path.dirname(__file__))
from build_be_reserves import classify_text, ocr_pdf  # noqa: E402

WFS = "https://geo.so.ch/api/wfs"
UA = {"User-Agent": "wildcamp-research/0.1"}


def pdf_text(url: str, cache: str) -> str:
    key = hashlib.md5(url.encode()).hexdigest()[:12]
    pdf, txt = f"{cache}/{key}.pdf", f"{cache}/{key}.txt"
    if not os.path.exists(pdf) or os.path.getsize(pdf) < 500:
        for _ in range(3):
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
                if data[:4] == b"%PDF":
                    open(pdf, "wb").write(data)
                    break
            except Exception:
                time.sleep(1.5)
        time.sleep(0.3)
    if not os.path.exists(pdf):
        return ""
    subprocess.run(["pdftotext", "-layout", pdf, txt], capture_output=True)
    t = open(txt, encoding="utf-8", errors="replace").read() if os.path.exists(txt) else ""
    if len(re.sub(r"\s+", "", t)) < 300:  # a scan: OCR it
        ocr = f"{cache}/{key}_ocr.txt"
        if not os.path.exists(ocr):
            ocr_pdf(pdf, ocr)
        t = open(ocr, encoding="utf-8", errors="replace").read() if os.path.exists(ocr) else ""
    return t


def ints(coords) -> list[int]:
    return [int(round(v)) for p in coords for v in p[:2]]


def main() -> None:
    cache = sys.argv[1] if len(sys.argv) > 1 else "/tmp/so_docs"
    out = sys.argv[2] if len(sys.argv) > 2 else "public/reserves-so.json.gz"
    evidence = sys.argv[3] if len(sys.argv) > 3 else "docs/sources/SO/reserves_document_scan.csv"
    os.makedirs(cache, exist_ok=True)
    q = urllib.parse.urlencode({"SERVICE": "WFS", "VERSION": "1.1.0", "REQUEST": "GetFeature", "TYPENAME": "ch.so.arp.naturreservate.reservate", "OUTPUTFORMAT": "application/json", "SRSNAME": "EPSG:2056"})
    with urllib.request.urlopen(urllib.request.Request(f"{WFS}?{q}", headers=UA), timeout=180) as r:
        feats = json.load(r)["features"]
    binding: dict[int, list[str]] = {}
    for i, f in enumerate(feats):
        docs = json.loads(f["properties"].get("dokumente") or "[]")
        binding[i] = [x["dokumente"] for x in docs if x.get("rechtsvorschrift") and x.get("rechtsstatus") == "inKraft" and str(x.get("dokumente", "")).lower().endswith(".pdf")]
    urls = sorted({u for v in binding.values() for u in v})
    with cf.ThreadPoolExecutor(int(os.environ.get("JOBS", "4"))) as ex:
        texts = dict(zip(urls, ex.map(lambda u: pdf_text(u, cache), urls)))
    reserves, rows = [], []
    for i, f in enumerate(feats):
        p = f["properties"]
        t = "\n".join(texts[u] for u in binding[i])
        cls, excerpt = classify_text(t) if len(re.sub(r"\s+", "", t)) > 300 else ("notext", "")
        geom = shape(f["geometry"])
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        rings = []
        for poly in polys:
            s = poly.simplify(2.0, preserve_topology=True)
            s = poly if s.is_empty else s
            rings.append(ints(s.exterior.coords))
            rings.extend(ints(h.coords) for h in s.interiors)
        link = binding[i][0] if binding[i] else "https://geo.so.ch/"
        reserves.append({"id": i + 1, "name": f"{p['aname']} ({p['gemeinden']})", "level": "restricted" if cls in ("banned", "entry") else "caution", "decree": link, "scan": cls, "rings": rings})
        rows.append([p["nummer"], p["aname"], cls, "restricted" if cls in ("banned", "entry") else "caution", ";".join(binding[i]), excerpt])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "SO", "generated": time.strftime("%Y-%m-%d"), "label": "Solothurn nature reserve",
                   "notes": {"restricted": "The reserve's binding legal documents (decision or special building provisions) prohibit camping or tenting, or prohibit entering the reserve.",
                             "caution": "Solothurn nature reserve. Its binding documents do not prohibit camping by name (or could not be read), so check them."},
                   "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["nummer", "name", "scan", "app_level", "documents", "excerpt"])
        w.writerows(rows)
    c = lambda k: sum(1 for r in rows if r[2] == k)
    print(f"wrote {out}: {len(reserves)} reserves; banned {c('banned')}, entry {c('entry')}, silent {c('silent')}, notext {c('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
