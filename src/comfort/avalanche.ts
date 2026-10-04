import { zurichNow } from './weather';

/**
 * The SLF avalanche bulletin (https://www.slf.ch, CAAML as GeoJSON: one feature per bulletin, its polygon the union of the
 * warning regions it covers). It is only published in the winter season; outside it the service returns no features.
 */
const URL_BULLETIN = 'https://aws.slf.ch/api/bulletin/caaml/en/geojson';
const CACHE_MS = 30 * 60 * 1000;

type Pos = number[];
interface Geometry {
  type: string;
  coordinates: unknown;
}
interface DangerRating {
  mainValue?: string;
  validTimePeriod?: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  customData?: { CH?: { subdivision?: string } };
}
interface Problem {
  problemType?: string;
  aspects?: string[];
  elevation?: { lowerBound?: string; upperBound?: string };
}
export interface BulletinFeature {
  geometry?: Geometry;
  properties?: {
    validTime?: { startTime?: string; endTime?: string };
    dangerRatings?: DangerRating[];
    avalancheProblems?: Problem[];
    regions?: { name?: string }[];
  };
}
export interface BulletinCollection {
  features?: BulletinFeature[];
}

export const LEVELS = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 } as const;
export const LEVEL_NAME = ['', 'low', 'moderate', 'considerable', 'high', 'very high'] as const;
const PROBLEM_NAME: Record<string, string> = {
  new_snow: 'new snow',
  wind_slab: 'wind slabs',
  persistent_weak_layers: 'persistent weak layers',
  wet_snow: 'wet snow',
  gliding_snow: 'gliding snow',
  cornices: 'cornices',
  no_distinct_avalanche_problem: 'no distinct problem',
  favourable_situation: 'favourable situation',
};

export interface AvalancheInfo {
  /** ok: a bulletin covers the spot; none: no bulletin is published (summer) or it has expired; outside: it does not cover the spot. */
  status: 'ok' | 'none' | 'outside';
  /** Danger level 1 to 5 (highest rating of the day). */
  level?: number;
  /** "plus", "minus" or "neutral" within the level, as the SLF gives it. */
  subdivision?: string;
  /** The problems, with where they apply. */
  problems?: { type: string; aspects: string[]; above?: number; below?: number }[];
  region?: string;
  /** End of the bulletin's validity as local Zurich "YYYY-MM-DDTHH:MM" and as an ISO time. */
  validUntilLocal?: string;
  validUntil?: string;
}

function inRing(x: number, y: number, ring: Pos[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** Point in a GeoJSON polygon or multipolygon (lon/lat), holes respected. */
export function inGeometry(g: Geometry | undefined, lon: number, lat: number): boolean {
  if (!g) return false;
  const poly = (rings: Pos[][]) => inRing(lon, lat, rings[0]!) && !rings.slice(1).some((r) => inRing(lon, lat, r));
  if (g.type === 'Polygon') return poly(g.coordinates as Pos[][]);
  if (g.type === 'MultiPolygon') return (g.coordinates as Pos[][][]).some(poly);
  return false;
}

const bound = (v: string | undefined) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

/** The bulletin's reading for a spot at a moment: the bulletin covering it, its highest rating and its problems. */
export function bulletinAt(fc: BulletinCollection | undefined, lat: number, lon: number, now: Date): AvalancheInfo {
  const live = (fc?.features ?? []).filter((f) => {
    const v = f.properties?.validTime;
    return v?.endTime && v.startTime && new Date(v.startTime) <= now && now < new Date(v.endTime);
  });
  if (!live.length) return { status: 'none' };
  const hit = live.find((f) => inGeometry(f.geometry, lon, lat));
  if (!hit) return { status: 'outside' };
  const p = hit.properties!;
  const ratings = (p.dangerRatings ?? []).filter((r) => r.mainValue && r.mainValue in LEVELS);
  if (!ratings.length) return { status: 'outside' };
  // the highest rating of the day counts: a "later" rating is the afternoon rise in wet-snow danger
  const top = ratings.reduce((a, b) => (LEVELS[b.mainValue as keyof typeof LEVELS] > LEVELS[a.mainValue as keyof typeof LEVELS] ? b : a));
  const end = new Date(p.validTime!.endTime!);
  return {
    status: 'ok',
    level: LEVELS[top.mainValue as keyof typeof LEVELS],
    subdivision: top.customData?.CH?.subdivision,
    problems: (p.avalancheProblems ?? [])
      .filter((x) => x.problemType && x.problemType !== 'favourable_situation')
      .map((x) => ({ type: PROBLEM_NAME[x.problemType!] ?? x.problemType!.replace(/_/g, ' '), aspects: x.aspects ?? [], above: bound(x.elevation?.lowerBound), below: bound(x.elevation?.upperBound) })),
    region: p.regions?.[0]?.name,
    validUntil: end.toISOString(),
    validUntilLocal: zurichNow(end),
  };
}

let cached: { at: number; fc: BulletinCollection } | undefined;

export async function fetchBulletin(signal?: AbortSignal, now = Date.now()): Promise<BulletinCollection> {
  if (cached && now - cached.at < CACHE_MS) return cached.fc;
  const res = await fetch(URL_BULLETIN, { signal });
  if (!res.ok) throw new Error(`bulletin ${res.status}`);
  const fc = (await res.json()) as BulletinCollection;
  if (!Array.isArray(fc.features)) throw new Error('bad bulletin');
  cached = { at: now, fc };
  return fc;
}

/** "above 2400 m", "below 2000 m", "2000 to 2600 m" */
export function bandText(above?: number, below?: number): string {
  if (above !== undefined && below !== undefined) return `${above} to ${below} m`;
  if (above !== undefined) return `above ${above} m`;
  if (below !== undefined) return `below ${below} m`;
  return 'at all elevations';
}
