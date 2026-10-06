import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { isInSwitzerland } from './coords';
import { assess, type Assessment } from './assess';
import { lv95ToWgs84, wgs84ToLv95 } from './coords';
import { loadForestMask, type ForestMask } from './forestmask';
import { fetchCanton, fetchElevation, fetchMunicipality, fetchZoneHits } from './geoadmin';
import { classifyTreeline } from './treeline';
import { loadTreelineSurface, type TreelineSurface } from './treelinesurface';
import { findMunicipalRule, findUnverifiedNote } from './municipalities';
import { downloadText, shareText, spotsToGpx } from './gpx';
import { LANGS, applyStatic, getLang, setLang, tr, type Lang } from './i18n';
import { reportUrl } from './report';
import { fetchRestrictions } from './restrictions';
import { spotIcon } from './markers';
import { RetryTileLayer, RetryWmsLayer } from './tilelayer';
import { fetchJuraReserves } from './jura';
import { loadReserveSet, reserveZoneHits, type ReserveSet } from './reserves';
import { searchPlaces, type Place } from './search';
import { comfortFor } from './comfort/comfort';
import { fetchWater, type WaterInfo } from './comfort/water';
import { bulletinAt, fetchBulletin, type AvalancheInfo } from './comfort/avalanche';
import { fetchGround, type GroundInfo } from './comfort/ground';
import { RESERVE_FILES, FOREST_FILE, TREELINE_FILE } from './localdata';
import { MAX_TILES, megabytes, planTiles, registerOffline, saveShell, saveTiles, tileUrl } from './offline';
import { defaultName, isSaved, loadSaved, removeSpot, saveSpot, spotId, type SavedSpot } from './saved';
import { renderSaved } from './savedview';
import { fetchCoverGrid, fetchElevationGrid, rankCells, withWater } from './finder';
import { combined, renderFinder, type FinderRow } from './finderview';
import { planNights } from './planner';
import { addToTrip, loadTrip, moveInTrip, removeFromTrip, saveTrip, tripSpots } from './trip';
import { renderTrip } from './tripview';
import { renderPlan } from './planview';
import { legalityScore, sleepScore } from './scores';
import { fetchShelters, type ShelterResult } from './comfort/shelters';
import { nearBuildingNote } from './comfort/nearbuilding';
import { el, renderOutside, renderResult, type ResultUi } from './resultview';
import { fetchSurroundings, type Surroundings } from './comfort/surroundings';
import { fetchBuildingZone } from './buildingzone';
import { fetchHazards, type HazardInfo } from './comfort/hazards';
import { fetchNoise, type NoiseInfo } from './comfort/noise';
import { moonNight } from './comfort/moon';
import { sunTimes } from './comfort/sun';
import { analyseTerrain, fetchProfiles, FAR, NEAR, type Profiles, type TerrainMetrics } from './comfort/terrain';
import { fetchForecast, nightWindows, summariseNight, windowHours, zurichNow, type Hourly } from './comfort/weather';
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
const map = L.map('map', { zoomControl: false }).setView(hashView ? [hLat!, hLon!] : [46.8, 8.2], hashView ? hZoom || 14 : 8);

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
// not compete with the map tiles, or at once when a check needs it. A check waits for it (up to DATA_WAIT_MS), so a deep
// link or an early tap is not judged without the forest map or the reserve polygons.
const DATA_WAIT_MS = 6000;
let forestMask: ForestMask | undefined;
const reserveSets: ReserveSet[] = [];
let treelineSurface: TreelineSurface | undefined;
let dataLoaded = false;
let dataPromise: Promise<unknown> | undefined;

/** Start fetching the local data once; later calls return the same promise. */
function ensureData(urgent = true): Promise<unknown> {
  // a background fetch yields to the map tiles; one a check is waiting for does not
  const init: RequestInit = urgent ? {} : ({ priority: 'low' } as RequestInit);
  dataPromise ??= Promise.all([
    loadForestMask(`${import.meta.env.BASE_URL}${FOREST_FILE}`, init)
      .then((m) => (forestMask = m))
      .catch((err) => console.warn('forest map failed to load', err)),
    ...RESERVE_FILES.map((file) =>
      loadReserveSet(`${import.meta.env.BASE_URL}${file}`, init)
        .then((r) => reserveSets.push(r))
        .catch((err) => console.warn(`${file} failed to load`, err)),
    ),
    loadTreelineSurface(`${import.meta.env.BASE_URL}${TREELINE_FILE}`, init)
      .then((t) => (treelineSurface = t))
      .catch((err) => console.warn('treeline surface failed to load', err)),
  ]).then(() => (dataLoaded = true));
  return dataPromise;
}

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
  p.append(el('span', 'spinner'), dataLoaded ? tr('Checking this spot…') : tr('Checking this spot (loading the map data for the first time)…'));
  result.append(p);
}

/** Rejects after `ms`, so one stalled request cannot hold up a whole check. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

const CHECK_BUDGET_MS = 10000;
/** Longest any one part may take; a slow forecast service should not hold the final score for the whole budget. */
const PART_MS = 6000;

/**
 * Terrain, surroundings, water and forecast for a spot. Every part is requested at once with a shared deadline
 * (about 10 s from the tap): the sleep score appears as soon as the main parts are in, refreshes as the rest
 * arrives, and anything still missing at the deadline is dropped and listed as not checked.
 */
async function loadDetails(ui: ResultUi, lat: number, lng: number, elevation: number | undefined, id: number, tappedAt: number) {
  ui.setSleepLoading();
  ui.weatherHost.replaceChildren(el('p', 'where', tr('Loading the forecast…')));
  const { e, n } = wgs84ToLv95(lat, lng);
  const windows = nightWindows(zurichNow(new Date()));
  const abort = new AbortController();
  const budget = Math.max(3000, tappedAt + CHECK_BUDGET_MS - Date.now());
  const deadline = window.setTimeout(() => abort.abort(), budget);

  const got: { terrain?: TerrainMetrics; far?: Profiles; near?: Profiles; around?: Partial<Surroundings>; water?: WaterInfo; shelters?: ShelterResult; ground?: GroundInfo; avalanche?: AvalancheInfo; noise?: NoiseInfo; hazards?: HazardInfo; hourly?: Hourly } = {};
  const done = { near: false, far: false, around: false, water: false, shelter: false, ground: false, avalanche: false, rules: false, noise: false, hazards: false, forecast: false };
  const failed = { water: false, avalanche: false, noise: false, hazards: false, forecast: false };
  let selected = 0;

  const paint = () => {
    if (id !== checkId) return;
    const w = windows[selected]!;
    const night = got.hourly ? summariseNight(got.hourly, w) : undefined;
    const nightName = w.label === 'Tonight' ? 'tonight' : w.label === 'Tomorrow' ? 'tomorrow night' : `${w.label} night`;
    const terrain = got.near ? analyseTerrain(got.near, got.far) : undefined;
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
      avalanche: got.avalanche,
      avalancheFailed: failed.avalanche,
      noise: got.noise,
      noiseFailed: failed.noise,
      hazards: got.hazards,
      hazardsFailed: failed.hazards,
      sun: sunTimes(new Date(`${w.to.slice(0, 10)}T12:00:00Z`), lat, lng, horizon),
      eveningSun: sunTimes(new Date(`${w.day}T12:00:00Z`), lat, lng, horizon),
      moon: moonNight(lat, lng, w),
      inForest: forestMask ? forestAt(forestMask, e, n) !== 0 : undefined,
    });
    if (waiting.length < 9 || done.near) ui.setSleep(comfort, nightName, waiting);
    ui.setWeatherChip(night, w.label === 'Tonight' ? 'Tonight' : w.label === 'Tomorrow' ? 'Tomorrow' : w.label, done.forecast && !got.hourly);
    if (!done.forecast) return;
    if (!got.hourly) ui.weatherHost.replaceChildren(el('h2', 'wx-title', tr('Weather')), el('p', 'where', tr('The forecast could not be loaded.')));
    else
      renderWeather(ui.weatherHost, {
        windows,
        selected,
        night,
        hours: windowHours(got.hourly, w),
        note: comfort.weatherStop ? 'This weather rules the night out, however good the spot is.' : undefined,
        onSelect: (i) => {
          selected = i;
          paint();
        },
      });
  };

  const track = <T,>(key: keyof typeof done, p: Promise<T>, onValue: (v: T) => void, onFail?: () => void) =>
    p
      .then(onValue)
      .catch(() => onFail?.())
      .finally(() => {
        done[key] = true;
        paint();
      });

  const parts = [
    track('near', withTimeout(fetchProfiles(lat, lng, NEAR, abort.signal), PART_MS), (v) => (got.near = v)),
    track('far', withTimeout(fetchProfiles(lat, lng, FAR, abort.signal), PART_MS + 2000), (v) => (got.far = v)),
    track('around', withTimeout(fetchSurroundings(lat, lng, abort.signal), PART_MS), (v) => (got.around = v)),
    track('water', withTimeout(fetchWater(lat, lng, abort.signal), PART_MS), (v) => { got.water = v; ui.setWater(v); }, () => { failed.water = true; ui.setWater(undefined, true); }),
    track('shelter', withTimeout(fetchShelters(lat, lng, abort.signal), PART_MS), (v) => { got.shelters = v; ui.setShelter(v); ui.setNearBuilding(nearBuildingNote(v)); }, () => ui.setShelter(undefined, true)),
    track('ground', withTimeout(fetchGround(lat, lng, abort.signal), PART_MS), (v) => (got.ground = v)),
    track('avalanche', withTimeout(fetchBulletin(abort.signal), PART_MS).then((fc) => bulletinAt(fc, lat, lng, new Date())), (v) => { got.avalanche = v; ui.setAvalanche(v); }, () => { failed.avalanche = true; ui.setAvalanche(undefined, true); }),
    track('rules', withTimeout(fetchRestrictions(lat, lng, abort.signal), PART_MS), (v) => ui.setRules(v), () => ui.setRules({ failed: ['fire', 'drones'] })),
    track('noise', withTimeout(fetchNoise(lat, lng, abort.signal), PART_MS), (v) => (got.noise = v), () => (failed.noise = true)),
    track('hazards', withTimeout(fetchHazards(lat, lng, abort.signal), PART_MS), (v) => (got.hazards = v), () => (failed.hazards = true)),
    track('forecast', withTimeout(fetchForecast(lat, lng, elevation, abort.signal), PART_MS), (v) => (got.hourly = v), () => (failed.forecast = true)),
  ];
  await Promise.allSettled(parts);
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

/** Legality assessment of a spot: the zone, canton, municipality and reserve lookups plus the local data. */
async function assessSpot(lat: number, lng: number, knownElevation?: number) {
  const inJura = lat > 47.1 && lat < 47.55 && lng > 6.85 && lng < 7.6;
  const LOOKUP_MS = 7000;
  const dataWait = Promise.race([ensureData(), new Promise((r) => setTimeout(r, DATA_WAIT_MS))]); // runs alongside the lookups
  const [elev, zones, canton, muni, jura, bzone] = await Promise.allSettled([
    knownElevation !== undefined ? Promise.resolve(knownElevation) : withTimeout(fetchElevation(lat, lng), LOOKUP_MS),
    withTimeout(fetchZoneHits(lat, lng), LOOKUP_MS),
    withTimeout(fetchCanton(lat, lng), LOOKUP_MS),
    withTimeout(fetchMunicipality(lat, lng), LOOKUP_MS),
    inJura ? withTimeout(fetchJuraReserves(lat, lng), LOOKUP_MS) : Promise.resolve([]),
    withTimeout(fetchBuildingZone(lat, lng), LOOKUP_MS),
  ]);
  await dataWait;
  const elevation = elev.status === 'fulfilled' ? elev.value : undefined;
  const { e, n } = wgs84ToLv95(lat, lng);
  const { status: treeline, note: treelineNote } = classifyTreeline(forestMask, treelineSurface, e, n, elevation);
  const assessment = assess({
    zones: [...(zones.status === 'fulfilled' ? zones.value : []), ...reserveSets.flatMap((set) => reserveZoneHits(set, e, n)), ...(jura.status === 'fulfilled' ? jura.value : [])],
    zoneLookupFailed: zones.status === 'rejected',
    treeline,
    treelineNote,
    elevationKnown: elevation !== undefined,
    canton: canton.status === 'fulfilled' ? canton.value : undefined,
    municipality: muni.status === 'fulfilled' ? muni.value?.name : undefined,
    municipalRule: muni.status === 'fulfilled' ? findMunicipalRule(muni.value?.bfs)?.rule : undefined,
    municipalNote: muni.status === 'fulfilled' ? findUnverifiedNote(muni.value?.bfs) : undefined,
    buildingZone: bzone.status === 'fulfilled' ? bzone.value : { near: false, failed: true },
    outsideSwitzerland: canton.status === 'fulfilled' && canton.value === undefined,
  });
  return { assessment, elevation };
}

async function checkSpot(lat: number, lng: number, fromFinder = false) {
  const id = ++checkId;
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
    return;
  }
  showLoading();
  const assessed = await assessSpot(lat, lng);
  if (id !== checkId) return; // a newer tap superseded this one
  const { assessment, elevation } = assessed;
  if (assessment.outside) {
    sheet.dataset.state = 'result';
    renderOutside(result);
    return;
  }
  sheet.dataset.state = 'result';
  const ui = renderResult(result, assessment, elevation, focusOn);
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
  save.onclick = () => {
    if (isSaved(store, sid)) removeSpot(store, sid);
    else {
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
      if (!saveSpot(store, spot).stored) say(tr('This browser would not keep the spot (private mode or storage blocked).'));
    }
    paintSave();
    syncSavedCount();
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
  result.append(actions, more);
  sheet.scrollTop = 0;
  void loadDetails(ui, lat, lng, elevation, id, tappedAt);
}


// Saved spots
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const savedBtn = el('button', 'finder-btn');
savedBtn.type = 'button';
function syncSavedCount() {
  savedBtn.textContent = `★ ${tr('Saved spots ({n})', { n: loadSaved(store).length })}`;
}
syncSavedCount();
function showSaved() {
  ++checkId;
  ++finderId;
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  renderSaved(result, loadSaved(store), {
    onOpen: (sp) => {
      map.flyTo([sp.lat, sp.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      void checkSpot(sp.lat, sp.lng);
    },
    onRemove: (id) => {
      removeSpot(store, id);
      syncSavedCount();
      showSaved();
    },
    onPlan: (picked) => {
      saveTrip(store, picked.map((p) => p.id));
      showTrip();
    },
  });
}
// Trip planner: its own menu. The nights are saved spots in order; each gets a fresh forecast.
const forecastCache = new Map<string, Promise<Hourly>>();
const forecastFor = (sp: SavedSpot) => {
  let p = forecastCache.get(sp.id);
  if (!p) {
    p = withTimeout(fetchForecast(sp.lat, sp.lng, sp.elevation), 9000);
    forecastCache.set(sp.id, p);
    p.catch(() => forecastCache.delete(sp.id)); // a failed forecast is asked for again next time
  }
  return p;
};
let tripToken = 0;

function showTrip() {
  ++checkId;
  ++finderId;
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  const spots = loadSaved(store);
  const ids = loadTrip(store);
  const inTrip = tripSpots(ids, spots);
  const windows = nightWindows(zurichNow(new Date()));
  const setIds = (next: string[]) => {
    saveTrip(store, next);
    showTrip();
  };
  const host = renderTrip(result, spots, inTrip, windows.map((w) => w.label), {
    onAdd: (id) => setIds(addToTrip(inTrip.map((s) => s.id), id)),
    onRemove: (id) => setIds(removeFromTrip(inTrip.map((s) => s.id), id)),
    onMove: (i, dir) => setIds(moveInTrip(inTrip.map((s) => s.id), i, dir)),
    onOpen: (sp) => {
      map.flyTo([sp.lat, sp.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      void checkSpot(sp.lat, sp.lng);
    },
  });
  if (!inTrip.length) return;
  const token = ++tripToken;
  host.replaceChildren(el('p', 'where', tr('Loading the forecast for each spot…')));
  void Promise.allSettled(inTrip.map(forecastFor)).then((forecasts) => {
    if (token !== tripToken) return; // the trip was changed meanwhile
    const plan = planNights(inTrip, windows, forecasts.map((f) => (f.status === 'fulfilled' ? f.value : undefined)));
    renderPlan(host, plan, forecasts.slice(0, plan.rows.length).filter((f) => f.status === 'rejected').length);
  });
}
savedBtn.onclick = showSaved;
// (the saved list is opened with the star button on the map, so the start panel does not repeat it)

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
    if (!water || water.failed.includes('water')) parts.push('water not checked');
    else if (water.kind === 'none') parts.push('no water within 800 m');
    else parts.push(`${water.kind === 'lake' ? 'lake' : 'stream'}${water.name ? ` ${water.name}` : ''} ${Math.round(water.meters / 10) * 10} m away${water.glacierM !== undefined ? ' (glacier water)' : ''}${water.upstreamPlants.length ? ' (sewage upstream)' : ''}`);
  }
  return `${parts.join(' · ') || 'ground not classified'}.`;
}

async function findBest(lat: number, lng: number) {
  const id = ++finderId;
  ++checkId; // stops a running spot check from painting over the list
  marker?.remove();
  marker = L.marker([lat, lng], { icon: spotIcon(), keyboard: false }).addTo(map);
  focusMarker?.remove();
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  const gone = () => id !== finderId;
  const mount = () => renderFinder(result, tr('Best spots nearby'), (c) => void checkSpot(c.lat, c.lon, true));
  let ui = mount();
  finderBack = undefined;
  ui.update([], tr('Reading the terrain and ground around here…'), false);
  if (!isInSwitzerland(lat, lng)) return ui.update([], tr('This app only covers Switzerland.'), true);
  const { e, n } = wgs84ToLv95(lat, lng);
  const abort = new AbortController();
  const stop = window.setTimeout(() => abort.abort(), 40000);
  try {
    const grid = await withTimeout(fetchElevationGrid(e, n, abort.signal), 12000);
    if (gone()) return;
    const covers = await withTimeout(fetchCoverGrid({ e, n }, abort.signal), 10000).catch(() => new Map());
    if (gone()) return;
    const cands = rankCells(grid, { e, n }, covers, FINDER_CANDIDATES);
    if (!cands.length) return ui.update([], tr('No suitable flat ground found within about 700 m (steep, glacier, water or built-up). Try another place.'), true);

    const rows: FinderRow[] = cands.map((c) => ({ candidate: c, sleep: sleepScore(c.comfort), note: finderNote(c, undefined, false), waterDone: false }));
    let hidden = 0;
    const shown = () => {
      const open = rows.filter((r) => r.legal?.verdict !== 'no');
      hidden = rows.length - open.length;
      return open.sort((a, b) => combined(b) - combined(a));
    };
    const draw = (done: boolean) => {
      if (gone()) return;
      const list = done ? shown().slice(0, FINDER_SHOWN) : shown();
      const checked = rows.filter((r) => r.legal && r.waterDone).length;
      ui.update(list, done ? tr(list.length === 1 ? '{n} spot within about 700 m' : '{n} spots within about 700 m', { n: list.length }) + (hidden ? '; ' + tr('{n} more skipped because camping is not allowed there', { n: hidden }) : '') + '.' : tr('Checking legality and water: {done} of {total} done…', { done: checked, total: rows.length }), done);
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
        const [a, w] = await Promise.allSettled([withTimeout(assessSpot(c.lat, c.lon, c.elevation), 12000), withTimeout(fetchWater(c.lat, c.lon, abort.signal), 8000)]);
        if (gone()) return;
        const water = w.status === 'fulfilled' ? w.value : undefined;
        r.waterDone = true;
        if (water && !water.failed.includes('water')) {
          c.comfort = withWater(c, water);
          r.sleep = sleepScore(c.comfort);
        }
        r.note = finderNote(c, water, true);
        if (a.status === 'fulfilled') {
          const L0 = legalityScore(a.value.assessment);
          r.legal = { ...L0, verdict: a.value.assessment.verdict, label: a.value.assessment.verdict };
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

// Search
const q = document.getElementById('q') as HTMLInputElement;
const suggest = document.getElementById('suggest')!;
let searchAbort: AbortController | undefined;
let timer: number | undefined;

function closeSuggest() {
  suggest.hidden = true;
  suggest.replaceChildren();
}
function goTo(p: Place) {
  closeSuggest();
  q.value = p.label;
  q.blur();
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 14));
  void checkSpot(p.lat, p.lon);
}
q.addEventListener('input', () => {
  window.clearTimeout(timer);
  const text = q.value.trim();
  if (text.length < 2) return closeSuggest();
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
      if (!places.length) suggest.append(el('li', undefined, 'No places found'));
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
  try {
    const [first] = await searchPlaces(text);
    if (first) goTo(first);
  } catch {
    /* ignore */
  }
});

// Locate me
document.getElementById('locate')!.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      void checkSpot(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      sheet.classList.remove('closed');
      sheet.dataset.state = 'result';
      result.hidden = false;
      result.replaceChildren(el('p', 'where', tr('Location unavailable. Allow location access, or tap the map instead.')));
    },
    { enableHighAccuracy: true, timeout: 10000 },
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
let watchId: number | undefined;
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
  if (me) return void map.flyTo(me.at, Math.max(map.getZoom(), MY_ZOOM), { duration: 0.6 }); // already tracking: just come back
  say(tr('Finding your location…'));
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      showMe(pos, first);
      if (first) toast.hidden = true;
      first = false;
    },
    (err) => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = undefined;
      say(err.code === err.PERMISSION_DENIED ? tr('Location is blocked. Allow it for this site in your browser settings, then try again.') : tr('Could not get your location. Try again outdoors or with a better signal.'));
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
}

// Offline: a service worker keeps the app, its data and viewed map tiles; a button saves the visible area on purpose.
if (import.meta.env.PROD) registerOffline(import.meta.env.BASE_URL);
const banner = document.getElementById('offline-banner')!;
const syncOnline = () => (banner.hidden = navigator.onLine);
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);
syncOnline();

let saving: AbortController | undefined;
async function saveArea() {
  if (saving) {
    saving.abort();
    return;
  }
  if (!('caches' in window)) return say(tr('This browser cannot store maps for offline use.'));
  if (!navigator.onLine) return say(tr('You are offline: connect to save a map area.'));
  const b = map.getBounds();
  const plan = planTiles({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, Math.round(map.getZoom()));
  if (!plan.tiles.length) return say(tr('This view is too large to save (more than {max} tiles). Zoom in and try again.', { max: MAX_TILES }));
  const ctl = (saving = new AbortController());
  say(tr('Saving {n} map tiles (about {mb} MB, zoom {from} to {to}). Tap the button again to stop.', { n: plan.tiles.length, mb: megabytes(plan.tiles.length), from: plan.from, to: plan.to }));
  void navigator.storage?.persist?.();
  try {
    await saveShell(import.meta.env.BASE_URL);
    const r = await saveTiles(plan.tiles.map((tl) => tileUrl(tl.z, tl.x, tl.y)), (p) => say(tr('Saving map: {done} of {total} tiles…', { done: p.done, total: p.total })), ctl.signal);
    say(ctl.signal.aborted ? tr('Stopped: {n} tiles saved.', { n: r.done - r.failed }) : r.failed ? tr('Saved {ok} of {total} tiles; {failed} failed. Try again with a better connection.', { ok: r.total - r.failed, total: r.total, failed: r.failed }) : tr('Saved {n} tiles (zoom {from} to {to}) and the app data. The map and local checks now work offline here; zone, water and weather lookups still need a connection.', { n: r.total, from: plan.from, to: plan.to }));
  } finally {
    saving = undefined;
  }
}

// One menu button tucks the map's actions away; zoom stays beside it.
const ICONS: Record<string, string> = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  locate: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  saved: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
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
      ['locate', tr('My location'), locateMe],
      ['saved', tr('Saved spots'), showSaved],
      ['trip', tr('Trip planner'), showTrip],
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

// Handle for browser tests in the dev server only.
if (import.meta.env.DEV) (window as unknown as { __wildcamp: { map: L.Map; focusOn: typeof focusOn } }).__wildcamp = { map, focusOn };
