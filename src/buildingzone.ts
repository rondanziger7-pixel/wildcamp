import { wgs84ToLv95 } from './coords';

/**
 * National harmonised building zones (Bauzonen, ARE: `ch.are.bauzonen`). Inside one the land is private or municipal and
 * outside the public access right of Art. 699 ZGB (forest and pasture only); see docs/sources/CH/README_settlements.md.
 */
const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
const LAYER = 'ch.are.bauzonen';
/** A building zone this close counts as "near a settlement". */
export const NEAR_M = 150;

export interface BuildingZoneInfo {
  /** The zone the spot lies in (harmonised category code and name), if any. */
  inside?: { code: string; name: string };
  /** A building zone lies within NEAR_M but not at the spot. */
  near: boolean;
  /** The lookup failed, so its absence is not read as "outside every building zone". */
  failed?: boolean;
}

type Body = { results?: { attributes?: Record<string, unknown> }[] };

export function parseBuildingZone(at: Body | undefined, near: Body | undefined): BuildingZoneInfo {
  const a = at?.results?.[0]?.attributes;
  if (a) {
    const code = String(a.ch_code_hn ?? '');
    return { inside: { code, name: typeof a.ch_bez_d === 'string' && a.ch_bez_d ? a.ch_bez_d : 'Bauzone' }, near: true };
  }
  return { near: (near?.results?.length ?? 0) > 0 };
}

async function identify(e: number, n: number, toleranceM: number, signal?: AbortSignal): Promise<Body> {
  // the service takes the tolerance in screen pixels, so a virtual 1000 px map is scaled to give `toleranceM` metres
  const mPerPx = Math.max(1, toleranceM / 400);
  const half = 500 * mPerPx;
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${LAYER}`,
    tolerance: String(toleranceM === 0 ? 0 : Math.round(toleranceM / mPerPx)),
    mapExtent: `${e - half},${n - half},${e + half},${n + half}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}?${q}`, { signal });
  if (!res.ok) throw new Error(`building zones ${res.status}`);
  return (await res.json()) as Body;
}

export async function fetchBuildingZone(lat: number, lon: number, signal?: AbortSignal): Promise<BuildingZoneInfo> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const at = await identify(e, n, 0, signal);
  if (at.results?.length) return parseBuildingZone(at, undefined);
  return parseBuildingZone(at, await identify(e, n, NEAR_M, signal));
}
