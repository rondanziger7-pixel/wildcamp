import { wgs84ToLv95 } from '../coords';

/**
 * Modelled night-time noise exposure (BAFU sonBASE, dB(A) Lr night) for roads and railways, read with a WMS GetFeatureInfo
 * request: the layers are rasters, so the identify service cannot be used. No value means no noise is modelled at the spot.
 */
const WMS = 'https://wms.geo.admin.ch/';
export const ROAD_LAYER = 'ch.bafu.laerm-strassenlaerm_nacht';
export const RAIL_LAYER = 'ch.bafu.laerm-bahnlaerm_nacht';

export interface NoiseInfo {
  /** Road traffic noise at night in dB(A), or undefined when none is modelled here. */
  roadDb?: number;
  railDb?: number;
  /** Which lookups failed, so a missing value is not read as "quiet". */
  failed: ('road' | 'rail')[];
}

/** The dB value of a GetFeatureInfo GeoJSON response: undefined when no feature is returned. */
export function parseNoise(body: { features?: { properties?: Record<string, unknown> }[] }): number | undefined {
  for (const f of body.features ?? []) {
    const v = Number(f.properties?.value_0);
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

async function value(layer: string, e: number, n: number, signal?: AbortSignal): Promise<number | undefined> {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: layer,
    QUERY_LAYERS: layer,
    CRS: 'EPSG:2056',
    BBOX: `${e - 50},${n - 50},${e + 50},${n + 50}`,
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: '1',
  });
  const res = await fetch(`${WMS}?${q}`, { signal });
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  return parseNoise((await res.json()) as never);
}

export async function fetchNoise(lat: number, lon: number, signal?: AbortSignal): Promise<NoiseInfo> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const [road, rail] = await Promise.allSettled([value(ROAD_LAYER, e, n, signal), value(RAIL_LAYER, e, n, signal)]);
  const out: NoiseInfo = { failed: [] };
  if (road.status === 'fulfilled') out.roadDb = road.value;
  else out.failed.push('road');
  if (rail.status === 'fulfilled') out.railDb = rail.value;
  else out.failed.push('rail');
  return out;
}
