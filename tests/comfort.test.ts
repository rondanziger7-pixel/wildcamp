import { describe, expect, it } from 'vitest';
import moiry from './fixtures/comfort-moiry.json';
import zermatt from './fixtures/comfort-zermatt.json';
import { comfortFor, rate } from '../src/comfort/comfort';
import type { WaterInfo } from '../src/comfort/water';
import { distanceTo, minDistance, parseNames, parseStops } from '../src/comfort/surroundings';
import { formatLocalTime, solarPosition, sunTimes } from '../src/comfort/sun';
import { analyseTerrain, horizonToward, parseProfile, ray, type Profiles, type TerrainMetrics } from '../src/comfort/terrain';
import { COMPASS, compassName, nightWindow, summariseNight, zurichNow, type Hourly } from '../src/comfort/weather';

const N = 101;
const MID = 50;
/** Profiles of a synthetic landscape z(x, y) with the spot at the origin; x east, y north, 10 m steps. */
function synth(z: (x: number, y: number) => number): Profiles {
  const line = (dx: number, dy: number) => Array.from({ length: N }, (_, i) => z((i - MID) * 10 * dx, (i - MID) * 10 * dy));
  const s = Math.SQRT1_2;
  return { step: 10, ew: line(1, 0), ns: line(0, 1), nesw: line(s, s), nwse: line(s, -s) };
}
const TAN = Math.tan;
const d2r = (d: number) => (d * Math.PI) / 180;

describe('terrain analysis on synthetic ground', () => {
  it('flat plain: no slope, no horizon, no ridge', () => {
    const t = analyseTerrain(synth(() => 2000));
    expect(t.slopeDeg).toBeCloseTo(0, 5);
    expect(t.meanHorizon).toBeLessThanOrEqual(0);
    expect(t.tpi).toBeCloseTo(0, 5);
    expect(t.steepAboveM).toBeUndefined();
    expect(t.dropNearM).toBeUndefined();
  });
  it('uniform 20 degree slope rising to the north', () => {
    const t = analyseTerrain(synth((_x, y) => 2000 + y * TAN(d2r(20))));
    expect(t.slopeDeg).toBeCloseTo(20, 1);
    expect(t.horizon[0]).toBeCloseTo(20, 0); // north
    expect(t.horizon[4]).toBeLessThan(-15); // south falls away
    expect(horizonToward(t.horizon, 0)).toBeCloseTo(t.horizon[0]!, 5);
  });
  it('a bowl: high horizon all round, negative TPI', () => {
    const t = analyseTerrain(synth((x, y) => 2000 + 0.3 * Math.hypot(x, y)));
    expect(t.meanHorizon).toBeGreaterThan(10);
    expect(t.tpi).toBeLessThan(-15);
  });
  it('a summit: positive TPI and a negative horizon', () => {
    const t = analyseTerrain(synth((x, y) => 2000 - 0.3 * Math.hypot(x, y)));
    expect(t.tpi).toBeGreaterThan(15);
    expect(t.meanHorizon).toBeLessThan(0);
  });
  it('finds a steep slope above and a drop below', () => {
    const wall = analyseTerrain(synth((_x, y) => (y > 80 ? 2000 + (y - 80) * 1.2 : 2000)));
    expect(wall.steepAboveM).toBeGreaterThanOrEqual(60);
    expect(wall.steepAboveM).toBeLessThanOrEqual(90);
    const cliff = analyseTerrain(synth((x, _y) => (x > 20 ? 2000 - (x - 20) * 1.5 : 2000)));
    expect(cliff.dropNearM).toBeDefined();
    expect(cliff.dropNearM!).toBeLessThanOrEqual(40);
    expect(analyseTerrain(synth(() => 2000)).dropNearM).toBeUndefined();
  });
  it('rays run outward from the spot in the right compass direction', () => {
    const p = synth((x, y) => 2000 + x * 0.1 + y * 0.01); // rises to the east much faster than north
    expect(ray(p, 90)[10]).toBeGreaterThan(ray(p, 270)[10]!);
    expect(ray(p, 0)[10]!).toBeGreaterThan(ray(p, 180)[10]!);
    expect(ray(p, 45)[10]!).toBeGreaterThan(ray(p, 225)[10]!);
    expect(ray(p, 135)[10]!).toBeGreaterThan(ray(p, 315)[10]!); // SE is east-ish and south-ish: net higher than NW
    for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) expect(ray(p, b)[0]).toBe(2000);
  });
  it('interpolates horizon between bearings and wraps at north', () => {
    const h = [10, 20, 0, 0, 0, 0, 0, 0];
    expect(horizonToward(h, 22.5)).toBeCloseTo(15, 5);
    expect(horizonToward(h, 360)).toBeCloseTo(10, 5);
    expect(horizonToward([0, 0, 0, 0, 0, 0, 0, 40], 337.5)).toBeCloseTo(20, 5);
  });
  it('reads profile responses, preferring the combined model and keeping gaps as NaN', () => {
    const z = parseProfile([{ dist: 0, alts: { COMB: 1, DTM2: 2 } }, { dist: 1, alts: { DTM2: 3 } }, { dist: 2, alts: {} }]);
    expect(z[0]).toBe(1);
    expect(z[1]).toBe(3);
    expect(Number.isNaN(z[2])).toBe(true);
    expect(() => parseProfile({})).toThrow();
  });
});

describe('real terrain at 150 m east of Cabane de Moiry (live data fixture)', () => {
  const t = analyseTerrain(moiry.near as Profiles, moiry.far as Profiles);
  it('gives finite numbers on real data', () => {
    for (const v of [t.elevation, t.slopeDeg, t.meanHorizon, t.tpi, ...t.horizon, ...t.farHorizon!]) expect(Number.isFinite(v)).toBe(true);
    expect(t.elevation).toBeGreaterThan(2700);
    expect(t.elevation).toBeLessThan(3000);
  });
  it('the far horizon is at least as high as the near one in the mountains', () => {
    expect(Math.max(...t.farHorizon!)).toBeGreaterThan(5);
  });
});

describe('sun position and times against an independent library (astral)', () => {
  const near = (d: Date | undefined, hhmm: string, tol = 3) => {
    const [h, m] = formatLocalTime(d!).split(':').map(Number);
    const [rh, rm] = hhmm.split(':').map(Number);
    expect(Math.abs(h! * 60 + m! - (rh! * 60 + rm!))).toBeLessThanOrEqual(tol);
  };
  it('matches reference sunrise and sunset', () => {
    const z = sunTimes(new Date('2026-10-04T12:00:00Z'), 47.3769, 8.5417);
    near(z.sunrise, '07:28');
    near(z.sunset, '18:59');
    const s = sunTimes(new Date('2026-06-21T12:00:00Z'), 46.02, 7.75);
    near(s.sunrise, '05:38');
    near(s.sunset, '21:23');
    const w = sunTimes(new Date('2026-12-21T12:00:00Z'), 46.0, 8.95);
    near(w.sunrise, '08:03');
    near(w.sunset, '16:41');
  });
  it('matches a reference azimuth and elevation', () => {
    const p = solarPosition(new Date('2026-06-21T10:00:00Z'), 46.8, 8.2);
    expect(p.azimuth).toBeCloseTo(134.94, 0);
    expect(p.elevation).toBeCloseTo(60.61, 0);
  });
  it('a mountain to the east delays the morning sun, one to the west brings the sunset forward', () => {
    const flat = sunTimes(new Date('2026-10-04T12:00:00Z'), 46.5, 8.4);
    const east = sunTimes(new Date('2026-10-04T12:00:00Z'), 46.5, 8.4, [0, 0, 20, 0, 0, 0, 0, 0]);
    const west = sunTimes(new Date('2026-10-04T12:00:00Z'), 46.5, 8.4, [0, 0, 0, 0, 0, 0, 20, 0]);
    expect(east.sunOnSpot!.getTime()).toBeGreaterThan(flat.sunrise!.getTime() + 30 * 60000);
    expect(west.sunLeavesSpot!.getTime()).toBeLessThan(flat.sunset!.getTime() - 30 * 60000);
    // a 0 degree horizon is a little stricter than the standard sunrise altitude (-0.83 degrees, refraction): a few minutes later
    const level = sunTimes(new Date('2026-10-04T12:00:00Z'), 46.5, 8.4, [0, 0, 0, 0, 0, 0, 0, 0]).sunOnSpot!.getTime();
    expect(level - flat.sunrise!.getTime()).toBeGreaterThanOrEqual(0);
    expect(level - flat.sunrise!.getTime()).toBeLessThanOrEqual(8 * 60000);
  });
});

describe('overnight forecast summary', () => {
  const times = ['2026-10-04T17:00', '2026-10-04T18:00', '2026-10-04T23:00', '2026-10-05T02:00', '2026-10-05T07:00', '2026-10-05T08:00', '2026-10-05T12:00'];
  const hourly: Hourly = {
    time: times,
    temperature_2m: [9, 7, 4, -1, -3, -2, 5],
    wind_speed_10m: [10, 20, 20, 20, 20, 90, 90],
    wind_gusts_10m: [15, 40, 55, 30, 25, 120, 120],
    wind_direction_10m: [180, 270, 270, 270, 270, 90, 90],
    precipitation: [0, 0, 0.5, 0.5, 0, 9, 9],
  };
  it('window: evening, night in progress, small hours', () => {
    expect(nightWindow('2026-10-04T15:30')).toMatchObject({ from: '2026-10-04T18:00', to: '2026-10-05T08:00', label: 'Tonight' });
    expect(nightWindow('2026-10-04T21:10')).toMatchObject({ from: '2026-10-04T21:10', to: '2026-10-05T08:00' });
    expect(nightWindow('2026-10-05T03:00')).toMatchObject({ from: '2026-10-05T03:00', to: '2026-10-05T08:00' });
    expect(nightWindow('2026-12-31T22:00').to).toBe('2027-01-01T08:00');
  });
  it('summarises only the hours inside the window', () => {
    const n = summariseNight(hourly, nightWindow('2026-10-04T15:30'))!;
    expect(n.minTempC).toBe(-3);
    expect(n.maxGustKmh).toBe(55);
    expect(n.meanWindKmh).toBeCloseTo(20, 5);
    expect(n.windFromDeg).toBeCloseTo(270, 3);
    expect(n.precipMm).toBeCloseTo(1, 5);
  });
  it('returns nothing when no hours fall in the window', () => {
    expect(summariseNight(hourly, { from: '2026-10-09T20:00', to: '2026-10-10T07:00' })).toBeUndefined();
  });
  it('averages wind directions around north correctly', () => {
    const h: Hourly = { ...hourly, wind_direction_10m: [0, 350, 10, 350, 10, 0, 0] };
    const n = summariseNight(h, nightWindow('2026-10-04T15:30'))!;
    expect(Math.min(n.windFromDeg, 360 - n.windFromDeg)).toBeLessThan(5);
  });
  it('names compass directions and tells Zurich time', () => {
    expect(COMPASS).toHaveLength(8);
    expect(compassName(359)).toBe('N');
    expect(compassName(225)).toBe('SW');
    expect(zurichNow(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01T12:00');
    expect(zurichNow(new Date('2026-01-01T10:00:00Z'))).toBe('2026-01-01T11:00');
  });
});

describe('distances and parsing on real fixtures', () => {
  const { e, n } = moiry;
  it('geometry distances', () => {
    expect(distanceTo({ type: 'Point', coordinates: [3, 4] }, 0, 0)).toBe(5);
    expect(distanceTo({ type: 'LineString', coordinates: [[-10, 3], [10, 3]] }, 0, 0)).toBe(3);
    expect(distanceTo({ type: 'Polygon', coordinates: [[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]] }, 0, 0)).toBe(0);
    expect(distanceTo({ type: 'Polygon', coordinates: [[[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]] }, 8, 0)).toBe(3);
    expect(distanceTo({ type: 'Polygon', coordinates: [[[-50, -50], [50, -50], [50, 50], [-50, 50], [-50, -50]], [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, -5]]] }, 0, 0)).toBe(5);
    expect(distanceTo(undefined, 0, 0)).toBe(Infinity);
  });
  it('finds Cabane de Moiry as a hut, a few hundred metres away, and a glacier is not a hut', () => {
    const r = parseNames(moiry.names as never, e, n);
    expect(r.huts[0]?.name).toMatch(/Cabane de Moiry/);
    expect(r.huts[0]!.meters).toBeGreaterThan(100);
    expect(r.huts[0]!.meters).toBeLessThan(300);
    expect(r.huts.every((h) => !/gletscher|glacier/i.test(h.name))).toBe(true);
  });
  it('finds trails and water near Moiry', () => {
    expect(minDistance(moiry.trails as never, e, n)).toBeLessThan(300);
    expect(minDistance(moiry.water as never, e, n)).toBeLessThan(400);
  });
  it('Zermatt centre: stops, settlement and trails', () => {
    const { e: ze, n: zn } = zermatt;
    const stops = parseStops(zermatt.stops as never, ze, zn);
    expect(stops.length).toBeGreaterThan(5);
    expect(stops[0]!.meters).toBeLessThan(150);
    expect(stops.map((s) => s.meters)).toEqual([...stops.map((s) => s.meters)].sort((a, b) => a - b));
    const names = parseNames(zermatt.names as never, ze, zn);
    expect(names.settlementM).toBeLessThan(50);
    expect(Array.isArray(names.huts)).toBe(true);
  });
  it('an empty response means nothing found', () => {
    expect(minDistance({ results: [] }, 0, 0)).toBeUndefined();
    expect(parseStops({}, 0, 0)).toEqual([]);
    expect(parseNames({}, 0, 0)).toEqual({ huts: [], settlementM: undefined, parkingM: undefined });
  });
});

describe('comfort rating', () => {
  const terrain = (over: Partial<TerrainMetrics> = {}): TerrainMetrics => ({
    elevation: 2400, slopeDeg: 3, horizon: [12, 12, 12, 12, 12, 12, 12, 12], meanHorizon: 12, tpi: 0, steepAboveM: undefined, dropNearM: undefined, ...over,
  });
  const quiet = { trailM: Infinity, huts: [], stops: [], settlementM: Infinity, parkingM: Infinity };
  const near: WaterInfo = { kind: 'stream', meters: 80, upstreamPlants: [], failed: [] };
  it('flat, sheltered, quiet, water: great', () => {
    const c = comfortFor({ terrain: terrain(), surroundings: quiet, water: near });
    expect(c.rating).toBe('great');
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['Flat ground', 'Sheltered by terrain', 'Likely quiet', 'Water close by']));
  });
  it('exposed ridge on a trail, steep: poor', () => {
    const c = comfortFor({ terrain: terrain({ slopeDeg: 18, meanHorizon: 1, tpi: 30, horizon: Array(8).fill(1) }), surroundings: { ...quiet, trailM: 5 } });
    expect(c.rating).toBe('poor');
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['Too steep to pitch', 'Exposed ridge or top', 'Likely busy']));
  });
  it('a hut and a bus stop make it busy', () => {
    const c = comfortFor({ surroundings: { ...quiet, huts: [{ name: 'Cabane X', meters: 120 }], stops: [{ name: 'Y', kind: 'Bus', meters: 300 }] } });
    const f = c.factors.find((x) => x.title === 'Likely busy')!;
    expect(f.tone).toBe('bad');
    expect(f.text).toMatch(/Cabane X/);
  });
  it('strong forecast wind is bad where open to it and fine where sheltered', () => {
    const night = { from: 'a', to: 'b', minTempC: 5, maxGustKmh: 70, meanWindKmh: 40, windFromDeg: 270, precipMm: 0, thunder: false };
    const open = [10, 10, 10, 10, 10, 10, 2, 10]; // W is open
    const shelt = [10, 10, 10, 10, 10, 10, 25, 10];
    const a = comfortFor({ terrain: terrain({ horizon: open }), night });
    const b = comfortFor({ terrain: terrain({ horizon: shelt }), night });
    expect(a.factors.find((x) => /open to it/.test(x.title))).toBeDefined();
    expect(b.factors.find((x) => /sheltered from it/.test(x.title))).toBeDefined();
    expect(a.score).toBeLessThan(b.score);
  });
  it('rain and frost are reported', () => {
    const c = comfortFor({ night: { from: 'a', to: 'b', minTempC: -9, maxGustKmh: 10, meanWindKmh: 5, windFromDeg: 0, precipMm: 6, thunder: false } });
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['Low of -9 °C', 'Rain forecast']));
    expect(c.rating).toBe('poor');
  });
  it('hazards from slopes', () => {
    const c = comfortFor({ terrain: terrain({ dropNearM: 20, steepAboveM: 60 }) });
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['Steep drop close by', 'Steep slope above']));
  });
  it('lists the checks that could not be made instead of treating them as good', () => {
    const c = comfortFor({});
    expect(c.missing).toEqual(['terrain (slope, wind shelter, hazards)', 'overnight forecast', 'crowds (trails, huts, transport)', 'water', 'huts nearby']);
    expect(c.factors).toEqual([]);
  });
  it('a hollow warns about cold air, and morning sun is reported', () => {
    const sunrise = new Date('2026-10-04T05:30:00Z');
    const c = comfortFor({ terrain: terrain({ tpi: -30 }), sun: { sunrise, sunOnSpot: new Date(sunrise.getTime() + 150 * 60000) } });
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['In a hollow']));
    expect(c.factors.some((f) => /^Morning sun at/.test(f.title))).toBe(true);
  });
  it('rating thresholds', () => {
    expect([5, 4, 3, 2, 1, 0, -1, -2].map(rate)).toEqual(['great', 'great', 'good', 'good', 'fair', 'fair', 'fair', 'poor']);
  });
});
