import { describe, expect, it } from 'vitest';
import spots from './fixtures/water-spots.json';
import { comfortFor } from '../src/comfort/comfort';
import { closestPoint, nearestSpring, nearestWater, upstreamPlants, type WaterInfo } from '../src/comfort/water';

type Spot = { e: number; n: number; water: never; info: WaterInfo; plants?: never };
const S = spots as unknown as Record<string, Spot>;

describe('nearest water from real hydrography responses', () => {
  it('finds a stream next to Capanna Barone, close by', () => {
    const w = nearestWater(S.barone!.water, S.barone!.e, S.barone!.n)!;
    expect(w.kind).toBe('stream');
    expect(w.meters).toBeLessThan(60);
    expect(w.gwl).toMatch(/^[A-Z]{2}\d{10}$/);
  });
  it('finds the stream in the Rhone glacier foreland', () => {
    const w = nearestWater(S.rhone!.water, S.rhone!.e, S.rhone!.n)!;
    expect(w.kind).toBe('stream');
    expect(w.meters).toBeGreaterThan(100);
    expect(w.meters).toBeLessThan(800);
  });
  it('names the Matter Vispa near Randa and returns a point on it', () => {
    const s = S.randa!;
    const w = nearestWater(s.water, s.e, s.n)!;
    expect(w.name).toBe('Matter Vispa');
    expect(Math.hypot(w.point[0]! - s.e, w.point[1]! - s.n)).toBeCloseTo(w.meters, 0);
  });
  it('ignores line types other than streams and finds nothing in an empty response', () => {
    const other = { results: [{ properties: { objektart: 7 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] };
    expect(nearestWater(other, 0, 0)).toBeUndefined();
    expect(nearestWater({}, 0, 0)).toBeUndefined();
  });
  it('treats polygons of type 101 as lakes, with distance 0 inside', () => {
    const lake = { results: [{ properties: { objektart: 101, name: 'Seeli' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] } }] };
    const w = nearestWater(lake, 50, 50)!;
    expect(w).toMatchObject({ kind: 'lake', name: 'Seeli', meters: 0 });
    expect(nearestWater(lake, 150, 50)!.meters).toBe(50);
  });
  it('closestPoint projects onto the nearest segment and clamps at the ends', () => {
    const line = { type: 'LineString', coordinates: [[0, 0], [10, 0]] };
    expect(closestPoint(line, 4, 3)).toEqual([4, 0]);
    expect(closestPoint(line, 20, 3)).toEqual([10, 0]);
    // a point geometry (most huts) is the target itself, never the caller's own position
    expect(closestPoint({ type: 'Point', coordinates: [1, 1] }, 5, 5)).toEqual([1, 1]);
    expect(closestPoint({ type: 'MultiPoint', coordinates: [[100, 0], [3, 4]] }, 0, 0)).toEqual([3, 4]);
  });
});

describe('treatment plants upstream, from the real plant register', () => {
  const s = S.randa!;
  const w = nearestWater(s.water, s.e, s.n)!;
  it('Matter Vispa at Randa lies below the Zermatt plant on the same watercourse', () => {
    const plants = upstreamPlants(s.plants!, w.gwl, 1400, s.e, s.n);
    expect(plants.map((p) => p.name)).toContain('ZERMATT');
    const z = plants.find((p) => p.name === 'ZERMATT')!;
    expect(z.meters).toBeGreaterThan(5000);
    expect(z.meters).toBeLessThan(10000);
    expect(z.sharePct).toBeGreaterThan(0);
  });
  it('is not flagged when the water is higher than the plant, or on another watercourse, or without an elevation', () => {
    expect(upstreamPlants(s.plants!, w.gwl, 1700, s.e, s.n)).toEqual([]);
    expect(upstreamPlants(s.plants!, 'CH9999990000', 1400, s.e, s.n)).toEqual([]);
    expect(upstreamPlants(s.plants!, w.gwl, undefined, s.e, s.n)).toEqual([]);
    expect(upstreamPlants(s.plants!, undefined, 1400, s.e, s.n)).toEqual([]);
  });
});

describe('what each kind of water does to the comfort result', () => {
  const water = (over: Partial<WaterInfo>): WaterInfo => ({ kind: 'stream', meters: 100, upstreamPlants: [], failed: [], ...over });
  const run = (w: WaterInfo | undefined) => comfortFor({ water: w });
  const titles = (w: WaterInfo | undefined) => run(w).factors.map((f) => f.title);
  it('proximity bands score 2, 1, 0 and -1', () => {
    const score = (w: WaterInfo) => comfortFor({ water: w }).score;
    expect(score(water({ meters: 100 }))).toBe(2);
    expect(score(water({ meters: 300 }))).toBe(1);
    expect(score(water({ meters: 600 }))).toBe(0);
    expect(score(water({ kind: 'none', meters: Infinity }))).toBe(-1);
    expect(score(water({ meters: 10 }))).toBe(0); // right beside: handy, but noisy, damp and flooding: no better than none
  });
  it('a stream beside the tent is a risk, not a plus, when heavy rain or a storm is forecast', () => {
    const night = (extra: object) => ({ from: 'a', to: 'b', minTempC: 8, maxGustKmh: 20, meanWindKmh: 10, windFromDeg: 0, precipMm: 0, thunder: false, ...extra });
    const dry = comfortFor({ water: water({ meters: 30 }), night: night({}) });
    const wet = comfortFor({ water: water({ meters: 30 }), night: night({ precipMm: 12 }) });
    expect(wet.score).toBeLessThan(dry.score);
    expect(wet.alerts.map((a) => a.title)).toContain('Stream beside the spot may rise tonight');
    expect(dry.alerts.map((a) => a.title)).not.toContain('Stream beside the spot may rise tonight');
    // moderate rain: a warning in the details, not an alert on the first view
    const some = comfortFor({ water: water({ meters: 30 }), night: night({ precipMm: 6 }) });
    expect(some.factors.map((f) => f.title)).toContain('Stream beside the spot may rise tonight');
    expect(some.alerts.map((a) => a.title)).not.toContain('Stream beside the spot may rise tonight');
    // far from the stream, or a lake: no such risk
    expect(comfortFor({ water: water({ meters: 200 }), night: night({ precipMm: 12 }) }).factors.map((f) => f.title)).not.toContain('Stream beside the spot may rise tonight');
    expect(comfortFor({ water: water({ meters: 30, kind: 'lake' }), night: night({ precipMm: 12 }) }).factors.map((f) => f.title)).not.toContain('Stream beside the spot may rise tonight');
  });
  it('glacier water right beside the spot counts against it (it rises in the evening); further away it does not', () => {
    const near = comfortFor({ water: water({ meters: 30, glacierM: 400 }) });
    const far = comfortFor({ water: water({ meters: 120, glacierM: 400 }) });
    expect(near.factors.find((f) => f.title === 'Glacier water')).toBeDefined();
    expect(near.score).toBeLessThan(comfortFor({ water: water({ meters: 30 }) }).score);
    expect(far.score).toBe(comfortFor({ water: water({ meters: 120 }) }).score);
  });
  it('titles by distance', () => {
    expect(titles(water({ meters: 10 }))).toContain('Water right beside the spot');
    expect(titles(water({ meters: 100 }))).toContain('Water close by');
    expect(titles(water({ meters: 300 }))).toContain('Water within 400 m');
    expect(titles(water({ meters: 600 }))).toContain('Water 400 to 800 m away');
    expect(titles(water({ kind: 'none', meters: Infinity }))).toContain('No water found nearby');
  });
  it('names a lake or stream', () => {
    expect(run(water({ kind: 'lake', name: 'Lai da Tuma', meters: 100 })).factors[0]!.text).toMatch(/lake Lai da Tuma/);
  });
  it('flags glacier water: certain within 1 km, possible within 3 km, nothing otherwise', () => {
    expect(titles(water({ glacierM: 1000 }))).toContain('Glacier water');
    expect(titles(water({ glacierM: 3000 }))).toContain('Possibly glacier water');
    expect(titles(water({}))).not.toContain('Glacier water');
    expect(run(water({ glacierM: 1000 })).factors.find((f) => f.title === 'Glacier water')!.text).toMatch(/milky/);
  });
  it('flags dirty water when a treatment plant discharges upstream, and never counts it as good', () => {
    const w = water({ upstreamPlants: [{ name: 'ZERMATT', meters: 7660, sharePct: 4.055, receiving: 'Vispa' }] });
    const f = run(w).factors.find((x) => x.title.startsWith('Dirty water'))!;
    expect(f.tone).toBe('bad');
    expect(f.text).toMatch(/ZERMATT/);
    expect(f.text).toMatch(/7\.7 km upstream/);
    expect(f.text).toMatch(/4 %/);
    expect(run(w).score).toBe(run(water({})).score - 1);
  });
  it('lists failed lookups as missing and does not flag anything for them', () => {
    const c = run(water({ failed: ['plants', 'glacier'] }));
    expect(c.missing).toEqual(expect.arrayContaining(['treatment plants upstream', 'glacier water check']));
    expect(c.factors.map((f) => f.title)).not.toContain('Glacier water');
    expect(run(water({ kind: 'none', meters: Infinity, failed: ['water'] })).missing).toContain('water');
    expect(run(undefined).missing).toContain('water');
    expect(run(water({})).missing).not.toContain('water');
  });
  it('reminds to treat surface water', () => {
    expect(run(water({ meters: 100 })).factors[0]!.text).toMatch(/Treat or filter/);
  });
});

describe('springs from the geological map', () => {
  const pt = (e: number, n: number, kind: string, spec?: string) => ({ geometry: { type: 'MultiPoint', coordinates: [[e, n, 1300]] }, properties: { kind_de: kind, spec_de: spec } });
  it('finds the nearest spring and says whether it is captured', () => {
    const body = { results: [pt(2619391.9, 1149535.1, 'Quelle', 'gefasst'), pt(2619100, 1149500, 'Quelle', 'nicht gefasst'), pt(2619300, 1149500, 'Orientierung der Schichten')] };
    const s = nearestSpring(body as never, 2619400, 1149500)!;
    expect(s.captured).toBe(true);
    expect(s.meters).toBeCloseTo(Math.hypot(8.1, 35.1), 0);
    expect(s.at).toEqual({ e: 2619391.9, n: 1149535.1 });
  });
  it('counts a diffuse spring, ignores every other kind of point, and finds nothing in an empty answer', () => {
    expect(nearestSpring({ results: [pt(10, 10, 'diffuse Quelle')] } as never, 0, 0)!.captured).toBe(false);
    expect(nearestSpring({ results: [pt(10, 10, 'Sturzblock'), pt(5, 5, 'Versickerungsstelle eines Baches')] } as never, 0, 0)).toBeUndefined();
    expect(nearestSpring({ results: [] }, 0, 0)).toBeUndefined();
    expect(nearestSpring({}, 0, 0)).toBeUndefined();
  });
  it('reads a plain point too, and skips a feature without a position', () => {
    const plain = { geometry: { type: 'Point', coordinates: [30, 40] }, properties: { kind_de: 'Quelle' } };
    expect(nearestSpring({ results: [plain, { properties: { kind_de: 'Quelle' } }] } as never, 0, 0)!.meters).toBe(50);
  });
});

describe('water items with a spring', () => {
  const info = (over: Partial<WaterInfo>): WaterInfo => ({ kind: 'none', meters: Infinity, upstreamPlants: [], failed: [], ...over });
  const titles = (w: WaterInfo) => comfortFor({ water: w }).spotFactors.map((f) => f.title);
  it('no mapped water but a spring: an information item instead of a warning, and no score loss', () => {
    const w = info({ spring: { meters: 350, captured: true, at: { e: 1, n: 2 } } });
    expect(titles(w)).toContain('A mapped spring nearby');
    expect(titles(w)).not.toContain('No water found nearby');
    const c = comfortFor({ water: w });
    expect(c.spotFactors.find((f) => f.title === 'A mapped spring nearby')).toMatchObject({ tone: 'info' });
    expect(c.spotFactors.find((f) => f.title === 'A mapped spring nearby')!.text).toContain('(captured)');
    // the missing water costs a point; a mapped spring does not give it back as a stream would, but it does not cost it either
    expect(c.score).toBe(comfortFor({ water: info({}) }).score + 1);
  });
  it('no mapped water and no spring is still a warning', () => {
    expect(titles(info({}))).toContain('No water found nearby');
  });
  it('water that is far and a spring that is much closer: both are said', () => {
    const w = info({ kind: 'stream', meters: 700, spring: { meters: 200, captured: false, at: { e: 1, n: 2 } } });
    expect(titles(w)).toEqual(expect.arrayContaining(['Water 400 to 800 m away', 'A mapped spring is closer']));
  });
  it('water close by needs no spring item', () => {
    expect(titles(info({ kind: 'stream', meters: 60, spring: { meters: 30, captured: false, at: { e: 1, n: 2 } } }))).not.toContain('A mapped spring is closer');
  });
});
