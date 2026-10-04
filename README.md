# Wildcamp CH

Tap a spot on the map and see whether wild camping there is likely allowed in Switzerland.

## What it checks
1. **Federal protected zones** (national park, wildlife reserves and quiet zones, floodplains, bogs, fens, dry meadows, amphibian sites) via the geo.admin.ch `identify` API. See `src/zones.ts`.
2. **Forest / treeline**: a forest map built from swissTLM3D forest polygons (`public/forest-mask.bin.gz`, 25 m grid, 3.7 MB, loaded by the browser at startup) combined with elevation. See `src/treeline.ts`:
   - in forest (closed, open, or shrub forest) → `forest`
   - below 1500 m → `below`
   - not in forest but forest within 500 m → `unknown` (the local treeline altitude isn't known, so it won't guess)
   - no forest within 500 m and ≥ 1800 m → `above`
   - otherwise → `unknown`

   If the forest map fails to load, it falls back to an elevation-only estimate and says so.

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
- [ ] **Local treeline altitude.** Forest presence is now real, but the "above treeline" call still uses fixed elevation bands (1500 / 1800 m). Precomputing the upper forest limit per area from the forest map plus a height model would remove the `unknown` band near forest edges.
- [ ] Add per-canton rules (Valais, Graubünden, Ticino, Bern, ... differ) with a source link for each.
- [ ] Add GPS "my location" and offline caching (PWA).
- [ ] Use quiet-zone protection season to show "restricted only 21.12.–30.04." instead of a flat no.

## Rebuilding the forest map
```
pip install -r scripts/requirements.txt
# download swissTLM3D (shapefile) from https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/ and extract TLM_BB/
python3 scripts/build_forest_mask.py <dir-with-BODENBEDECKUNG-shp> public/forest-mask.bin.gz 25
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
