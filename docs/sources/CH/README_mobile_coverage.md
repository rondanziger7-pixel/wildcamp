<!-- Research memo, read 2026-10-06. It backs src/comfort/coverage.ts and the mobile-signal item (BAKOM broadband atlas, 4G and 5G, centre pixel of a 3 x 3 px image).
     Operator predictions for outdoors only: said so in the item; a place without coverage in the model is not "no reception", and covered is not a promise. -->

# r2 (3): Mobile phone coverage (BAKOM)

Researcher memo for Wildcamp CH. Read live on **2026-10-06**. Repo not edited.

## 1. Bottom line

- **Available, but only as a coarse "number of providers" class, and not through `identify`.** Layers `ch.bakom.mobilnetz-3g`, `ch.bakom.mobilnetz-4g`, `ch.bakom.mobilnetz-5g` (BAKOM "Breitbandatlas", owner Bundesamt für Kommunikation BAKOM, `dataStatus` 20260430) have **no vector table** (`MapServer/<layer>` answers "No Vector Table was found", so `identify` is unavailable). They are WMS layers (`queryable="1"` in `https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`) that can be read two ways: **WMS GetMap centre-pixel read** (what `src/comfort/hazards.ts` already does) or **WMS GetFeatureInfo**.
- **What the values mean** (layer abstract and legend, identical for 3G/4G/5G): the map is a grid of **100 x 100 m cells**; each cell tells how many of the three operators (Swisscom, Sunrise, Salt) can **theoretically provide that technology outdoors** ("im Aussenbereich: Outdoor, Strassen, öffentliche Plätze"). The figures are operator predictions ("Prädiktionsmodelle ... ohne Gewähr"), not measurements, not indoor, no signal strength, no per-operator split.
  - green RGBA (0,150,0,255) = "Covered by 3 providers (expected availability)"; GetFeatureInfo `value_0` = `"3"`
  - orange RGBA (255,186,0,255) = "Covered by less than 3 providers"; `value_0` = `"2"` (a value `"1"` was never seen in 189 sampled points x 3 layers, so "<3" cannot be split into 1 or 2 providers)
  - fully transparent (alpha 0) = no provider expected to cover the cell (and also outside Switzerland); GetFeatureInfo returns no feature.
- **2G: not offered** (no layer; 2G is switched off in Switzerland). **3G is nearly gone**: in 189 sample points the 3G layer never showed green, only orange or nothing (3G sunset), so do not present 3G as a reliable fallback.
- The app should present it as "Mobile data (outdoor, predicted)": 5G / 4G / 3G with "all three providers", "some providers" or "none expected".

## 2. Working requests

GetMap centre pixel (use a **3 x 3 px image at 1 m/px**; a 1 x 1 px image comes back fully transparent, and the 9 x 9 px / 13 m/px read of `hazards.ts` blends the 100 m cell edges):

```
https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.bakom.mobilnetz-4g&STYLES=&CRS=EPSG:2056&BBOX=2786510.8,1168890,2786513.8,1168893&WIDTH=3&HEIGHT=3&FORMAT=image/png&TRANSPARENT=TRUE
```

(BBOX = point +/- 1.5 m; the centre pixel is the answer.) Results at the test points (3G / 4G / 5G):

| point | LV95 | 3G | 4G | 5G |
|---|---|---|---|---|
| Zürich HB 47.3779, 8.5403 | 2683196.8, 1248035.3 | <3 | 3 | 3 |
| Uetliberg 47.3496, 8.4912 | 2679531.2, 1244838.2 | <3 | 3 | 3 |
| Kesch-Hütte 46.6452, 9.8752 | 2786512.3, 1168891.5 | none | <3 | <3 |
| Albula pass 46.5826, 9.8351 | 2783656.3, 1161841.2 | <3 | 3 | <3 |
| Oeschinensee 46.498, 7.715 | 2621215.6, 1149669.1 | <3 | <3 | <3 |
| Lötschental near Kippel 46.4, 7.77 (the task's "Fafleralp"; the real Fafleralp is 46.4344, 7.8563) | 2625483.7, 1138791.3 | <3 | 3 | 3 |
| **Val Trupchun 46.6, 10.15 (nothing)** | 2807713.2, 1164560.1 | none | none | none |

Verification of the pixel read: over 66 grid points, 3 x 3 px read vs GetFeatureInfo agreed on 63 (the 3 differences were pixel "<3" while GetFeatureInfo returned a neighbouring "3" cell: GetFeatureInfo picks the nearest cell centre within a pixel tolerance, so the pixel read is the exact-cell answer). Across 144 grid points over the Swiss Alps and Mittelland, 4G: 79 cells "3", 20 "<3", 46 none; no other value ever occurred.

GetFeatureInfo alternative (returns the cell centre as a point plus the value):

```
https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=ch.bakom.mobilnetz-4g&QUERY_LAYERS=ch.bakom.mobilnetz-4g&STYLES=&CRS=EPSG:2056&BBOX=2786452.3,1168831.5,2786572.3,1168951.5&WIDTH=9&HEIGHT=9&I=4&J=4&INFO_FORMAT=application/json&FEATURE_COUNT=5
```

```json
{"type":"FeatureCollection","name":"ch.bakom.mobilnetz-4g","features":[
 {"type":"Feature","properties":{"value_0":"2"},"geometry":{"type":"Point","coordinates":[2786549.3,1168848.5]}}]}
```

(this is Kesch-Hütte, 4G: value "2" = fewer than 3 providers; the point is the 100 m cell centre 37 m east / 43 m south of the query point). Notes: a 1 m x 1 m bbox returns nothing (the tolerance is in pixels), a 100 m bbox at 1 m/px can return two neighbouring cell centres (Zürich HB returned two features, both "3"); other `INFO_FORMAT`: `text/plain` ("ch.bakom.mobilnetz-4g.value_0.name = '3'"), `text/xml` and `application/vnd.ogc.gml` work, `text/html` and `application/geo+json` are rejected.

Scale: GetMap renders at any fine scale (tested from 1:1,600 up to 1:400,000); at 1:4,000,000 and coarser it is blank. The catalog's "1:10'000 - 1:1'000'000" is the map viewer's range only.

Legend images: `https://api3.geo.admin.ch/static/images/legends/ch.bakom.mobilnetz-4g_en.png` (same file for 3g, 5g; 276 x 103 px, two classes).

## 3. Related layer that can be identified: base stations

`ch.bakom.standorte-mobilfunkanlagen` ("Mobilfunkanlagen", `dataStatus` 20261005, vector, identify works, not scale limited). Attributes: `station` (operator and site id, e.g. "Swisscom MOTX", "Salt VS_0048A", "SBB ZIM-SY-06934"), `techno_de` ("Technologie 2G", "3G,4G", "3G,4G,5G", "4G", "4G,5G"), `typ_de` (Outdoor > 6 Werp, Outdoor <= 6 Werp, Indoor <= 6 Werp, Tunnel), `power_de` (very small up to 6 W, small up to 500 W, medium up to 5000 W, large above 5000 W), `agw_de` (installation limit value V/m), `bewilligung_de` ("Standortdatenblatt <date>"), `adaptiv_de`, `koord`. Example (identify with geometry, 10 m/px virtual map, `tolerance=1500` = 15 km radius, paged with `offset`):

| point | nearest station |
|---|---|
| Kesch-Hütte | 7560 m (3G,4G,5G, outdoor, medium power); none within 5 km |
| Oeschinensee | 106 m (4G, outdoor, medium) |
| Val Trupchun | 4504 m (4G,5G, outdoor, medium) |
| Zürich HB | 9 m (4G, indoor, very small; 1428 stations within 5 km, so page or restrict) |

A distance to the nearest outdoor station is a useful second hint but is no line-of-sight statement. Unlike the coverage layers it has the operator in `station`.

## 4. License, update, limits

- BAKOM data on geo.admin.ch (Breitbandatlas; the abstract names the operators' own coverage maps as authoritative: Salt, Sunrise, Swisscom). Terms: the STAC entries of `ch.bakom.mobilnetz-4g` and `-5g` link the federal general terms (`http://disclaimer.admin.ch`), the geocat record is tagged `opendata.swiss` with update frequency "biannually" (`dataStatus` 20260430, STAC updated 2026-06-02); the base-station layer `ch.bakom.standorte-mobilfunkanlagen` links `https://opendata.swiss/en/terms-of-use/#terms_by` (open use, source reference required). CORS `access-control-allow-origin: *` on wms.geo.admin.ch; WMS responses are cacheable 1 h.
- Limits: outdoor only, predicted, three-valued, no operator split, no signal strength, 100 m cells, **no coverage in the model does not mean no reception** (valley shadow, hut roofs). The 2/3 split hides 1 versus 2 providers.
- The `ch.bakom.notruf-*_mobilnetz` layers (112, 117, 118, 142, 143, 144, 145, 147) are emergency-call routing catchment areas (which alarm centre answers), not coverage. They are identify-queryable polygons: at Kesch-Hütte `ch.bakom.notruf-112_mobilnetz` returns `{"routing_nr":"(0)989 112 590","name":"Kantonspolizei,Chur"}` and `ch.bakom.notruf-144_mobilnetz` returns `{"routing_nr":"(0)989 144 590","name":"Regionalspital Surselva,Ilanz"}` (request: `identify?...geometry=2786512.3,1168891.5&layers=all:ch.bakom.notruf-112_mobilnetz&tolerance=0&mapExtent=2786412.3,1168791.5,2786612.3,1168991.5&imageDisplay=1000,1000,96`). Could be used to tell which centre answers a 112 or 144 call from the spot.

## Appendix: full URLs for the nothing-found case (verified on 2026-10-06)

Val Trupchun (46.6 N 10.15 E), 4G GetMap 3x3 px: centre pixel is fully transparent [0,0,0,0] = no provider:

```
https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.bakom.mobilnetz-4g&STYLES=&CRS=EPSG:2056&BBOX=2807711.7,1164558.6,2807714.7,1164561.6&WIDTH=3&HEIGHT=3&FORMAT=image/png&TRANSPARENT=TRUE
```

