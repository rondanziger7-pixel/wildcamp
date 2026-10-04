# Canton wild-camping rules: research log

Last updated 2026-10-04. The source texts are saved in `docs/sources/<canton code>/` so every rule in `src/cantons.ts` can be checked against what was read. Pages were fetched over plain HTTPS from the sandbox (`scripts/fetch_lexwork.py` for cantonal law portals built on LexWork; `curl` + `pdftotext` for PDFs). The research assistant's page-fetch tool was blocked for every site, so web-search summaries were used only to *find* documents, never as the source of a rule.

## Rules in the app (read from the primary text)
| Canton | Stance | Source read | Gist |
|---|---|---|---|
| OW | restricted | Gesetz über das Campieren (GDB 971.4), in force 2015-03-01 | Tents/caravans/motorhomes outside approved campsites banned (Art. 6); a single night without permit allowed if no public or private interests are impaired (Art. 8); fines (Art. 11) |
| NW | restricted | Cantonal leaflet, 2021-11-18, §3.11 (guidance, not statute); Biotope ordinance NG 332.11 | In principle not allowed without landowner consent; single nights above the forest line (not groups) as exception; general ban in nature reserves, federal hunting reserves, wildlife quiet zones; tents banned off-path in protected bogs and dry sites |
| TI | restricted | Legge sui campeggi, 2004-01-26 (state 2024-01-01) | Camping only in authorised campsites (Art. 2); exception: bivouac tenting in the mountains; "mountains" undefined; fines CHF 50 to 10,000 (Art. 27) |
| SG | tolerated | Kantonsforstamt leaflet, 2022-05-02, §3.6 (guidance) | Individuals and small groups mostly allowed; not in federal hunting reserves, nature reserves, municipal protection areas; avoid the upper forest line, floodplains, wetlands |

`restricted` caps the verdict at "Caution"; `tolerated` adds the note only. Leaflets are cantonal *guidance*, which the summaries say.

## Read, but no general camping rule found
- **GR**: the Police Act (BR 613.000) and Police Ordinance (BR 613.100) contain no camping provisions. This is consistent with reports that municipalities decide, but it is not proof there is no other cantonal rule. Municipal rules were not checked.
- **UR**: the Campingverordnung (RB 70.2431) covers commercial campsites only. A separate reserve ordinance (RB 10.5110) bans camping on the Urnersee south shore. No general rule found.

## Not found or not researched
- **BE**: only the *city* of Bern's rule turned up (reported ban on public land, fines to CHF 2,000); no cantonal law found.
- **VS**: nothing verified. A law that a search attributed to Valais (935.61) is Vaud's (RSV 935.61), so it was **not** used.
- **VD**: Vaud's camping law (RSV 935.61) exists but has not been read.
- **JU, ZH, GE, BS, AG, AI, AR, BL, FR, GL, LU, NE, SH, SO, SZ, TG, ZG**: not researched. The widely repeated claim that Aargau allows one night is unverified and one article calls it questionable.

## Federal and cross-cutting points seen in official texts
- Federal ordinance on hunting reserves (SR 922.31) Art. 5 para. 1 let. e bans camping and free tenting, including bivouacking, in federal hunting reserves. This is cited in the SG leaflet; the ordinance itself was not read.
- Free entry to forest and pasture in customary measure: ZGB Art. 699. Uses disadvantageous to the forest are not allowed: WaG Art. 16 (cited in the SG leaflet).
- SG's guidance says to avoid the upper forest line as sensitive habitat, so "above the treeline is fine" is not universal advice.

## Adding or updating a rule
1. Save the source: `python3 scripts/fetch_lexwork.py <host> <number> docs/sources/<CODE>/<number>.md [lang]` for LexWork portals, or download the PDF and `pdftotext -layout`.
2. Read it. Quote article numbers in the summary and say if it is guidance rather than law.
3. Add the rule to `src/cantons.ts`. `npm test` rejects sources that are not on the canton's official domain (or admin.ch), bad dates, and rules with no saved source text.
4. Municipal rules are out of scope; the app tells users to check with the municipality.
