import { ascentDescent, cumulativeM, haversineM, mainLine, naismithMinutes, simplify, splitStages, type ParsedGpx, type RoutePoint } from './route';
import { cellAt, nearestLegal, positionAt, sharesBetween, type Cell, type NearestLegal, type RouteReport, type Sample, type StripClass } from './routecheck';

/** What the route page shows besides the zone check: length, climb, walking time, and the stages with where to sleep. */

export interface RouteStats {
  lengthM: number;
  ascentM?: number;
  descentM?: number;
  /** Walking time by Naismith's rule, minutes (optimistic on rough ground). */
  minutes: number;
}

const between = <T extends { distM: number }>(items: readonly T[], fromM: number, toM: number) => items.filter((s) => s.distM >= fromM && s.distM <= toM);

/**
 * The line's climb and descent between two distances along it: from its own heights when it has them for almost every point, else from
 * the heights looked up at the samples. Undefined when neither exists.
 */
function climb(points: readonly RoutePoint[], cum: readonly number[], samples: readonly Sample[] | undefined, fromM: number, toM: number): { ascentM: number; descentM: number } | undefined {
  const own = points.filter((p) => p.ele !== undefined).length >= points.length * 0.9;
  if (own) {
    const slice = points.filter((_, i) => cum[i]! >= fromM && cum[i]! <= toM);
    return ascentDescent(slice);
  }
  if (!samples) return undefined;
  const slice = between(samples, fromM, toM);
  return ascentDescent(slice);
}

export function routeStats(points: readonly RoutePoint[], samples?: readonly Sample[]): RouteStats {
  const cum = cumulativeM(points);
  const lengthM = cum[cum.length - 1] ?? 0;
  const c = climb(points, cum, samples, 0, lengthM);
  return { lengthM, ascentM: c?.ascentM, descentM: c?.descentM, minutes: naismithMinutes(lengthM, c?.ascentM ?? 0, c?.descentM ?? 0) };
}

export interface Camp {
  lat: number;
  lon: number;
  ele?: number;
  /** Distance along the route, metres. */
  distM: number;
  /** The stage's end is banned or unchecked, and this is the nearest place along the route that is not banned. */
  moved: boolean;
  /** Everything within reach of the stage's end is banned (or unknown): no place along the route to suggest. */
  blocked: boolean;
}

export interface StageInfo {
  n: number;
  fromM: number;
  toM: number;
  distM: number;
  ascentM?: number;
  descentM?: number;
  minutes: number;
  /** The line's point where the stage ends. */
  end: RoutePoint;
  /** The cell at the end of the stage, once the route has been checked. */
  endCell?: Cell;
  /** Where to sleep: the end of the stage, or the nearest place along the route that is not banned. */
  camp: Camp;
  nearest?: NearestLegal;
  /** Shares of the stage in each class (0 to 1), once the route has been checked. */
  shares?: Record<StripClass, number>;
}

/** How far from the end of a stage a place to sleep is looked for, along the route. */
export const CAMP_REACH_M = 3000;

/**
 * The route cut into stages of about `stageKm`, each with distance, climb, walking time and where to sleep. Without a `report` (the
 * check has not run, or failed) the camp is simply the end of the stage.
 */
export function stageInfos(points: readonly RoutePoint[], stageKm: number, report?: RouteReport, samples?: readonly Sample[]): StageInfo[] {
  const cum = cumulativeM(points);
  return splitStages(points, stageKm).map((s, i): StageInfo => {
    const toM = s.startDistM + s.distM;
    const c = climb(points, cum, samples, s.startDistM, toM);
    const endCell = report ? cellAt(report.cells, toM) : undefined; // the sample at or just before the end of the stage
    const nearest = report && endCell && endCell.cls !== 'ok' ? nearestLegal(report.cells, toM, CAMP_REACH_M) : undefined;
    const sampleAt = (d: number) => (samples ? positionAt(samples, d) : undefined);
    let camp: Camp = { lat: s.to.lat, lon: s.to.lon, ele: s.to.ele, distM: toM, moved: false, blocked: false };
    if (report && endCell && endCell.cls !== 'ok') {
      if (nearest) {
        const p = sampleAt(nearest.distM);
        if (p) camp = { lat: p.lat, lon: p.lon, ele: samples ? samples.find((x) => x.distM === nearest.distM)?.ele : undefined, distM: nearest.distM, moved: true, blocked: false };
      } else camp = { ...camp, blocked: endCell.cls === 'ban' };
    }
    return {
      n: i + 1,
      fromM: s.startDistM,
      toM,
      distM: s.distM,
      ascentM: c?.ascentM,
      descentM: c?.descentM,
      minutes: naismithMinutes(s.distM, c?.ascentM ?? 0, c?.descentM ?? 0),
      end: s.to,
      endCell,
      camp,
      nearest,
      shares: report ? sharesBetween(report.cells, s.startDistM, toM, report.lengthM) : undefined,
    };
  });
}


/** Tracks that follow one another (the next starts within this distance of where the last ended) are one route. */
export const JOIN_M = 3000;

/**
 * The line to plan with. A file with several tracks (one per day, as some apps export) is one route when the tracks connect end to start in
 * file order; otherwise the longest track (or route) is used. `joined` is how many tracks make up the line.
 */
export function routeLine(g: ParsedGpx): { points: RoutePoint[]; joined: number } {
  for (const lines of [g.tracks, g.routes]) {
    const usable = lines.filter((l) => l.points.length > 1);
    if (usable.length < 2) continue;
    const chain: RoutePoint[] = [...usable[0]!.points];
    let ok = true;
    for (const l of usable.slice(1)) {
      const end = chain[chain.length - 1]!;
      if (haversineM(end, l.points[0]!) > JOIN_M) {
        ok = false;
        break;
      }
      chain.push(...l.points);
    }
    if (ok) return { points: chain, joined: usable.length };
  }
  const points = mainLine(g);
  return { points, joined: points.length ? 1 : 0 };
}

/** The route as kept in the browser between visits: a simplified line (at most `maxPoints`), the stage length and the first day. */
export interface StoredRoute {
  name: string;
  /** [lat, lon] or [lat, lon, ele], rounded to about a metre. */
  pts: number[][];
  stageKm: number;
  date: string;
}

export const ROUTE_KEY = 'wildcamp.route.v1';

/** The line with at most `maxPoints` points: simplified with a growing tolerance (from `startM` metres) until it fits. */
export function thin(points: readonly RoutePoint[], maxPoints: number, startM = 3): RoutePoint[] {
  let line: RoutePoint[] = points.slice();
  for (let tol = startM; line.length > maxPoints && tol < 5000; tol *= 1.6) line = simplify(points, tol);
  return line;
}

export function packRoute(name: string, points: readonly RoutePoint[], stageKm: number, date: string, maxPoints = 3000): StoredRoute {
  const line = thin(points, maxPoints, 5);
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return { name: name.slice(0, 120), pts: line.map((p) => (p.ele === undefined ? [r5(p.lat), r5(p.lon)] : [r5(p.lat), r5(p.lon), Math.round(p.ele)])), stageKm, date };
}

export function unpackRoute(raw: unknown): { name: string; points: RoutePoint[]; stageKm: number; date: string } | undefined {
  const r = raw as StoredRoute | undefined;
  if (!r || typeof r.name !== 'string' || !Array.isArray(r.pts) || r.pts.length < 2 || r.pts.length > 20_000) return undefined;
  const points: RoutePoint[] = [];
  for (const p of r.pts) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]!) > 90 || Math.abs(p[1]!) > 180) return undefined;
    points.push(Number.isFinite(p[2]) ? { lat: p[0]!, lon: p[1]!, ele: p[2] } : { lat: p[0]!, lon: p[1]! });
  }
  const stageKm = Number.isFinite(r.stageKm) ? Math.max(5, Math.min(40, Math.round(r.stageKm))) : 15;
  return { name: r.name, points, stageKm, date: typeof r.date === 'string' ? r.date : '' };
}


/** The position at a distance along the line (clamped to its ends), with its height where the line has one. */
export function pointAt(points: readonly RoutePoint[], cum: readonly number[], distM: number): RoutePoint | undefined {
  const n = points.length;
  if (!n) return undefined;
  if (distM <= 0 || n === 1) return points[0];
  if (distM >= cum[n - 1]!) return points[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < distM) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1]!;
  const b = points[lo]!;
  const span = cum[lo]! - cum[lo - 1]!;
  const f = span > 0 ? (distM - cum[lo - 1]!) / span : 0;
  const p: RoutePoint = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
  if (a.ele !== undefined && b.ele !== undefined) p.ele = a.ele + (b.ele - a.ele) * f;
  return p;
}

/** The part of the line between two distances: the exact start, the points in between, the exact end. */
export function slicePoints(points: readonly RoutePoint[], cum: readonly number[], fromM: number, toM: number): RoutePoint[] {
  const a = pointAt(points, cum, fromM);
  const b = pointAt(points, cum, toM);
  if (!a || !b) return [];
  const inner = points.filter((_, i) => cum[i]! > fromM && cum[i]! < toM);
  return [a, ...inner, b];
}
