import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { isInSwitzerland } from './coords';
import { assess, type Assessment } from './assess';
import { wgs84ToLv95 } from './coords';
import { loadForestMask, type ForestMask } from './forestmask';
import { fetchCanton, fetchElevation, fetchMunicipality, fetchZoneHits } from './geoadmin';
import { classifyTreeline } from './treeline';
import { loadTreelineSurface, type TreelineSurface } from './treelinesurface';
import { findMunicipalRule } from './municipalities';
import { fetchJuraReserves } from './jura';
import { loadReserveSet, reserveZoneHits, type ReserveSet } from './reserves';
import { searchPlaces, type Place } from './search';
import { comfortFor } from './comfort/comfort';
import { fetchWater } from './comfort/water';
import { el, renderOutside, renderResult, type ResultUi } from './resultview';
import { fetchSurroundings } from './comfort/surroundings';
import { sunTimes } from './comfort/sun';
import { analyseTerrain, fetchProfiles, FAR, NEAR } from './comfort/terrain';
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

// Local data (forest map 3.7 MB, reserves, treeline surface) loads in the background. A check waits for it (up to
// DATA_WAIT_MS), so a deep link or an early tap is not judged without the forest map or the reserve polygons.
const loading: Promise<unknown>[] = [];
const DATA_WAIT_MS = 20000;
let forestMask: ForestMask | undefined;
loading.push(
  loadForestMask(`${import.meta.env.BASE_URL}forest-mask.bin.gz`)
    .then((m) => (forestMask = m))
    .catch((err) => console.warn('forest map failed to load', err)),
);

const reserveSets: ReserveSet[] = [];
for (const file of ['reserves-be.json.gz', 'reserves-ti.json.gz', 'reserves-vs.json.gz', 'reserves-ge.json.gz', 'reserves-gl.json.gz', 'reserves-fr.json.gz', 'reserves-lu.json.gz', 'reserves-so.json.gz', 'bans-court.json.gz']) {
  loading.push(
    loadReserveSet(`${import.meta.env.BASE_URL}${file}`)
      .then((r) => reserveSets.push(r))
      .catch((err) => console.warn(`${file} failed to load`, err)),
  );
}

let treelineSurface: TreelineSurface | undefined;
loading.push(
  loadTreelineSurface(`${import.meta.env.BASE_URL}treeline-surface.bin.gz`)
    .then((t) => (treelineSurface = t))
    .catch((err) => console.warn('treeline surface failed to load', err)),
);
const dataReady = Promise.all(loading);

const sheet = document.getElementById('sheet')!;
const result = document.getElementById('result')!;

function showLoading() {
  sheet.dataset.state = 'loading';
  result.hidden = false;
  result.replaceChildren();
  const p = el('p', 'where');
  p.append(el('span', 'spinner'), 'Checking this spot…');
  result.append(p);
}

/** Terrain, surroundings, water and forecast for a spot; the sleep score, water chip and weather card follow the chosen night. */
async function loadDetails(ui: ResultUi, lat: number, lng: number, elevation: number | undefined, id: number) {
  ui.setSleepLoading();
  ui.weatherHost.replaceChildren(el('p', 'where', 'Loading the forecast…'));
  const { e, n } = wgs84ToLv95(lat, lng);
  const windows = nightWindows(zurichNow(new Date()));
  const [near, far, around, water, forecast] = await Promise.allSettled([
    fetchProfiles(lat, lng, NEAR),
    fetchProfiles(lat, lng, FAR),
    fetchSurroundings(lat, lng),
    fetchWater(lat, lng),
    fetchForecast(lat, lng, elevation),
  ]);
  if (id !== checkId) return;
  const terrain = near.status === 'fulfilled' ? analyseTerrain(near.value, far.status === 'fulfilled' ? far.value : undefined) : undefined;
  const horizon = terrain && (terrain.farHorizon ? terrain.horizon.map((h, i) => Math.max(h, terrain.farHorizon![i]!)) : terrain.horizon);
  const hourly: Hourly | undefined = forecast.status === 'fulfilled' ? forecast.value : undefined;
  const waterInfo = water.status === 'fulfilled' ? water.value : undefined;
  ui.setWater(waterInfo, water.status === 'rejected');
  let selected = 0;
  const paint = () => {
    const w = windows[selected]!;
    const night = hourly ? summariseNight(hourly, w) : undefined;
    const nightName = w.label === 'Tonight' ? 'tonight' : w.label === 'Tomorrow' ? 'tomorrow night' : `${w.label} night`;
    const comfort = comfortFor({
      terrain,
      night,
      surroundings: around.status === 'fulfilled' ? around.value : undefined,
      water: waterInfo,
      sun: sunTimes(new Date(`${w.to.slice(0, 10)}T12:00:00Z`), lat, lng, horizon),
      inForest: forestMask ? forestAt(forestMask, e, n) !== 0 : undefined,
    });
    ui.setSleep(comfort, nightName);
    ui.setWeatherChip(night, w.label === 'Tonight' ? 'Tonight' : w.label === 'Tomorrow' ? 'Tomorrow' : w.label, !hourly);
    if (!hourly) ui.weatherHost.replaceChildren(el('h2', 'wx-title', 'Weather'), el('p', 'where', 'The forecast could not be loaded.'));
    else
      renderWeather(ui.weatherHost, {
        windows,
        selected,
        night,
        hours: windowHours(hourly, w),
        note: comfort.weatherStop ? 'This weather rules the night out, however good the spot is.' : undefined,
        onSelect: (i) => {
          selected = i;
          paint();
        },
      });
  };
  paint();
}

let marker: L.Marker | undefined;
let checkId = 0;

async function checkSpot(lat: number, lng: number) {
  const id = ++checkId;
  marker?.remove();
  marker = L.marker([lat, lng]).addTo(map);
  history.replaceState(null, '', `#${lat.toFixed(5)},${lng.toFixed(5)},${map.getZoom()}`);
  if (!isInSwitzerland(lat, lng)) {
    sheet.dataset.state = 'result';
    result.hidden = false;
    result.replaceChildren(el('p', 'where', 'This app only covers Switzerland.'));
    return;
  }
  showLoading();
  const inJura = lat > 47.1 && lat < 47.55 && lng > 6.85 && lng < 7.6;
  const [elev, zones, canton, muni, jura] = await Promise.allSettled([
    fetchElevation(lat, lng),
    fetchZoneHits(lat, lng),
    fetchCanton(lat, lng),
    fetchMunicipality(lat, lng),
    inJura ? fetchJuraReserves(lat, lng) : Promise.resolve([]),
  ]);
  await Promise.race([dataReady, new Promise((r) => setTimeout(r, DATA_WAIT_MS))]);
  if (id !== checkId) return; // a newer tap superseded this one
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
      outsideSwitzerland: canton.status === 'fulfilled' && canton.value === undefined,
  });
  if (assessment.outside) {
    sheet.dataset.state = 'result';
    renderOutside(result);
    return;
  }
  sheet.dataset.state = 'result';
  const ui = renderResult(result, assessment, elevation);
  sheet.scrollTop = 0;
  void loadDetails(ui, lat, lng, elevation, id);
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

// Handle for browser tests in the dev server only.
if (import.meta.env.DEV) (window as unknown as { __wildcamp: { map: L.Map } }).__wildcamp = { map };
