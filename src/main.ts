import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { isInSwitzerland } from './coords';
import { assess, type Assessment } from './assess';
import { lv95ToWgs84, wgs84ToLv95 } from './coords';
import { findMunicipalRule, findUnverifiedNote } from './municipalities';
import { downloadText, shareText, spotsToGpx } from './gpx';
import { LANGS, applyStatic, getLang, setLang, tr, type Lang } from './i18n';
import { reportUrl } from './report';
import { fetchRestrictions } from './restrictions';
import { spotIcon } from './markers';
import { RetryTileLayer, RetryWmsLayer } from './tilelayer';
import { fetchJuraReserves } from './jura';
import { LocalData } from './localstore';
import { assessInputs, checkLegality, collectDetails, terrainOf, withTimeout, CHECK_BUDGET_MS, type DetailsRun } from './spotcheck';
import { searchPlaces, type Place } from './search';
import { isLocationError, parseLocation } from './coordsearch';
import { comfortFor } from './comfort/comfort';
import { fetchWater, type WaterInfo } from './comfort/water';
import { renderEmergency } from './emergencyview';
import type { Position } from './emergency';
import { fetchElevation } from './geoadmin';
import { bulletinAt, fetchBulletin, type AvalancheInfo } from './comfort/avalanche';
import { fetchGround, type GroundInfo } from './comfort/ground';
import { MAX_SAVED_TILES, MAX_TILES, addArea, megabytes, planCorridor, planSpots, planTiles, registerOffline, saveShell, saveTiles, savedTileCount, tileUrl, type TilePlan } from './offline';
import { listenInstall, renderSettings } from './settingsview';
import { announce } from './a11y';
import { campsiteLine, loadCampsites, nearestCampsites, type CampsiteList } from './campsites';
import { MAX_SAVED, defaultName, importSpots, isSaved, loadSaved, removeSpot, saveSpot, spotId, updateLegality, updateSnapshot, updateSpot, verdictLabel, type SavedSpot } from './saved';
import { renderSaved } from './savedview';
import { CANDIDATE_RADIUS_M, FINDER_RADII, elevationRadiusFor, fetchCoverGrid, fetchElevationGrid, rankCells, refineCandidate, separationFor, withWater, zAt } from './finder';
import { combined, radiusText, renderFinder, type FinderRow } from './finderview';
import { beyondForecast, firstEvening, flagsFor, planTrip } from './planner';
import { MAX_NIGHTS, addNight, loadTrip, moveNight, nightsFor, removeNight, saveTrip, setNightSpot, tripNights, type TripNight } from './trip';
import { InputsCache, legalForNight, recheckSpots } from './recheck';
import { MAX_SHARE_SPOTS, decodeShare, isShareHash, shareLink, type DecodedShare, type SharePayload } from './share';
import { renderShared } from './sharedview';
import { cumulativeM, parseGpx, routeToGpx, type ParsedGpx, type RoutePoint } from './route';
import { gatherRouteInputs, reportForDates, type RouteInputs, type RouteReport } from './routecheck';
import { ROUTE_KEY, packRoute, pointAt, routeLine, routeStats, slicePoints, stageInfos, thin, unpackRoute, type StageInfo } from './routeplan';
import { STAGE_KM, renderRoute, runsOf, type RouteViewState } from './routeview';
import { renderTrip } from './tripview';
import { renderPlan } from './planview';
import { legalityScore, sleepScore } from './scores';
import { fetchNearShelters } from './comfort/shelters';
import { fetchHutLink } from './comfort/hutlink';
import { applyNearBuilding, nearBuildingNote } from './comfort/nearbuilding';
import { el, renderOutside, renderResult, type ResultUi } from './resultview';
import { fetchSurroundings, type Surroundings } from './comfort/surroundings';
import { fetchBuildingZone } from './buildingzone';
import { fetchHazards, type HazardInfo } from './comfort/hazards';
import { fetchNoise, type NoiseInfo } from './comfort/noise';
import { moonNight } from './comfort/moon';
import { sunTimes } from './comfort/sun';
import { analyseTerrain, fetchProfiles, FAR, NEAR, type Profiles, type TerrainMetrics } from './comfort/terrain';
import { addDays, fetchForecast, forecastEnd, nightDate, nightWindowFor, nightWindows, soonWindow, summariseNight, windowHours, zurichNow, type Hourly, type NightWindow } from './comfort/weather';
import { renderWeather } from './weatherview';
import { forestAt } from './forestmask';
import { ZONE_LAYERS } from './zones';

// Language: static text is translated first, then the selector in the layers panel (a change reloads the page).
applyStatic();
const langSelect = document.getElementById('lang-select') as HTMLSelectElement;
langSelect.append(...LANGS.map(([code, name]) => Object.assign(document.createElement('option'), { value: code, textContent: name, selected: code === getLang() })));
langSelect.onchange = () => setLang(langSelect.value as Lang);

// Optional deep link: #lat,lon,zoom
const [hLat, hLon, hZoom] = location.hash.slice(1).split(',').map(Number);
const hashView = Number.isFinite(hLat) && Number.isFinite(hLon);
// People who asked their system for less motion get a map that jumps instead of gliding and fading.
const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const map = L.map('map', { zoomControl: false, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm }).setView(hashView ? [hLat!, hLon!] : [46.8, 8.2], hashView ? hZoom || 14 : 8);
if (calm) {
  const still = map as unknown as { flyTo: L.Map['setView']; flyToBounds: (b: L.LatLngBoundsExpression, o?: L.FitBoundsOptions) => L.Map };
  still.flyTo = (at, zoom) => map.setView(at, zoom ?? map.getZoom(), { animate: false });
  still.flyToBounds = (b, o) => map.fitBounds(b, { ...o, animate: false });
}
// Keyboard: the map takes focus, the arrow keys move it and + and - zoom it (Leaflet), Enter checks the spot in the middle, where a cross shows.
const mapBox = map.getContainer();
mapBox.setAttribute('aria-label', tr('Map of Switzerland. Arrow keys move the map, plus and minus zoom, Enter checks the spot in the middle.'));
mapBox.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.target !== mapBox) return;
  ev.preventDefault();
  const c = map.getCenter();
  void checkSpot(c.lat, c.lng);
});
// Escape closes what is open, the innermost first: the map menu, a panel, the sheet.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || ev.defaultPrevented) return;
  const menuBtn = document.querySelector<HTMLButtonElement>('.map-menu button[aria-expanded="true"]');
  if (menuBtn) return void menuBtn.click();
  if (!layersPanel.hidden || !settingsPanel.hidden) {
    layersPanel.hidden = settingsPanel.hidden = true;
    return;
  }
  if (!sheet.classList.contains('closed') && sheet.dataset.state !== 'intro') {
    sheet.classList.add('closed');
    mapBox.focus();
  }
});

L.control.zoom({ position: 'topright' }).addTo(map);

// Tile loading is kept light: no tiles are requested mid-zoom, failed tiles are asked for again (see tilelayer.ts),
// and the overlays below start only at the zooms where they say something and use 512 px tiles (a quarter of the requests).
const LIGHT = { updateWhenZooming: false } as const;
// Overlays are flat colours: an 8-bit PNG is about 45 % smaller than the default and looks the same.
const OVERLAY_FORMAT = 'image/png; mode=8bit';
const baseLayer = new RetryTileLayer(
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  { maxZoom: 18, attribution: '© swisstopo', ...LIGHT },
).addTo(map);

const zoneOverlay = new RetryWmsLayer('https://wms.geo.admin.ch/', {
    layers: ZONE_LAYERS.filter((l) => l.severity !== 'info')
      .map((l) => l.overlayId ?? l.id)
      .join(','),
    format: OVERLAY_FORMAT,
    transparent: true,
    opacity: 0.45,
    attribution: '© BAFU',
    tileSize: 512,
    minZoom: 9,
    ...LIGHT,
  });

// Signposted hiking trails (swissTLM3D): yellow hiking, red mountain, blue alpine trails.
const trailOverlay = new RetryWmsLayer('https://wms.geo.admin.ch/', {
  layers: 'ch.swisstopo.swisstlm3d-wanderwege',
  format: OVERLAY_FORMAT,
  transparent: true,
  opacity: 0.9,
  attribution: '© swisstopo (trails)',
  tileSize: 512,
  minZoom: 11,
  ...LIGHT,
});

// Slopes of 30 degrees or more (swisstopo): where avalanches release. Off by default, toggled in the layers panel.
const slopeOverlay = new RetryWmsLayer('https://wms.geo.admin.ch/', {
  layers: 'ch.swisstopo-karto.hangneigung',
  format: OVERLAY_FORMAT,
  transparent: true,
  opacity: 0.6,
  attribution: '© swisstopo (slope)',
  tileSize: 512,
  minZoom: 11,
  ...LIGHT,
});

// Local data (forest map 3.7 MB, reserves, treeline surface) is fetched after the map has drawn its first view, so it does
// not compete with the map tiles, or at once when a check needs it. A check waits for it (up to DATA_WAIT_MS); one that
// went ahead without it is marked incomplete and judged again when the data is in (see checkSpot).
const data = new LocalData(import.meta.env.BASE_URL);
const ensureData = (urgent = true) => data.load(urgent);

const sheet = document.getElementById('sheet')!;
document.getElementById('sheet-close')!.onclick = () => sheet.classList.add('closed');
const result = document.getElementById('result')!;
const introFind = el('button', 'finder-btn', '🔍 ' + tr('Best spots in this area'));
introFind.type = 'button';
introFind.onclick = () => {
  const c = map.getCenter();
  void findBest(c.lat, c.lng);
};
document.getElementById('intro')!.append(introFind);

function showLoading() {
  sheet.dataset.state = 'loading';
  result.hidden = false;
  result.replaceChildren();
  const p = el('p', 'where');
  p.append(el('span', 'spinner'), data.complete ? tr('Checking this spot…') : tr('Checking this spot (loading the map data for the first time)…'));
  result.append(p);
}

/**
 * Terrain, surroundings, water and forecast for a spot. Every part is requested at once with a shared deadline
 * (about 10 s from the tap): the sleep score appears as soon as the main parts are in, refreshes as the rest
 * arrives, and anything still missing at the deadline is dropped and listed as not checked.
 */
async function loadDetails(ui: ResultUi, lat: number, lng: number, elevation: number | undefined, id: number, tappedAt: number, opts: { onNight?: (w: NightWindow) => void } = {}) {
  ui.setSleepLoading();
  ui.weatherHost.replaceChildren(el('p', 'where', tr('Loading the forecast…')));
  const { e, n } = wgs84ToLv95(lat, lng);
  const now = zurichNow(new Date());
  const today = now.slice(0, 10);
  const windows = nightWindows(now);
  const abort = new AbortController();
  const budget = Math.max(3000, tappedAt + CHECK_BUDGET_MS - Date.now());
  const deadline = window.setTimeout(() => abort.abort(), budget);
  let current: NightWindow = windows[0]!;
  let run: DetailsRun | undefined;

  const announce = () =>
    ui.setNights({
      windows,
      selected: current,
      forecastEnd: run?.got.hourly ? forecastEnd(run.got.hourly) : undefined,
      today,
      onSelect: choose,
      windowFor: (day) => nightWindowFor(day, now),
    });
  const choose = (w: NightWindow) => {
    current = w;
    announce();
    paint();
    opts.onNight?.(w);
  };

  const paint = () => {
    if (id !== checkId || !run) return;
    const { got, done, failed } = run;
    const w = current;
    const isToday = w.day <= today;
    const night = got.hourly ? summariseNight(got.hourly, w) : undefined;
    const nightName = w.label === 'Tonight' ? 'tonight' : w.label === 'Tomorrow' ? 'tomorrow night' : `${w.short} night`;
    const terrain = terrainOf(got);
    const horizon = terrain && (terrain.farHorizon ? terrain.horizon.map((h, i) => Math.max(h, terrain.farHorizon![i]!)) : terrain.horizon);
    // the far profile only refines the sun times, so the score does not wait for it
    const waiting = [!done.near && 'terrain', !done.around && 'trails and roads', !done.water && 'water', !done.shelter && 'huts', !done.ground && 'ground cover', !done.avalanche && 'avalanche bulletin', !done.noise && 'noise', !done.hazards && 'natural hazards', !done.forecast && 'forecast'].filter(Boolean) as string[];
    const comfort = comfortFor({
      terrain,
      night,
      surroundings: got.around,
      water: got.water,
      shelters: got.shelters,
      ground: got.ground,
      // the bulletin and the snow cover are today's: they say nothing about a night weeks away
      avalanche: isToday || w.day <= addDays(today, 1) ? got.avalanche : undefined,
      avalancheFailed: failed.avalanche,
      noise: got.noise,
      noiseFailed: failed.noise,
      hazards: got.hazards,
      hazardsFailed: failed.hazards,
      sun: sunTimes(new Date(`${w.to.slice(0, 10)}T12:00:00Z`), lat, lng, horizon),
      eveningSun: sunTimes(new Date(`${w.day}T12:00:00Z`), lat, lng, horizon),
      // the national flood warning is live data: it says nothing about a night weeks away
      flood: isToday ? got.rules?.flood : undefined,
      floodFailed: isToday && !!got.rules?.failed.includes('flood'),
      moon: moonNight(lat, lng, w),
      inForest: data.forestMask ? forestAt(data.forestMask, e, n) !== 0 : undefined,
    });
    if (waiting.length < 9 || done.near) ui.setSleep(comfort, nightName, waiting);
    // dangers for the first view: the spot's, the chosen night's and the hours before evening (a storm at 16:00 matters at 15:30)
    const soonW = soonWindow(now);
    ui.setHazards({ comfort, fire: isToday ? got.rules?.fire : undefined, dogs: got.rules?.dogs, date: new Date(`${w.day}T12:00:00`), soon: isToday && got.hourly && soonW ? summariseNight(got.hourly, soonW) : undefined });
    ui.setWeatherChip(night, nightName, done.forecast && !got.hourly);
    if (!done.forecast) return;
    if (!got.hourly) ui.weatherHost.replaceChildren(el('h2', 'wx-title', tr('Weather')), el('p', 'where', tr('The forecast could not be loaded.')));
    else {
      const end = forecastEnd(got.hourly);
      renderWeather(ui.weatherHost, {
        window: w,
        night,
        hours: windowHours(got.hourly, w),
        note: comfort.weatherStop ? 'This weather rules the night out, however good the spot is.' : undefined,
        noForecastWhy: end ? tr('The weather forecast reaches only until {date}, so there is no weather for this night. Legality, sun and moon are still worked out for it.', { date: end.slice(0, 10) }) : undefined,
      });
    }
  };

  run = collectDetails(lat, lng, elevation, {
    signal: abort.signal,
    onPart: (key) => {
      const { got, failed } = run!;
      if (key === 'water') ui.setWater(failed.water ? undefined : got.water, failed.water);
      else if (key === 'shelter') {
        ui.setShelter(failed.shelter ? undefined : got.shelters, failed.shelter);
        // the hut the chip names (the first hut or bivouac), when it is a hut: its SAC page, if swisstopo's winter list has one
        const named = got.shelters?.shelters.find((x) => x.kind === 'hut' || x.kind === 'biwak');
        if (named?.kind === 'hut' && !failed.shelter) void fetchHutLink(named.at, getLang()).then((l) => id === checkId && ui.setHutLink(l), () => undefined);
        if (got.shelters) ui.setNearBuilding(nearBuildingNote(got.shelters));
      } else if (key === 'avalanche') ui.setAvalanche(failed.avalanche ? undefined : got.avalanche, failed.avalanche);
      else if (key === 'rules') ui.setRules(failed.rules ? { failed: ['fire', 'drones'] } : got.rules);
      else if (key === 'forecast') announce();
      paint();
    },
  });
  announce();
  await run.finished;
  window.clearTimeout(deadline);
}

let marker: L.Marker | undefined;
let checkId = 0;
let focusMarker: L.CircleMarker | undefined;

/** Fly to a hut or water spot and mark it, centred in the part of the map the sheet leaves free. */
function focusOn(e: number, n: number, label: string) {
  const { lat, lon } = lv95ToWgs84(e, n);
  const target = L.latLng(lat, lon);
  focusMarker?.remove();
  focusMarker = L.circleMarker(target, { radius: 9, color: '#fff', weight: 3, fillColor: '#e8710a', fillOpacity: 1 })
    .addTo(map)
    .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] })
    .openTooltip();
  const closed = sheet.classList.contains('closed');
  const wide = window.matchMedia('(min-width: 720px)').matches;
  const pad = closed ? { padding: L.point(40, 70) } : wide ? { paddingTopLeft: L.point(430, 70), paddingBottomRight: L.point(60, 40) } : { paddingTopLeft: L.point(40, 70), paddingBottomRight: L.point(40, Math.min(sheet.offsetHeight, window.innerHeight * 0.62) + 20) };
  const bounds = L.latLngBounds([target, target]);
  map.flyToBounds(bounds, { ...pad, maxZoom: 16, duration: 0.8 });
}

/** The legality check of a spot (the lookups plus the bundled data). `inputs` is kept to judge the same spot again, for another date or once late data is in. */
const assessSpot = (lat: number, lng: number, knownElevation?: number, accuracyM?: number) => checkLegality(lat, lng, data, { knownElevation, accuracyM });

/** The spot checked last, for the emergency page. */
let lastSpot: Position | undefined;

async function checkSpot(lat: number, lng: number, fromFinder = false, accuracyM?: number) {
  const id = ++checkId;
  delete result.dataset.page;
  if (!fromFinder) {
    ++finderId;
    finderPins.clearLayers();
  }
  sheet.classList.remove('closed');
  const tappedAt = Date.now();
  marker?.remove();
  focusMarker?.remove();
  focusMarker = undefined;
  marker = L.marker([lat, lng], { icon: spotIcon(), keyboard: false }).addTo(map);
  history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)},${map.getZoom()}`);
  if (!isInSwitzerland(lat, lng)) {
    sheet.dataset.state = 'result';
    result.hidden = false;
    result.replaceChildren(el('p', 'where', tr('This app only covers Switzerland.')));
    announce(tr('This app only covers Switzerland.'));
    return;
  }
  showLoading();
  announce(tr('Checking this spot…'));
  const assessed = await assessSpot(lat, lng, undefined, accuracyM);
  if (id !== checkId) return; // a newer tap superseded this one
  const { assessment, elevation, inputs } = assessed;
  lastSpot = { lat, lng, elevation, accuracyM };
  if (assessment.outside) {
    sheet.dataset.state = 'result';
    renderOutside(result);
    return;
  }
  sheet.dataset.state = 'result';
  // "Check again": the failed lookups are made again, the bundled data that failed is asked for again first
  const retry = async () => {
    if (!data.complete) await data.retry();
    void checkSpot(lat, lng, fromFinder, accuracyM);
  };
  const ui = renderResult(result, assessment, elevation, focusOn, { onRetry: () => void retry(), accuracyM });
  // another night: the legality of the same spot is judged again for its date (zone seasons, firing days), without new requests
  const nowStr = zurichNow(new Date());
  let judgedFor = new Date();
  const onNight = (w: NightWindow) => {
    judgedFor = nightDate(w, nowStr);
    ui.setAssessment(assessInputs(inputs, data, judgedFor));
  };
  // bundled data that was still loading when the check went ahead: judge the same spot again as soon as it is in
  if (assessment.incomplete?.includes('local rule data') && data.loading) {
    void data.load().then(() => {
      if (id === checkId) ui.setAssessment(assessInputs(inputs, data, judgedFor));
    });
  }
  if (fromFinder && finderBack) {
    const back = el('button', 'linkish', '← ' + tr('Back to best spots'));
    back.type = 'button';
    back.onclick = finderBack;
    result.prepend(back);
  }
  const sid = spotId(lat, lng);
  const save = el('button', 'save-btn');
  save.type = 'button';
  const paintSave = () => {
    const on = isSaved(store, sid);
    save.setAttribute('aria-pressed', String(on));
    save.textContent = on ? '★ ' + tr('Saved') : '☆ ' + tr('Save');
  };
  paintSave();
  // saving is one tap; taking a spot off the list asks once (a stray tap must not lose a spot with its notes)
  let confirming: number | undefined;
  save.onclick = () => {
    if (isSaved(store, sid)) {
      if (confirming === undefined) {
        save.textContent = '✕ ' + tr('Tap again to remove');
        confirming = window.setTimeout(() => {
          confirming = undefined;
          paintSave();
        }, 3500);
        return;
      }
      window.clearTimeout(confirming);
      confirming = undefined;
      removeSpot(store, sid);
    } else {
      const spot: SavedSpot = {
        id: sid,
        lat,
        lng,
        name: defaultName(assessment.municipality, elevation, lat, lng),
        elevation,
        municipality: assessment.municipality,
        canton: assessment.canton?.name,
        snapshot: { ...ui.snapshot(), savedAt: Date.now() },
      };
      const r = saveSpot(store, spot);
      if (r.full) say(tr('The list of saved spots is full ({n}). Remove some to save more.', { n: MAX_SAVED }));
      else if (!r.stored) say(tr('This browser would not keep the spot (private mode or storage blocked).'));
    }
    paintSave();
    syncSaved();
  };
  const name = defaultName(assessment.municipality, elevation, lat, lng);
  const share = el('button', 'save-btn', '↗ ' + tr('Share this spot'));
  share.type = 'button';
  share.onclick = async () => {
    const text = shareText(name, ui.snapshot(), location.href);
    try {
      if (navigator.share) await navigator.share({ title: tr('Wild camping: {name}', { name }), text });
      else {
        await navigator.clipboard.writeText(text);
        say(tr('Copied the scores and link.'));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') say(tr('Could not share. Use "Copy link" instead.'));
    }
  };
  const gpx = el('button', 'linkish', tr('Download as GPX'));
  gpx.type = 'button';
  gpx.onclick = () =>
    downloadText(
      'wildcamp-spot.gpx',
      spotsToGpx([{ id: sid, lat, lng, name, elevation, municipality: assessment.municipality, canton: assessment.canton?.name, snapshot: { ...ui.snapshot(), savedAt: Date.now() } }]),
    );
  const report = el('a', 'linkish report-link', tr('Report a missing or wrong rule'));
  report.href = reportUrl({ lat, lng, municipality: assessment.municipality, canton: assessment.canton?.name, verdict: assessment.verdict, link: location.href });
  report.target = '_blank';
  report.rel = 'noopener';
  const find = el('button', 'save-btn find-btn', '🔍 ' + tr('Best spots'));
  find.type = 'button';
  find.onclick = () => void findBest(lat, lng);
  const copy = el('button', 'linkish', tr('Copy link'));
  copy.type = 'button';
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      say(tr('Link copied'));
    } catch {
      say(location.href);
    }
  };
  // two actions in view, the rest one tap away
  const actions = el('div', 'actions');
  actions.append(save, find);
  const more = el('details', 'more');
  more.append(el('summary', undefined, tr('More options')), share, copy, gpx, report);
  result.append(actions, more, sosLink());
  sheet.scrollTop = 0;
  // where to sleep instead (shown only when the spot is not allowed or doubtful)
  void ensureCampsites().then((list) => {
    if (list && id === checkId) ui.setCampsites(campsiteLine(nearestCampsites(list, lat, lng)));
  });
  void loadDetails(ui, lat, lng, elevation, id, tappedAt, { onNight }).then(() => {
    // a spot saved while the checks were still running keeps the final scores, not the early ones
    if (id === checkId && isSaved(store, sid)) updateSnapshot(store, sid, ui.snapshot());
    if (id !== checkId) return;
    const snap = ui.snapshot();
    announce(`${name}. ${verdictLabel(snap.verdict)}.` + (snap.overall === undefined ? '' : ' ' + tr('Overall {n} out of 100.', { n: snap.overall })));
  });
}


// Saved spots
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

/** A page in the sheet (saved spots, trip, emergency, a shared list): the sheet opens, any running check is let go. */
function openPage() {
  ++checkId;
  ++finderId;
  delete result.dataset.page;
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  sheet.scrollTop = 0;
}

/** Fit the map to some bounds inside the part of it the sheet leaves free (above it on a phone, beside it on a wide screen). */
function fitBoundsClear(bounds: L.LatLngBounds, maxZoom = 14, sheetWillFill = false) {
  const wide = window.matchMedia('(min-width: 720px)').matches;
  // `sheetWillFill`: the page about to be drawn is long, so the sheet will be at its tallest by the time the map has moved
  const covered = sheet.classList.contains('closed') ? 0 : wide ? sheet.offsetWidth + 24 : sheetWillFill ? window.innerHeight * 0.62 : Math.min(sheet.offsetHeight, window.innerHeight * 0.62);
  map.fitBounds(bounds, { paddingTopLeft: [wide ? covered + 30 : 30, 70], paddingBottomRight: [30, wide ? 30 : covered + 20], maxZoom });
}

/** Saved spots on the map: a small star at each, opening that spot's check. Shown unless switched off in the layers panel. */
const savedPins = L.layerGroup();
const savedStar = L.divIcon({ className: '', html: '<div class="saved-pin">★</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
function syncSaved() {
  savedPins.clearLayers();
  for (const sp of loadSaved(store)) {
    L.marker([sp.lat, sp.lng], { icon: savedStar, title: sp.name, alt: sp.name, riseOnHover: true })
      .on('click', () => void checkSpot(sp.lat, sp.lng))
      .addTo(savedPins);
  }
}
syncSaved();
const savedToggle = document.getElementById('toggle-saved') as HTMLInputElement;
const showSavedPins = (on: boolean) => {
  savedToggle.checked = on;
  if (on) savedPins.addTo(map);
  else savedPins.remove();
};
showSavedPins(true);
savedToggle.addEventListener('change', () => showSavedPins(savedToggle.checked));

/** A link to a list of places (and maybe a trip): the share sheet of the phone, or the clipboard. */
async function shareLinkOf(payload: SharePayload, title: string) {
  const link = shareLink(location.href, payload);
  if (link.trimmed) say(tr('A link carries at most {n} spots; the first {n} are in it.', { n: MAX_SHARE_SPOTS }));
  else if (link.long) say(tr('This link is long; some apps may cut it. Share fewer spots.'));
  try {
    if (navigator.share) await navigator.share({ title, url: link.url });
    else {
      await navigator.clipboard.writeText(link.url);
      if (!link.trimmed && !link.long) say(tr('Link copied'));
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') say(link.url);
  }
}
const shareSpots = (spots: SavedSpot[]) => shareLinkOf({ spots: spots.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, note: s.note })) }, tr('Wild camping spots'));

/** Waypoints of a GPX file become saved spots, unchecked. A route or track is not a list of spots and is said to be one. */
function importGpx(text: string, fileName: string) {
  const g = parseGpx(text);
  if (!g.waypoints.length) {
    say(g.tracks.length || g.routes.length ? tr('This file holds a route, not spots. Open "Route" in the menu to use it.') : tr('No spots found in {file}.', { file: fileName }));
    return;
  }
  const inside = g.waypoints.filter((w) => isInSwitzerland(w.lat, w.lon));
  const r = importSpots(store, inside.map((w) => ({ lat: w.lat, lng: w.lon, name: w.name, elevation: w.ele, note: w.desc })));
  const bits = [r.added === 1 ? tr('Added {n} spot.', { n: r.added }) : tr('Added {n} spots.', { n: r.added })];
  if (r.existing) bits.push(tr('{n} were saved already.', { n: r.existing }));
  if (g.waypoints.length > inside.length) bits.push(tr('{n} outside Switzerland were left out.', { n: g.waypoints.length - inside.length }));
  if (r.refused) bits.push(tr('The list is full: {n} were left out.', { n: r.refused }));
  if (!r.stored) bits.push(tr('This browser would not keep the spots (private mode or storage blocked).'));
  say(bits.join(' '));
  syncSaved();
  showSaved();
}

/** Every saved spot on the map, the view fitted to them. */
function showAllSaved() {
  const list = loadSaved(store);
  if (!list.length) return;
  showSavedPins(true);
  fitBoundsClear(L.latLngBounds(list.map((s) => [s.lat, s.lng] as [number, number])));
}

function showSaved() {
  openPage();
  renderSaved(result, loadSaved(store), {
    onOpen: (sp) => {
      map.flyTo([sp.lat, sp.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      void checkSpot(sp.lat, sp.lng);
    },
    onRemove: (id) => {
      removeSpot(store, id);
      syncSaved();
      showSaved();
    },
    onPlan: (picked) => {
      saveTrip(store, nightsFor(picked.map((p) => p.id), firstEvening(zurichNow(new Date()))));
      showTrip();
    },
    onEdit: (id, patch) => {
      if (!updateSpot(store, id, patch)) say(tr('This browser would not keep the change (private mode or storage blocked).'));
      syncSaved();
      showSaved();
    },
    onShowAll: showAllSaved,
    onSaveMaps: (picked) => void saveSpotMaps(picked, tr('Saved spots')),
    onRefresh: async (progress) => {
      const outcomes = await recheckSpots(loadSaved(store), data, { onProgress: progress });
      for (const o of outcomes) if (o.patch) updateLegality(store, o.spot.id, o.patch);
      return {
        changes: outcomes.map((o) => ({ spot: o.spot, before: verdictLabel(o.before), after: o.after ? verdictLabel(o.after) : undefined, failed: o.failed, changed: o.changed })),
        spots: loadSaved(store),
      };
    },
    onShare: (spots) => void shareSpots(spots),
    onImport: (text, name) => importGpx(text, name),
    origin: () => map.getCenter(),
  });
}

/** A list of places that came in a link: look at them, add them to the saved spots (and the trip), or leave them. */
function showShared(d: DecodedShare) {
  openPage();
  const pin = (i: number) => L.divIcon({ className: '', html: `<div class="finder-pin">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  d.payload.spots.forEach((s, i) => L.marker([s.lat, s.lng], { icon: pin(i), keyboard: false }).on('click', () => void checkSpot(s.lat, s.lng)).addTo(finderPins));
  const leave = () => {
    finderPins.clearLayers();
    sheet.dataset.state = 'intro';
    result.hidden = true;
  };
  const today = firstEvening(zurichNow(new Date()));
  const addSpots = () => {
    const r = importSpots(store, d.payload.spots);
    syncSaved();
    return r;
  };
  renderShared(result, d, loadSaved(store).length, loadTrip(store, today).length > 0, {
    onOpen: (i) => {
      const s = d.payload.spots[i]!;
      map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      void checkSpot(s.lat, s.lng);
    },
    onAddSpots: () => {
      const r = addSpots();
      say(r.added === 1 ? tr('Added {n} spot.', { n: r.added }) : tr('Added {n} spots.', { n: r.added }));
      showSaved();
    },
    onAddTrip: () => {
      addSpots();
      const nights = (d.payload.trip ?? [])
        .map((n) => ({ spot: spotId(d.payload.spots[n.spot]!.lat, d.payload.spots[n.spot]!.lng), date: n.date }))
        .filter((n) => n.date >= today);
      saveTrip(store, nights);
      if (nights.length < (d.payload.trip?.length ?? 0)) say(tr('Nights that are already past were left out.'));
      showTrip();
    },
    onClose: leave,
  });
  fitBoundsClear(L.latLngBounds(d.payload.spots.map((s) => [s.lat, s.lng] as [number, number]))); // once the list is drawn, so the sheet's height is known
}
/** A share link in the address (on load, or pasted into an open tab). */
function openShareHash(): boolean {
  if (!isShareHash(location.hash)) return false;
  const d = decodeShare(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (!d) {
    say(tr('This link could not be read. Ask for it again.'));
    return true;
  }
  showShared(d);
  return true;
}

/** The emergency page: numbers to tap, the position to read out, what to say. */
function showEmergency() {
  openPage();
  const spot = lastSpot;
  renderEmergency(result, {
    spot,
    say,
    locate: async () => {
      const pos = await bestFix(12000, 20);
      showMe(pos, false);
      const here: Position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy };
      // the height above sea level from the federal model when there is a connection (the phone's own altitude is not reliable)
      here.elevation = await withTimeout(fetchElevation(here.lat, here.lng), 2500).catch(() => undefined);
      return here;
    },
    onBack: () => {
      if (spot) void checkSpot(spot.lat, spot.lng);
      else {
        sheet.dataset.state = 'intro';
        result.hidden = true;
      }
    },
  });
}
const sosLink = () => {
  const b = el('button', 'linkish sos-link', '🆘 ' + tr('Emergency numbers and my position'));
  b.type = 'button';
  b.onclick = showEmergency;
  return b;
};
document.getElementById('intro')!.append(sosLink());

// Trip planner: its own menu. Nights with a date and a saved spot each; the legality is judged for each date and each night gets a fresh forecast.
const FORECAST_TTL_MS = 20 * 60 * 1000;
const forecastCache = new Map<string, { at: number; p: Promise<Hourly> }>();
const forecastFor = (sp: SavedSpot) => {
  const hit = forecastCache.get(sp.id);
  if (hit && Date.now() - hit.at < FORECAST_TTL_MS) return hit.p;
  const p = withTimeout(fetchForecast(sp.lat, sp.lng, sp.elevation), 9000);
  forecastCache.set(sp.id, { at: Date.now(), p });
  p.catch(() => forecastCache.delete(sp.id)); // a failed forecast is asked for again next time
  return p;
};
const legalInputs = new InputsCache();
let tripToken = 0;

function showTrip() {
  openPage();
  const now = zurichNow(new Date());
  const today = firstEvening(now);
  const spots = loadSaved(store);
  const nights = tripNights(loadTrip(store, today), spots, today);
  const plain = () => nights.map((n) => n.night);
  const set = (next: TripNight[]) => {
    saveTrip(store, next);
    showTrip();
  };
  const host = renderTrip(result, spots, nights, today, now, {
    onAdd: (spot) => {
      const next = addNight(plain(), spot, today);
      if (next === plain() || next.length === nights.length) say(tr('No free night to add.'));
      set(next);
    },
    onRemove: (date) => set(removeNight(plain(), date)),
    onSpot: (date, spot) => set(setNightSpot(plain(), date, spot)),
    onDate: (date, to) => {
      const next = moveNight(plain(), date, to, today);
      if (!next) say(tr('Another night is already planned for that date, or the date is out of range.'));
      set(next ?? plain());
    },
    onOpen: (sp) => {
      map.flyTo([sp.lat, sp.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      void checkSpot(sp.lat, sp.lng);
    },
    onShare: () => {
      const ids = [...new Set(nights.map((n) => n.spot.id))];
      const used = ids.map((id) => spots.find((s) => s.id === id)!);
      void shareLinkOf(
        { spots: used.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name, note: s.note })), trip: nights.map((n) => ({ spot: ids.indexOf(n.spot.id), date: n.night.date })) },
        tr('Wild camping trip'),
      );
    },
    onPrint: () => window.print(),
    onSaveMaps: () => void saveSpotMaps([...new Map(nights.map((n) => [n.spot.id, n.spot])).values()], tr('Trip')),
  });
  if (!nights.length) return;
  const token = ++tripToken;
  host.replaceChildren(el('p', 'where', tr('Checking the legality and the forecast for each night…')));
  const ready = withTimeout(data.load(), 8000).catch(() => undefined);
  const legalAll = Promise.all(
    nights.map(async ({ night, spot }) => {
      try {
        const inp = await legalInputs.get(spot);
        await ready;
        const sum = legalForNight(inp, data, night.date, now);
        return sum.unchecked || sum.outside ? undefined : sum; // a check that could not be made falls back to the saved score, marked as such
      } catch {
        return undefined;
      }
    }),
  );
  const forecastAll = Promise.allSettled(nights.map(({ night, spot }) => (beyondForecast(night.date, now) ? Promise.resolve(undefined) : forecastFor(spot))));
  void Promise.all([legalAll, forecastAll]).then(([legal, forecasts]) => {
    if (token !== tripToken) return; // the trip was changed meanwhile
    const hourly = forecasts.map((f) => (f.status === 'fulfilled' ? f.value : undefined));
    const plan = planTrip(nights.map((n) => ({ spot: n.spot, date: n.night.date })), hourly, legal, now);
    renderPlan(host, plan, {
      forecasts: forecasts.filter((f, i) => f.status === 'rejected' && !beyondForecast(nights[i]!.night.date, now)).length,
      legality: legal.filter((l) => l === undefined).length,
    });
  });
}
// (the saved list is opened with the star button on the map, so the start panel does not repeat it)

// Route: a GPX file drawn on the map, checked for zones and rules along it, cut into days with a place to sleep each night
interface LiveRoute {
  name: string;
  points: RoutePoint[];
  stageKm: number;
  /** The first day of the walk, "YYYY-MM-DD". */
  date: string;
  status: RouteViewState['status'];
  progress?: { done: number; total: number };
  inputs?: RouteInputs;
  report?: RouteReport;
  abort?: AbortController;
}
let route: LiveRoute | undefined;
const routeLayer = L.layerGroup().addTo(map);
let routeFocus: L.CircleMarker | undefined;
const STRIP_COLOURS = { ok: '#2e7d32', caution: '#f2a900', ban: '#c62828', unknown: '#8a8f8c' } as const;
const noon = (day: string) => new Date(`${day}T12:00:00`);
const inRoutePage = () => result.dataset.page === 'route';

/** Move the map so a place lies in the part the sheet leaves free. */
function flyToClear(at: L.LatLngExpression, zoom: number) {
  const wide = window.matchMedia('(min-width: 720px)').matches;
  const covered = sheet.classList.contains('closed') ? 0 : wide ? sheet.offsetWidth + 24 : Math.min(sheet.offsetHeight, window.innerHeight * 0.62);
  const p = map.project(L.latLng(at), zoom);
  const centre = map.unproject(wide ? p.subtract([covered / 2, 0]) : p.add([0, covered / 2]), zoom);
  map.flyTo(centre, zoom, { duration: 0.6 });
}

function persistRoute() {
  try {
    if (!route) store?.removeItem(ROUTE_KEY);
    else store?.setItem(ROUTE_KEY, JSON.stringify(packRoute(route.name, route.points, route.stageKm, route.date)));
  } catch {
    /* storage blocked: the route lasts until the page is reloaded */
  }
}

/** Judge the route again from the lookups already made: another first day or stage length needs no new request. */
function reassessRoute() {
  const r = route;
  if (!r?.inputs) return;
  const base = stageInfos(r.points, r.stageKm);
  r.report = reportForDates(r.inputs, data, base.map((s) => ({ fromM: s.fromM, toM: s.toM, date: noon(addDays(r.date, s.n - 1)) })));
}

/** The campsite list, loaded the first time a page wants it (a few kilobytes; undefined when it could not be loaded). */
let campsiteData: CampsiteList | undefined;
function ensureCampsites(): Promise<CampsiteList | undefined> {
  return loadCampsites(import.meta.env.BASE_URL).then(
    (l) => (campsiteData = l),
    () => undefined,
  );
}

function routeState(): RouteViewState | undefined {
  const r = route;
  if (!r) return undefined;
  const stages = stageInfos(r.points, r.stageKm, r.report, r.inputs?.samples);
  const campsites: Record<number, string> = {};
  if (campsiteData) {
    for (const s of stages) {
      if (!s.endCell || s.endCell.cls === 'ok' || s.camp.moved) continue;
      const line = campsiteLine(nearestCampsites(campsiteData, s.camp.lat, s.camp.lon));
      if (line) campsites[s.n] = line;
    }
  }
  return {
    name: r.name,
    stats: routeStats(r.points, r.inputs?.samples),
    stageKm: r.stageKm,
    date: r.date,
    today: firstEvening(zurichNow(new Date())),
    status: r.status,
    progress: r.progress,
    report: r.report,
    stages,
    campsites,
  };
}

const routeCum = (r: LiveRoute) => cumulativeM(r.points);

/** The route on the map: a white casing, the coloured stretches (or one blue line before the check), a numbered pin at each night's camp. */
function drawRoute() {
  routeLayer.clearLayers();
  const r = route;
  if (!r) return;
  const ll = (p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number];
  L.polyline(r.points.map(ll), { color: '#fff', weight: 9, opacity: 0.9, interactive: false, lineCap: 'round' }).addTo(routeLayer);
  const cum = routeCum(r);
  if (r.report) {
    for (const run of runsOf(r.report.cells, r.report.lengthM)) {
      L.polyline(slicePoints(r.points, cum, run.fromM, run.toM).map(ll), { color: STRIP_COLOURS[run.cls], weight: 5, opacity: 1, interactive: false, lineCap: 'butt' }).addTo(routeLayer);
    }
  } else L.polyline(r.points.map(ll), { color: '#1a73e8', weight: 5, interactive: false }).addTo(routeLayer);
  for (const s of stageInfos(r.points, r.stageKm, r.report, r.inputs?.samples)) {
    L.marker([s.camp.lat, s.camp.lon], {
      icon: L.divIcon({ className: '', html: `<div class="stage-pin${s.camp.blocked ? ' blocked' : ''}">${s.n}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: tr('Day {n}', { n: s.n }),
      keyboard: false,
    })
      .on('click', () => void checkSpot(s.camp.lat, s.camp.lon))
      .addTo(routeLayer);
  }
}

function renderRouteNow() {
  if (!inRoutePage()) return;
  const st = routeState();
  const keep = sheet.scrollTop;
  renderRoute(result, st, {
    onFile: loadRoute,
    onStageKm: (km) => {
      if (!route) return;
      route.stageKm = km;
      reassessRoute();
      persistRoute();
      drawRoute();
      renderRouteNow();
    },
    onDate: (day) => {
      if (!route) return;
      route.date = day;
      reassessRoute();
      persistRoute();
      drawRoute();
      renderRouteNow();
    },
    onFocus: (distM) => {
      if (!route) return;
      const p = pointAt(route.points, routeCum(route), distM);
      if (!p) return;
      routeFocus?.remove();
      routeFocus = L.circleMarker([p.lat, p.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#e8710a', fillOpacity: 1, interactive: false }).addTo(map);
      flyToClear([p.lat, p.lon], Math.max(map.getZoom(), 14));
    },
    onStage: (s) => {
      if (!route) return;
      fitBoundsClear(L.latLngBounds(slicePoints(route.points, routeCum(route), s.fromM, s.toM).map((p) => [p.lat, p.lon] as [number, number])), 15, true);
    },
    onFind: (s) => void findBest(s.camp.lat, s.camp.lon, { back: { label: tr('Back to the route'), run: showRoute } }),
    onPlan: planRouteNights,
    onExport: exportRoute,
    onSaveMaps: () => void saveRouteMaps(),
    onRetry: () => void checkRoute(),
    onClear: () => {
      route?.abort?.abort();
      route = undefined;
      routeFocus?.remove();
      persistRoute();
      drawRoute();
      renderRouteNow();
    },
  });
  sheet.scrollTop = keep;
}

function showRoute() {
  openPage();
  result.dataset.page = 'route';
  if (!route) restoreRoute(true);
  else if (!route.inputs && !route.abort) void checkRoute(); // restored at start, not checked yet
  renderRouteNow();
  if (!campsiteData) void ensureCampsites().then((l) => l && inRoutePage() && renderRouteNow());
}

/** The route kept from the last visit (the line only; the check is made again). */
function restoreRoute(check: boolean) {
  if (route) return;
  try {
    const raw = store?.getItem(ROUTE_KEY);
    const got = raw ? unpackRoute(JSON.parse(raw)) : undefined;
    if (!got) return;
    const today = firstEvening(zurichNow(new Date()));
    route = { name: got.name, points: got.points, stageKm: got.stageKm, date: got.date >= today ? got.date : today, status: 'checking' };
    drawRoute();
    if (check) void checkRoute();
  } catch {
    /* an unreadable stored route is ignored */
  }
}

function loadRoute(text: string, fileName: string) {
  let g: ParsedGpx;
  try {
    g = parseGpx(text);
  } catch {
    return say(tr('This file could not be read as GPX.'));
  }
  const { points: raw, joined } = routeLine(g);
  if (raw.length < 2) return say(g.waypoints.length ? tr('This file holds spots, not a route. Import it under "Saved spots".') : tr('No route found in {file}.', { file: fileName }));
  const step = Math.max(1, Math.ceil(raw.length / 300));
  if (!raw.some((p, i) => i % step === 0 && isInSwitzerland(p.lat, p.lon))) return say(tr('This route is outside Switzerland, so the rules checked here do not apply.'));
  route?.abort?.abort();
  const points = thin(raw, 6000);
  const today = firstEvening(zurichNow(new Date()));
  route = { name: (g.name ?? g.tracks[0]?.name ?? fileName.replace(/\.gpx$/i, '')).trim().slice(0, 120) || tr('Route'), points, stageKm: STAGE_KM.initial, date: today, status: 'checking' };
  if (joined > 1) say(tr('{n} tracks in the file were joined into one route.', { n: joined }));
  persistRoute();
  routeFocus?.remove();
  drawRoute();
  fitBoundsClear(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])), 13, true);
  void checkRoute();
  renderRouteNow();
}

async function checkRoute() {
  const r = route;
  if (!r) return;
  r.abort?.abort();
  const ctl = (r.abort = new AbortController());
  r.status = 'checking';
  r.progress = { done: 0, total: 1 };
  r.report = undefined;
  r.inputs = undefined;
  renderRouteNow();
  const live = () => route === r && !ctl.signal.aborted;
  try {
    const inputs = await gatherRouteInputs(r.points, {
      signal: ctl.signal,
      onProgress: (done, total) => {
        if (!live()) return;
        r.progress = { done, total };
        if (inRoutePage()) renderRouteNow();
      },
    });
    if (!live()) return;
    await withTimeout(data.load(), 8000).catch(() => undefined);
    if (!live()) return;
    r.inputs = inputs;
    reassessRoute();
    r.status = 'done';
    announce(tr('Route checked.'));
  } catch (err) {
    if (!live()) return;
    console.warn('route check failed', err);
    r.status = 'failed';
    announce(tr('The route could not be checked.'));
  }
  drawRoute();
  renderRouteNow();
}

let planArmed: number | undefined;
/** Save each day's camp as a spot and plan the nights from the first day; asks once before it replaces a trip that is there. */
function planRouteNights() {
  const r = route;
  if (!r) return;
  const stages = stageInfos(r.points, r.stageKm, r.report, r.inputs?.samples);
  const today = firstEvening(zurichNow(new Date()));
  const existing = tripNights(loadTrip(store, today), loadSaved(store), today);
  if (existing.length && planArmed === undefined) {
    say(tr('This replaces the trip you have now. Tap again to continue.'));
    planArmed = window.setTimeout(() => (planArmed = undefined), 5000);
    return;
  }
  window.clearTimeout(planArmed);
  planArmed = undefined;
  const used = stages.slice(0, MAX_NIGHTS);
  const note = (s: StageInfo) => [tr('Day {n} of the route "{name}", about {km} km from its start.', { n: s.n, name: r.name, km: Math.round(s.camp.distM / 100) / 10 }), s.camp.moved ? tr('Moved from the end of the stage, which is not allowed or not clear.') : ''].filter(Boolean).join(' ');
  const got = importSpots(store, used.map((s) => ({ lat: s.camp.lat, lng: s.camp.lon, elevation: s.camp.ele, name: `${r.name} · ${tr('Day {n}', { n: s.n })}`, note: note(s) })));
  if (got.refused) say(tr('The list is full: {n} were left out.', { n: got.refused }));
  const nights = used.map((s) => ({ spot: spotId(s.camp.lat, s.camp.lon), date: addDays(r.date, s.n - 1) })).filter((n) => n.date >= today);
  saveTrip(store, nights);
  syncSaved();
  if (stages.length > MAX_NIGHTS) say(tr('A trip has at most {n} nights; the first {n} days were planned.', { n: MAX_NIGHTS }));
  showTrip();
}

function exportRoute() {
  const r = route;
  if (!r) return;
  const stages = stageInfos(r.points, r.stageKm, r.report, r.inputs?.samples);
  const camps = stages.map((s) => ({ lat: s.camp.lat, lon: s.camp.lon, ele: s.camp.ele, name: `${tr('Day {n}', { n: s.n })} · ${tr('camp')}`, desc: s.camp.moved ? tr('Moved from the end of the stage, which is not allowed or not clear.') : undefined }));
  const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'route';
  downloadText(`${slug}-with-camps.gpx`, routeToGpx(r.name, r.points, camps));
}

// Best spots nearby
const finderPins = L.layerGroup().addTo(map);
let finderId = 0;
let finderBack: (() => void) | undefined;
const FINDER_CANDIDATES = 12;
const FINDER_SHOWN = 5;
const FINDER_POOL = 4;

function finderNote(c: { coverLabel?: string; elevation: number }, water: WaterInfo | undefined, waterDone: boolean): string {
  const parts: string[] = [];
  if (c.coverLabel) parts.push(c.coverLabel);
  if (waterDone) {
    if (!water || water.failed.includes('water')) parts.push(tr('water not checked'));
    else if (water.kind === 'none') parts.push(water.spring ? tr('no stream or lake within 800 m; a mapped spring {m} m away', { m: Math.round(water.spring.meters / 10) * 10 }) : tr('no water within 800 m'));
    else {
      const what = `${water.kind === 'lake' ? tr('lake') : tr('stream')}${water.name ? ` ${water.name}` : ''}`;
      parts.push(`${tr('{what} {m} m away', { what, m: Math.round(water.meters / 10) * 10 })}${water.glacierM !== undefined ? ' ' + tr('(glacier water)') : ''}${water.upstreamPlants.length ? ' ' + tr('(sewage upstream)') : ''}`);
    }
  }
  return `${parts.join(' · ') || tr('ground not classified')}.`;
}

async function findBest(lat: number, lng: number, opts: { back?: { label: string; run: () => void }; radiusM?: number } = {}) {
  const radius = opts.radiusM ?? CANDIDATE_RADIUS_M;
  const id = ++finderId;
  ++checkId; // stops a running spot check from painting over the list
  delete result.dataset.page;
  marker?.remove();
  marker = L.marker([lat, lng], { icon: spotIcon(), keyboard: false }).addTo(map);
  focusMarker?.remove();
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  const gone = () => id !== finderId;
  const mount = () => {
    const ui = renderFinder(result, tr('Best spots nearby'), (c) => void checkSpot(c.lat, c.lon, true), { radius, radii: FINDER_RADII, onRadius: (m) => void findBest(lat, lng, { ...opts, radiusM: m }) });
    if (opts.back) {
      const back = el('button', 'linkish', '← ' + opts.back.label);
      back.type = 'button';
      back.onclick = opts.back.run;
      result.prepend(back);
    }
    return ui;
  };
  let ui = mount();
  finderBack = undefined;
  ui.update([], tr('Reading the terrain and ground around here…'), false);
  if (!isInSwitzerland(lat, lng)) return ui.update([], tr('This app only covers Switzerland.'), true);
  const { e, n } = wgs84ToLv95(lat, lng);
  const abort = new AbortController();
  const stop = window.setTimeout(() => abort.abort(), 40000);
  try {
    const grid = await withTimeout(fetchElevationGrid(e, n, abort.signal, elevationRadiusFor(radius)), radius > CANDIDATE_RADIUS_M ? 20000 : 12000);
    if (gone()) return;
    const covers = await withTimeout(fetchCoverGrid({ e, n }, abort.signal, radius), radius > CANDIDATE_RADIUS_M ? 16000 : 10000).catch(() => new Map());
    if (gone()) return;
    const cands = rankCells(grid, { e, n }, covers, FINDER_CANDIDATES, radius, separationFor(radius));
    // tonight's weather around here, one line above the list (the centre's own height, from the grid)
    const here = zAt(grid, e, n);
    void withTimeout(fetchForecast(lat, lng, Number.isFinite(here) ? here : undefined), 9000).then((h) => {
      const nowZ = zurichNow(new Date());
      const night = summariseNight(h, nightWindows(nowZ, 1)[0]!);
      if (!night || gone()) return;
      const flags = flagsFor(night);
      ui.setHeadline(tr('Tonight around here: {low} °C low, gusts {gust} km/h, {rain}{watch}.', { low: Math.round(night.minTempC), gust: Math.round(night.maxGustKmh), rain: night.precipMm >= 1 ? tr('{mm} mm rain', { mm: night.precipMm.toFixed(0) }) : tr('dry'), watch: flags.length ? '. ' + tr('Watch for: {list}', { list: flags.join(', ') }) : '' }));
    }, () => undefined);
    const wider = FINDER_RADII.find((r) => r > radius);
    const offer = wider ? { label: tr('Look within {radius}', { radius: radiusText(wider) }), run: () => void findBest(lat, lng, { ...opts, radiusM: wider }) } : undefined;
    if (!cands.length) {
      const sites = await withTimeout(ensureCampsites(), 4000).catch(() => undefined);
      if (gone()) return;
      const line = sites ? campsiteLine(nearestCampsites(sites, lat, lng)) : undefined;
      return ui.update([], tr('No suitable flat ground found within about {radius} (steep, glacier, water or built-up). Try another place.', { radius: radiusText(radius) }) + (line ? ' ' + line : ''), true, offer);
    }

    const rows: FinderRow[] = cands.map((c) => ({ candidate: c, sleep: sleepScore(c.comfort), note: finderNote(c, undefined, false), waterDone: false }));
    let hidden = 0;
    let steep = 0;
    const shown = () => {
      const level = rows.filter((r) => !r.steep);
      const open = level.filter((r) => r.legal?.verdict !== 'no');
      steep = rows.length - level.length;
      hidden = level.length - open.length;
      return open.sort((a, b) => combined(b) - combined(a));
    };
    const draw = (done: boolean) => {
      if (gone()) return;
      const list = done ? shown().slice(0, FINDER_SHOWN) : shown();
      const checked = rows.filter((r) => r.legal && r.waterDone).length;
      ui.update(list, done ? tr(list.length === 1 ? '{n} spot within about {radius}' : '{n} spots within about {radius}', { n: list.length, radius: radiusText(radius) }) + (hidden ? '; ' + tr('{n} more skipped because camping is not allowed there', { n: hidden }) : '') + (steep ? '; ' + tr('{n} more skipped because they are too steep to pitch on', { n: steep }) : '') + '.' : tr('Checking legality and water: {done} of {total} done…', { done: checked, total: rows.length }), done, done && list.length < 3 ? offer : undefined);
      finderPins.clearLayers();
      list.forEach((r, i) =>
        L.marker([r.candidate.lat, r.candidate.lon], { icon: L.divIcon({ className: '', html: `<div class="finder-pin">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
          .on('click', () => void checkSpot(r.candidate.lat, r.candidate.lon, true))
          .addTo(finderPins),
      );
    };
    draw(false);
    finderBack = () => {
      if (gone()) return;
      sheet.classList.remove('closed');
      ui = mount();
      draw(true);
    };
    const bounds = L.latLngBounds(cands.map((c) => [c.lat, c.lon] as [number, number])).extend([lat, lng]);
    const wide = window.matchMedia('(min-width: 720px)').matches;
    map.flyToBounds(bounds, wide ? { paddingTopLeft: L.point(430, 70), paddingBottomRight: L.point(60, 40), maxZoom: 15 } : { paddingTopLeft: L.point(40, 70), paddingBottomRight: L.point(40, Math.min(sheet.offsetHeight, window.innerHeight * 0.62) + 20), maxZoom: 15 });

    let next = 0;
    const worker = async () => {
      while (!gone() && next < rows.length) {
        const r = rows[next++]!;
        const c = r.candidate;
        const [a, w, sh, fine] = await Promise.allSettled([
          withTimeout(assessSpot(c.lat, c.lon, c.elevation), 12000),
          withTimeout(fetchWater(c.lat, c.lon, abort.signal), 8000),
          withTimeout(fetchNearShelters(c.lat, c.lon, abort.signal), 8000),
          withTimeout(fetchProfiles(c.lat, c.lon, NEAR, abort.signal), 8000),
        ]);
        if (gone()) return;
        const water = w.status === 'fulfilled' && !w.value.failed.includes('water') ? w.value : undefined;
        r.waterDone = true;
        // the 100 m grid under-reads slope: the shortlisted spot is measured again on the 20 m profile
        if (fine.status === 'fulfilled') r.steep = refineCandidate(c, analyseTerrain(fine.value), water).steep;
        else if (water) c.comfort = withWater(c, water);
        r.sleep = sleepScore(c.comfort);
        r.note = finderNote(c, w.status === 'fulfilled' ? w.value : undefined, true);
        if (a.status === 'fulfilled') {
          // a hut, inn or alp right beside the spot makes "likely OK" a "caution", as in the full check
          const note = sh.status === 'fulfilled' ? nearBuildingNote(sh.value) : undefined;
          const shownAssessment = applyNearBuilding(a.value.assessment, note);
          r.legal = { ...legalityScore(shownAssessment), verdict: shownAssessment.verdict, label: shownAssessment.verdict };
        } else r.legal = { tone: 'warn', value: 40, verdict: 'unknown', label: 'unknown' };
        draw(false);
      }
    };
    await Promise.all(Array.from({ length: FINDER_POOL }, worker));
    draw(true);
  } catch (err) {
    console.warn('best spots failed', err);
    const why = err instanceof Error ? err.message : String(err);
    if (!gone()) ui.update([], tr('The terrain could not be loaded ({why}). Check your connection and try again.', { why }), true);
  } finally {
    window.clearTimeout(stop);
  }
}

map.on('click', (ev: L.LeafletMouseEvent) => {
  closeSuggest();
  void checkSpot(ev.latlng.lat, ev.latlng.lng);
});
if (hashView) void checkSpot(hLat!, hLon!);
// a link pasted into an open tab (or a changed address) opens that place
window.addEventListener('hashchange', () => {
  if (openShareHash()) return;
  const [la, lo, z] = location.hash.slice(1).split(',').map(Number);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
  if (lastSpot && spotId(lastSpot.lat, lastSpot.lng) === spotId(la!, lo!)) return;
  map.setView([la!, lo!], z || Math.max(map.getZoom(), 14));
  void checkSpot(la!, lo!);
});

// Search
const q = document.getElementById('q') as HTMLInputElement;
const suggest = document.getElementById('suggest')!;
let searchAbort: AbortController | undefined;
let timer: number | undefined;

function closeSuggest() {
  suggest.hidden = true;
  suggest.replaceChildren();
}
function goTo(p: Place, zoom?: number) {
  closeSuggest();
  q.value = p.label;
  q.blur();
  map.setView([p.lat, p.lon], zoom ?? Math.max(map.getZoom(), 14));
  void checkSpot(p.lat, p.lon);
}

/** Coordinates, Plus codes and map links typed or pasted into the box: opened directly, with no search. */
function locationFromText(text: string): { place?: Place; zoom?: number; message?: string } | undefined {
  const r = parseLocation(text);
  if (!r) return undefined;
  if (isLocationError(r)) return { message: tr(r.message) };
  return { place: { label: `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`, lat: r.lat, lon: r.lon }, zoom: r.zoom };
}
function showLocation(loc: NonNullable<ReturnType<typeof locationFromText>>) {
  if (loc.message) {
    suggest.replaceChildren(el('li', 'suggest-note', loc.message));
    suggest.hidden = false;
    return;
  }
  const place = loc.place!;
  const li = el('li', undefined, `📍 ${place.label} · ${tr('coordinates')}`);
  li.onclick = () => goTo(place, loc.zoom);
  suggest.replaceChildren(li);
  suggest.hidden = false;
}
q.addEventListener('input', () => {
  window.clearTimeout(timer);
  const text = q.value.trim();
  if (text.length < 2) return closeSuggest();
  const loc = locationFromText(text);
  if (loc) return showLocation(loc);
  timer = window.setTimeout(async () => {
    searchAbort?.abort();
    searchAbort = new AbortController();
    try {
      const places = await searchPlaces(text, searchAbort.signal);
      suggest.replaceChildren(
        ...(places.length ? places : []).map((p) => {
          const li = el('li', undefined, p.label);
          li.onclick = () => goTo(p);
          return li;
        }),
      );
      if (!places.length) suggest.append(el('li', undefined, tr('No places found')));
      suggest.hidden = false;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') closeSuggest();
    }
  }, 250);
});
document.getElementById('search')!.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = q.value.trim();
  if (!text) return;
  const loc = locationFromText(text);
  if (loc) {
    if (loc.place) goTo(loc.place, loc.zoom);
    else showLocation(loc);
    return;
  }
  try {
    const [first] = await searchPlaces(text);
    if (first) goTo(first);
  } catch {
    /* ignore */
  }
});

// Locate me. One fix is taken (the best of the few seconds a GPS needs to settle) and the receiver is switched off again:
// a position watch left running drains the battery of someone who may need it for hours.
function bestFix(maxMs = 9000, goodM = 15): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    let best: GeolocationPosition | undefined;
    let id: number | undefined;
    let over = false;
    const stop = () => {
      over = true;
      if (id !== undefined) navigator.geolocation.clearWatch(id);
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(() => {
      if (over) return;
      stop();
      if (best) resolve(best);
      else reject(new Error('timeout'));
    }, maxMs);
    id = navigator.geolocation.watchPosition(
      (pos) => {
        if (over) return;
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= goodM) {
          stop();
          resolve(best);
        }
      },
      (err) => {
        if (over) return;
        stop();
        if (best) resolve(best);
        else reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: maxMs },
    );
  });
}
const locateFailed = (err: unknown) =>
  say((err as GeolocationPositionError)?.code === 1 ? tr('Location is blocked. Allow it for this site in your browser settings, then try again.') : tr('Could not get your location. Try again outdoors or with a better signal.'));

document.getElementById('locate')!.addEventListener('click', () => {
  if (!navigator.geolocation) return say(tr('This browser cannot share your location.'));
  say(tr('Finding your location…'));
  bestFix().then(
    (pos) => {
      toast.hidden = true;
      showMe(pos, true);
      void checkSpot(pos.coords.latitude, pos.coords.longitude, false, pos.coords.accuracy);
    },
    locateFailed,
  );
});

// Settings panel (opened from the map menu)
const layersPanel = document.getElementById('legend')!;
const settingsPanel = document.getElementById('settings')!;
document.getElementById('layers-close')!.addEventListener('click', () => (layersPanel.hidden = true));
document.getElementById('settings-close')!.addEventListener('click', () => (settingsPanel.hidden = true));
/** One panel at a time. */
function togglePanel(open: HTMLElement) {
  const show = open.hidden;
  layersPanel.hidden = settingsPanel.hidden = true;
  open.hidden = !show;
  if (show && open === settingsPanel) drawSettings();
}
listenInstall();
function drawSettings() {
  renderSettings(document.getElementById('settings-more')!, {
    store,
    today: () => firstEvening(zurichNow(new Date())),
    saveVisible: () => void saveArea(),
    onWiped: () => {
      route?.abort?.abort();
      route = undefined;
      routeFocus?.remove();
      drawRoute();
      syncSaved();
      sheet.classList.add('closed'); // a saved list, trip or route page on screen would show what was just deleted
    },
    say,
  });
}
document.getElementById('toggle-trails')!.addEventListener('change', (ev) => {
  if ((ev.target as HTMLInputElement).checked) trailOverlay.addTo(map);
  else trailOverlay.remove();
});
document.getElementById('toggle-slope')!.addEventListener('change', (ev) => {
  if ((ev.target as HTMLInputElement).checked) slopeOverlay.addTo(map);
  else slopeOverlay.remove();
});
document.getElementById('toggle-zones')!.addEventListener('change', (ev) => {
  if ((ev.target as HTMLInputElement).checked) zoneOverlay.addTo(map);
  else zoneOverlay.remove();
});

// "My location" map button: shows where you are and brings the map back to it
const toast = document.getElementById('toast')!;
let toastTimer: number | undefined;
function say(text: string) {
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 5000);
}
let me: { dot: L.CircleMarker; ring: L.Circle; at: L.LatLng } | undefined;
const MY_ZOOM = 15;

function showMe(pos: GeolocationPosition, recentre: boolean) {
  const at = L.latLng(pos.coords.latitude, pos.coords.longitude);
  if (!me) {
    const ring = L.circle(at, { radius: pos.coords.accuracy, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
    const dot = L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
    me = { dot, ring, at };
  } else {
    me.dot.setLatLng(at);
    me.ring.setLatLng(at);
    me.ring.setRadius(pos.coords.accuracy);
    me.at = at;
  }
  if (recentre) map.flyTo(at, Math.max(map.getZoom(), MY_ZOOM), { duration: 0.6 });
}

function locateMe() {
  if (!navigator.geolocation) return say(tr('This browser cannot share your location.'));
  say(tr('Finding your location…'));
  bestFix().then((pos) => {
    toast.hidden = true;
    showMe(pos, true);
  }, locateFailed);
}

// Offline: a service worker keeps the app, its data and viewed map tiles; a button saves the visible area on purpose.
const updateBar = document.getElementById('update-bar')!;
document.getElementById('update-reload')!.addEventListener('click', () => location.reload());
document.getElementById('update-later')!.addEventListener('click', () => (updateBar.hidden = true));
if (import.meta.env.PROD) registerOffline(import.meta.env.BASE_URL, () => (updateBar.hidden = false));
const banner = document.getElementById('offline-banner')!;
const syncOnline = () => (banner.hidden = navigator.onLine);
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);
syncOnline();

let saving: AbortController | undefined;
let asked: { key: string; at: number } | undefined;
/**
 * Save the tiles of a plan into the saved-maps cache. A stop is a second tap while it runs; a plan of more than the usual size
 * (a route, many spots) is first announced and starts on a second tap within ten seconds.
 */
async function downloadMaps(plan: TilePlan, name: string, tooBig: string) {
  if (saving) {
    saving.abort();
    return;
  }
  if (!('caches' in window)) return say(tr('This browser cannot store maps for offline use.'));
  if (!navigator.onLine) return say(tr('You are offline: connect to save a map area.'));
  if (!plan.tiles.length) return say(tooBig);
  const have = await savedTileCount();
  if (have + plan.tiles.length > MAX_SAVED_TILES) return say(tr('That would pass the limit of {max} saved map tiles. Delete saved maps in Settings first.', { max: MAX_SAVED_TILES }));
  if (plan.tiles.length > MAX_TILES) {
    const key = `${name}|${plan.tiles.length}`;
    if (!asked || asked.key !== key || Date.now() - asked.at > 10_000) {
      asked = { key, at: Date.now() };
      return say(tr('This saves {n} map tiles (about {mb} MB, zoom {from} to {to}). Tap again within ten seconds to start.', { n: plan.tiles.length, mb: megabytes(plan.tiles.length), from: plan.from, to: plan.to }));
    }
    asked = undefined;
  }
  const ctl = (saving = new AbortController());
  say(tr('Saving {n} map tiles (about {mb} MB, zoom {from} to {to}). Tap the button again to stop.', { n: plan.tiles.length, mb: megabytes(plan.tiles.length), from: plan.from, to: plan.to }));
  void navigator.storage?.persist?.();
  try {
    await saveShell(import.meta.env.BASE_URL);
    const r = await saveTiles(plan.tiles.map((tl) => tileUrl(tl.z, tl.x, tl.y)), (p) => say(tr('Saving map: {done} of {total} tiles…', { done: p.done, total: p.total })), ctl.signal);
    if (!ctl.signal.aborted && !r.failed) addArea(store, { name, at: new Date().toISOString(), from: plan.from, to: plan.to, tiles: r.total });
    say(ctl.signal.aborted ? tr('Stopped: {n} tiles saved.', { n: r.done - r.failed }) : r.failed ? tr('Saved {ok} of {total} tiles; {failed} failed. Try again with a better connection.', { ok: r.total - r.failed, total: r.total, failed: r.failed }) : tr('Saved {n} tiles (zoom {from} to {to}) and the app data. The map and local checks now work offline here; zone, water and weather lookups still need a connection.', { n: r.total, from: plan.from, to: plan.to }));
  } finally {
    saving = undefined;
  }
}

function saveArea() {
  const b = map.getBounds();
  const c = map.getCenter();
  const plan = planTiles({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, Math.round(map.getZoom()));
  return downloadMaps(plan, `${tr('Map view')} ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`, tr('This view is too large to save (more than {max} tiles). Zoom in and try again.', { max: MAX_TILES }));
}

function saveSpotMaps(spots: { lat: number; lng: number; name: string }[], label: string) {
  const plan = planSpots(spots.map((p) => ({ lat: p.lat, lon: p.lng })));
  return downloadMaps(plan, label, tr('Those places are too far apart or too many to save in one go. Choose fewer.'));
}

function saveRouteMaps() {
  if (!route) return;
  const plan = planCorridor(route.points);
  return downloadMaps(plan, route.name, tr('This route is too long to save in one go. Save its parts separately: zoom in on a part and use “Save the map”.'));
}

// One menu button tucks the map's actions away; zoom stays beside it.
const ICONS: Record<string, string> = {
  sos: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.6 5.6l3.7 3.7M14.7 14.7l3.7 3.7M18.4 5.6l-3.7 3.7M9.3 14.7l-3.7 3.7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  locate: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  saved: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  route: '<circle cx="6" cy="18" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 17.5c7 0 1-11 8-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  trip: '<rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 14.5l2.5 2.5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  save: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M5 18v2h14v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ICONS[name]}</svg>`;

const MenuControl = L.Control.extend({
  onAdd() {
    const box = L.DomUtil.create('div', 'map-menu');
    const btn = L.DomUtil.create('button', 'map-locate', box) as HTMLButtonElement;
    btn.type = 'button';
    btn.title = tr('Menu');
    btn.setAttribute('aria-label', tr('Menu'));
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = icon('menu');
    const list = L.DomUtil.create('div', 'menu-list', box);
    list.hidden = true;
    list.setAttribute('role', 'menu');
    const close = () => {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    };
    const items: [string, string, () => void][] = [
      ['sos', tr('Emergency'), showEmergency],
      ['locate', tr('My location'), locateMe],
      ['saved', tr('Saved spots'), showSaved],
      ['trip', tr('Trip planner'), showTrip],
      ['route', tr('Route'), showRoute],
      ['save', tr('Save map for offline'), () => void saveArea()],
      ['layers', tr('Map layers'), () => togglePanel(layersPanel)],
      ['settings', tr('Settings'), () => togglePanel(settingsPanel)],
    ];
    for (const [name, label, run] of items) {
      const it = L.DomUtil.create('button', 'menu-item', list) as HTMLButtonElement;
      it.type = 'button';
      it.setAttribute('role', 'menuitem');
      it.dataset.menu = name;
      it.innerHTML = `${icon(name)}<span></span>`;
      it.lastElementChild!.textContent = label;
      it.onclick = () => {
        close();
        run();
      };
    }
    btn.onclick = () => {
      list.hidden = !list.hidden;
      btn.setAttribute('aria-expanded', String(!list.hidden));
    };
    map.on('click movestart', close);
    L.DomEvent.disableClickPropagation(box);
    return box;
  },
});
new MenuControl({ position: 'topright' }).addTo(map);

// Stage the loading so the base map is never held up: the overlays (the heaviest requests) are added once the base tiles of
// the first view are in, or after 2.5 s at most, and then the local data follows at low priority.
{
  let overlaysAdded = false;
  const addOverlays = () => {
    if (overlaysAdded) return;
    overlaysAdded = true;
    // the layers panel may have been used in the meantime: respect the checkboxes
    if ((document.getElementById('toggle-zones') as HTMLInputElement).checked) zoneOverlay.addTo(map);
    if ((document.getElementById('toggle-trails') as HTMLInputElement).checked) trailOverlay.addTo(map);
  };
  baseLayer.once('load', addOverlays);
  setTimeout(addOverlays, 2500);
}

// Fetch the local data once the map has drawn (or after 4 s at most), and at once for a deep link.
{
  const later = () => {
    const run = () => void ensureData(false);
    if ('requestIdleCallback' in window) (window as unknown as { requestIdleCallback: (f: () => void, o: { timeout: number }) => void }).requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 1500);
  };
  if (hashView) void ensureData(); // a deep link is checked at once, so the data is needed at once
  else {
    let started = false;
    const go = () => !started && ((started = true), later());
    baseLayer.once('load', () => setTimeout(go, 800)); // the first view's tiles are in
    setTimeout(go, 4000);
  }
}

// the route of the last visit is drawn again (the line only; the check is made when the Route page is opened)
restoreRoute(false);
// a link that carries a list of places (and maybe a trip) opens it
openShareHash();

// Handle for browser tests in the dev server only.
if (import.meta.env.DEV) (window as unknown as { __wildcamp: { map: L.Map; focusOn: typeof focusOn } }).__wildcamp = { map, focusOn };
