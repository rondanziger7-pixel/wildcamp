# Wildcamp CH

Tap a spot on the map and see whether wild camping there is likely allowed in Switzerland.

## What it checks
1. **Federal protected zones** (national park, wildlife reserves and quiet zones, floodplains, bogs, fens, dry meadows, amphibian sites) via the geo.admin.ch `identify` API. See `src/zones.ts`.
2. **Treeline**: currently an elevation estimate only (`estimateTreeline`), which decides just the clear cases (≥ 2300 m above, < 1500 m below).

Verdicts are `Not allowed`, `Caution`, `Likely OK` or `Unknown`. The app never says "legal".

## Limits
There is no federal wild-camping law. Rules are cantonal and municipal, and the treeline is a rule of thumb, not a legal test. Private land, grazing areas, and local bans are not checked.

## Before this is trustworthy
- [ ] Verify every layer ID in `src/zones.ts` against `https://api3.geo.admin.ch/rest/services/api/MapServer`. They were written from memory and not checked, because that host was blocked when this was built.
- [ ] Verify the `identify` attribute names used for zone names in `src/geoadmin.ts`.
- [ ] Replace the elevation treeline estimate with a forest / vegetation-zone layer.
- [ ] Add per-canton rules (Valais, Graubünden, Ticino, Bern, ... differ) with a source link for each.
- [ ] Add GPS "my location" and offline caching (PWA).

## Dev
```
npm install
npm run dev     # local server
npm test        # rules + coordinate tests
npm run build
```
Map data: © swisstopo, © BAFU.
