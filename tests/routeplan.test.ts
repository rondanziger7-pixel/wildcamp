import { describe, expect, it } from 'vitest';
import { CAMP_REACH_M, packRoute, pointAt, routeLine, routeStats, slicePoints, stageInfos, thin, unpackRoute } from '../src/routeplan';
import { sharesBetween, type Cell, type RouteReport, type Sample } from '../src/routecheck';
import { cumulativeM, lengthM, type RoutePoint } from '../src/route';

/** A 30 km line east from the Gasterntal with a climb of 1000 m over the first half and a descent over the second. */
function route(n = 301, ele = true): RoutePoint[] {
  const dLon = 100 / (111320 * Math.cos((46.5 * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => ({ lat: 46.5, lon: 7.7 + i * dLon, ele: ele ? 1000 + 1000 * (1 - Math.abs(2 * (i / (n - 1)) - 1)) : undefined }));
}
const cell = (distM: number, cls: Cell['cls'], why = '', cause: Cell['cause'] = 'none'): Cell => ({ distM, cls, why, cause });

describe('route statistics', () => {
  it('give length, climb, descent and a walking time by Naismith', () => {
    const pts = route();
    const s = routeStats(pts);
    expect(s.lengthM).toBeCloseTo(lengthM(pts), 0);
    expect(s.ascentM).toBeGreaterThan(950);
    expect(s.ascentM).toBeLessThan(1050);
    expect(s.descentM).toBeGreaterThan(950);
    // 30 km at 4 km/h is 7.5 h, plus 10 minutes per 100 m of climb: about 9 h 10 min
    expect(s.minutes).toBeGreaterThan(8.5 * 60);
    expect(s.minutes).toBeLessThan(9.8 * 60);
  });
  it('without heights of its own, takes them from the looked-up samples; without either, has no climb and counts the flat only', () => {
    const pts = route(301, false);
    const samples: Sample[] = Array.from({ length: 121 }, (_, i) => ({ distM: i * 250, lat: 46.5, lon: 7.7, e: 0, n: 0, ele: 1000 + 1000 * (1 - Math.abs(2 * (i / 120) - 1)) }));
    const withSamples = routeStats(pts, samples);
    expect(withSamples.ascentM).toBeGreaterThan(900);
    const none = routeStats(pts);
    expect(none.ascentM).toBeUndefined();
    expect(none.minutes).toBeCloseTo((lengthM(pts) / 4000) * 60, 0);
  });
});

describe('stages', () => {
  it('are of about the length asked, add up to the route, and carry climb and time each', () => {
    const pts = route();
    const st = stageInfos(pts, 15);
    expect(st).toHaveLength(2);
    expect(st.map((s) => s.n)).toEqual([1, 2]);
    expect(st[0]!.fromM).toBe(0);
    expect(st[1]!.toM).toBeCloseTo(lengthM(pts), 0);
    expect(st[0]!.toM).toBe(st[1]!.fromM);
    expect(st[0]!.ascentM).toBeGreaterThan(900);
    expect(st[1]!.descentM).toBeGreaterThan(900);
    expect(st[0]!.minutes).toBeGreaterThan(st[0]!.distM / 4000 * 60);
  });
  it('before the check, the camp is the end of the stage', () => {
    const [a] = stageInfos(route(), 15);
    expect(a!.camp).toMatchObject({ moved: false, blocked: false, lat: a!.end.lat, lon: a!.end.lon });
    expect(a!.endCell).toBeUndefined();
    expect(a!.shares).toBeUndefined();
  });

  const samples = (n = 121): Sample[] => Array.from({ length: n }, (_, i) => ({ distM: i * 250, lat: 46.5, lon: 7.7 + i * 0.0032, e: 0, n: 0, ele: 1500 }));
  const report = (cells: Cell[]): RouteReport => ({ cells, stretches: [], shares: { ban: 0, caution: 0, ok: 0, unknown: 0 }, outsideShare: 0, lengthM: 30_000, cantons: [], municipalities: [], failed: [] });
  const allOk = () => Array.from({ length: 121 }, (_, i) => cell(i * 250, 'ok'));

  it('a stage that ends on ground that is fine camps at its end', () => {
    const [a, b] = stageInfos(route(), 15, report(allOk()), samples());
    expect(a!.endCell!.cls).toBe('ok');
    expect(a!.camp.moved).toBe(false);
    expect(a!.nearest).toBeUndefined();
    expect(a!.shares!.ok).toBeCloseTo(1, 5);
    expect(b!.shares!.ok).toBeCloseTo(1, 5);
  });
  it('a stage that ends inside a ban camps at the nearest place that is not banned, and says how far', () => {
    const cells = allOk().map((c) => (c.distM >= 14_000 && c.distM <= 16_000 ? cell(c.distM, 'ban', 'Zone A', 'zone') : c));
    const [a] = stageInfos(route(), 15, report(cells), samples());
    expect(a!.endCell!.cls).toBe('ban');
    expect(a!.camp).toMatchObject({ moved: true, blocked: false });
    expect(Math.abs(a!.camp.distM - a!.toM)).toBeLessThanOrEqual(1250);
    expect(a!.camp.distM).toBeLessThan(14_000 + 1); // the nearest legal cell is just before the zone
    expect(a!.nearest!.cls).toBe('ok');
  });
  it('when everything within reach is banned there is no camp to suggest, and the stage says so', () => {
    const cells = allOk().map((c) => (c.distM >= 14_000 - CAMP_REACH_M && c.distM <= 16_000 + CAMP_REACH_M ? cell(c.distM, 'ban', 'Zone A', 'zone') : c));
    const [a] = stageInfos(route(), 15, report(cells), samples());
    expect(a!.camp).toMatchObject({ moved: false, blocked: true });
  });
  it('a stage ending on a caution camps there unless open ground is near', () => {
    const cells = allOk().map((c) => (c.distM >= 14_500 && c.distM <= 15_500 ? cell(c.distM, 'caution', 'In forest', 'forest') : c));
    const [a] = stageInfos(route(), 15, report(cells), samples());
    expect(a!.endCell!.cls).toBe('caution');
    expect(a!.camp.moved).toBe(true);
    expect(a!.nearest!.cls).toBe('ok');
  });
  it('shares are clipped to the stage', () => {
    const cells = allOk().map((c) => (c.distM >= 5000 && c.distM < 10_000 ? cell(c.distM, 'ban', 'Z', 'zone') : c));
    const [a, b] = stageInfos(route(), 15, report(cells), samples());
    expect(a!.shares!.ban).toBeCloseTo(5000 / a!.distM, 2);
    expect(b!.shares!.ban).toBe(0);
  });
});

describe('shares between two distances', () => {
  it('count only the part inside the window, each cell running to the next', () => {
    const cells = [cell(0, 'ok'), cell(1000, 'ban'), cell(2000, 'ok')];
    expect(sharesBetween(cells, 500, 1500, 3000)).toEqual({ ban: 0.5, caution: 0, ok: 0.5, unknown: 0 });
    expect(sharesBetween(cells, 2500, 3000, 3000)).toEqual({ ban: 0, caution: 0, ok: 1, unknown: 0 });
    expect(sharesBetween(cells, 10, 10, 3000)).toEqual({ ban: 0, caution: 0, ok: 0, unknown: 0 });
  });
});

describe('the line of a file', () => {
  const line = (lat0: number, lon0: number, n = 20): { points: RoutePoint[] } => ({ points: Array.from({ length: n }, (_, i) => ({ lat: lat0, lon: lon0 + i * 0.001 })) });
  const gpx = (tracks: { points: RoutePoint[] }[], routes: { points: RoutePoint[] }[] = []) => ({ tracks, routes, waypoints: [] });
  it('one track is the line', () => {
    const r = routeLine(gpx([line(46.5, 7.7)]));
    expect(r.joined).toBe(1);
    expect(r.points).toHaveLength(20);
  });
  it('tracks that connect end to start are one route (a track per day)', () => {
    const a = line(46.5, 7.7);
    const b = line(46.5, 7.7 + 0.019); // starts where a ends
    const c = line(46.5, 7.7 + 0.038);
    const r = routeLine(gpx([a, b, c]));
    expect(r.joined).toBe(3);
    expect(r.points).toHaveLength(60);
  });
  it('tracks that do not connect are not glued together: the longest is used', () => {
    const short = line(46.5, 7.7, 5);
    const long = line(46.9, 8.9, 30); // elsewhere
    const r = routeLine(gpx([short, long]));
    expect(r.joined).toBe(1);
    expect(r.points).toHaveLength(30);
  });
  it('falls back to routes when there are no tracks, and to nothing for an empty file', () => {
    expect(routeLine(gpx([], [line(46.5, 7.7, 8)])).points).toHaveLength(8);
    expect(routeLine(gpx([])).joined).toBe(0);
    expect(routeLine(gpx([])).points).toEqual([]);
  });
});

describe('the route kept between visits', () => {
  it('is simplified to the limit, rounded to a metre, and comes back as it went', () => {
    const wiggly = Array.from({ length: 12_000 }, (_, i) => ({ lat: 46.5 + i * 0.00003 + (i % 2) * 0.000004, lon: 7.7 + i * 0.00004, ele: 1000 + (i % 50) }));
    const packed = packRoute('Haute Route', wiggly, 18, '2027-07-01');
    expect(packed.pts.length).toBeLessThanOrEqual(3000);
    expect(packed.pts[0]).toEqual([46.5, 7.7, 1000]);
    const back = unpackRoute(JSON.parse(JSON.stringify(packed)))!;
    expect(back.name).toBe('Haute Route');
    expect(back.stageKm).toBe(18);
    expect(back.date).toBe('2027-07-01');
    expect(back.points).toHaveLength(packed.pts.length);
    expect(back.points[0]).toEqual({ lat: 46.5, lon: 7.7, ele: 1000 });
    // the simplified line is about as long as the original
    expect(Math.abs(lengthM(back.points) - lengthM(wiggly)) / lengthM(wiggly)).toBeLessThan(0.08);
  });
  it('a line without heights stays without', () => {
    const back = unpackRoute(packRoute('x', [{ lat: 46.5, lon: 7.7 }, { lat: 46.6, lon: 7.8 }], 15, ''))!;
    expect(back.points[0]).toEqual({ lat: 46.5, lon: 7.7 });
  });
  it('refuses what is not a route: garbage, too short, out of range coordinates, too big', () => {
    expect(unpackRoute(undefined)).toBeUndefined();
    expect(unpackRoute({})).toBeUndefined();
    expect(unpackRoute({ name: 'x', pts: [[46, 7]], stageKm: 15, date: '' })).toBeUndefined();
    expect(unpackRoute({ name: 'x', pts: [[46, 7], [95, 7]], stageKm: 15, date: '' })).toBeUndefined();
    expect(unpackRoute({ name: 'x', pts: [[46, 7], ['a', 7]], stageKm: 15, date: '' })).toBeUndefined();
    expect(unpackRoute({ name: 'x', pts: Array.from({ length: 30_000 }, () => [46, 7]), stageKm: 15, date: '' })).toBeUndefined();
    expect(unpackRoute({ name: 5, pts: [[46, 7], [46.1, 7.1]] })).toBeUndefined();
  });
  it('keeps the stage length within what the page allows', () => {
    expect(unpackRoute({ name: 'x', pts: [[46, 7], [46.1, 7.1]], stageKm: 999, date: '' })!.stageKm).toBe(40);
    expect(unpackRoute({ name: 'x', pts: [[46, 7], [46.1, 7.1]], stageKm: 1, date: '' })!.stageKm).toBe(5);
    expect(unpackRoute({ name: 'x', pts: [[46, 7], [46.1, 7.1]], stageKm: 'many', date: '' })!.stageKm).toBe(15);
  });
});

describe('positions along the line', () => {
  const pts: RoutePoint[] = [{ lat: 46, lon: 7, ele: 1000 }, { lat: 46, lon: 7.01, ele: 1100 }, { lat: 46.01, lon: 7.01, ele: 1300 }];
  const cum = cumulativeM(pts);
  it('are found between points, with the height interpolated, and clamp to the ends', () => {
    const mid = pointAt(pts, cum, cum[1]! / 2)!;
    expect(mid.lon).toBeCloseTo(7.005, 6);
    expect(mid.ele).toBeCloseTo(1050, 5);
    expect(pointAt(pts, cum, cum[1]!)).toMatchObject({ lon: 7.01, lat: 46 });
    expect(pointAt(pts, cum, -50)).toEqual(pts[0]);
    expect(pointAt(pts, cum, 1e9)).toEqual(pts[2]);
    expect(pointAt([], [], 5)).toBeUndefined();
    expect(pointAt([pts[0]!], [0], 5)).toEqual(pts[0]);
  });
  it('a slice starts and ends exactly where asked and keeps the points in between', () => {
    const s = slicePoints(pts, cum, cum[1]! / 2, cum[1]! + (cum[2]! - cum[1]!) / 2);
    expect(s).toHaveLength(3);
    expect(s[0]!.lon).toBeCloseTo(7.005, 6);
    expect(s[1]).toEqual(pts[1]);
    expect(s[2]!.lat).toBeCloseTo(46.005, 6);
    expect(slicePoints(pts, cum, 0, cum[2]!)).toHaveLength(3);
    expect(slicePoints([], [], 0, 10)).toEqual([]);
  });
  it('thinning keeps the ends and the limit', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ lat: 46 + i * 0.0001, lon: 7 + Math.sin(i / 20) * 0.001 }));
    const t = thin(many, 400);
    expect(t.length).toBeLessThanOrEqual(400);
    expect(t[0]).toEqual(many[0]);
    expect(t[t.length - 1]).toEqual(many[many.length - 1]);
    expect(thin(many.slice(0, 10), 400)).toHaveLength(10);
  });
});
