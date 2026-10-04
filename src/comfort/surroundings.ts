import { wgs84ToLv95 } from '../coords';

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';

type Pos = number[];
interface Geometry {
  type: string;
  coordinates: unknown;
}
interface Feature {
  properties?: Record<string, unknown>;
  geometry?: Geometry;
}

function segDist(e: number, n: number, a: Pos, b: Pos): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((e - a[0]!) * dx + (n - a[1]!) * dy) / len2));
  return Math.hypot(e - (a[0]! + t * dx), n - (a[1]! + t * dy));
}

const lineDist = (e: number, n: number, line: Pos[]) => {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(e, n, line[i - 1]!, line[i]!));
  return line.length === 1 ? Math.hypot(e - line[0]![0]!, n - line[0]![1]!) : d;
};

function inRing(e: number, n: number, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > n !== yj! > n && e < ((xj! - xi!) * (n - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** Distance in metres from an LV95 point to a GeoJSON geometry in LV95 (0 inside a polygon). */
export function distanceTo(g: Geometry | undefined, e: number, n: number): number {
  if (!g) return Infinity;
  const c = g.coordinates as never;
  switch (g.type) {
    case 'Point':
      return Math.hypot(e - (c as Pos)[0]!, n - (c as Pos)[1]!);
    case 'MultiPoint':
    case 'LineString':
      return lineDist(e, n, c as Pos[]);
    case 'MultiLineString':
      return Math.min(...(c as Pos[][]).map((l) => lineDist(e, n, l)));
    case 'Polygon': {
      const rings = c as Pos[][];
      if (inRing(e, n, rings[0]!) && !rings.slice(1).some((r) => inRing(e, n, r))) return 0;
      return Math.min(...rings.map((r) => lineDist(e, n, r)));
    }
    case 'MultiPolygon':
      return Math.min(...(c as Pos[][][]).map((p) => distanceTo({ type: 'Polygon', coordinates: p }, e, n)));
    default:
      return Infinity;
  }
}

const HUT = /h[üu]tte|cabane|capanna|rifugio|refuge|chamanna|berghaus|berggasthaus|gasthaus|restaurant|hotel|biv/i;
const SETTLEMENT = new Set(['Ort', 'Quartierteil']);

export interface Named {
  name: string;
  meters: number;
}
export interface Stop extends Named {
  kind: string;
}

export interface Surroundings {
  /** Distance to the nearest marked hiking trail (Infinity if none within 300 m, undefined if the lookup failed). */
  trailM?: number;
  /** Mountain huts, inns and hotels nearby, nearest first. */
  huts: Named[];
  /** Bus, rail and cableway stops nearby, nearest first. */
  stops: Stop[];
  /** Distance to the nearest named settlement or neighbourhood. */
  settlementM?: number;
  /** Distance to the nearest public car park area. */
  parkingM?: number;
}

const nearest = <T extends { meters: number }>(items: T[]) => items.sort((a, b) => a.meters - b.meters);

/** Hiking trails or hydrography: minimum distance over the returned features. */
export function minDistance(body: { results?: Feature[] }, e: number, n: number): number | undefined {
  const ds = (body.results ?? []).map((f) => distanceTo(f.geometry, e, n)).filter((d) => Number.isFinite(d));
  return ds.length ? Math.min(...ds) : undefined;
}

export function parseNames(body: { results?: Feature[] }, e: number, n: number): Pick<Surroundings, 'huts' | 'settlementM' | 'parkingM'> {
  const huts: Named[] = [];
  let settlementM: number | undefined;
  let parkingM: number | undefined;
  for (const f of body.results ?? []) {
    const p = f.properties ?? {};
    const kind = String(p.objektart ?? '');
    const name = String(p.name ?? '');
    const m = distanceTo(f.geometry, e, n);
    if (!Number.isFinite(m)) continue;
    if ((kind === 'Gebaeude' || kind === 'Offenes Gebaeude' || kind === 'Gebaeude Einzelhaus') && HUT.test(name)) huts.push({ name, meters: m });
    else if (SETTLEMENT.has(kind)) settlementM = Math.min(settlementM ?? Infinity, m);
    else if (kind === 'Oeffentliches Parkareal') parkingM = Math.min(parkingM ?? Infinity, m);
  }
  return { huts: nearest(huts), settlementM, parkingM };
}

export function parseStops(body: { results?: Feature[] }, e: number, n: number): Stop[] {
  const out: Stop[] = [];
  for (const f of body.results ?? []) {
    const p = f.properties ?? {};
    const m = distanceTo(f.geometry, e, n);
    if (Number.isFinite(m)) out.push({ name: String(p.name ?? ''), kind: String(p.verkehrsmittel_de ?? p.betriebspunkttyp_de ?? 'Stop'), meters: m });
  }
  return nearest(out);
}

async function identify(layer: string, e: number, n: number, tolerance: number) {
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${layer}`,
    tolerance: String(tolerance),
    mapExtent: `${e - 500},${n - 500},${e + 500},${n + 500}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'true',
    geometryFormat: 'geojson',
    lang: 'en',
  });
  const res = await fetch(`${API}?${q}`);
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  return (await res.json()) as { results?: Feature[] };
}

/** Looks up trails, water, huts, stops and settlements around a spot. Each part fails on its own. */
export async function fetchSurroundings(lat: number, lon: number): Promise<Partial<Surroundings>> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const [trails, names, stops] = await Promise.allSettled([
    identify('ch.swisstopo.swisstlm3d-wanderwege', e, n, 300),
    identify('ch.swisstopo.swissnames3d', e, n, 400),
    identify('ch.bav.haltestellen-oev', e, n, 500),
  ]);
  const out: Partial<Surroundings> = {};
  // A successful lookup that finds nothing within the radius is Infinity; undefined means the lookup failed.
  if (trails.status === 'fulfilled') out.trailM = minDistance(trails.value, e, n) ?? Infinity;
  if (names.status === 'fulfilled') {
    const nm = parseNames(names.value, e, n);
    Object.assign(out, { huts: nm.huts, settlementM: nm.settlementM ?? Infinity, parkingM: nm.parkingM ?? Infinity });
  }
  if (stops.status === 'fulfilled') out.stops = parseStops(stops.value, e, n);
  return out;
}
