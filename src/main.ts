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
import { reportUrl } from './report';
import { fetchJuraReserves } from './jura';
import { loadReserveSet, reserveZoneHits, type ReserveSet } from './reserves';
import { searchPlaces, type Place } from './search';
import { comfortFor } from './comfort/comfort';
import { fetchWater, type WaterInfo } from './comfort/water';
import { bulletinAt, fetchBulletin, type AvalancheInfo } from './comfort/avalanche';
import { fetchGround, type GroundInfo } from './comfort/ground';
import { fetchCoverGrid, fetchElevationGrid, rankCells, withWater } from './finder';
import { RESERVE_FILES, FOREST_FILE, TREELINE_FILE } from './localdata';
import { MAX_TILES, megabytes, planTiles, registerOffline, saveShell, saveTiles, tileUrl } from './offline';
import { defaultName, isSaved, loadSaved, removeSpot, saveSpot, spotId, type SavedSpot } from './saved';
import { renderSaved } from './savedview';
import { combined, renderFinder, type FinderRow } from './finderview';
import { legalityScore, sleepScore } from './scores';
import { fetchShelters, type ShelterResult } from './comfort/shelters';
import { el, renderOutside, renderResult, type ResultUi } from './resultview';
import { fetchSurroundings, type Surroundings } from './comfort/surroundings';
import { sunTimes } from './comfort/sun';
import { analyseTerrain, fetchProfiles, FAR, NEAR, type Profiles, type TerrainMetrics } from './comfort/terrain';
import { fetchForecast, nightWindows, summariseNight, windowHours, zurichNow, type Hourly } from './comfort/weather';
import { renderWeather } from './weatherview';
import { forestAt } from './forestmask';
import { ZONE_LAYERS } from './zones';

// Optional deep link: #lat,lon,zoom
const [hLat, hLon, hZoom] = location.hash.slice(1).split(',').map(Number);
const hashView = Number.isFinite(hLat) && Number.isFinite(hLon);
const map = L.map('map', { zoomControl: false }).setView(hashView ? [hLat!, hLon!] : [46.8, 8.2], hashView ? hZoom || 14 : 8);

L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer(
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  { maxZoom: 18, attribution: '© swisstopo' },
).addTo(map);

const zoneOverlay = L.tileLayer
  .wms('https://wms.geo.admin.ch/', {
    layers: ZONE_LAYERS.filter((l) => l.severity !== 'info')
      .map((l) => l.overlayId ?? l.id)
      .join(','),
    format: 'image/png',
    transparent: true,
    opacity: 0.45,
    attribution: '© BAFU',
  });
zoneOverlay.addTo(map);

// Signposted hiking trails (swissTLM3D): yellow hiking, red mountain, blue alpine trails.
const trailOverlay = L.tileLayer.wms('https://wms.geo.admin.ch/', {
  layers: 'ch.swisstopo.swisstlm3d-wanderwege',
  format: 'image/png',
  transparent: true,
  opacity: 0.9,
  attribution: '© swisstopo (trails)',
});
trailOverlay.addTo(map);

// Slopes of 30 degrees or more (swisstopo): where avalanches release. Off by default, toggled in the layers panel.
const slopeOverlay = L.tileLayer.wms('https://wms.geo.admin.ch/', {
  layers: 'ch.swisstopo-karto.hangneigung',
  format: 'image/png',
  transparent: true,
  opacity: 0.6,
  attribution: '© swisstopo (slope)',
});

// Local data (forest map 3.7 MB, reserves, treeline surface) loads in the background. A check waits for it (up to
// DATA_WAIT_MS), so a deep link or an early tap is not judged without the forest map or the reserve polygons.
const loading: Promise<unknown>[] = [];
const DATA_WAIT_MS = 6000;
let forestMask: ForestMask | undefined;
loading.push(
  loadForestMask(`${import.meta.env.BASE_URL}${FOREST_FILE}`)
    .then((m) => (forestMask = m))
    .catch((err) => console.warn('forest map failed to load', err)),
);

const reserveSets: ReserveSet[] = [];
for (const file of RESERVE_FILES) {
  loading.push(
    loadReserveSet(`${import.meta.env.BASE_URL}${file}`)
      .then((r) => reserveSets.push(r))
      .catch((err) => console.warn(`${file} failed to load`, err)),
  );
}

let treelineSurface: TreelineSurface | undefined;
loading.push(
  loadTreelineSurface(`${import.meta.env.BASE_URL}${TREELINE_FILE}`)
    .then((t) => (treelineSurface = t))
    .catch((err) => console.warn('treeline surface failed to load', err)),
);
let dataLoaded = false;
const dataReady = Promise.all(loading).then(() => (dataLoaded = true));

const sheet = document.getElementById('sheet')!;
document.getElementById('sheet-close')!.onclick = () => sheet.classList.add('closed');
const result = document.getElementById('result')!;
const introFind = el('button', 'finder-btn', '🔍 Find the best spots around the map centre');
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
  p.append(el('span', 'spinner'), dataLoaded ? 'Checking this spot…' : 'Checking this spot (loading the map data for the first time)…');
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
  ui.weatherHost.replaceChildren(el('p', 'where', 'Loading the forecast…'));
  const { e, n } = wgs84ToLv95(lat, lng);
  const windows = nightWindows(zurichNow(new Date()));
  const abort = new AbortController();
  const budget = Math.max(3000, tappedAt + CHECK_BUDGET_MS - Date.now());
  const deadline = window.setTimeout(() => abort.abort(), budget);

  const got: { terrain?: TerrainMetrics; far?: Profiles; near?: Profiles; around?: Partial<Surroundings>; water?: WaterInfo; shelters?: ShelterResult; ground?: GroundInfo; avalanche?: AvalancheInfo; hourly?: Hourly } = {};
  const done = { near: false, far: false, around: false, water: false, shelter: false, ground: false, avalanche: false, forecast: false };
  const failed = { water: false, avalanche: false, forecast: false };
  let selected = 0;

  const paint = () => {
    if (id !== checkId) return;
    const w = windows[selected]!;
    const night = got.hourly ? summariseNight(got.hourly, w) : undefined;
    const nightName = w.label === 'Tonight' ? 'tonight' : w.label === 'Tomorrow' ? 'tomorrow night' : `${w.label} night`;
    const terrain = got.near ? analyseTerrain(got.near, got.far) : undefined;
    const horizon = terrain && (terrain.farHorizon ? terrain.horizon.map((h, i) => Math.max(h, terrain.farHorizon![i]!)) : terrain.horizon);
    // the far profile only refines the sun times, so the score does not wait for it
    const waiting = [!done.near && 'terrain', !done.around && 'trails and roads', !done.water && 'water', !done.shelter && 'huts', !done.ground && 'ground cover', !done.avalanche && 'avalanche bulletin', !done.forecast && 'forecast'].filter(Boolean) as string[];
    const comfort = comfortFor({
      terrain,
      night,
      surroundings: got.around,
      water: got.water,
      shelters: got.shelters,
      ground: got.ground,
      avalanche: got.avalanche,
      avalancheFailed: failed.avalanche,
      sun: sunTimes(new Date(`${w.to.slice(0, 10)}T12:00:00Z`), lat, lng, horizon),
      inForest: forestMask ? forestAt(forestMask, e, n) !== 0 : undefined,
    });
    if (waiting.length < 7 || done.near) ui.setSleep(comfort, nightName, waiting);
    ui.setWeatherChip(night, w.label === 'Tonight' ? 'Tonight' : w.label === 'Tomorrow' ? 'Tomorrow' : w.label, done.forecast && !got.hourly);
    if (!done.forecast) return;
    if (!got.hourly) ui.weatherHost.replaceChildren(el('h2', 'wx-title', 'Weather'), el('p', 'where', 'The forecast could not be loaded.'));
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
    track('shelter', withTimeout(fetchShelters(lat, lng, abort.signal), PART_MS), (v) => { got.shelters = v; ui.setShelter(v); }, () => ui.setShelter(undefined, true)),
    track('ground', withTimeout(fetchGround(lat, lng, abort.signal), PART_MS), (v) => (got.ground = v)),
    track('avalanche', withTimeout(fetchBulletin(abort.signal), PART_MS).then((fc) => bulletinAt(fc, lat, lng, new Date())), (v) => { got.avalanche = v; ui.setAvalanche(v); }, () => { failed.avalanche = true; ui.setAvalanche(undefined, true); }),
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
  const dataWait = Promise.race([dataReady, new Promise((r) => setTimeout(r, DATA_WAIT_MS))]); // runs alongside the lookups
  const [elev, zones, canton, muni, jura] = await Promise.allSettled([
    knownElevation !== undefined ? Promise.resolve(knownElevation) : withTimeout(fetchElevation(lat, lng), LOOKUP_MS),
    withTimeout(fetchZoneHits(lat, lng), LOOKUP_MS),
    withTimeout(fetchCanton(lat, lng), LOOKUP_MS),
    withTimeout(fetchMunicipality(lat, lng), LOOKUP_MS),
    inJura ? withTimeout(fetchJuraReserves(lat, lng), LOOKUP_MS) : Promise.resolve([]),
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
    canton: canton.status === 'fulfilled' ? canton.value : undefined,
    municipality: muni.status === 'fulfilled' ? muni.value?.name : undefined,
    municipalRule: muni.status === 'fulfilled' ? findMunicipalRule(muni.value?.bfs)?.rule : undefined,
    municipalNote: muni.status === 'fulfilled' ? findUnverifiedNote(muni.value?.bfs) : undefined,
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
  marker = L.marker([lat, lng]).addTo(map);
  history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)},${map.getZoom()}`);
  if (!isInSwitzerland(lat, lng)) {
    sheet.dataset.state = 'result';
    result.hidden = false;
    result.replaceChildren(el('p', 'where', 'This app only covers Switzerland.'));
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
    const back = el('button', 'linkish', '← Back to best spots');
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
    save.textContent = on ? '★ Saved: tap to remove' : '☆ Save this spot';
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
      if (!saveSpot(store, spot).stored) say('This browser would not keep the spot (private mode or storage blocked).');
    }
    paintSave();
    syncSavedCount();
  };
  result.append(save);
  const report = el('a', 'linkish report-link', 'Report a missing or wrong rule');
  report.href = reportUrl({ lat, lng, municipality: assessment.municipality, canton: assessment.canton?.name, verdict: assessment.verdict, link: location.href });
  report.target = '_blank';
  report.rel = 'noopener';
  const find = el('button', 'finder-btn', '🔍 Find the best spots near here');
  find.type = 'button';
  find.onclick = () => void findBest(lat, lng);
  result.append(find, report);
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
  savedBtn.textContent = `★ Saved spots (${loadSaved(store).length})`;
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
  });
}
savedBtn.onclick = showSaved;
document.getElementById('intro')!.append(savedBtn);

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
  marker = L.marker([lat, lng]).addTo(map);
  focusMarker?.remove();
  finderPins.clearLayers();
  sheet.classList.remove('closed');
  sheet.dataset.state = 'result';
  result.hidden = false;
  const gone = () => id !== finderId;
  const mount = () => renderFinder(result, 'Best spots nearby', (c) => void checkSpot(c.lat, c.lon, true));
  let ui = mount();
  finderBack = undefined;
  ui.update([], 'Reading the terrain and ground around here…', false);
  if (!isInSwitzerland(lat, lng)) return ui.update([], 'This app only covers Switzerland.', true);
  const { e, n } = wgs84ToLv95(lat, lng);
  const abort = new AbortController();
  const stop = window.setTimeout(() => abort.abort(), 40000);
  try {
    const grid = await withTimeout(fetchElevationGrid(e, n, abort.signal), 12000);
    if (gone()) return;
    const covers = await withTimeout(fetchCoverGrid({ e, n }, abort.signal), 10000).catch(() => new Map());
    if (gone()) return;
    const cands = rankCells(grid, { e, n }, covers, FINDER_CANDIDATES);
    if (!cands.length) return ui.update([], 'No suitable flat ground found within about 700 m (steep, glacier, water or built-up). Try another place.', true);

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
      ui.update(list, done ? `${list.length} spot${list.length === 1 ? '' : 's'} within about 700 m${hidden ? `; ${hidden} more skipped because camping is not allowed there` : ''}.` : `Checking legality and water: ${checked} of ${rows.length} done…`, done);
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
    if (!gone()) ui.update([], `The terrain could not be loaded (${why}). Check your connection and try again.`, true);
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
      result.replaceChildren(el('p', 'where', 'Location unavailable. Allow location access, or tap the map instead.'));
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// Layer legend
const legend = document.getElementById('legend')!;
const layersBtn = document.getElementById('layers-btn')!;
layersBtn.addEventListener('click', () => {
  legend.hidden = !legend.hidden;
  layersBtn.setAttribute('aria-expanded', String(!legend.hidden));
});
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
  if (!navigator.geolocation) return say('This browser cannot share your location.');
  if (me) return void map.flyTo(me.at, Math.max(map.getZoom(), MY_ZOOM), { duration: 0.6 }); // already tracking: just come back
  say('Finding your location…');
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
      say(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow it for this site in your browser settings, then try again.' : 'Could not get your location. Try again outdoors or with a better signal.');
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
}

const LocateControl = L.Control.extend({
  onAdd() {
    const btn = L.DomUtil.create('button', 'map-locate') as HTMLButtonElement;
    btn.type = 'button';
    btn.title = 'Center the map on my location';
    btn.setAttribute('aria-label', 'Center the map on my location');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', locateMe);
    return btn;
  },
});
new LocateControl({ position: 'topright' }).addTo(map);

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
  if (!('caches' in window)) return say('This browser cannot store maps for offline use.');
  if (!navigator.onLine) return say('You are offline: connect to save a map area.');
  const b = map.getBounds();
  const plan = planTiles({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, Math.round(map.getZoom()));
  if (!plan.tiles.length) return say(`This view is too large to save (more than ${MAX_TILES} tiles). Zoom in and try again.`);
  const ctl = (saving = new AbortController());
  say(`Saving ${plan.tiles.length} map tiles (about ${megabytes(plan.tiles.length)} MB, zoom ${plan.from} to ${plan.to}). Tap the button again to stop.`);
  void navigator.storage?.persist?.();
  try {
    await saveShell(import.meta.env.BASE_URL);
    const r = await saveTiles(plan.tiles.map((t) => tileUrl(t.z, t.x, t.y)), (p) => say(`Saving map: ${p.done} of ${p.total} tiles…`), ctl.signal);
    say(ctl.signal.aborted ? `Stopped: ${r.done - r.failed} tiles saved.` : r.failed ? `Saved ${r.total - r.failed} of ${r.total} tiles; ${r.failed} failed. Try again with a better connection.` : `Saved ${r.total} tiles (zoom ${plan.from} to ${plan.to}) and the app data. The map and local checks now work offline here; zone, water and weather lookups still need a connection.`);
  } finally {
    saving = undefined;
  }
}

const SaveControl = L.Control.extend({
  onAdd() {
    const btn = L.DomUtil.create('button', 'map-locate') as HTMLButtonElement;
    btn.type = 'button';
    btn.title = 'Save this map area for offline use';
    btn.setAttribute('aria-label', 'Save this map area for offline use');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 18v2h14v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', () => void saveArea());
    return btn;
  },
});
new SaveControl({ position: 'topright' }).addTo(map);

const SavedControl = L.Control.extend({
  onAdd() {
    const btn = L.DomUtil.create('button', 'map-locate map-saved') as HTMLButtonElement;
    btn.type = 'button';
    btn.title = 'Saved spots';
    btn.setAttribute('aria-label', 'Saved spots');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', showSaved);
    return btn;
  },
});
new SavedControl({ position: 'topright' }).addTo(map);

// Handle for browser tests in the dev server only.
if (import.meta.env.DEV) (window as unknown as { __wildcamp: { map: L.Map; focusOn: typeof focusOn } }).__wildcamp = { map, focusOn };
