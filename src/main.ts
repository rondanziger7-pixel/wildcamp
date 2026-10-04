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

// Forest map (3.7 MB) loads in the background; clicks before it arrives fall back to elevation only.
let forestMask: ForestMask | undefined;
loadForestMask(`${import.meta.env.BASE_URL}forest-mask.bin.gz`)
  .then((m) => (forestMask = m))
  .catch((err) => console.warn('forest map failed to load', err));

const reserveSets: ReserveSet[] = [];
for (const file of ['reserves-be.json.gz', 'reserves-ti.json.gz', 'reserves-vs.json.gz', 'reserves-ge.json.gz', 'reserves-gl.json.gz', 'reserves-fr.json.gz', 'reserves-lu.json.gz', 'reserves-so.json.gz']) {
  loadReserveSet(`${import.meta.env.BASE_URL}${file}`)
    .then((r) => reserveSets.push(r))
    .catch((err) => console.warn(`${file} failed to load`, err));
}

let treelineSurface: TreelineSurface | undefined;
loadTreelineSurface(`${import.meta.env.BASE_URL}treeline-surface.bin.gz`)
  .then((t) => (treelineSurface = t))
  .catch((err) => console.warn('treeline surface failed to load', err));

const sheet = document.getElementById('sheet')!;
const result = document.getElementById('result')!;

const BANNER: Record<Assessment['verdict'], { icon: string; label: string; sub: string }> = {
  no: { icon: '⛔', label: 'Not allowed', sub: 'A recorded rule or protected zone prohibits camping here.' },
  caution: { icon: '⚠️', label: 'Be careful', sub: 'Possibly restricted. Read the points below before you go.' },
  likely_ok: { icon: '✅', label: 'Likely OK', sub: 'No restriction found in the data checked. Not a guarantee.' },
  unknown: { icon: '❔', label: 'Unknown', sub: 'Not enough data to say. Check locally.' },
};
const OUTSIDE = { icon: '🌍', label: 'Outside Switzerland', sub: 'This app only covers Swiss rules and zones.' };
const TONE_ORDER = { bad: 0, warn: 1, ok: 2, info: 3 } as const;
const VISIBLE = 4;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function showLoading() {
  sheet.dataset.state = 'loading';
  result.hidden = false;
  result.replaceChildren();
  const p = el('p', 'where');
  p.append(el('span', 'spinner'), 'Checking this spot…');
  result.append(p);
}

function render(a: Assessment, lat: number, lng: number, elevation?: number) {
  sheet.dataset.state = 'result';
  const b = a.outside ? OUTSIDE : BANNER[a.verdict];
  const banner = el('div', `banner ${a.verdict}`);
  const text = el('div');
  text.append(el('h2', undefined, b.label), el('p', undefined, b.sub));
  banner.append(el('span', 'icon', b.icon), text);

  const where = el('p', 'where', [a.municipality, a.canton?.name, elevation === undefined ? '' : `${Math.round(elevation)} m`].filter(Boolean).join(' · '));

  const list = el('ul', 'checks');
  const items = [...a.items].sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone]);
  items.forEach((it, i) => {
    const li = el('li', `check ${it.tone}${i >= VISIBLE ? ' more' : ''}`);
    li.append(el('h3', undefined, it.title), el('p', undefined, it.text));
    if (it.sources?.length) {
      const s = el('div', 'srcs');
      s.append('Source: ');
      it.sources.forEach((u, k) => {
        if (k) s.append(', ');
        const link = el('a', undefined, new URL(u).hostname);
        link.href = u;
        link.target = '_blank';
        link.rel = 'noopener';
        s.append(link);
      });
      li.append(s);
    }
    list.append(li);
  });

  const actions = el('div', 'actions');
  if (items.length > VISIBLE) {
    const more = el('button', undefined, `Show all ${items.length} details`);
    more.type = 'button';
    more.onclick = () => {
      const open = list.classList.toggle('expanded');
      more.textContent = open ? 'Show fewer' : `Show all ${items.length} details`;
    };
    actions.append(more);
  }
  const share = el('button', undefined, 'Copy link');
  share.type = 'button';
  share.onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      share.textContent = 'Link copied';
    } catch {
      share.textContent = location.href;
    }
  };
  actions.append(share);
  result.replaceChildren(banner, where, list, actions);
  sheet.scrollTop = 0;
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
  if (id !== checkId) return; // a newer tap superseded this one
  const elevation = elev.status === 'fulfilled' ? elev.value : undefined;
  const { e, n } = wgs84ToLv95(lat, lng);
  const { status: treeline, note: treelineNote } = classifyTreeline(forestMask, treelineSurface, e, n, elevation);
  render(
    assess({
      zones: [...(zones.status === 'fulfilled' ? zones.value : []), ...reserveSets.flatMap((set) => reserveZoneHits(set, e, n)), ...(jura.status === 'fulfilled' ? jura.value : [])],
      zoneLookupFailed: zones.status === 'rejected',
      treeline,
      treelineNote,
      canton: canton.status === 'fulfilled' ? canton.value : undefined,
      municipality: muni.status === 'fulfilled' ? muni.value?.name : undefined,
      municipalRule: muni.status === 'fulfilled' ? findMunicipalRule(muni.value?.bfs)?.rule : undefined,
      outsideSwitzerland: canton.status === 'fulfilled' && canton.value === undefined,
    }),
    lat,
    lng,
    elevation,
  );
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
document.getElementById('toggle-zones')!.addEventListener('change', (ev) => {
  if ((ev.target as HTMLInputElement).checked) zoneOverlay.addTo(map);
  else zoneOverlay.remove();
});
