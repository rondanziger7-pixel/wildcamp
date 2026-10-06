import { assess, type Assessment, type ZoneHit } from './assess';
import { findCanton, localCantonName, type Canton } from './cantons';
import { lv95ToWgs84, wgs84ToLv95 } from './coords';
import { fetchCanton, parseZoneHits } from './geoadmin';
import { tr } from './i18n';
import type { LocalData } from './localstore';
import { findMunicipalRule, findUnverifiedNote } from './municipalities';
import { reserveZoneHits } from './reserves';
import { cumulativeM, haversineM, sampleEvery, simplify, type RoutePoint } from './route';
import { legalWhy } from './scores';
import { classifyTreeline } from './treeline';
import { ZONE_LAYERS } from './zones';

/**
 * The legality of a whole route in one pass: the federal protection zones the line crosses (asked for per piece of the route, with
 * their outlines, so the stretches inside them can be placed to a few metres), the municipalities that have a recorded rule, the cantons,
 * the bundled reserves and the forest map. The same `assess` as for a single spot judges each point, so the route and a tapped spot
 * never disagree. What is not checked along a route (settlements, huts and inns, hunting, Jura reserves) is said on the page.
 */

const API = 'https://api3.geo.admin.ch/rest/services';

// ---------------------------------------------------------------------------------------------------------------------
// Geometry

export type Ring = number[][];
export type RouteGeometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

function inRing(ring: Ring, e: number, n: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > n !== yj! > n && e < ((xj! - xi!) * (n - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: Ring[], e: number, n: number): boolean {
  if (!rings.length || !inRing(rings[0]!, e, n)) return false;
  for (let h = 1; h < rings.length; h++) if (inRing(rings[h]!, e, n)) return false; // a hole
  return true;
}

/** Whether an LV95 point lies in a GeoJSON polygon or multipolygon (holes respected). `bbox` [minE, minN, maxE, maxN] rejects far points quickly. */
export function inGeometry(g: RouteGeometry | undefined, e: number, n: number, bbox?: number[]): boolean {
  if (!g) return false;
  if (bbox && bbox.length >= 4 && (e < bbox[0]! || e > bbox[2]! || n < bbox[1]! || n > bbox[3]!)) return false;
  if (g.type === 'Polygon') return inPolygon(g.coordinates, e, n);
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => inPolygon(p, e, n));
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pieces of the route for the requests

export interface QueryChunk {
  /** Distance along the route at the start and end of the piece, metres. */
  fromM: number;
  toM: number;
  /** The piece as LV95 [E, N], simplified so that a request stays short. */
  path: [number, number][];
}

export const CHUNK_M = 30_000;
export const MAX_QUERY_VERTICES = 120;

/**
 * The route cut into pieces of at most `chunkM` (sharing their end points), each simplified to at most `maxVertices` points (the tolerance
 * grows from 8 m until it fits). A long route in one request would hit the service's limits on the length of the address and on the number of
 * results; pieces also let the outlines it returns stay detailed.
 */
export function queryChunks(points: readonly RoutePoint[], opts: { chunkM?: number; maxVertices?: number } = {}): QueryChunk[] {
  const chunkM = opts.chunkM ?? CHUNK_M;
  const maxVertices = opts.maxVertices ?? MAX_QUERY_VERTICES;
  if (points.length < 2) return [];
  const cum = cumulativeM(points);
  const out: QueryChunk[] = [];
  let a = 0;
  while (a < points.length - 1) {
    let b = a + 1;
    while (b < points.length - 1 && cum[b + 1]! - cum[a]! <= chunkM) b++;
    let piece = points.slice(a, b + 1);
    for (let tol = 8; piece.length > maxVertices && tol < 5000; tol *= 2) piece = simplify(points.slice(a, b + 1), tol);
    if (piece.length > maxVertices) piece = piece.filter((_, i) => i % Math.ceil(piece.length / maxVertices) === 0 || i === piece.length - 1);
    out.push({
      fromM: cum[a]!,
      toM: cum[b]!,
      path: piece.map((p) => {
        const { e, n } = wgs84ToLv95(p.lat, p.lon);
        return [Math.round(e), Math.round(n)] as [number, number];
      }),
    });
    a = b;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests

export interface RouteFeature {
  layerBodId: string;
  featureId?: string | number;
  attributes: Record<string, unknown>;
  geometry?: RouteGeometry;
  bbox?: number[];
}

interface RawResult {
  layerBodId: string;
  featureId?: string | number;
  attributes?: Record<string, unknown>;
  geometry?: RouteGeometry;
  bbox?: number[];
}

function extentOf(path: [number, number][], margin = 500): string {
  const es = path.map((p) => p[0]);
  const ns = path.map((p) => p[1]);
  return `${Math.min(...es) - margin},${Math.min(...ns) - margin},${Math.max(...es) + margin},${Math.max(...ns) + margin}`;
}

async function identifyAlong(path: [number, number][], layers: string[], extra: Record<string, string>, signal?: AbortSignal): Promise<RawResult[]> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ paths: [path] }),
    geometryType: 'esriGeometryPolyline',
    sr: '2056',
    layers: 'all:' + layers.join(','),
    tolerance: '0',
    mapExtent: extentOf(path),
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
    ...extra,
  });
  const res = await fetch(`${API}/api/MapServer/identify?${params}`, { signal });
  if (!res.ok) throw new Error(`identify ${res.status}`);
  const body = (await res.json()) as { results?: RawResult[] };
  return body.results ?? [];
}

const ZONE_IDS = [...new Set(ZONE_LAYERS.map((l) => l.id))];

/** The federal zone features the piece of route crosses, with their outlines. */
export async function fetchRouteZones(path: [number, number][], signal?: AbortSignal): Promise<RouteFeature[]> {
  const raw = await identifyAlong(path, ZONE_IDS, { returnGeometry: 'true', geometryFormat: 'geojson' }, signal);
  return raw.map((r) => ({ layerBodId: r.layerBodId, featureId: r.featureId, attributes: r.attributes ?? {}, geometry: r.geometry, bbox: r.bbox }));
}

export interface RouteMunicipality {
  name: string;
  bfs: number;
  canton: string;
  featureId?: string | number;
  geometry?: RouteGeometry;
  bbox?: number[];
}

const MUNICIPALITY_LAYER = 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill';

/** The municipalities the piece of route crosses (names and numbers only: their outlines are large). */
export async function fetchRouteMunicipalities(path: [number, number][], year = new Date().getFullYear(), signal?: AbortSignal): Promise<RouteMunicipality[]> {
  const raw = await identifyAlong(path, [MUNICIPALITY_LAYER], { timeInstant: String(year) }, signal);
  const out: RouteMunicipality[] = [];
  for (const r of raw) {
    const a = r.attributes ?? {};
    if (a.is_current_jahr === false) continue;
    const bfs = Number(a.gde_nr);
    if (typeof a.gemname === 'string' && Number.isFinite(bfs) && typeof a.kanton === 'string') out.push({ name: a.gemname, bfs, canton: a.kanton, featureId: r.featureId });
  }
  return out;
}

/** The outline of one municipality (from the feature service), for the ones that have a rule. */
export async function fetchMunicipalityGeometry(featureId: string | number, signal?: AbortSignal): Promise<{ geometry: RouteGeometry; bbox?: number[] } | undefined> {
  const res = await fetch(`${API}/api/MapServer/${MUNICIPALITY_LAYER}/${featureId}?geometryFormat=geojson&sr=2056`, { signal });
  if (!res.ok) throw new Error(`municipality outline ${res.status}`);
  const body = (await res.json()) as { feature?: { geometry?: RouteGeometry; bbox?: number[] } };
  return body.feature?.geometry ? { geometry: body.feature.geometry, bbox: body.feature.bbox } : undefined;
}

export interface ProfilePoint {
  /** Distance along the piece, metres. */
  dist: number;
  alt: number;
}

/** Heights along a piece of route from the federal elevation model. */
export async function fetchRouteElevations(path: [number, number][], lengthM: number, signal?: AbortSignal): Promise<ProfilePoint[]> {
  const nb = Math.max(2, Math.min(2000, Math.ceil(lengthM / 50)));
  const q = new URLSearchParams({ geom: JSON.stringify({ type: 'LineString', coordinates: path }), sr: '2056', nbPoints: String(nb) });
  const res = await fetch(`${API}/profile.json?${q}`, { signal });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  const body = (await res.json()) as { dist?: number; alts?: Record<string, number | null> }[];
  if (!Array.isArray(body)) throw new Error('bad profile');
  return body.flatMap((p) => {
    const alt = p.alts?.COMB ?? p.alts?.DTM2 ?? p.alts?.DTM25;
    return typeof p.dist === 'number' && typeof alt === 'number' ? [{ dist: p.dist, alt }] : [];
  });
}

/** Height at `fraction` (0 to 1) of the way along a profile, by linear interpolation; undefined for an empty profile. */
export function altitudeAt(profile: readonly ProfilePoint[], fraction: number): number | undefined {
  if (!profile.length) return undefined;
  const total = profile[profile.length - 1]!.dist;
  const d = Math.max(0, Math.min(1, fraction)) * total;
  let lo = 0;
  let hi = profile.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (profile[mid]!.dist < d) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return profile[0]!.alt;
  const a = profile[lo - 1]!;
  const b = profile[lo]!;
  const f = b.dist > a.dist ? (d - a.dist) / (b.dist - a.dist) : 0;
  return a.alt + (b.alt - a.alt) * f;
}

// ---------------------------------------------------------------------------------------------------------------------
// Which canton, where

/**
 * Which of several values holds at each sample, from a few lookups: every `coarseM` along the route, and wherever two neighbours
 * differ the gap is halved until it is `fineM` (or `maxLookups` is spent: the rest keeps the nearer neighbour's value). `lookup` may fail
 * for a sample, which then counts as unknown. Used for cantons, which change a few times along a route at most.
 */
export async function locateAlong<T extends string>(
  samples: readonly { distM: number }[],
  lookup: (index: number) => Promise<T | undefined>,
  opts: { coarseM?: number; fineM?: number; maxLookups?: number } = {},
): Promise<(T | undefined)[]> {
  const n = samples.length;
  const out: (T | undefined)[] = new Array(n).fill(undefined);
  if (!n) return out;
  const coarseM = opts.coarseM ?? 4000;
  const fineM = opts.fineM ?? 250;
  let budget = opts.maxLookups ?? 120;
  const known = new Map<number, T | undefined>();
  const ask = async (i: number): Promise<T | undefined> => {
    if (known.has(i)) return known.get(i);
    budget--;
    let v: T | undefined;
    try {
      v = await lookup(i);
    } catch {
      v = undefined;
    }
    known.set(i, v);
    return v;
  };
  // the coarse grid: the first and last sample and one about every coarseM
  const grid: number[] = [0];
  for (let i = 1; i < n; i++) if (samples[i]!.distM - samples[grid[grid.length - 1]!]!.distM >= coarseM) grid.push(i);
  if (grid[grid.length - 1] !== n - 1) grid.push(n - 1);
  await Promise.all(grid.map((i) => ask(i)));
  // between two grid points with different answers: bisect
  const refine = async (lo: number, hi: number): Promise<void> => {
    if (hi - lo <= 1 || samples[hi]!.distM - samples[lo]!.distM <= fineM || budget <= 0) return;
    if (known.get(lo) === known.get(hi) && known.get(lo) !== undefined) return;
    const mid = (lo + hi) >> 1;
    await ask(mid);
    await Promise.all([refine(lo, mid), refine(mid, hi)]);
  };
  await Promise.all(grid.slice(1).map((hi, k) => refine(grid[k]!, hi)));
  // fill: each sample takes the value of the nearest looked-up sample that agrees on both sides; between different neighbours, the nearer one
  const idx = [...known.keys()].sort((a, b) => a - b);
  for (let i = 0; i < n; i++) {
    let best = idx[0]!;
    for (const k of idx) if (Math.abs(samples[k]!.distM - samples[i]!.distM) < Math.abs(samples[best]!.distM - samples[i]!.distM)) best = k;
    out[i] = known.get(best);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Judging the route

export interface Sample {
  distM: number;
  lat: number;
  lon: number;
  e: number;
  n: number;
  ele?: number;
}

/** Points every `everyM` along the line with their LV95 position (and height where the line has one). */
export function routeSamples(points: readonly RoutePoint[], everyM = 250): Sample[] {
  return sampleEvery(points, everyM).map((p) => {
    const { e, n } = wgs84ToLv95(p.lat, p.lon);
    return { distM: p.distM, lat: p.lat, lon: p.lon, e, n, ele: p.ele };
  });
}

/** The canton "code" of a point that lies in no canton: outside Switzerland (or in Liechtenstein). */
export const OUTSIDE = 'OUT';

export type RouteCheckName = 'zones' | 'municipalities' | 'cantons' | 'elevation' | 'local rule data';

export interface RouteInputs {
  samples: Sample[];
  /** Federal zone features along the route (all pieces together, no repeats). */
  zones: RouteFeature[];
  /** Municipalities crossed; `geometry` is present for the ones that have a rule or note. */
  municipalities: RouteMunicipality[];
  /** Canton code at each sample, `undefined` where it is not known. */
  cantonAt: (string | undefined)[];
  /** What could not be looked up for part of the route. */
  failed: RouteCheckName[];
}

export type StripClass = 'ban' | 'caution' | 'ok' | 'unknown';
export type Cause = 'zone' | 'municipality' | 'canton' | 'forest' | 'treeline' | 'unknown' | 'none';

export interface Cell {
  distM: number;
  cls: StripClass;
  cause: Cause;
  /** The most serious finding in a few words. */
  why?: string;
}

export interface Stretch {
  fromM: number;
  toM: number;
  cls: 'ban' | 'caution';
  cause: Cause;
  why: string;
}

const CLASS_OF = { no: 'ban', caution: 'caution', likely_ok: 'ok', unknown: 'unknown' } as const;

/**
 * Judge every sample for a date. The date matters for the zones' protection seasons and for firing days.
 * Consecutive samples with the same findings share one assessment.
 */
export function classifySamples(inp: RouteInputs, data: LocalData, date: Date): Cell[] {
  const cache = new Map<string, { a: Assessment; cause: Cause }>();
  const withInfo = inp.municipalities.filter((m) => m.geometry);
  return inp.samples.map((s, i) => {
    if (inp.cantonAt[i] === OUTSIDE) return { distM: s.distM, cls: 'unknown', cause: 'unknown', why: tr('Outside Switzerland') } as Cell;
    const covering = inp.zones.filter((f) => inGeometry(f.geometry, s.e, s.n, f.bbox));
    const muni = withInfo.find((m) => inGeometry(m.geometry, s.e, s.n, m.bbox));
    const canton = findCanton(inp.cantonAt[i]);
    const { status: treeline, note: treelineNote } = classifyTreeline(data.forestMask, data.treelineSurface, s.e, s.n, s.ele);
    const reserves: ZoneHit[] = data.reserveSets.flatMap((set) => reserveZoneHits(set, s.e, s.n));
    const key = [covering.map((f) => `${f.layerBodId}/${f.featureId ?? ''}`).sort().join(','), reserves.map((r) => `${r.layer.id}/${r.name ?? ''}`).join(','), treeline, canton?.code ?? '', muni?.bfs ?? '', s.ele === undefined ? 'n' : 'e'].join('|');
    let hit = cache.get(key);
    if (!hit) {
      const zones = [...parseZoneHits({ results: covering.map((f) => ({ layerBodId: f.layerBodId, attributes: f.attributes })) }, date), ...reserves];
      const a = assess({
        zones,
        treeline,
        treelineNote,
        elevationKnown: s.ele !== undefined,
        canton,
        municipality: muni?.name,
        municipalRule: muni ? findMunicipalRule(muni.bfs)?.rule : undefined,
        municipalNote: muni ? findUnverifiedNote(muni.bfs) : undefined,
        buildingZone: { near: false },
        outsideSwitzerland: false,
      });
      const bad = (title: string) => a.items.some((it) => (it.tone === 'bad' || it.tone === 'warn') && it.title === title);
      const cause: Cause = zones.some((z) => z.layer.severity !== 'info')
        ? 'zone'
        : muni && (bad(tr('{name} (municipality)', { name: muni.name })) || bad(tr('{name}: reported camping ban, not verified', { name: muni.name })))
          ? 'municipality'
          : canton && bad(tr('{name} rules', { name: localCantonName(canton) }))
            ? 'canton'
            : treeline === 'forest'
              ? 'forest'
              : treeline === 'below' || a.items.some((it) => it.tone === 'warn' && it.title === tr('Close to the treeline'))
                ? 'treeline'
                : a.verdict === 'unknown'
                  ? 'unknown'
                  : 'none';
      hit = { a, cause };
      cache.set(key, hit);
    }
    return { distM: s.distM, cls: CLASS_OF[hit.a.verdict], cause: hit.cause, why: legalWhy(hit.a) };
  });
}

/** Runs of consecutive samples with the same class and the same finding, as stretches (ban and caution only). Each stretch ends where the next cell begins. */
export function stretchesOf(cells: readonly Cell[], totalM: number): Stretch[] {
  const out: Stretch[] = [];
  let cur: Stretch | undefined;
  cells.forEach((c, i) => {
    const toM = i + 1 < cells.length ? cells[i + 1]!.distM : totalM;
    if (c.cls === 'ban' || c.cls === 'caution') {
      if (cur && cur.cls === c.cls && cur.why === (c.why ?? '')) cur.toM = toM;
      else {
        cur = { fromM: c.distM, toM, cls: c.cls, cause: c.cause, why: c.why ?? '' };
        out.push(cur);
      }
    } else cur = undefined;
  });
  return out;
}

/** The share of the stretch between two distances along the route in each class, 0 to 1 (by distance; each cell runs to the next one). */
export function sharesBetween(cells: readonly Cell[], fromM: number, toM: number, routeEndM = toM): Record<StripClass, number> {
  const s: Record<StripClass, number> = { ban: 0, caution: 0, ok: 0, unknown: 0 };
  const span = toM - fromM;
  if (span <= 0) return s;
  cells.forEach((c, i) => {
    const end = i + 1 < cells.length ? cells[i + 1]!.distM : routeEndM;
    const a = Math.max(c.distM, fromM);
    const b = Math.min(end, toM);
    if (b > a) s[c.cls] += (b - a) / span;
  });
  return s;
}

/** The share of the route in each class, 0 to 1 (by distance). */
export const shares = (cells: readonly Cell[], totalM: number) => sharesBetween(cells, 0, totalM);

export interface NearestLegal {
  /** Distance along the route of the place, metres. */
  distM: number;
  /** How far from the asked-for position along the route (negative = before it), metres. */
  offsetM: number;
  cls: 'ok' | 'caution';
}

/**
 * The nearest place along the route that is not banned, to a position along it: `ok` first (within `maxM`), else the nearest `caution`.
 * Undefined when everything within reach is banned or unknown.
 */
export function nearestLegal(cells: readonly Cell[], atM: number, maxM = 3000): NearestLegal | undefined {
  let best: NearestLegal | undefined;
  for (const c of cells) {
    if (c.cls !== 'ok' && c.cls !== 'caution') continue;
    const off = c.distM - atM;
    if (Math.abs(off) > maxM) continue;
    const better = !best || (c.cls === 'ok' && best.cls === 'caution') || (c.cls === best.cls && Math.abs(off) < Math.abs(best.offsetM));
    if (better) best = { distM: c.distM, offsetM: off, cls: c.cls };
  }
  return best;
}

/** The cell at a distance along the route. */
export function cellAt(cells: readonly Cell[], distM: number): Cell | undefined {
  let found: Cell | undefined;
  for (const c of cells) {
    if (c.distM <= distM) found = c;
    else break;
  }
  return found;
}

/** Position on the route at a distance along it (the sample at or before it), for centring the map. */
export function positionAt(samples: readonly Sample[], distM: number): { lat: number; lon: number } | undefined {
  let found: Sample | undefined;
  for (const s of samples) {
    if (s.distM <= distM) found = s;
    else break;
  }
  return found ? { lat: found.lat, lon: found.lon } : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Gathering the inputs

export interface GatherOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, what: string) => void;
  /** How many requests at once. */
  concurrency?: number;
}

async function pool<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = { status: 'fulfilled', value: await work(items[i]!) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, run));
  return out;
}

/**
 * Everything the route needs from the services: zones (with outlines) and municipalities per piece, the outlines of the municipalities that have
 * a rule, cantons, and heights when the line has none. A part that fails is listed in `failed` and left out, never read as "nothing found".
 */
export async function gatherRouteInputs(points: readonly RoutePoint[], opts: GatherOptions = {}): Promise<RouteInputs> {
  if (points.length < 2) return { samples: [], zones: [], municipalities: [], cantonAt: [], failed: [] };
  const concurrency = opts.concurrency ?? 4;
  const failed = new Set<RouteCheckName>();
  const chunks = queryChunks(points);
  let samples = routeSamples(points);
  const total = chunks.length * 2 + 3;
  let done = 0;
  const tick = (what: string) => opts.onProgress?.(++done, total, what);

  // zones and municipalities, piece by piece
  const zoneRes = await pool(chunks, concurrency, async (c) => {
    const r = await fetchRouteZones(c.path, opts.signal);
    tick('zones');
    return r;
  });
  const muniRes = await pool(chunks, concurrency, async (c) => {
    const r = await fetchRouteMunicipalities(c.path, new Date().getFullYear(), opts.signal);
    tick('municipalities');
    return r;
  });
  const seen = new Set<string>();
  const zones: RouteFeature[] = [];
  zoneRes.forEach((r) => {
    if (r.status === 'rejected') return failed.add('zones');
    for (const f of r.value) {
      const key = `${f.layerBodId}/${f.featureId ?? JSON.stringify(f.attributes)}`;
      if (!seen.has(key)) {
        seen.add(key);
        zones.push(f);
      }
    }
  });
  const munis = new Map<number, RouteMunicipality>();
  muniRes.forEach((r) => {
    if (r.status === 'rejected') return failed.add('municipalities');
    for (const m of r.value) if (!munis.has(m.bfs)) munis.set(m.bfs, m);
  });
  // the outlines of the municipalities that have a rule or a note: where along the route each one holds
  const ruled = [...munis.values()].filter((m) => m.featureId !== undefined && (findMunicipalRule(m.bfs) || findUnverifiedNote(m.bfs)));
  const outlines = await pool(ruled, concurrency, (m) => fetchMunicipalityGeometry(m.featureId!, opts.signal));
  outlines.forEach((r, i) => {
    if (r.status === 'rejected' || !r.value) return failed.add('municipalities');
    ruled[i]!.geometry = r.value.geometry;
    ruled[i]!.bbox = r.value.bbox;
  });
  tick('municipalities');

  // heights: the line's own, or the elevation model's
  const withEle = points.filter((p) => p.ele !== undefined).length;
  if (withEle < points.length * 0.9) {
    const profiles = await pool(chunks, concurrency, (c) => fetchRouteElevations(c.path, c.toM - c.fromM, opts.signal));
    samples = samples.map((s) => {
      const k = chunks.findIndex((c, ci) => s.distM <= c.toM || ci === chunks.length - 1);
      const r = profiles[k];
      const c = chunks[k];
      if (!r || r.status !== 'fulfilled' || !c) return { ...s, ele: undefined };
      return { ...s, ele: altitudeAt(r.value, c.toM > c.fromM ? (s.distM - c.fromM) / (c.toM - c.fromM) : 0) };
    });
    if (samples.some((s) => s.ele === undefined)) failed.add('elevation');
  }
  tick('heights');

  // the canton at each sample, from a few point lookups along the route; 'OUT' where there is none (the route leaves Switzerland)
  const cantonAt = await locateAlong(samples, async (i) => (await fetchCanton(samples[i]!.lat, samples[i]!.lon))?.code ?? OUTSIDE);
  if (cantonAt.some((c) => c === undefined)) failed.add('cantons');
  tick('cantons');
  return { samples, zones, municipalities: [...munis.values()], cantonAt, failed: [...failed] };
}

// ---------------------------------------------------------------------------------------------------------------------
// The report

export interface Municipal {
  name: string;
  bfs: number;
  canton: string;
  stance?: 'banned' | 'restricted' | 'tolerated' | 'permitted';
  /** True when only an unverified note exists. */
  unverified?: boolean;
}

export interface RouteReport {
  cells: Cell[];
  stretches: Stretch[];
  shares: Record<StripClass, number>;
  /** The share of the route that lies outside Switzerland (0 to 1, by samples). */
  outsideShare: number;
  lengthM: number;
  /** Cantons crossed, in the order codes were seen. */
  cantons: Canton[];
  /** Municipalities crossed that have a recorded rule or note. */
  municipalities: Municipal[];
  failed: RouteCheckName[];
}

/** The verdicts along the route for a date, with the stretches, the shares and what was crossed. */
export function reportFor(inp: RouteInputs, data: LocalData, date: Date): RouteReport {
  return reportForDates(inp, data, [{ fromM: 0, toM: Infinity, date }]);
}

/**
 * The verdicts along the route when each part is walked on its own day: a point is judged for the date of the range that holds it, so a
 * wildlife zone that closes on 30 April bans the first days of a walk that starts on 28 April and not the later ones. Ranges are `[fromM, toM)`
 * (the last one takes the end of the route); a point in no range takes the first range's date.
 */
export function reportForDates(inp: RouteInputs, data: LocalData, ranges: { fromM: number; toM: number; date: Date }[]): RouteReport {
  const byDay = new Map<string, Cell[]>();
  const cellsFor = (date: Date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    let c = byDay.get(key);
    if (!c) byDay.set(key, (c = classifySamples(inp, data, date)));
    return c;
  };
  const rangeOf = (distM: number) => ranges.find((r) => distM >= r.fromM && distM < r.toM) ?? ranges[ranges.length - 1] ?? { date: new Date() };
  const cells = inp.samples.map((s, i) => cellsFor(rangeOf(s.distM).date)[i]!);
  const last = inp.samples[inp.samples.length - 1];
  const lengthM = last?.distM ?? 0;
  // the cantons the samples were found in, and any other the municipalities crossed belong to (a short crossing can fall between two lookups)
  const codes = new Set([...inp.cantonAt.filter((c): c is string => !!c && c !== OUTSIDE), ...inp.municipalities.map((m) => m.canton)]);
  const cantons = [...codes].map((c) => findCanton(c)).filter((c): c is Canton => !!c);
  const municipalities: Municipal[] = [];
  for (const m of inp.municipalities) {
    const rule = findMunicipalRule(m.bfs);
    const note = findUnverifiedNote(m.bfs);
    if (rule) municipalities.push({ name: m.name, bfs: m.bfs, canton: m.canton, stance: rule.rule.stance as Municipal['stance'] });
    else if (note) municipalities.push({ name: m.name, bfs: m.bfs, canton: m.canton, unverified: true });
  }
  const failed = [...inp.failed];
  if (!data.complete) failed.push('local rule data');
  const outsideShare = inp.cantonAt.length ? inp.cantonAt.filter((c) => c === OUTSIDE).length / inp.cantonAt.length : 0;
  return { cells, stretches: stretchesOf(cells, lengthM), shares: shares(cells, lengthM), outsideShare, lengthM, cantons, municipalities, failed };
}

/** Distance in metres between two route samples' positions (used to place a stage end on the map). */
export const spanM = (a: Pick<Sample, 'lat' | 'lon'>, b: Pick<Sample, 'lat' | 'lon'>) => haversineM({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });

/** LV95 to WGS84, re-exported for the places that draw route features. */
export const toLatLon = lv95ToWgs84;
