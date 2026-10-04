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
Absence from the texts below is not proof that no rule exists elsewhere (municipal police regulations, reserve decrees, other laws).
- **GR**: Police Act (BR 613.000) and Police Ordinance (BR 613.100) contain no camping provisions. Consistent with reports that municipalities decide. Municipal rules not checked.
- **UR**: Campingverordnung (RB 70.2431) covers commercial campsites only. A separate reserve ordinance (RB 10.5110) bans camping on the Urnersee south shore.
- **BE**: Kantonale Waldverordnung (BSG 921.111) and Naturschutzverordnung (BSG 426.111) contain no camping provisions. Individual reserve decrees (e.g. Napf) reportedly ban camping, and the *city* of Bern bans it on public land (media, not read).
- **VS**: Construction ordinance (OC 705.100) requires a building permit for tents or caravans outside a campsite only if they stay over 3 weeks or number more than 12, so it does not govern a hiker's tent. The cantonal master plan sheet B.3 (a **draft** modification with tracked changes) states as planning policy that camping outside suitable zones should be prohibited except short special cases and youth camps with landowner and commune consent, and that communes set wild-camping rules in their police regulations. That is not a statute binding hikers, so no rule is recorded.
- **FR**: Forest law (RSF 921.1/921.11) and nature law (RSF 721.0.1) contain no camping provisions. Official web pages recommend camping "only where expressly authorised" in forests and biotopes and ban "staying" (with or without a tent) in wildlife quiet zones. These are recommendations and a restatement of the quiet-zone layer, so no rule is recorded.
- **JU**: official statements (2023 communiqué, Doubs reserve page) say overnighting outside official campsites is prohibited in all nature reserves, and the fines ordinance (OLiLAO 324.111, item 1.6) sets a CHF 100 fine for camping in the Doubs reserve. No general cantonal ban or permission was found. The media claim that Jura is "generally allowed" is unverified.

## Not found or not researched
- **VD**: Vaud's camping law (RSV 935.61, 1978) exists and has not been read. A web-search summary that attributed it to Valais was wrong and was not used.
- **ZH, GE, BS, AG, AI, AR, BL, GL, LU, NE, SH, SO, SZ, TG, ZG**: not researched or nothing found. Reports that Aargau allows one night are unverified (one article calls the claim questionable). Glarus reportedly relies on protected-area bans and dialogue (media).

## Federal texts read (saved in docs/sources/CH/)
- **VEJ (SR 922.31), Art. 5 para. 1 let. e**: "Das freie Zelten und Campieren ist verboten. Vorbehalten bleibt die Benutzung offizieller Zeltplätze. Die Kantone können Ausnahmen bewilligen." Confirms federal hunting reserves are a legal ban (cantons can grant exceptions).
- **WZVV (SR 922.32)**: has **no** general camping or tenting clause. Reserve-specific provisions sit in the federal inventory's object sheets. A web-search summary claimed otherwise; the ordinance text does not support it. Federal bird reserves therefore only trigger "Caution".

## Federal and cross-cutting points seen in official texts
- Free entry to forest and pasture in customary measure: ZGB Art. 699. Uses disadvantageous to the forest are not allowed: WaG Art. 16 (cited in the SG leaflet).
- SG's guidance says to avoid the upper forest line as sensitive habitat, so "above the treeline is fine" is not universal advice.

## Adding or updating a rule
1. Save the source: `python3 scripts/fetch_lexwork.py <host> <number> docs/sources/<CODE>/<number>.md [lang]` for LexWork portals, or download the PDF and `pdftotext -layout`.
2. Read it. Quote article numbers in the summary and say if it is guidance rather than law.
3. Add the rule to `src/cantons.ts`. `npm test` rejects sources that are not on the canton's official domain (or admin.ch), bad dates, and rules with no saved source text.
4. Municipal rules are out of scope; the app tells users to check with the municipality.
