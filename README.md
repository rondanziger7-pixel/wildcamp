# Wildcamp CH

Tap a spot on the map and see whether wild camping there is likely allowed in Switzerland.

## What it checks
1. **Federal zones** via the geo.admin.ch `identify` API (`src/zones.ts`, `src/geoadmin.ts`). What each does, from the primary texts saved in `docs/sources/CH/`:
   - *Not allowed*: Swiss National Park; federal hunting reserves (VEJ Art. 5 para. 1 let. e bans free tenting and camping); wildlife quiet zones whose own data says statutory entry ban or path-only rule **and** whose season is running today.
   - *Caution* (no federal camping ban by name, so local rules decide): floodplains and glacier forefields (AuenV Art. 5 para. 2 let. c), raised bogs, fens, dry meadows, amphibian sites, waterbird reserves, Pro Natura reserves, and wildlife quiet zones that are only recommended, have another rule, apply to winter sports only, or are out of season today. An army shooting zone becomes caution on a day when shooting is listed.
   - *Info*: mire landscapes, BLN landscapes, army shooting zones with no firing today, and glacier ice (hazard note, not a legal finding).
   - The federal wildlife-quiet-zone map is incomplete (BAFU: status varies between cantons), so a ridge can be in a zone that is not on it. The result says so.
2. **Cantonal nature reserves** (Bern, Ticino, Valais, Geneva, Glarus, Fribourg, Lucerne, Solothurn and Jura so far): Bern's 244 reserves are bundled as polygons (`public/reserves-be.json.gz`, 132 KB). Each reserve's protection decree was downloaded (scans OCR'd) and searched for camping clauses, in German and French: 181 name camping or tenting as prohibited and 20 prohibit entering the reserve or leaving the marked paths, so camping is effectively banned (all 201 → "Not allowed", with the decree link); the other 43 are old decrees that say nothing about camping, so they are "Caution". The scan is automated and checked by reading the matches for every reserve that was not obvious, not by reading every decree line by line; see `docs/sources/BE/reserves_decree_scan.csv`. Ticino's 351 in-force protection-decree polygons (`public/reserves-ti.json.gz`, 63 KB) come from the canton's WFS; the 26 decrees behind them were read in Italian: 15 prohibit camping (294 polygons → "Not allowed", with the decree link and any stated exception such as authorised occasional-camping areas), 11 say nothing (57 polygons → "Caution"); see `docs/sources/TI/reserves_decree_scan.csv`. Valais's 100 sites protected by cantonal decision (`public/reserves-vs.json.gz`, ArcGIS layer `Nature/1101`) link to 49 decisions on `lex.vs.ch`, read in French: 12 prohibit camping or tenting and 3 prohibit entering the marsh (or leaving the paths), so 15 of the 49 decisions are "Not allowed"; the other 34 decisions list prohibited activities without camping and stay "Caution"; see `docs/sources/VS/reserves_decision_scan.csv`. Jura reserves are queried live from the canton's WMS and tested against the returned polygon; the canton states overnighting outside campsites is banned in all its nature reserves. Geneva's 68 sites (`reserves-ge.json.gz`): the cantonal regulation on nature reserves prohibits all activity except on signed paths, so 'reserves' are "Not allowed" and other protected sites "Caution". Lucerne's 20 protected areas (`reserves-lu.json.gz`): 18 protection ordinances on `srl.lu.ch` prohibit camping/tenting or entering ("Not allowed"), 2 are silent ("Caution"); see `docs/sources/LU/reserves_ordinance_scan.csv`. Glarus's protected areas (`reserves-gl.json.gz`) and Fribourg's 18 reserves (`reserves-fr.json.gz`) are only "Caution" because their camping rules were not read. All of these are built by `scripts/build_*_reserves.py`. Solothurn's 101 reserves (`reserves-so.json.gz`): the in-force legal documents (143 PDFs, scans OCR'd) were classified like Bern's; 11 prohibit camping ("Not allowed"), 90 do not name it or have no readable document ("Caution"); see `docs/sources/SO/reserves_document_scan.csv`. The other 16 cantons were searched and nothing usable was found (no published polygons, services that block scripted access, or polygons without legal texts): AG, AI, AR, BL, BS, GR, NE, NW, OW, SG, SH, SZ, TG, UR, VD, ZG, ZH. Details in `docs/CANTON_RESEARCH.md`.
3. **Forest / treeline**: a forest map built from swissTLM3D forest polygons (`public/forest-mask.bin.gz`, 25 m grid, 3.7 MB, loaded by the browser at startup) combined with elevation. See `src/treeline.ts`:
   - in forest (closed, open, or shrub forest) → `forest`
   - otherwise compare elevation with the **local upper forest limit** (`public/treeline-surface.bin.gz`, 1 km grid, 29 KB): ≥ limit + 100 m → `above`; < limit − 100 m → `below`; within ±100 m → `unknown`
   - where there is no local estimate (no forest within 5 km): fixed bands — below 1500 m → `below`; forest within 500 m → `unknown`; ≥ 1800 m → `above`; else `unknown`

   The local limit comes from the swissTLM3D forest polygons' vertex heights: for each 500 m cell, the 98th percentile of the forest vertices within 1.5 km (widening to 3 km and then 5 km where there is hardly any forest). An earlier version took the maximum over 5 km, which let one high stand of trees in the next valley decide: near Capanna Barone (Ticino) it read 2177 m while forest within 1.5 km ends near 1800 m, so treeless ground at 2050 m was called "below the treeline". "Above" is never claimed below 1600 m, and nothing below 1500 m counts as above the treeline.

   If the forest map fails to load, it falls back to an elevation-only estimate and says so.

4. **Canton** (swissBOUNDARIES3D) shown for every spot, with its camping rule where one has been read from the primary text. Currently recorded: OW, NW, TI, VD, SG, AI (Ticino: restricted, but tolerated above the treeline, since the law excepts tenting for a bivouac in the mountains and does not define the term); the others show "cantonal rules are not verified". A `banned` rule forces "Not allowed" and `restricted` caps at "Caution". Rules live in `src/cantons.ts`; tests require an official cantonal/federal source, a check date and the saved source text under `docs/sources/`. See `docs/CANTON_RESEARCH.md`.

5. **Municipality** (swissBOUNDARIES3D) is shown for every spot. Municipal rules are verified for the City of Bern only (Campingverordnung SSSB 732.221: ban on the city's public ground outside designated areas; it cannot tell public from private ground, so it only caps at "Caution"). Everywhere else the app tells users to look up the municipality's police regulations. Entries live in `src/municipalities.ts` under the same source gate as cantonal rules.

**Interface**: mobile-first map with place search (geo.admin.ch SearchServer), a locate-me button, a bottom sheet with a verdict banner and a checklist (worst findings first, sources linked), a layers menu (signposted hiking trails from swissTLM3D, restricted zones) and a copy-link button. Every spot has a shareable `#lat,lon,zoom` link.

6. **Weather card** (every spot in Switzerland): a night picker (tonight and the next three nights), headline tiles (sky, low and freezing level, gusts and direction, rain and chance), and three hourly charts (temperature, rain, wind gusts) with hover and keyboard readouts and a table view. Code: `src/weatherview.ts`, `src/chart.ts`, `src/comfort/weather.ts`. The forecast request asks for the extra variables (rain chance, sky code, cloud, snow, freezing level, dew point) and falls back to the core five if the service refuses them.
7. **Scores and details**: every tap shows two cards, *Legality* and *Sleep*, each with a 0 to 100 score and a label; tap a card to open its details (the legality checklist with sources, or the sleep factors). Two chips under them show the nearest water (with glacier-water and dirty-water tags) and the weather for the chosen night; tap the water chip for the sleep details or the weather chip for the forecast card. The scores are plain summaries, not probabilities (`src/scores.ts`): *legality* is 0 for not allowed, 85 for likely OK (never higher: rules and private land are never fully checked), 40 for unknown, and for caution 55 minus 10 per warning (at least 25); *sleep* is 50 plus 6.25 per point of the comfort factor total, capped at 25 in a storm. Outside Switzerland there is no score.
8. **Water** (a main sleep criterion, `src/comfort/water.ts`): the nearest stream or lake in the swissTLM3D hydrography within 800 m (types 4 and 101 are read as streams and lakes; other types are ignored because I could not find the object catalogue to confirm what they are). Close water scores up (about 150 m: +2, 400 m: +1), no water within 800 m scores down, and water right beside the spot is flagged as noisy and flood-prone. *Glacier water*: glacier ice within 1 km of the water (swisstopo glacier extent) is tagged "glacier water", within 3 km "maybe glacier water"; this is judged from distance only, so a large river fed by a glacier far upstream is not tagged, and a nearby hanging glacier can tag a stream it does not feed. *Dirty water*: only one kind is known from the data, a wastewater treatment plant on the same watercourse (same watercourse number) that lies higher than the water, from the federal plant register; it is tagged "dirty: sewage upstream" with the plant and its share of the river's low flow. Livestock, wildlife and unmapped sources are not known, so every result says to treat or filter surface water.
9. **Speed**: a tap runs the legality lookups at once and shows the legality card as soon as they are in (about 1 to 3 s). The sleep score then appears as soon as any part of its data has arrived, marked with "…" and a "still checking" note, and refreshes as terrain, trails and huts, water and the forecast come in. Every request has a time limit (7 s for legality lookups, 6 s per sleep part) and the whole check has a budget of about 10 s from the tap: anything still missing then is dropped and listed as not checked, never counted as good. The very first tap also waits (up to 6 s) for the local map data (forest map 3.7 MB, reserves) to download.
10. **Sleep comfort** (separate from legality; not shown where camping is not allowed or outside Switzerland; follows the night chosen in the weather card). Code in `src/comfort/`. Rule-of-thumb rating (great / good / okay / poor) from:
   - *Terrain*, from the swisstopo elevation model through the geo.admin.ch profile service (2 m model, four lines through the spot, 10 m spacing within 500 m and 50 m spacing within 5 km): slope over 20 m (can you pitch a tent), wind shelter (average horizon angle around the spot, and whether it is an open ridge or top), hollows (cold air), steep slopes above and drops close by.
   - *Weather for the chosen night* (evening 18:00 to 08:00; pick tonight or one of the next three nights) from Open-Meteo (CC BY 4.0, hourly, adjusted to the spot's elevation). It changes the rating: lowest temperature, gusts compared with the terrain horizon on the windward side, rain amount and chance, snow and freezing level, fog or condensation, and thunderstorms. A forecast thunderstorm or gusts of 80 km/h or more cap the night at "Poor" however good the spot is. The card shows the spot alone and the weather's effect separately.
   - *Crowds*, judged from distances only (no visitor counts exist in these datasets): marked hiking trails, huts and inns, public transport and cableway stops, car parks and villages.
   - *Water* in the swissTLM3D hydrography within 400 m, and *morning sun* (sun position against the terrain horizon).
   The factor thresholds and the rating cut-offs are my own judgement and have not been tested against campers' experience. Trees, rock, snow and local wind effects are not modelled. A check that could not run is listed as missing and never counted as good.

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
- [ ] Let the user pick a date, so the quiet-zone season check is not tied to today.

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
Map data: © swisstopo, © BAFU. Elevation: swisstopo swissALTI3D. Forecast: Open-Meteo.com (CC BY 4.0).
