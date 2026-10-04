# Wildcamp CH

Tap a spot on the map and see whether wild camping there is likely allowed in Switzerland.

## What it checks
1. **Federal protected zones** (national park, wildlife reserves and quiet zones, floodplains, bogs, fens, dry meadows, amphibian sites) via the geo.admin.ch `identify` API. See `src/zones.ts`.
2. **Treeline**: currently an elevation estimate only (`estimateTreeline`), which decides just the clear cases (≥ 2300 m above, < 1500 m below).

Verdicts are `Not allowed`, `Caution`, `Likely OK` or `Unknown`. The app never says "legal".

## Limits
There is no federal wild-camping law. Rules are cantonal and municipal, and the treeline is a rule of thumb, not a legal test. Private land, grazing areas, and local bans are not checked.

## Status
Verified against the live geo.admin.ch API:
- All zone layer IDs exist and are queryable via `identify`. The dedicated National Park layer is *not* queryable, so the parks layer is used and filtered to category `SNP`.
- Zone names come from each feature's `label`; wildlife quiet zones also report the restriction, protection season and canton.
- Elevation via the `height` service.

Not verified: browser CORS behaviour (calls were tested from Node, not a browser).

## To do
- [ ] **Treeline.** Still an elevation estimate. `ch.bafu.wald-obere_waldgrenze`, `ch.swisstopo.swisstlm3d-wald` and `ch.bafu.wald-vegetationshoehenstufen_1975` exist but are not queryable by `identify`; WMS `GetFeatureInfo` and 1×1 pixel sampling returned nothing for them (possibly scale-dependent). The vegetation height model's `identify` returns only tile dates, not heights. Next options: vector forest data from swissTLM3D, or a height-model raster.
- [ ] Add per-canton rules (Valais, Graubünden, Ticino, Bern, ... differ) with a source link for each.
- [ ] Add GPS "my location" and offline caching (PWA).
- [ ] Use quiet-zone protection season to show "restricted only 21.12.–30.04." instead of a flat no.

## Dev
```
npm install
npm run dev     # local server
npm test        # rules, parsing and coordinate tests
LIVE=1 npm test # also hit the real API (in a proxied sandbox add NODE_USE_ENV_PROXY=1)
npm run build
```
Map data: © swisstopo, © BAFU.
