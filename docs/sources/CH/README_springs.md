<!-- Research memo, read 2026-10-06. It backs the mapped-spring lookup in src/comfort/water.ts (swissGEOCOVER2D points of kind "Quelle"): partial coverage, so a spring found is
     real and a spring not found proves nothing; the map does not say the water is drinkable. -->

# r2 (1): Springs and drinking-water points (springs, fountains, hut water)

Researcher memo for Wildcamp CH. Read live on **2026-10-06**. Repo not edited. Tested at Kesch-Hütte (46.6452, 9.8752), Alp Plazbi (46.649, 9.86), Oeschinensee (46.498, 7.715).

## 1. Bottom line

- **No federal dataset of drinking-water points exists on geo.admin.ch** (no fountains with potability, no hut water, no water-supply points, no groundwater protection zones: those are cantonal). Evidence: scan of all 902 layers of the `all` catalog for Quelle / Quellen / Brunnen / Trinkwasser / Wasserfassung / Fassung / Grundwasserschutz / Schutzzone / Wasserversorgung / fountain / drinking / spring found only unrelated layers (soil atlas, nitrate, NAQUA groundwater monitoring, thermal waters, geotopes, hydrogeological map sheets); `SearchServer?type=layers` for "Quelle", "Quellen", "Brunnen", "Trinkwasser" returned the same unrelated layers. The swissTLM3D object catalog (Objektkatalog 2.4, Feb 2026, `https://www.swisstopo.admin.ch/dam/de/sd-web/A3kQ2dAgenqG/2026-02%20swissTLM3D%202.4%20OK-DE.pdf`, section 10.1 `TLM_EINZELOBJEKT`) defines `Brunnen` ("Alleinstehender Brunnen"), `Quelle` ("Deutlich sichtbarer Ursprung eines Baches oder eines Flusses mit dauerndem Wasseraustritt aus dem Boden", captured springs and Brunnstuben are explicitly excluded) and `Wasserversorgung` (reservoir, cistern, pump station), each marked "Noch nicht systematisch erfasst". That feature class is **not published as a layer** on geo.admin.ch (the swissTLM3D layers there are only Strassen, Eisenbahn, Übrige Bahn, Wanderwege, Wald, Gewässernetz and two map renderings).
- **Two usable but partial sources of spring points**, both identify-queryable and CORS-open:
  1. **`ch.swisstopo.geologie-swissgeocover2d_points`** (swissGEOCOVER2D "Geological points"): point objects with `kind_de = "Quelle"` plus `spec_de = "gefasst"` (captured) / `"nicht gefasst"` (not captured) / null. Not scale dependent. Coverage follows the geological map sheets and is very uneven (see section 4). This is the only federal inventory of *unnamed* springs, and the only one that says "captured".
  2. **`ch.swisstopo.swissnames3d`**: objektart `Quelle` (86 features nationwide) and `Brunnen` (39 features nationwide); named objects only, so it is nearly empty in practice (no Quelle or Brunnen within 3 km of any of the three test sites). **Scale dependent**: Quelle are returned only when the virtual map is at most 9 m/px (mapExtent width <= 9 km per 1000 px), Brunnen only at most 1.75 m/px (<= 1.75 km per 1000 px). The app's shelter query (12.5 m/px, `src/comfort/shelters.ts`) can therefore never see either.
- "gefasst" means a tapped spring (often with a Brunnenstube or trough). It does **not** say the water is potable or flowing in autumn. Treat as "possible water source, unverified".
- A hut's own water supply is in no federal dataset (see `r2_hut_data.md`).
- Non-federal pointer (not tested, Overpass is blocked in this sandbox): OpenStreetMap `amenity=drinking_water`, `natural=spring`, `man_made=water_tap` via an Overpass query from the browser.

## 2. Requests that work

### 2a. swissGEOCOVER2D springs (`ch.swisstopo.geologie-swissgeocover2d_points`)

HIT, Oeschinensee, radius 2 km (10 m/px virtual map, tolerance 200 px = 2000 m), 14 geological points returned of which 8 springs (nearest spring 1473 m, nearest captured 1829 m):

```
https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=2621215.6,1149669.1&sr=2056&layers=all:ch.swisstopo.geologie-swissgeocover2d_points&tolerance=200&mapExtent=2616215.6,1144669.1,2626215.6,1154669.1&imageDisplay=1000,1000,96&returnGeometry=true&lang=en&geometryFormat=geojson
```

Sample feature (captured spring 188170 at 46.49685 N 7.69124 E, 1300 m a.s.l.; the third coordinate of the MultiPoint is the elevation):

```json
{"featureId":188170,"layerBodId":"ch.swisstopo.geologie-swissgeocover2d_points",
 "geometry":{"type":"MultiPoint","coordinates":[[2619391.9,1149535.1,1300]]},
 "properties":{"kind":12501001,"kind_de":"Quelle","kind_fr":"source","spec_de":"gefasst","spec_fr":"captée",
   "erl_link":null,"ber_link":null,"label":"Quelle", "dip":999998,"azimuth":0,"...":"(structure-measurement fields, 999998 = not applicable)"}}
```

MISS for springs, Kesch-Hütte, radius 2 km: the same request with `geometry=2786512.3,1168891.5` (mapExtent 2781512.3,1163891.5,2791512.3,1173891.5) returns 63 geological points but only `Orientierung der Faltenachse`, `Orientierung der Schichten`, `Sturzblock`, no spring. Nearest springs there: 3710 m (id 197308, not captured), 4 more between 3959 and 3969 m. Alp Plazbi: nearest spring 2724 m (id 195643, spec null), none captured within 5 km.

Attributes that matter: `kind_de` / `kind_fr` / `kind` code, `spec_de` / `spec_fr`. Water-related kinds seen (value counts over 7 sampled windows of 3.75 km radius around alpine and prealpine centres, 1240 points): `Quelle` 12501001 (spec gefasst 187, nicht gefasst 88, null 39), `diffuse Quelle` 12501002 (12), `Wiederaustritt eines unterirdischen Bachlaufes` 12501003 (4, resurgence), `Versickerungsstelle eines Baches` 12501004 (2, swallow hole). Everything else in the layer is geology (Orientierung der Schichten, Sturzblock, Hinweis auf Hanginstabilität, erratischer Block, Bohrung, ...), so a client must filter on `kind_de`.

### 2b. swissNAMES3D named springs and fountains (`ch.swisstopo.swissnames3d`)

Attributes: `objektart` (`Quelle`, `Brunnen`), `objektklasse` (`TLM_EINZELOBJEKT`), `name`, `sprachcode`, `namen_typ`, `status`, `label`.

HIT Quelle, "Funtauna Richa" (46.67114 N 9.90144 E), virtual map 3 m/px, tolerance 10 px:

```
https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=2788429.9,1171837.2&sr=2056&layers=all:ch.swisstopo.swissnames3d&tolerance=10&mapExtent=2786929.9,1170337.2,2789929.9,1173337.2&imageDisplay=1000,1000,96&returnGeometry=true&lang=en&geometryFormat=geojson
```

```json
{"featureId":6438,"geometry":{"type":"MultiPoint","coordinates":[[2788429.9,1171837.2]]},
 "properties":{"objektart":"Quelle","objektklasse":"TLM_EINZELOBJEKT","name":"Funtauna Richa","sprachcode":"Rumantsch Grischun inkl. Lokalsprachen","namen_typ":"einfacher Name","status":"offiziell","label":"Funtauna Richa"}}
```

(the response also contains "Val Funtauna", a `Tal`, which has to be filtered out by `objektart`).

HIT Brunnen, "Bebmerbrunnen" (46.72991 N 9.03610 E): needs a **1 m/px** map, `tolerance=40`, `mapExtent=2721600.9,1176154.8,2722600.9,1177154.8` (full URL: `.../identify?geometryType=esriGeometryPoint&geometry=2722100.9,1176654.8&sr=2056&layers=all:ch.swisstopo.swissnames3d&tolerance=40&mapExtent=2721600.9,1176154.8,2722600.9,1177154.8&imageDisplay=1000,1000,96&returnGeometry=true&lang=en&geometryFormat=geojson`). The same request at 3 m/px returns `[]`.

Visibility thresholds measured (virtual map metres per pixel at which a known feature is still returned): Quelle yes at 9 m/px, no at 10; Brunnen yes at 1.75, no at 2; campsite polygons yes at 9, no at 10 (see `r2_campsites.md`). Because the radius is `tolerance x m/px`, a 1 km search for Brunnen at 1 m/px is `tolerance=1000`; tolerance values up to 100000 px were accepted (no hard limit seen).

MISS: Kesch-Hütte, Alp Plazbi and Oeschinensee have no Quelle and no Brunnen within 3 km. Checked at 6 m/px (`tolerance=500`, `mapExtent` +/- 3000 m; 39, 36 and 75 swissNAMES3D objects returned, none a spring) and at 1 m/px for the Brunnen (`tolerance=3000`, `mapExtent` +/- 500 m; 52, 69 and 147 objects returned, none a fountain).

## 3. Query mechanics that matter

- **Identify cap and paging**: at most 201 features per request and per underlying table; results are **not sorted by distance** (checked: distances in response order are arbitrary). In geology-rich windows a 5 km radius returns the cap (Oeschinensee: 201 of 246 points in 5 km). Page with `&offset=<n>` (works, verified: pages 0, 201, ... return disjoint sets) until a page has fewer than 201 results; or use a small radius. The official docs (`https://docs.geo.admin.ch/access-data/identify-features.html`) list `limit` (default 50, max 200) and `offset`, applied per table.
- `layerDefs`/`where` filtering is not available for these layers (HTTP 400 "not queryable"), so spring-only filtering cannot be done server-side; filter `kind_de === 'Quelle'` / `objektart` client-side.
- Distance: use the first two coordinates of each geojson `MultiPoint` (a z value follows in geocover).
- Typical cost: Oeschinensee 5 km radius, 2 pages, 783 ms; Kesch-Hütte 5 km, 2 pages, 1.7 s.
- `find` also works on swissNAMES3D for the full named set: `.../MapServer/find?layer=ch.swisstopo.swissnames3d&searchText=Quelle&searchField=objektart&contains=false&returnGeometry=true&geometryFormat=geojson&sr=2056` returns 602 rows = 86 distinct features (each feature repeated 7 times, once per scale level), Brunnen 156 rows = 39 features (4x). Dedupe by `id`. ~300 KB / 80 KB with geometry. This is the cheap way to get all named springs once.

## 4. Coverage and quality (sample of ten 3 km-radius windows, about 28 km2 each)

| window | swissNAMES3D Quelle / Brunnen | geocover points (all kinds) | geocover Quelle (of which gefasst) |
|---|---|---|---|
| Kandersteg area | 0 / 0 | 29 | 10 (0) |
| Albula (Engadin) | 1 / 0 | 145 | 27 (0) |
| Saas (Wallis) | 0 / 0 | 28 | 0 |
| Klöntal (GL) | 0 / 0 | 3 | 0 |
| Leventina (TI) | 0 / 0 | 184 | 5 (0) |
| Chasseral (Jura) | 0 / 0 | 286 | 15 (12) |
| Mittelland near Bern | 0 / 0 | 588 | 135 (123) |
| Engelberg | 0 / 0 | 4 | 0 |
| Appenzell | 0 / 0 | 117 | 17 (8) |
| Pays-d'Enhaut (VD) | 0 / 0 | 169 | 84 (76) |

Reading: the high Alps are thinly covered (the "gefasst" flag is almost only used in the lowlands and the Jura), and the layer abstract says the data are being updated (first complete update by 2030). A spring found is real, a spring not found proves nothing. Nearest springs at the three test sites: Kesch-Hütte 3.7 km (flagged "nicht gefasst"), Alp Plazbi 2.7 km (no `spec_de` flag), Oeschinensee 1.5 km (nearest captured one 1.8 km).

## 5. License and update

- swisstopo data; free since 1 March 2021 under Open Government Data terms (also commercial use), the only condition is a source reference, "Quelle: Bundesamt für Landestopografie swisstopo". Layer `dataStatus`: swissNAMES3D 20260429; swissGEOCOVER2D points 20260901 (catalog entry).
- CORS: `access-control-allow-origin: *` on identify and find; JSON responses are cacheable for 30 min (`cache-control: max-age=1800`).

## 6. Limits summary

201 features per request and table, unsorted, `offset` paging; swissNAMES3D identify is scale limited (Quelle <= 9 m/px, Brunnen <= 1.75 m/px); geocover coverage is patchy and `gefasst` is not a potability statement; no water-supply, fountain-with-potability or hut-water data in any federal layer.

## Appendix: full URLs for the nothing-found case (verified on 2026-10-06)

Kesch-Hütte, swissGEOCOVER2D springs: 63 points returned in 2 km but no spring (not empty; spring filter gives none):

```
https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=2786512.3,1168891.5&sr=2056&layers=all:ch.swisstopo.geologie-swissgeocover2d_points&tolerance=200&mapExtent=2781512.3,1163891.5,2791512.3,1173891.5&imageDisplay=1000,1000,96&returnGeometry=true&lang=en&geometryFormat=geojson
```

