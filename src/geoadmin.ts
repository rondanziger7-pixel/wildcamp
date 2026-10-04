import { wgs84ToLv95 } from './coords';
import { ZONE_LAYERS } from './zones';
import type { ZoneHit } from './assess';

const API = 'https://api3.geo.admin.ch/rest/services';

export async function fetchElevation(lat: number, lon: number): Promise<number | undefined> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const res = await fetch(`${API}/height?easting=${e}&northing=${n}&sr=2056`);
  if (!res.ok) throw new Error(`height ${res.status}`);
  const body = (await res.json()) as { height?: string };
  const h = Number(body.height);
  return Number.isFinite(h) ? h : undefined;
}

/** Identify all protected-zone layers at a point. Throws if the request fails. */
export async function fetchZoneHits(lat: number, lon: number): Promise<ZoneHit[]> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const params = new URLSearchParams({
    geometry: `${e},${n}`,
    geometryType: 'esriGeometryPoint',
    sr: '2056',
    layers: 'all:' + ZONE_LAYERS.map((l) => l.id).join(','),
    tolerance: '0',
    mapExtent: `${e - 100},${n - 100},${e + 100},${n + 100}`,
    imageDisplay: '200,200,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/api/MapServer/identify?${params}`);
  if (!res.ok) throw new Error(`identify ${res.status}`);
  return parseZoneHits(await res.json());
}

interface IdentifyResult {
  layerBodId: string;
  attributes?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

/** Turn an identify response into zone hits, dropping features a layer's filter rejects. */
export function parseZoneHits(body: { results?: IdentifyResult[] }): ZoneHit[] {
  const hits: ZoneHit[] = [];
  for (const r of body.results ?? []) {
    const a = r.attributes ?? {};
    const layer = ZONE_LAYERS.find((l) => l.id === r.layerBodId && (l.accept?.(a) ?? true));
    if (!layer) continue;
    let detail: string | undefined;
    if (r.layerBodId === 'ch.bafu.wrz-wildruhezonen_portal') {
      detail = [str(a.best_de), str(a.schutzzeit) && `(${str(a.schutzzeit)})`, str(a.kanton) && `[${str(a.kanton)}]`]
        .filter(Boolean)
        .join(' ');
    }
    hits.push({ layer, name: str(a.label), detail });
  }
  return hits;
}
