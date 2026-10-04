#!/usr/bin/env python3
"""Fetch a cantonal law from a LexWork portal (e.g. gdb.ow.ch, www.gr-lex.gr.ch) as plain text.

Usage: python3 scripts/fetch_lexwork.py <host> <systematic number> <out.md> [<language, default de>]
The portal's JSON API returns the current in-force version; the output keeps the
canonical URL, version dates and retrieval date so the source can be cited.
"""
import datetime
import html
import json
import re
import sys
import urllib.request


def to_text(xhtml: str) -> str:
    s = re.sub(r"(?is)<(script|style).*?</\1>", "", xhtml)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</(p|div|h\d|li|tr|table|ol|ul)>", "\n", s)
    s = re.sub(r"(?i)<li[^>]*>", "- ", s)
    s = re.sub(r"(?s)<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t\xa0]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return "\n".join(line.strip() for line in s.splitlines()).strip()


def main() -> None:
    host, number, out = sys.argv[1:4]
    lang = sys.argv[4] if len(sys.argv) > 4 else "de"
    url = f"https://{host}/api/{lang}/texts_of_law/{number}"
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)["text_of_law"]
    body = to_text(d["selected_version"]["xhtml_tol"])
    head = (
        f"# {d['systematic_number']} {d['title']}\n\n"
        f"- Source: {d['canonical_link'].replace('http://', 'https://')}\n"
        f"- Version: {d['text_of_law_dates_str']}\n"
        f"- Abrogated: {d['abrogated']}\n"
        f"- Retrieved: {datetime.date.today().isoformat()} via {url}\n"
        f"- Plain-text conversion of the portal's XHTML; check the source for authoritative wording.\n\n---\n\n"
    )
    with open(out, "w", encoding="utf-8") as f:
        f.write(head + body + "\n")
    print(f"wrote {out}: {len(body)} chars; {d['text_of_law_dates_str']}", file=sys.stderr)


if __name__ == "__main__":
    main()
