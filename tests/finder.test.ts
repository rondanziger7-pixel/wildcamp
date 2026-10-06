import { describe, expect, it } from 'vitest';
import tile from './fixtures/cover-tile.json';
import { fetchElevationGrid, CANDIDATE_RADIUS_M, FINDER_RADII, MIN_SEPARATION_M, elevationRadiusFor, separationFor, STEP, bearingTo, compass8, gridFromProfile, makeGrid, parseCoverTile, profilesAt, rankCells, serpentine, withWater, zAt, type Grid } from '../src/finder';
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

describe('elevation request', () => {
  it('posts a string body with the exact form content type (the service answers 415 to ";charset=UTF-8")', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const g = makeGrid(CE, CN);
    const body = JSON.stringify(serpentine(g).map(() => ({ alts: { COMB: 1500 } })));
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    try {
      const grid = await fetchElevationGrid(CE, CN);
      expect(grid.size).toBe(23);
    } finally {
      globalThis.fetch = real;
    }
    expect(seen!.url).toBe('https://api3.geo.admin.ch/rest/services/profile.json');
    expect(seen!.init.method).toBe('POST');
    expect(seen!.init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(typeof seen!.init.body).toBe('string');
    const form = new URLSearchParams(seen!.init.body as string);
    expect(form.get('nbPoints')).toBe('529');
    expect(form.get('distinct_points')).toBe('true');
    expect(JSON.parse(form.get('geom')!).coordinates).toHaveLength(529);
  });
  it('reports the HTTP status when the service refuses', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response('no', { status: 415 })) as typeof fetch;
    try {
      await expect(fetchElevationGrid(CE, CN)).rejects.toThrow('profile 415');
    } finally {
      globalThis.fetch = real;
    }
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

describe('a wider search', () => {
  const R = 1500;
  const E_R = elevationRadiusFor(R);
  const wide = (() => {
    const base = makeGrid(CE, CN, E_R);
    return gridFromProfile(base, serpentine(base).map(() => 2000));
  })();
  it('offers the default and 1.5 km, reads 400 m beyond the candidates, and keeps wider candidates further apart', () => {
    expect([...FINDER_RADII]).toEqual([CANDIDATE_RADIUS_M, 1500]);
    expect(elevationRadiusFor(CANDIDATE_RADIUS_M)).toBe(1100);
    expect(E_R).toBe(1900);
    expect(makeGrid(CE, CN, E_R).size).toBe(39); // one request of 1521 points
    expect(separationFor(CANDIDATE_RADIUS_M)).toBe(MIN_SEPARATION_M);
    expect(separationFor(R)).toBeGreaterThan(MIN_SEPARATION_M);
  });
  it('finds candidates out to the radius asked for and not beyond it', () => {
    const c = rankCells(wide, { e: CE, n: CN }, new Map(), 40, R, separationFor(R));
    expect(Math.max(...c.map((x) => x.meters))).toBeGreaterThan(CANDIDATE_RADIUS_M);
    for (const x of c) expect(x.meters).toBeLessThanOrEqual(R);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i]!.e - c[j]!.e, c[i]!.n - c[j]!.n)).toBeGreaterThanOrEqual(separationFor(R));
  });
  it('the default radius is unchanged', () => {
    const c = rankCells(wide, { e: CE, n: CN }, new Map(), 40);
    for (const x of c) expect(x.meters).toBeLessThanOrEqual(CANDIDATE_RADIUS_M);
  });
  it('requests the elevation grid of the radius asked for', async () => {
    let points = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      points = Number(body.get('nbPoints'));
      return new Response(JSON.stringify(Array.from({ length: points }, () => ({ alts: { COMB: 2000 } }))), { status: 200 });
    }) as typeof fetch;
    try {
      await fetchElevationGrid(CE, CN, undefined, E_R);
    } finally {
      globalThis.fetch = real;
    }
    expect(points).toBe(39 * 39);
  });
});

describe('walking time to a candidate', () => {
  it('is Naismith over the straight line: 4 km/h flat, ten minutes more per 100 m climbed, none saved on the way down', () => {
    // 1 m of height per 2 m east: the east side climbs, the west side descends
    const hill = surface((e) => 2000 + (e - CE) * 0.05);
    const all = rankCells(hill, { e: CE, n: CN }, new Map(), 60);
    const east = all.filter((c) => c.e > CE + 400)[0]!;
    const west = all.filter((c) => c.e < CE - 400)[0]!;
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    const flatMin = (d: number) => (d / 4000) * 60;
    expect(east.walkMin!).toBeGreaterThan(flatMin(east.meters) + 1);
    expect(west.walkMin!).toBeCloseTo(flatMin(west.meters), 5);
  });
  it('is the flat walking time on level ground', () => {
    const c = rankCells(surface(() => 2000), { e: CE, n: CN }, new Map(), 5)[0]!;
    expect(c.walkMin).toBeCloseTo((c.meters / 4000) * 60, 5);
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

describe('ground names in the language of the page', () => {
  const body = { results: [{ geometry: { type: 'Point', coordinates: [2622000, 1150000] }, properties: { year: 2023, desc_lc09r_27_en: 'Grass and herb vegetation', desc_lc09r_27_de: 'Gras-, Krautvegetation', desc_lc09r_27_fr: 'Végétation herbacée', desc_lc09r_27_it: 'Vegetazione erbacea' } }] };
  it('keeps the class from the English name and shows the name in the language', async () => {
    const { setLangForTest } = await import('../src/i18n');
    try {
      expect([...parseCoverTile(body as never).values()][0]).toEqual({ cover: 'grass', label: 'Grass and herb vegetation' });
      setLangForTest('de');
      expect([...parseCoverTile(body as never).values()][0]).toEqual({ cover: 'grass', label: 'Gras-, Krautvegetation' });
      setLangForTest('fr');
      expect([...parseCoverTile(body as never).values()][0]!.label).toBe('Végétation herbacée');
      setLangForTest('it');
      expect([...parseCoverTile(body as never).values()][0]!.label).toBe('Vegetazione erbacea');
    } finally {
      setLangForTest('en');
    }
  });
  it('falls back to English where the service has no name in the language', async () => {
    const { setLangForTest } = await import('../src/i18n');
    try {
      setLangForTest('de');
      const only = { results: [{ geometry: { type: 'Point', coordinates: [1, 2] }, properties: { year: 2023, desc_lc09r_27_en: 'Solid rock' } }] };
      expect([...parseCoverTile(only as never).values()][0]).toEqual({ cover: 'rock', label: 'Solid rock' });
    } finally {
      setLangForTest('en');
    }
  });
});
