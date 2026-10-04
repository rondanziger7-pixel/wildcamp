import { describe, expect, it } from 'vitest';
import tile from './fixtures/cover-tile.json';
import { CANDIDATE_RADIUS_M, MIN_SEPARATION_M, STEP, bearingTo, compass8, gridFromProfile, makeGrid, parseCoverTile, profilesAt, rankCells, serpentine, withWater, zAt, type Grid } from '../src/finder';
import type { Cover } from '../src/comfort/ground';

const CE = 2622000;
const CN = 1150000;

/** A grid of the synthetic surface z(e, n) around the centre. */
function surface(z: (e: number, n: number) => number): Grid {
  const base = makeGrid(CE, CN);
  const path = serpentine(base);
  return gridFromProfile(base, path.map(([e, n]) => z(e, n)));
}

describe('grid', () => {
  it('snaps to multiples of 100 m and covers the radius', () => {
    const g = makeGrid(2622049, 1149951);
    expect(g.e0 % STEP).toBe(0);
    expect(g.n0 % STEP).toBe(0);
    expect(g.size).toBe(23);
    expect(g.e0).toBe(2622000 - 1100);
  });
  it('serpentine visits every node once, reversing odd rows, and round-trips to row-major', () => {
    const base = makeGrid(CE, CN);
    const path = serpentine(base);
    expect(path).toHaveLength(base.size * base.size);
    expect(new Set(path.map((p) => p.join(','))).size).toBe(path.length);
    expect(path[base.size]).toEqual([base.e0 + (base.size - 1) * STEP, base.n0 + STEP]); // row 1 starts at the east end
    const g = gridFromProfile(base, path.map(([e, n]) => e * 0.001 + n * 0.002));
    for (const [i, j] of [[0, 0], [5, 1], [22, 22], [3, 7]] as const) expect(g.z[j * g.size + i]).toBeCloseTo((g.e0 + i * STEP) * 0.001 + (g.n0 + j * STEP) * 0.002, 6);
    expect(() => gridFromProfile(base, [1, 2, 3])).toThrow();
  });
  it('interpolates bilinearly and gives NaN outside', () => {
    const g = surface((e, n) => 0.1 * (e - CE) + 0.2 * (n - CN));
    expect(zAt(g, CE + 30, CN + 70)).toBeCloseTo(3 + 14, 6);
    expect(zAt(g, CE + 5000, CN)).toBeNaN();
  });
  it('builds the four profile lines at 100 m spacing through a node', () => {
    const g = surface((e) => (e - CE) * 0.1);
    const p = profilesAt(g, CE, CN);
    expect(p.step).toBe(STEP);
    expect(p.ew).toHaveLength(21);
    expect(p.ew[10]).toBeCloseTo(0, 6);
    expect(p.ew[11]! - p.ew[10]!).toBeCloseTo(10, 6);
    expect(p.ns[11]! - p.ns[10]!).toBeCloseTo(0, 6);
  });
});

describe('ground cover tiles (real response)', () => {
  it('reads one class per sample point', () => {
    const m = parseCoverTile(tile as never);
    expect(m.size).toBe(25);
    const first = m.get(`${CE},${CN}`);
    expect(first).toBeDefined();
    expect(first!.cover).toMatch(/^(water|grass|rock|loose|shrub|forest|wet|built|other|glacier)$/);
    expect([...m.values()].some((v) => v.cover === 'water')).toBe(true); // the tile reaches into Oeschinensee
  });
  it('keeps the latest year when a point has several', () => {
    const f = (year: number, d: string) => ({ geometry: { type: 'Point', coordinates: [1, 2] }, properties: { year, desc_lc09r_27_en: d } });
    expect(parseCoverTile({ results: [f(1990, 'Solid rock'), f(2023, 'Grass and herb vegetation'), f(2004, 'Shrubs')] }).get('1,2')?.cover).toBe('grass');
    expect(parseCoverTile({}).size).toBe(0);
  });
});

describe('ranking', () => {
  const flat = surface(() => 2000);
  const covers = (f: (e: number, n: number) => Cover) => {
    const m = new Map<string, { cover: Cover; label: string }>();
    for (let e = CE - 1100; e <= CE + 1100; e += STEP) for (let n = CN - 1100; n <= CN + 1100; n += STEP) m.set(`${e},${n}`, { cover: f(e, n), label: f(e, n) });
    return m;
  };
  it('prefers grass to rock on otherwise identical flat ground', () => {
    const c = rankCells(flat, { e: CE, n: CN }, covers((e) => (e < CE ? 'grass' : 'rock')), 5);
    expect(c[0]!.cover).toBe('grass');
    expect(c.every((x) => x.cover !== 'rock') || c.findIndex((x) => x.cover === 'rock') > c.findIndex((x) => x.cover === 'grass')).toBe(true);
  });
  it('never offers glacier, water, built-up or wet cover', () => {
    const c = rankCells(flat, { e: CE, n: CN }, covers((e, n) => (e > CE && n > CN ? 'grass' : (['glacier', 'water', 'built', 'wet'] as const)[(e / STEP + n / STEP) % 4]!)), 50);
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.cover === 'grass')).toBe(true);
  });
  it('drops steep ground and keeps candidates apart and inside the radius', () => {
    const slope = surface((e) => (e < CE ? 2000 + (CE - e) * 0.6 : 2000)); // steep on the west half, flat on the east
    const c = rankCells(slope, { e: CE, n: CN }, new Map(), 12);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((x) => x.terrain.slopeDeg < 18)).toBe(true);
    expect(c.every((x) => x.e >= CE - STEP)).toBe(true);
    for (const x of c) expect(x.meters).toBeLessThanOrEqual(CANDIDATE_RADIUS_M);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i]!.e - c[j]!.e, c[i]!.n - c[j]!.n)).toBeGreaterThanOrEqual(MIN_SEPARATION_M);
  });
  it('prefers a sheltered flat to an exposed knoll, and rescoring with water moves the score', () => {
    const bowl = surface((e, n) => 2000 + 0.12 * Math.min(Math.hypot(e - CE, n - CN), 1100)); // flat middle, rising all round
    const c = rankCells(bowl, { e: CE, n: CN }, new Map(), 3);
    expect(c[0]!.meters).toBeLessThan(300);
    const base = c[0]!.comfort.score;
    const near = withWater(c[0]!, { kind: 'stream', meters: 80, upstreamPlants: [], failed: [] });
    expect(near.score).toBe(base + 2 - 0);
  });
  it('returns nothing when everything is steep', () => {
    const wall = surface((e) => 2000 + (e - CE) * 0.8);
    expect(rankCells(wall, { e: CE, n: CN }, new Map(), 5)).toEqual([]);
  });
});

describe('bearings', () => {
  it('names the compass point', () => {
    expect(bearingTo(0, 100)).toBe(0);
    expect(bearingTo(100, 0)).toBe(90);
    expect(bearingTo(-100, -100)).toBe(225);
    expect(compass8(225)).toBe('SW');
    expect(compass8(359)).toBe('N');
  });
});
