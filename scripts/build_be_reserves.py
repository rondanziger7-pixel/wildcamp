#!/usr/bin/env python3
"""Build public/reserves-be.json.gz: Bern cantonal nature reserves with a per-reserve camping classification.

Polygons come from the canton's geoservice (layer NSG_NSGP, 244 reserves, LV95). Each reserve record links
its protection decree (PDF on the canton's ÖREB file store). The decree text is searched for camping or
tenting provisions:
  banned  -> restricted: the decree text prohibits camping/tenting (German or French), or allows it only at designated places
  entry   -> restricted: no camping term, but the decree prohibits entering the reserve (or leaving the marked paths),
             so camping is effectively prohibited
  silent  -> caution:    readable text with neither
  notext  -> caution:    the decree is a scan with no readable text, even after OCR (if rapidocr_onnxruntime is installed,
             scans without a text layer are OCR'd first)

Usage: python3 scripts/build_be_reserves.py [cache_dir] [out.json.gz] [evidence.csv]
Needs: shapely, pdftotext/pdftoppm (poppler); optional rapidocr_onnxruntime for scans. Decree PDFs and OCR text are cached in cache_dir.
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
TERM = re.compile(
    r"(?i)campier|kampier|zelten|zelt\b|zelte\b|biwak|wildcamp|camping"  # German
    r"|c[ao][mnr]{1,2}pieren"  # OCR variants of "campieren"
    r"|\bcamper\b|\btentes?\b|bivouaqu|\bcaravanes?\b"  # French
)
# "untersagt" is often mangled by OCR ("untersaq", "unter;agt", "untersä9t", "r:ntersagt")
PROHIBIT = re.compile(
    r"(?i)nt[eo]r\W{0,2}s\W{0,2}[aäo]\W{0,2}[gq9]|verbot|nicht gestattet|ist nicht|sind nicht|dürfen nicht|interdit|ne (?:doit|peut|doivent|peuvent)"
)
PERMISSIVE = re.compile(r"(?i)erlaubt|gestattet|bewilligt|autoris|permis")
# an entry ban: "a) das Betreten;" / "Betreten oder Befahren mit Ausnahme der befestigten Strassen" / "Betreten ausserhalb der ... Wege"
ENTRY = re.compile(
    r"(?i)(?:nt[eo]r\W{0,2}s\W{0,2}[aäo]\W{0,2}[gq9]|verbot)[^.]{0,300}?[a-e]\)\s*(?:das\s+)?(?:Befahren\s+und\s+)?Betreten(?:\s+oder\s+Befahren)?\s*(?:;|,|mit\s+Ausnahme|ausserhalb)"
)
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


def ocr_pdf(pdf: str, out_txt: str) -> bool:
    """OCR a scan page by page (first 6 pages); returns False if no OCR engine is available."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return False
    import glob
    prefix = pdf[:-4] + "_ocr"
    subprocess.run(["pdftoppm", "-r", "170", "-png", "-f", "1", "-l", "6", pdf, prefix], capture_output=True)
    engine = RapidOCR()
    pages = []
    for png in sorted(glob.glob(prefix + "-*.png")):
        res, _ = engine(png)
        if res:
            pages.append(" ".join(r[1] for r in res))
        os.remove(png)
    open(out_txt, "w", encoding="utf-8").write("\n".join(pages))
    return True


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
    txt = fn[:-4] + ".txt"
    subprocess.run(["pdftotext", "-layout", fn, txt], capture_output=True)
    return txt


def normalise(t: str) -> str:
    flat = re.sub(r"\s+", " ", t)
    flat = re.sub(r"(?<=[A-Za-zäöüÄÖÜ])-\s?(?=[a-zäöü])", "", flat)  # OCR line-break hyphens: "Zel-ten" -> "Zelten"
    return flat


def classify(txt_path: str, pdf_path: str) -> tuple[str, str]:
    """Returns (class, quoted excerpt of the first prohibition found)."""
    try:
        t = open(txt_path, encoding="utf-8", errors="replace").read()
    except FileNotFoundError:
        t = ""
    if len(re.sub(r"\s+", "", t)) < 300:
        ocr_txt = pdf_path[:-4] + "_ocr.txt"
        if not os.path.exists(ocr_txt):
            ocr_pdf(pdf_path, ocr_txt)
        t = open(ocr_txt, encoding="utf-8", errors="replace").read() if os.path.exists(ocr_txt) else ""
        if len(re.sub(r"\s+", "", t)) < 300:
            return "notext", ""
    return classify_text(t)


def classify_text(t: str) -> tuple[str, str]:
    """Classify legal text (German or French): banned / entry / silent, with a quoted excerpt."""
    flat = normalise(t)
    despaced = re.sub(r"(?<=\b\w) (?=\w\b)", "", flat)  # OCR spaced letters like "Z e l t e n"
    for src in (flat, despaced):
        for m in TERM.finditer(src):
            context = src[max(0, m.start() - 1500) : m.end() + 400]
            near = src[max(0, m.start() - 100) : m.end() + 100]
            # a camping term inside a prohibition list is a ban; one with only permissive wording nearby is not
            if PROHIBIT.search(context) or not PERMISSIVE.search(near):
                return "banned", src[max(0, m.start() - 110) : m.end() + 90]
    e = ENTRY.search(flat)
    return ("entry", flat[max(0, e.start()) : e.end() + 60]) if e else ("silent", "")


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
    pdfs = {nr: f"{cache}/{nr}.pdf" for nr, _ in items}
    reserves, rows = [], []
    for f in feats:
        a = f["attributes"]
        nr, name, url = a["NSG_NR"], a["NSG_NAME"], a["URL_BESCHL"]
        cls, excerpt = classify(texts[nr], pdfs[nr])
        level = "restricted" if cls in ("banned", "entry") else "caution"
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
        rows.append([nr, name, cls, level, url, excerpt])
    with gzip.open(out, "wt", encoding="utf-8") as g:
        json.dump({"canton": "BE", "generated": time.strftime("%Y-%m-%d"), "reserves": reserves}, g, separators=(",", ":"))
    with open(evidence, "w", newline="", encoding="utf-8") as g:
        w = csv.writer(g)
        w.writerow(["nsg_nr", "name", "decree_scan", "app_level", "decree_url", "excerpt"])
        w.writerows(sorted(rows))
    n = lambda c: sum(1 for r in rows if r[2] == c)
    print(f"wrote {out}: banned {n('banned')}, entry {n('entry')}, silent {n('silent')}, notext {n('notext')}", file=sys.stderr)


if __name__ == "__main__":
    main()
