# Wildcamp CH

Tap a spot on the map and see whether wild camping there is likely allowed in Switzerland.

## What it checks
1. **Protected zones** (national park, federal hunting reserves, wildlife quiet zones, floodplains, bogs, fens, dry meadows, amphibian sites; plus federal waterbird reserves and Pro Natura reserves, which only trigger a "Caution") via the geo.admin.ch `identify` API. See `src/zones.ts`.
2. **Cantonal nature reserves** (Bern, Ticino, Valais, Geneva, Glarus, Fribourg, Lucerne and Jura so far): Bern's 244 reserves are bundled as polygons (`public/reserves-be.json.gz`, 132 KB). Each reserve's protection decree was downloaded (scans OCR'd) and searched for camping clauses, in German and French: 181 name camping or tenting as prohibited and 20 prohibit entering the reserve or leaving the marked paths, so camping is effectively banned (all 201 → "Not allowed", with the decree link); the other 43 are old decrees that say nothing about camping, so they are "Caution". The scan is automated and checked by reading the matches for every reserve that was not obvious, not by reading every decree line by line; see `docs/sources/BE/reserves_decree_scan.csv`. Ticino's 351 in-force protection-decree polygons (`public/reserves-ti.json.gz`, 63 KB) come from the canton's WFS; the 26 decrees behind them were read in Italian: 15 prohibit camping (294 polygons → "Not allowed", with the decree link and any stated exception such as authorised occasional-camping areas), 11 say nothing (57 polygons → "Caution"); see `docs/sources/TI/reserves_decree_scan.csv`. Valais's 100 sites protected by cantonal decision (`public/reserves-vs.json.gz`, ArcGIS layer `Nature/1101`) link to 49 decisions on `lex.vs.ch`, read in French: 12 prohibit camping or tenting and 3 prohibit entering the marsh (or leaving the paths), so 15 of the 49 decisions are "Not allowed"; the other 34 decisions list prohibited activities without camping and stay "Caution"; see `docs/sources/VS/reserves_decision_scan.csv`. Jura reserves are queried live from the canton's WMS and tested against the returned polygon; the canton states overnighting outside campsites is banned in all its nature reserves. Geneva's 68 sites (`reserves-ge.json.gz`): the cantonal regulation on nature reserves prohibits all activity except on signed paths, so 'reserves' are "Not allowed" and other protected sites "Caution". Lucerne's 20 protected areas (`reserves-lu.json.gz`): 18 protection ordinances on `srl.lu.ch` prohibit camping/tenting or entering ("Not allowed"), 2 are silent ("Caution"); see `docs/sources/LU/reserves_ordinance_scan.csv`. Glarus's protected areas (`reserves-gl.json.gz`) and Fribourg's 18 reserves (`reserves-fr.json.gz`) are only "Caution" because their camping rules were not read. All of these are built by `scripts/build_*_reserves.py`. The other 17 cantons were searched and nothing usable was found (no published polygons, services that block scripted access, or polygons without legal texts): AG, AI, AR, BL, BS, GR, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG, ZH. Details in `docs/CANTON_RESEARCH.md`.
3. **Forest / treeline**: a forest map built from swissTLM3D forest polygons (`public/forest-mask.bin.gz`, 25 m grid, 3.7 MB, loaded by the browser at startup) combined with elevation. See `src/treeline.ts`:
   - in forest (closed, open, or shrub forest) → `forest`
   - otherwise compare elevation with the **local upper forest limit** (`public/treeline-surface.bin.gz`, 1 km grid, 29 KB): ≥ limit + 100 m → `above`; < limit − 100 m → `below`; within ±100 m → `unknown`
   - where there is no local estimate (no forest within 5 km): fixed bands — below 1500 m → `below`; forest within 500 m → `unknown`; ≥ 1800 m → `above`; else `unknown`

   The local limit comes from the swissTLM3D forest polygons' vertex heights: the 98th percentile per 1 km cell, then the *maximum* over a 5 km neighbourhood. That max is deliberately conservative, so the limit tends to read high (e.g. ~2045 m in the Gantrisch where ~1750 m is typical). The effect is that spots genuinely above the treeline may get "below"/"unknown" (a caution), not the reverse.

   If the forest map fails to load, it falls back to an elevation-only estimate and says so.

4. **Canton** (swissBOUNDARIES3D) shown for every spot, with its camping rule where one has been read from the primary text. Currently recorded: OW, NW, TI, VD, SG, AI; the others show "cantonal rules are not verified". A `banned` rule forces "Not allowed" and `restricted` caps at "Caution". Rules live in `src/cantons.ts`; tests require an official cantonal/federal source, a check date and the saved source text under `docs/sources/`. See `docs/CANTON_RESEARCH.md`.

5. **Municipality** (swissBOUNDARIES3D) is shown for every spot. Municipal rules are verified for the City of Bern only (Campingverordnung SSSB 732.221: ban on the city's public ground outside designated areas; it cannot tell public from private ground, so it only caps at "Caution"). Everywhere else the app tells users to look up the municipality's police regulations. Entries live in `src/municipalities.ts` under the same source gate as cantonal rules.

**Interface**: mobile-first map with place search (geo.admin.ch SearchServer), a locate-me button, a bottom sheet with a verdict banner and a checklist (worst findings first, sources linked), a zones layer toggle and a copy-link button. Every spot has a shareable `#lat,lon,zoom` link.

Verdicts are `Not allowed`, `Caution`, `Likely OK` or `Unknown`. The app never says "legal".

## Limits
There is no federal wild-camping law. Rules are cantonal and municipal, and the treeline is a rule of thumb, not a legal test. Private land, grazing areas, and local bans are not checked.

## Status
Verified against the live geo.admin.ch API:
- All zone layer IDs exist and are queryable via `identify`. The dedicated National Park layer is *not* queryable, so the parks layer is used and filtered to category `SNP`.
- Zone names come from each feature's `label`; wildlife quiet zones also report the restriction, protection season and canton.
- Elevation via the `height` service.

Forest map accuracy (checked against the source polygons): 294/300 points inside large forests read as forest; 295/300 points 60 m+ from any large forest read as not-forest (misses are small, open, or shrub forest). Grid resolution is 25 m, so edges are approximate. Forest data is swissTLM3D 2026-02; rebuild to refresh.

Also verified: the API sends `access-control-allow-origin: *`, and the built app runs in headless Chromium (forest map download/decompression, lookup, and rendering).

## To do
- [ ] **Remaining canton rules**: 20 of 26 have no recorded rule. For GR, VS, BE, FR, JU, UR, NE, LU, SZ and ZH the cantonal texts were read and contain no general rule for a hiker's tent (municipal rules decide); GE, BS, AG, AR, BL, GL, SH, SO, TG and ZG are unresolved. See `docs/CANTON_RESEARCH.md`.
- [ ] **Cantonal nature reserves in the other 17 cantons** (see item 2 for what was tried). No national dataset exists (checked: swissTLM3D `TLM_SCHUTZGEBIET` is the national park only; swissTLMRegio protected areas are coarse parks; the geo.admin.ch layers are federal inventories, Pro Natura and bird reserves). Graubünden's `naturschutz` WFS has biotopes, geotopes, parks and landscapes but no separate cantonal reserve layer. Some cantonal services block scripted access.
- [ ] The 43 Bern reserves whose decrees do not mention camping stay at "Caution"; a person could read them to see whether a general ban on changes or on leaving paths applies.
- [ ] Municipal rules beyond the City of Bern (about 2,100 municipalities; no national dataset).
- [ ] Offline caching (PWA).
- [ ] Use quiet-zone protection season to show "restricted only 21.12.–30.04." instead of a flat no.

## Rebuilding the forest data
```
pip install -r scripts/requirements.txt
# download swissTLM3D (shapefile) from https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/ and extract TLM_BB/
python3 scripts/build_forest_mask.py <dir-with-BODENBEDECKUNG-shp> public/forest-mask.bin.gz 25
python3 scripts/build_treeline_surface.py <dir-with-BODENBEDECKUNG-shp> public/treeline-surface.bin.gz
```
The full download is about 3.6 GB; only the land-cover files are used. Takes ~1 minute.

## Dev
```
npm install
npm run dev     # local server (deep link a spot with /#lat,lon,zoom)
npm test        # rules, parsing and coordinate tests
LIVE=1 npm test # also hit the real API (in a proxied sandbox add NODE_USE_ENV_PROXY=1)
npm run build
```
Map data: © swisstopo, © BAFU.
