import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { isInSwitzerland } from './coords';
import { assess, type Assessment } from './assess';
import { fetchElevation, fetchTreeline, fetchZoneHits } from './geoadmin';
import { ZONE_LAYERS } from './zones';

const map = L.map('map').setView([46.8, 8.2], 8);

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
  meta.textContent = elevation === undefined ? '' : `Elevation ${Math.round(elevation)} m`;
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
  const [elev, zones] = await Promise.allSettled([fetchElevation(lat, lng), fetchZoneHits(lat, lng)]);
  const elevation = elev.status === 'fulfilled' ? elev.value : undefined;
  const treeline = await fetchTreeline(elevation);
  render(
    assess({
      zones: zones.status === 'fulfilled' ? zones.value : [],
      zoneLookupFailed: zones.status === 'rejected',
      treeline,
    }),
    elevation,
  );
});
