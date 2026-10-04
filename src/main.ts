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
import { ZONE_LAYERS } from './zones';

// Optional deep link: #lat,lon,zoom
const [hLat, hLon, hZoom] = location.hash.slice(1).split(',').map(Number);
const hashView = Number.isFinite(hLat) && Number.isFinite(hLon);
const map = L.map('map').setView(hashView ? [hLat!, hLon!] : [46.8, 8.2], hashView ? hZoom || 14 : 8);

L.tileLayer(
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
  { maxZoom: 18, attribution: '© swisstopo' },
).addTo(map);

L.tileLayer
  .wms('https://wms.geo.admin.ch/', {
    layers: ZONE_LAYERS.filter((l) => l.severity !== 'info')
      .map((l) => l.overlayId ?? l.id)
      .join(','),
    format: 'image/png',
    transparent: true,
    opacity: 0.45,
    attribution: '© BAFU',
  })
  .addTo(map);

// Forest map (3.7 MB) loads in the background; clicks before it arrives fall back to elevation only.
let forestMask: ForestMask | undefined;
loadForestMask(`${import.meta.env.BASE_URL}forest-mask.bin.gz`)
  .then((m) => (forestMask = m))
  .catch((err) => console.warn('forest map failed to load', err));

const reserveSets: ReserveSet[] = [];
for (const file of ['reserves-be.json.gz', 'reserves-ti.json.gz', 'reserves-vs.json.gz']) {
  loadReserveSet(`${import.meta.env.BASE_URL}${file}`)
    .then((r) => reserveSets.push(r))
    .catch((err) => console.warn(`${file} failed to load`, err));
}

let treelineSurface: TreelineSurface | undefined;
loadTreelineSurface(`${import.meta.env.BASE_URL}treeline-surface.bin.gz`)
  .then((t) => (treelineSurface = t))
  .catch((err) => console.warn('treeline surface failed to load', err));

let marker: L.Marker | undefined;
const result = document.getElementById('result')!;
const hint = document.getElementById('hint')!;

const LABEL: Record<Assessment['verdict'], string> = {
  no: 'Not allowed',
  caution: 'Caution',
  likely_ok: 'Likely OK',
  unknown: 'Unknown',
};

function render(a: Assessment, elevation?: number) {
  result.innerHTML = '';
  const h = document.createElement('h2');
  h.className = `verdict ${a.verdict}`;
  h.textContent = LABEL[a.verdict];
  const meta = document.createElement('p');
  meta.textContent = [a.municipality, a.canton?.name, elevation === undefined ? '' : `${Math.round(elevation)} m`].filter(Boolean).join(' · ');
  const ul = document.createElement('ul');
  for (const r of a.reasons) {
    const li = document.createElement('li');
    li.textContent = r;
    ul.append(li);
  }
  result.append(h, meta, ul);
}

map.on('click', async (ev: L.LeafletMouseEvent) => {
  const { lat, lng } = ev.latlng;
  marker?.remove();
  marker = L.marker(ev.latlng).addTo(map);
  hint.hidden = true;
  if (!isInSwitzerland(lat, lng)) {
    result.textContent = 'This app only covers Switzerland.';
    return;
  }
  result.textContent = 'Checking…';
  const inJura = lat > 47.1 && lat < 47.55 && lng > 6.85 && lng < 7.6;
  const [elev, zones, canton, muni, jura] = await Promise.allSettled([
    fetchElevation(lat, lng),
    fetchZoneHits(lat, lng),
    fetchCanton(lat, lng),
    fetchMunicipality(lat, lng),
    inJura ? fetchJuraReserves(lat, lng) : Promise.resolve([]),
  ]);
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
    }),
    elevation,
  );
});
