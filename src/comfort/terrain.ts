import { wgs84ToLv95 } from '../coords';

/** Bearings of the 8 rays, degrees clockwise from north. */
export const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export const NEAR = { radius: 500, points: 101 } as const; // 10 m spacing
export const FAR = { radius: 5000, points: 201 } as const; // 50 m spacing

/** Elevations along four lines through the spot, from -radius to +radius. Direction of increasing index: ew west to east, ns south to north, nesw southwest to northeast, nwse northwest to southeast. */
export interface Profiles {
  step: number;
  ew: number[];
  ns: number[];
  nesw: number[];
  nwse: number[];
}

const S = Math.SQRT1_2;
const LINES = {
  ew: [1, 0],
  ns: [0, 1],
  nesw: [S, S],
  nwse: [S, -S],
} as const;

interface ProfilePoint {
  dist: number;
  alts?: Record<string, number | null>;
}

export function parseProfile(body: unknown): number[] {
  if (!Array.isArray(body)) throw new Error('bad profile');
  return (body as ProfilePoint[]).map((p) => p.alts?.COMB ?? p.alts?.DTM2 ?? p.alts?.DTM25 ?? Number.NaN);
}

async function fetchLine(e: number, n: number, dir: readonly [number, number], radius: number, points: number, signal?: AbortSignal): Promise<number[]> {
  const geom = { type: 'LineString', coordinates: [[e - radius * dir[0], n - radius * dir[1]], [e + radius * dir[0], n + radius * dir[1]]] };
  const q = new URLSearchParams({ geom: JSON.stringify(geom), sr: '2056', nbPoints: String(points) });
  const res = await fetch(`https://api3.geo.admin.ch/rest/services/profile.json?${q}`, { signal });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  const z = parseProfile(await res.json());
  if (z.length !== points) throw new Error('unexpected profile length');
  return z;
}

export async function fetchProfiles(lat: number, lon: number, set: { radius: number; points: number }, signal?: AbortSignal): Promise<Profiles> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const [ew, ns, nesw, nwse] = await Promise.all(
    (Object.values(LINES) as (readonly [number, number])[]).map((d) => fetchLine(e, n, d, set.radius, set.points, signal)),
  );
  return { step: (2 * set.radius) / (set.points - 1), ew: ew!, ns: ns!, nesw: nesw!, nwse: nwse! };
}

/** Elevations along the half line from the spot (index 0 = the spot) in a compass direction. */
export function ray(p: Profiles, bearing: number): number[] {
  const mid = (p.ew.length - 1) / 2;
  const pick = (line: number[], sign: 1 | -1) => Array.from({ length: mid + 1 }, (_, k) => line[mid + sign * k]!);
  switch (bearing) {
    case 0: return pick(p.ns, 1);
    case 45: return pick(p.nesw, 1);
    case 90: return pick(p.ew, 1);
    case 135: return pick(p.nwse, 1);
    case 180: return pick(p.ns, -1);
    case 225: return pick(p.nesw, -1);
    case 270: return pick(p.ew, -1);
    case 315: return pick(p.nwse, -1);
    default: throw new Error(`bearing ${bearing}`);
  }
}

const deg = (rad: number) => (rad * 180) / Math.PI;

export interface TerrainMetrics {
  elevation: number;
  /** Ground slope over 20 m around the spot, degrees. */
  slopeDeg: number;
  /** Highest horizon angle per bearing within the profile, degrees (negative = the ground falls away). */
  horizon: number[];
  meanHorizon: number;
  /** Elevation minus the mean of the ground 100 to 300 m away, metres. Positive on ridges, negative in hollows. */
  tpi: number;
  /** Distance in metres to the nearest slope of 30 degrees or more that rises above the spot, if within 150 m. */
  steepAboveM?: number;
  /** Distance in metres to a drop steeper than 40 degrees, if within 40 m. */
  dropNearM?: number;
  /** Highest horizon angle beyond the near profile, if a far profile was given. */
  farHorizon?: number[];
}

/** Horizon angles from a profile set; skips the first 20 m so noise at the spot does not count. */
export function horizonAngles(p: Profiles): number[] {
  return BEARINGS.map((b) => {
    const r = ray(p, b);
    let h = -90;
    for (let k = 2; k < r.length; k++) {
      const a = deg(Math.atan2(r[k]! - r[0]!, k * p.step));
      if (!Number.isNaN(a)) h = Math.max(h, a);
    }
    return h;
  });
}

export function analyseTerrain(near: Profiles, far?: Profiles): TerrainMetrics {
  const mid = (near.ew.length - 1) / 2;
  const z0 = near.ew[mid]!;
  const gx = (near.ew[mid + 1]! - near.ew[mid - 1]!) / (2 * near.step);
  const gy = (near.ns[mid + 1]! - near.ns[mid - 1]!) / (2 * near.step);
  const slopeDeg = deg(Math.atan(Math.hypot(gx, gy)));
  const horizon = horizonAngles(near);
  const farHorizon = far ? horizonAngles(far) : undefined;
  const meanHorizon = horizon.reduce((a, b) => a + b, 0) / horizon.length;

  const ring: number[] = [];
  let steepAboveM: number | undefined;
  let dropNearM: number | undefined;
  for (const b of BEARINGS) {
    const r = ray(near, b);
    for (let k = Math.ceil(100 / near.step); k <= Math.floor(300 / near.step); k++) ring.push(r[k]!);
    const win = Math.round(20 / near.step); // slope over 20 m windows
    for (let k = 0; k + win < r.length; k++) {
      const dz = r[k + win]! - r[k]!;
      const s = deg(Math.atan(Math.abs(dz) / (win * near.step)));
      const d = k * near.step;
      if (dz > 0 && s >= 30 && r[k + win]! > z0 && d <= 150 && (steepAboveM === undefined || d < steepAboveM)) steepAboveM = d;
      if (dz < 0 && s >= 40 && d <= 40 && (dropNearM === undefined || d < dropNearM)) dropNearM = d;
    }
  }
  const tpi = z0 - ring.reduce((a, b) => a + b, 0) / ring.length;
  return { elevation: z0, slopeDeg, horizon, meanHorizon, tpi, steepAboveM, dropNearM, farHorizon };
}

/** Horizon angle toward an azimuth (degrees clockwise from north), interpolating between the 8 bearings. */
export function horizonToward(horizon: number[], azimuth: number): number {
  const a = ((azimuth % 360) + 360) % 360;
  const i = Math.floor(a / 45);
  const f = (a - i * 45) / 45;
  return horizon[i % 8]! * (1 - f) + horizon[(i + 1) % 8]! * f;
}
