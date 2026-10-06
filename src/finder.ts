import { classifyCover, type Cover, type GroundInfo } from './comfort/ground';
import { comfortFor, type Comfort } from './comfort/comfort';
import { analyseTerrain, parseProfile, type Profiles, type TerrainMetrics } from './comfort/terrain';
import type { WaterInfo } from './comfort/water';
import { lv95ToWgs84 } from './coords';
import { tr } from './i18n';

/**
 * "Best spots nearby": a coarse scan of the ground around a point, before any per-spot lookups.
 * Elevation (one profile request over a 100 m grid) and ground cover (the statistics' sample points sit on the
 * same grid) rank the cells; the best few are then checked for legality and water one by one by the caller.
 */
export const STEP = 100;
/** Candidates are taken within this distance of the centre. */
export const CANDIDATE_RADIUS_M = 700;
/** Elevations are read this far out, so horizon and ridge tests have terrain around the outermost candidates. */
export const ELEVATION_RADIUS_M = 1100;
/** Candidates closer than this to a better one are dropped, so the list offers distinct places. */
export const MIN_SEPARATION_M = 250;
/** Survey year requested from the land-cover statistics (one record per point instead of one per year). */
export const COVER_YEAR = 2023;
/** Cover classes a tent cannot go on, or that make no sense as a recommendation. */
const EXCLUDED: Cover[] = ['glacier', 'water', 'built', 'wet'];
/** Slopes at or above this (degrees, over 200 m) are not offered. */
export const MAX_SLOPE_DEG = 18;

export interface Grid {
  /** LV95 of the south-west node. */
  e0: number;
  n0: number;
  /** Nodes per side. */
  size: number;
  /** Row-major (north rows), index j * size + i; NaN where unknown. */
  z: number[];
}

/** Nodes snap to multiples of 100 m, which are the land-cover sample points. */
export function makeGrid(e: number, n: number, radius = ELEVATION_RADIUS_M): { e0: number; n0: number; size: number } {
  const ce = Math.round(e / STEP) * STEP;
  const cn = Math.round(n / STEP) * STEP;
  return { e0: ce - radius, n0: cn - radius, size: (2 * radius) / STEP + 1 };
}

/** The serpentine path over all nodes (row by row, odd rows reversed), as the profile service takes it. */
export function serpentine(g: { e0: number; n0: number; size: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < g.size; j++) {
    for (let k = 0; k < g.size; k++) {
      const i = j % 2 ? g.size - 1 - k : k;
      out.push([g.e0 + i * STEP, g.n0 + j * STEP]);
    }
  }
  return out;
}

/** Put the profile's values (serpentine order) back into row-major order. */
export function gridFromProfile(g: { e0: number; n0: number; size: number }, values: number[]): Grid {
  if (values.length !== g.size * g.size) throw new Error('unexpected profile length');
  const z = new Array<number>(values.length);
  for (let j = 0; j < g.size; j++)
    for (let k = 0; k < g.size; k++) z[j * g.size + (j % 2 ? g.size - 1 - k : k)] = values[j * g.size + k]!;
  return { ...g, z };
}

export async function fetchElevationGrid(e: number, n: number, signal?: AbortSignal): Promise<Grid> {
  const base = makeGrid(e, n);
  const body = new URLSearchParams({
    geom: JSON.stringify({ type: 'LineString', coordinates: serpentine(base) }),
    sr: '2056',
    nbPoints: String(base.size * base.size),
    distinct_points: 'true',
  });
  // POST: the path is far too long for a query string. The body is sent as a string with this exact content type:
  // a URLSearchParams body makes browsers add ";charset=UTF-8", which the service rejects with 415.
  const res = await fetch('https://api3.geo.admin.ch/rest/services/profile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal,
  });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return gridFromProfile(base, parseProfile(await res.json()));
}

/** Elevation at an LV95 position by bilinear interpolation; NaN outside the grid or next to a gap. */
export function zAt(g: Grid, e: number, n: number): number {
  const fi = (e - g.e0) / STEP;
  const fj = (n - g.n0) / STEP;
  if (fi < 0 || fj < 0 || fi > g.size - 1 || fj > g.size - 1) return Number.NaN;
  const i = Math.min(Math.floor(fi), g.size - 2);
  const j = Math.min(Math.floor(fj), g.size - 2);
  const u = fi - i;
  const v = fj - j;
  const at = (a: number, b: number) => g.z[b * g.size + a]!;
  return at(i, j) * (1 - u) * (1 - v) + at(i + 1, j) * u * (1 - v) + at(i, j + 1) * (1 - u) * v + at(i + 1, j + 1) * u * v;
}

/** Four lines through a node at 100 m spacing out to 1 km, in the layout `analyseTerrain` takes. */
export function profilesAt(g: Grid, e: number, n: number): Profiles {
  const S = Math.SQRT1_2;
  const line = (dx: number, dy: number) => Array.from({ length: 21 }, (_, k) => zAt(g, e + (k - 10) * STEP * dx, n + (k - 10) * STEP * dy));
  return { step: STEP, ew: line(1, 0), ns: line(0, 1), nesw: line(S, S), nwse: line(S, -S) };
}

export interface Candidate {
  e: number;
  n: number;
  lat: number;
  lon: number;
  elevation: number;
  cover?: Cover;
  coverLabel?: string;
  terrain: TerrainMetrics;
  /** Comfort of the spot alone from terrain and ground (and water once known); the weather is not in it. */
  comfort: Comfort;
  /** Straight-line distance from the centre in metres. */
  meters: number;
  /** Bearing from the centre, degrees clockwise from north. */
  bearing: number;
}

const groundInfo = (cover: Cover | undefined, label: string | undefined): GroundInfo | undefined =>
  cover && label ? { cover, label, meters: 0, year: COVER_YEAR } : undefined;

export function bearingTo(de: number, dn: number): number {
  return ((Math.atan2(de, dn) * 180) / Math.PI + 360) % 360;
}

/** Score every node within the candidate radius and keep the best ones that are far enough apart. */
export function rankCells(
  g: Grid,
  centre: { e: number; n: number },
  covers: Map<string, { cover: Cover; label: string }>,
  limit: number,
): Candidate[] {
  const all: Candidate[] = [];
  for (let j = 0; j < g.size; j++) {
    for (let i = 0; i < g.size; i++) {
      const e = g.e0 + i * STEP;
      const n = g.n0 + j * STEP;
      const d = Math.hypot(e - centre.e, n - centre.n);
      if (d > CANDIDATE_RADIUS_M) continue;
      const z = g.z[j * g.size + i]!;
      if (!Number.isFinite(z)) continue;
      const c = covers.get(`${e},${n}`);
      if (c && EXCLUDED.includes(c.cover)) continue;
      const terrain = analyseTerrain(profilesAt(g, e, n));
      if (!Number.isFinite(terrain.slopeDeg) || terrain.slopeDeg >= MAX_SLOPE_DEG || !Number.isFinite(terrain.meanHorizon) || !Number.isFinite(terrain.tpi)) continue;
      const comfort = comfortFor({ terrain, ground: groundInfo(c?.cover, c?.label) });
      const { lat, lon } = lv95ToWgs84(e, n);
      all.push({ e, n, lat, lon, elevation: z, cover: c?.cover, coverLabel: c?.label, terrain, comfort, meters: d, bearing: bearingTo(e - centre.e, n - centre.n) });
    }
  }
  all.sort((a, b) => b.comfort.score - a.comfort.score || a.meters - b.meters);
  const kept: Candidate[] = [];
  for (const c of all) {
    if (kept.length >= limit) break;
    if (kept.every((k) => Math.hypot(k.e - c.e, k.n - c.n) >= MIN_SEPARATION_M)) kept.push(c);
  }
  return kept;
}

/** Rescore a candidate once its water is known. */
export function withWater(c: Candidate, water: WaterInfo | undefined): Comfort {
  return comfortFor({ terrain: c.terrain, ground: groundInfo(c.cover, c.coverLabel), water });
}

type PointFeature = { geometry?: { type?: string; coordinates?: number[] }; properties?: Record<string, unknown> };

/** Ground cover of the sample points in an identify response (geojson), latest survey year per point. */
export function parseCoverTile(body: { results?: PointFeature[] }): Map<string, { cover: Cover; label: string }> {
  const best = new Map<string, { year: number; label: string }>();
  for (const f of body.results ?? []) {
    const c = f.geometry?.coordinates;
    const p = f.properties ?? {};
    const label = p.desc_lc09r_27_en;
    const year = Number(p.year);
    if (f.geometry?.type !== 'Point' || !c || c.length < 2 || typeof label !== 'string' || !Number.isFinite(year)) continue;
    const key = `${Math.round(c[0]!)},${Math.round(c[1]!)}`;
    if (!best.has(key) || best.get(key)!.year < year) best.set(key, { year, label });
  }
  return new Map([...best].map(([k, v]) => [k, { cover: classifyCover(v.label), label: v.label }]));
}

/** Ground cover for every node within the candidate radius: a few identify requests over envelopes of up to 1 km. */
export async function fetchCoverGrid(centre: { e: number; n: number }, signal?: AbortSignal): Promise<Map<string, { cover: Cover; label: string }>> {
  const lo = (v: number) => Math.floor((v - CANDIDATE_RADIUS_M) / STEP) * STEP;
  const hi = (v: number) => Math.ceil((v + CANDIDATE_RADIUS_M) / STEP) * STEP;
  const e0 = lo(centre.e);
  const n0 = lo(centre.n);
  const e1 = hi(centre.e);
  const n1 = hi(centre.n);
  const tile = 1000; // up to 11 x 11 = 121 points, under the service's 200 results
  const jobs: Promise<Map<string, { cover: Cover; label: string }>>[] = [];
  for (let a = e0; a < e1; a += tile + STEP)
    for (let b = n0; b < n1; b += tile + STEP) {
      const ea = Math.min(a + tile, e1);
      const nb = Math.min(b + tile, n1);
      const q = new URLSearchParams({
        geometryType: 'esriGeometryEnvelope',
        geometry: `${a},${b},${ea},${nb}`,
        sr: '2056',
        layers: 'all:ch.bfs.arealstatistik-bodenbedeckung',
        tolerance: '0',
        mapExtent: `${a},${b},${ea},${nb}`,
        imageDisplay: '1000,1000,96',
        returnGeometry: 'true',
        geometryFormat: 'geojson',
        timeInstant: String(COVER_YEAR),
        lang: 'en',
      });
      jobs.push(
        fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${q}`, { signal }).then(async (res) => {
          if (!res.ok) throw new Error(`cover ${res.status}`);
          return parseCoverTile((await res.json()) as never);
        }),
      );
    }
  // a failed tile only leaves its cells without ground cover; they are still ranked, on terrain alone
  const tiles = await Promise.allSettled(jobs);
  const out = new Map<string, { cover: Cover; label: string }>();
  for (const t of tiles) if (t.status === 'fulfilled') for (const [k, v] of t.value) out.set(k, v);
  return out;
}

/** Cell of the compass: "NE", "S" … */
export function compass8(bearing: number): string {
  return tr(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!);
}
