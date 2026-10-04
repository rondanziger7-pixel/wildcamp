import { wgs84ToLv95 } from '../coords';
import { distanceTo } from './surroundings';

const API = 'https://api3.geo.admin.ch/rest/services';
const SEARCH_M = 800;
/** A glacier this close to the water counts as its likely source. */
export const GLACIER_CLOSE_M = 1000;
export const GLACIER_NEAR_M = 3000;
const ARA_SEARCH_M = 10000;

interface Feature {
  properties?: Record<string, unknown>;
  geometry?: { type: string; coordinates: unknown };
}
type Pos = number[];

export interface TreatmentPlant {
  name: string;
  /** Distance from the water in metres. */
  meters: number;
  /** Treated wastewater share of the river's low flow (Q347), percent, if given. */
  sharePct?: number;
  receiving?: string;
}

export interface WaterInfo {
  /** What the nearest water is; "none" when nothing was found within the search radius. */
  kind: 'stream' | 'lake' | 'none';
  name?: string;
  /** Distance from the spot to the water in metres (Infinity when none found). */
  meters: number;
  /** The point of the water closest to the spot (LV95). */
  at?: { e: number; n: number };
  /** Glacier ice near the water: its distance, or undefined when none within 3 km. */
  glacierM?: number;
  /** Treatment plants on the same watercourse that lie higher than the water, so their discharge flows past it. */
  upstreamPlants: TreatmentPlant[];
  /** Which lookups failed, so a missing flag is not read as an all-clear. */
  failed: ('water' | 'glacier' | 'plants')[];
}

/** Streams are swissTLM3D hydrography objects of type 4; lakes are its polygon objects (type 101). Other line types are not used. */
export function nearestWater(body: { results?: Feature[] }, e: number, n: number): { kind: 'stream' | 'lake'; name?: string; meters: number; gwl?: string; point: Pos } | undefined {
  let best: { kind: 'stream' | 'lake'; name?: string; meters: number; gwl?: string; point: Pos } | undefined;
  for (const f of body.results ?? []) {
    const p = f.properties ?? {};
    const code = Number(p.objektart);
    const kind = code === 4 ? 'stream' : code === 101 ? 'lake' : undefined;
    if (!kind || !f.geometry) continue;
    const meters = distanceTo(f.geometry, e, n);
    if (!Number.isFinite(meters)) continue;
    if (!best || meters < best.meters) {
      best = { kind, name: typeof p.name === 'string' && p.name ? p.name : undefined, meters, gwl: typeof p.gwl_nr === 'string' ? p.gwl_nr : undefined, point: closestPoint(f.geometry, e, n) };
    }
  }
  return best;
}

/** The point on a geometry (a point, its lines or ring edges) closest to (e, n). */
export function closestPoint(g: { type: string; coordinates: unknown }, e: number, n: number): Pos {
  if (g.type === 'Point') return g.coordinates as Pos;
  if (g.type === 'MultiPoint') {
    const pts = g.coordinates as Pos[];
    return pts.reduce((a, b) => (Math.hypot(e - b[0]!, n - b[1]!) < Math.hypot(e - a[0]!, n - a[1]!) ? b : a), pts[0] ?? [e, n]);
  }
  const lines: Pos[][] =
    g.type === 'LineString' ? [g.coordinates as Pos[]] : g.type === 'MultiLineString' ? (g.coordinates as Pos[][]) : g.type === 'Polygon' ? (g.coordinates as Pos[][]) : g.type === 'MultiPolygon' ? (g.coordinates as Pos[][][]).flat() : [];
  let best: Pos = [e, n];
  let bd = Infinity;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1]!;
      const [bx, by] = line[i]!;
      const dx = bx! - ax!;
      const dy = by! - ay!;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((e - ax!) * dx + (n - ay!) * dy) / len2));
      const px = ax! + t * dx;
      const py = ay! + t * dy;
      const d = Math.hypot(e - px, n - py);
      if (d < bd) {
        bd = d;
        best = [px, py];
      }
    }
  return best;
}

/** Treatment plants on watercourse `gwl` that sit at least `margin` metres higher than the water. */
export function upstreamPlants(body: { results?: { attributes?: Record<string, unknown> }[] }, gwl: string | undefined, waterElevation: number | undefined, e: number, n: number, margin = 5): TreatmentPlant[] {
  if (!gwl || waterElevation === undefined) return [];
  const out: TreatmentPlant[] = [];
  for (const r of body.results ?? []) {
    const a = r.attributes ?? {};
    if (a.gwlnr !== gwl) continue;
    const h = Number(a.hoehe);
    if (!Number.isFinite(h) || h < waterElevation + margin) continue;
    const x = Number(a.rechtswert) + 2000000;
    const y = Number(a.hochwert) + 1000000;
    out.push({
      name: String(a.name ?? a.label ?? 'Treatment plant'),
      meters: Number.isFinite(x) && Number.isFinite(y) ? Math.hypot(x - e, y - n) : Infinity,
      sharePct: typeof a.abwasseranteil_q347 === 'number' ? a.abwasseranteil_q347 : undefined,
      receiving: typeof a.name_vorfluter === 'string' ? a.name_vorfluter : undefined,
    });
  }
  return out.sort((p, q) => p.meters - q.meters);
}

async function identify(layer: string, e: number, n: number, toleranceM: number, geometry: boolean, signal?: AbortSignal) {
  // The service takes the tolerance in screen pixels, so a virtual 1000 px map is scaled to give `toleranceM` metres.
  const mPerPx = Math.max(1, toleranceM / 400);
  const half = 500 * mPerPx;
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${layer}`,
    tolerance: String(Math.round(toleranceM / mPerPx)),
    mapExtent: `${e - half},${n - half},${e + half},${n + half}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: String(geometry),
    lang: 'en',
  });
  if (geometry) q.set('geometryFormat', 'geojson');
  const res = await fetch(`${API}/api/MapServer/identify?${q}`, { signal });
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  return (await res.json()) as { results?: never[] };
}

async function heightLv95(e: number, n: number, signal?: AbortSignal): Promise<number> {
  const res = await fetch(`${API}/height?${new URLSearchParams({ easting: String(e), northing: String(n), sr: '2056' })}`, { signal });
  if (!res.ok) throw new Error(`height ${res.status}`);
  return Number(((await res.json()) as { height: string }).height);
}

/** Nearest water to a spot, whether glacier ice is near it, and whether a treatment plant discharges upstream of it. */
export async function fetchWater(lat: number, lon: number, signal?: AbortSignal): Promise<WaterInfo> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const info: WaterInfo = { kind: 'none', meters: Infinity, upstreamPlants: [], failed: [] };
  let found: ReturnType<typeof nearestWater>;
  try {
    found = nearestWater((await identify('ch.swisstopo.swisstlm3d-gewaessernetz', e, n, SEARCH_M, true, signal)) as never, e, n);
  } catch {
    info.failed.push('water');
    return info;
  }
  if (!found) return info;
  const [we, wn] = found.point as [number, number];
  Object.assign(info, { kind: found.kind, name: found.name, meters: found.meters, at: { e: we, n: wn } });
  const gl = 'ch.swisstopo.geologie-gletscherausdehnung';

  // glacier checks and the treatment-plant check do not depend on each other, so they run together
  const [close, near, plants] = await Promise.allSettled([
    identify(gl, we, wn, GLACIER_CLOSE_M, false, signal),
    identify(gl, we, wn, GLACIER_NEAR_M, false, signal),
    found.kind === 'stream' && found.gwl
      ? Promise.all([identify('ch.bafu.gewaesserschutz-klaeranlagen_reinigungstyp', we, wn, ARA_SEARCH_M, false, signal), heightLv95(we, wn, signal)])
      : Promise.resolve(undefined),
  ]);
  if (close.status === 'fulfilled' && near.status === 'fulfilled') {
    if ((close.value.results ?? []).length) info.glacierM = GLACIER_CLOSE_M;
    else if ((near.value.results ?? []).length) info.glacierM = GLACIER_NEAR_M;
  } else if (close.status === 'fulfilled' && (close.value.results ?? []).length) info.glacierM = GLACIER_CLOSE_M;
  else info.failed.push('glacier');
  if (plants.status === 'fulfilled') {
    if (plants.value) info.upstreamPlants = upstreamPlants(plants.value[0] as never, found.gwl, plants.value[1], we, wn);
  } else info.failed.push('plants');
  return info;
}
