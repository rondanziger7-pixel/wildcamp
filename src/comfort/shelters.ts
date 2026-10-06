import { wgs84ToLv95 } from '../coords';
import { distanceTo } from './surroundings';
import { closestPoint } from './water';

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer';
const LAYER = 'ch.swisstopo.swissnames3d';
export const SHELTER_RADIUS_M = 5000;
/** The small search that cannot miss anything close (see fetchNearShelters). */
export const NEAR_LOOKUP_M = 350;
const MAX_LOOKUPS = 14;

export type ShelterKind = 'hut' | 'biwak' | 'inn' | 'alp';

export interface Shelter {
  name: string;
  kind: ShelterKind;
  /** Straight-line distance in metres, not a walking distance. */
  meters: number;
  /** A club hut (SAC, CAS, CAI, CAF) by its name. */
  club?: boolean;
  /** Its position (LV95), the point of its outline closest to the spot. */
  at: { e: number; n: number };
}

/** A club hut (SAC, CAS, CAI, CAF) by its name. */
export const isClubHut = (name: string) => /\b(SAC|CAS|CAI|CAF)\b/.test(name);

const BUILDING = new Set(['Gebaeude', 'Offenes Gebaeude', 'Gebaeude Einzelhaus']);
const ALP_AREA = new Set(['Gebiet', 'Lokalname swisstopo', 'Flurname swisstopo', ...BUILDING]);

/** What a swissNAMES3D feature is, judged from its name and object type; undefined if it is not a place to shelter. */
export function classifyShelter(name: string | undefined | null, objektart: string | undefined | null): ShelterKind | undefined {
  if (!name || !objektart) return undefined;
  if (BUILDING.has(objektart)) {
    if (/biwak|bivac|bivouac|notunterkunft|refuge d.urgence|ricovero/i.test(name)) return 'biwak';
    if (/berghaus|berggasthaus|gasthaus|restaurant|hotel|auberge|ristorante|albergo|buvette/i.test(name)) return 'inn';
    if (isClubHut(name) && /h[üu]tte|cabane|cabanne|capanna|rifugio|refuge|chamanna|bivacco/i.test(name)) return 'hut';
    if (/senn?h[üu]tte|alph[üu]tte|alpk[äa]serei|ch[äa]sih[üu]tte|maisonnette|stafel/i.test(name)) return 'alp';
    if (/h[üu]tte|cabane|cabanne|capanna|rifugio|refuge|chamanna|hospiz|hospice/i.test(name)) return 'hut';
  }
  if (ALP_AREA.has(objektart) && /(^|\s)(alp|alpe|alpage|alpe di|alp da)(\s|$)/i.test(name)) return 'alp';
  return undefined;
}

interface Hit {
  featureId: number;
  attributes?: Record<string, unknown>;
}

/** Candidate shelters from an identify response (no geometry yet), huts and inns before alps. */
export function shelterCandidates(body: { results?: Hit[] }): { id: number; name: string; kind: ShelterKind }[] {
  const out: { id: number; name: string; kind: ShelterKind }[] = [];
  const seen = new Set<string>();
  for (const r of body.results ?? []) {
    const name = typeof r.attributes?.name === 'string' ? r.attributes.name : undefined;
    const kind = classifyShelter(name, r.attributes?.objektart as string | undefined);
    if (!kind || !name) continue;
    const key = `${kind}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.featureId, name, kind });
  }
  const rank: Record<ShelterKind, number> = { hut: 0, biwak: 0, inn: 1, alp: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, MAX_LOOKUPS);
}

/** Shelters within the radius, nearest first, from candidates and their geometries. */
export function placeShelters(candidates: { name: string; kind: ShelterKind }[], geometries: ({ type: string; coordinates: unknown } | undefined)[], e: number, n: number): Shelter[] {
  const out: Shelter[] = [];
  candidates.forEach((c, i) => {
    const meters = distanceTo(geometries[i], e, n);
    if (Number.isFinite(meters) && meters <= SHELTER_RADIUS_M) {
      const [x, y] = closestPoint(geometries[i]!, e, n) as [number, number];
      out.push({ name: c.name, kind: c.kind, meters, club: c.kind === 'hut' && isClubHut(c.name) ? true : undefined, at: { e: x, n: y } });
    }
  });
  return out.sort((a, b) => a.meters - b.meters);
}

/** Huts, bivouac boxes, inns and alps within 5 km of a spot. */
export interface ShelterResult {
  shelters: Shelter[];
  /** True when some candidate's position could not be fetched, so the list may be missing a hut. */
  incomplete: boolean;
}

/** Candidates within `radiusM` of the spot (identify), with their geometries, placed and measured. */
async function lookup(e: number, n: number, radiusM: number, signal?: AbortSignal): Promise<ShelterResult & { candidates: number }> {
  const mPerPx = radiusM / 400;
  const half = 500 * mPerPx;
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${LAYER}`,
    tolerance: '400',
    mapExtent: `${e - half},${n - half},${e + half},${n + half}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/identify?${q}`, { signal });
  if (!res.ok) throw new Error(`shelters ${res.status}`);
  const candidates = shelterCandidates((await res.json()) as { results?: Hit[] });
  const geoms = await Promise.all(
    candidates.map(async (c) => {
      try {
        const r = await fetch(`${API}/${LAYER}/${c.id}?sr=2056&geometryFormat=geojson`, { signal });
        if (!r.ok) return undefined;
        return ((await r.json()) as { feature?: { geometry?: { type: string; coordinates: unknown } } }).feature?.geometry;
      } catch {
        return undefined;
      }
    }),
  );
  return { shelters: placeShelters(candidates, geoms, e, n), incomplete: geoms.some((g) => g === undefined), candidates: candidates.length };
}

/**
 * Huts, inns and alps within `NEAR_LOOKUP_M` only: a small search, so nothing close can be crowded out by the many huts
 * within 5 km (the wide search keeps only the first `MAX_LOOKUPS` by kind, not by distance). Used for the "close to a hut"
 * note and for the finder's candidates.
 */
export async function fetchNearShelters(lat: number, lon: number, signal?: AbortSignal): Promise<ShelterResult> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const r = await lookup(e, n, NEAR_LOOKUP_M, signal);
  return { shelters: r.shelters, incomplete: r.incomplete };
}

export async function fetchShelters(lat: number, lon: number, signal?: AbortSignal): Promise<ShelterResult> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const [wide, near] = await Promise.allSettled([lookup(e, n, SHELTER_RADIUS_M, signal), lookup(e, n, NEAR_LOOKUP_M, signal)]);
  if (wide.status === 'rejected') throw wide.reason;
  // the near search is complete within its radius, so its entries replace the wide search's: both name the same objects
  const nearList = near.status === 'fulfilled' ? near.value.shelters : [];
  const key = (s: Shelter) => `${s.kind}:${s.name}`;
  const seen = new Set(nearList.map(key));
  const shelters = [...nearList, ...wide.value.shelters.filter((s) => !seen.has(key(s)))].sort((a, b) => a.meters - b.meters);
  return { shelters, incomplete: wide.value.incomplete || near.status === 'rejected' || (near.status === 'fulfilled' && near.value.incomplete) };
}
