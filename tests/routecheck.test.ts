import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  altitudeAt,
  cellAt,
  classifySamples,
  gatherRouteInputs,
  inGeometry,
  locateAlong,
  nearestLegal,
  positionAt,
  queryChunks,
  reportFor,
  reportForDates,
  shares,
  stretchesOf,
  type Cell,
  type RouteFeature,
  type RouteGeometry,
  type RouteInputs,
  type Sample,
} from '../src/routecheck';
import { LocalData } from '../src/localstore';
import { lv95ToWgs84 } from '../src/coords';
import { haversineM, lengthM, type RoutePoint } from '../src/route';

const square = (e0: number, n0: number, e1: number, n1: number): number[][] => [[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]];

describe('outlines', () => {
  const donut: RouteGeometry = { type: 'Polygon', coordinates: [square(0, 0, 100, 100), square(40, 40, 60, 60)] };
  it('contain a point, except in a hole', () => {
    expect(inGeometry(donut, 10, 10)).toBe(true);
    expect(inGeometry(donut, 50, 50)).toBe(false); // the hole
    expect(inGeometry(donut, 150, 50)).toBe(false);
  });
  it('can be several polygons, and reject by bounding box first', () => {
    const multi: RouteGeometry = { type: 'MultiPolygon', coordinates: [[square(0, 0, 10, 10)], [square(100, 100, 110, 110)]] };
    expect(inGeometry(multi, 105, 105)).toBe(true);
    expect(inGeometry(multi, 50, 50)).toBe(false);
    expect(inGeometry(multi, 5, 5, [100, 100, 110, 110])).toBe(false); // outside the stated box: not even looked at
    expect(inGeometry(undefined, 1, 1)).toBe(false);
  });
});

/** A straight line of `n` points about `stepM` apart from the Gasterntal heading east (WGS84). */
function line(n: number, stepM = 100, ele?: (i: number) => number | undefined): RoutePoint[] {
  const out: RoutePoint[] = [];
  const dLon = stepM / (111320 * Math.cos((46.5 * Math.PI) / 180));
  for (let i = 0; i < n; i++) out.push({ lat: 46.5, lon: 7.7 + i * dLon, ele: ele?.(i) });
  return out;
}

describe('pieces of the route for the requests', () => {
  it('a long route is cut into pieces of at most 30 km that share their ends', () => {
    const pts = line(1001, 100); // 100 km
    const chunks = queryChunks(pts);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks[0]!.fromM).toBe(0);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.fromM).toBe(chunks[i - 1]!.toM);
    for (const c of chunks) expect(c.toM - c.fromM).toBeLessThanOrEqual(30_000 + 1);
    expect(chunks[chunks.length - 1]!.toM).toBeCloseTo(lengthM(pts), 0);
  });
  it('simplifies each piece to the vertex limit and writes the points in LV95', () => {
    const zig = Array.from({ length: 4000 }, (_, i) => ({ lat: 46.5 + (i % 2 ? 0.0004 : 0) + i * 0.00001, lon: 7.7 + i * 0.00002 }));
    for (const c of queryChunks(zig)) {
      expect(c.path.length).toBeLessThanOrEqual(120);
      for (const [e, n] of c.path) {
        expect(e).toBeGreaterThan(2_600_000);
        expect(e).toBeLessThan(2_700_000);
        expect(n).toBeGreaterThan(1_100_000);
        expect(n).toBeLessThan(1_250_000);
      }
    }
  });
  it('a short route is one piece; fewer than two points gives none', () => {
    expect(queryChunks(line(50, 100))).toHaveLength(1);
    expect(queryChunks(line(1))).toEqual([]);
    expect(queryChunks([])).toEqual([]);
  });
  it('keeps the first and last point of every piece', () => {
    const pts = line(300, 100);
    const [a, b] = queryChunks(pts, { chunkM: 15_000 });
    expect(a!.path[0]).toEqual(queryChunks(pts, { chunkM: 1e9 })[0]!.path[0]);
    expect(b!.path[b!.path.length - 1]).toEqual(queryChunks(pts, { chunkM: 1e9 })[0]!.path.at(-1));
  });
});

describe('heights along a profile', () => {
  const prof = [{ dist: 0, alt: 1000 }, { dist: 100, alt: 1100 }, { dist: 300, alt: 1300 }];
  it('are interpolated by the share of the way', () => {
    expect(altitudeAt(prof, 0)).toBe(1000);
    expect(altitudeAt(prof, 1)).toBe(1300);
    expect(altitudeAt(prof, 100 / 300)).toBeCloseTo(1100, 5);
    expect(altitudeAt(prof, 200 / 300)).toBeCloseTo(1200, 5);
    expect(altitudeAt(prof, -1)).toBe(1000);
    expect(altitudeAt(prof, 7)).toBe(1300);
    expect(altitudeAt([], 0.5)).toBeUndefined();
  });
});

describe('telling a few values apart along the route with few lookups', () => {
  const samples = Array.from({ length: 200 }, (_, i) => ({ distM: i * 250 })); // 50 km
  it('finds where the answer changes, to the fine step, with a handful of lookups', async () => {
    let calls = 0;
    const out = await locateAlong(samples, async (i) => (calls++, samples[i]!.distM < 12_300 ? 'BE' : samples[i]!.distM < 31_000 ? 'VS' : 'TI'));
    expect(out[0]).toBe('BE');
    expect(out[199]).toBe('TI');
    const firstVs = out.findIndex((v) => v === 'VS');
    const firstTi = out.findIndex((v) => v === 'TI');
    expect(Math.abs(samples[firstVs]!.distM - 12_300)).toBeLessThanOrEqual(250);
    expect(Math.abs(samples[firstTi]!.distM - 31_000)).toBeLessThanOrEqual(250);
    expect(calls).toBeLessThan(40);
  });
  it('one canton all the way costs only the coarse grid', async () => {
    let calls = 0;
    const out = await locateAlong(samples, async () => (calls++, 'BE'));
    expect(new Set(out)).toEqual(new Set(['BE']));
    expect(calls).toBeLessThanOrEqual(14);
  });
  it('a lookup that fails leaves unknown, not a guess, and never throws', async () => {
    const out = await locateAlong(samples, async () => { throw new Error('offline'); });
    expect(out.every((v) => v === undefined)).toBe(true);
  });
  it('stops asking when the budget is spent', async () => {
    let calls = 0;
    await locateAlong(samples, async (i) => (calls++, i % 2 ? 'A' : 'B'), { maxLookups: 20 });
    expect(calls).toBeLessThanOrEqual(30); // the coarse grid is always asked; refining stops with the budget
  });
  it('handles no samples', async () => {
    expect(await locateAlong([], async () => 'x')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

const loaded = async () => {
  const d = new LocalData('/', { forest: async () => undefined as never, treeline: async () => undefined as never, reserve: async () => ({ canton: 'XX', generated: 'test', reserves: [] }) });
  await d.load();
  return d;
};

/** 40 samples 250 m apart along E from (2'620'000, 1'150'000) at the given elevation. */
function samplesAt(ele: number | undefined, count = 40): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const e = 2_620_000 + i * 250;
    const n = 1_150_000;
    const { lat, lon } = lv95ToWgs84(e, n);
    return { distM: i * 250, lat, lon, e, n, ele };
  });
}
const inputs = (over: Partial<RouteInputs> = {}): RouteInputs => {
  const samples = over.samples ?? samplesAt(2500);
  return { samples, zones: [], municipalities: [], cantonAt: samples.map(() => 'BE'), failed: [], ...over };
};
const wrz = (name: string, schutzzeit: string, g: number[][]): RouteFeature => ({
  layerBodId: 'ch.bafu.wrz-wildruhezonen_portal',
  featureId: name,
  attributes: { name, label: name, schutzzeit, best_de: 'Zutrittsverbot', schutzs_de: 'rechtsverbindlich' },
  geometry: { type: 'Polygon', coordinates: [g] },
  bbox: [Math.min(...g.map((p) => p[0]!)), Math.min(...g.map((p) => p[1]!)), Math.max(...g.map((p) => p[0]!)), Math.max(...g.map((p) => p[1]!))],
});
const WINTER = new Date(2027, 0, 20, 12);
const SUMMER = new Date(2027, 6, 20, 12);
const cls = (cells: Cell[]) => cells.map((c) => c.cls[0]).join('');

describe('judging every point of the route', () => {
  it('open ground above the treeline is fine everywhere', async () => {
    const cells = classifySamples(inputs(), await loaded(), SUMMER);
    expect(new Set(cells.map((c) => c.cls))).toEqual(new Set(['ok']));
  });
  it('the stretch inside a wildlife zone is banned, and only that stretch', async () => {
    const zone = wrz('Winterzone', '15.12. - 15.04.', square(2_620_000 + 5 * 250 - 10, 1_149_900, 2_620_000 + 12 * 250 + 10, 1_150_100));
    const winter = classifySamples(inputs({ zones: [zone] }), await loaded(), WINTER);
    expect(cls(winter).slice(0, 20)).toBe('oooooxxxxxxxxooooooo'.replace(/x/g, 'b'));
    expect(winter[5]!.cause).toBe('zone');
    expect(winter[5]!.why).toContain('Winterzone');
    // the same zone out of season does not ban anything
    const summer = classifySamples(inputs({ zones: [zone] }), await loaded(), SUMMER);
    expect(summer.some((c) => c.cls === 'ban')).toBe(false);
  });
  it('a municipality with a recorded ban bans the stretch inside its outline', async () => {
    const kandersteg = { name: 'Kandersteg', bfs: 565, canton: 'BE', featureId: 565, geometry: { type: 'Polygon', coordinates: [square(2_620_000 + 10 * 250 - 10, 1_149_000, 2_620_000 + 20 * 250 + 10, 1_151_000)] } as RouteGeometry };
    const cells = classifySamples(inputs({ municipalities: [kandersteg] }), await loaded(), SUMMER);
    expect(cls(cells).slice(8, 23)).toBe('oo' + 'b'.repeat(11) + 'oo'); // samples 10 to 20 lie inside the outline
    expect(cells[12]).toMatchObject({ cls: 'ban', cause: 'municipality', why: 'Municipal rule: Kandersteg' });
  });
  it('a municipality without a rule changes nothing', async () => {
    const other = { name: 'Nowhere', bfs: 99999, canton: 'BE', geometry: { type: 'Polygon', coordinates: [square(2_600_000, 1_100_000, 2_700_000, 1_200_000)] } as RouteGeometry };
    const cells = classifySamples(inputs({ municipalities: [other] }), await loaded(), SUMMER);
    expect(new Set(cells.map((c) => c.cls))).toEqual(new Set(['ok']));
  });
  it('a canton that restricts camping makes its part a caution, unless its own rule tolerates open ground above the treeline', async () => {
    const samples = samplesAt(2500);
    const vaud = classifySamples(inputs({ samples, cantonAt: samples.map((_, i) => (i < 20 ? 'BE' : 'VD')) }), await loaded(), SUMMER);
    expect(vaud[10]!.cls).toBe('ok');
    expect(vaud[30]).toMatchObject({ cls: 'caution', cause: 'canton' });
    // Ticino allows a bivouac in the mountains: above the treeline it is no caution
    const ticino = classifySamples(inputs({ samples, cantonAt: samples.map(() => 'TI') }), await loaded(), SUMMER);
    expect(ticino[30]!.cls).toBe('ok');
  });
  it('below the treeline is a caution, close to it too, and no height at all is unknown', async () => {
    const below = classifySamples(inputs({ samples: samplesAt(900) }), await loaded(), SUMMER);
    expect(below[0]).toMatchObject({ cls: 'caution', cause: 'treeline' });
    const band = classifySamples(inputs({ samples: samplesAt(1900) }), await loaded(), SUMMER);
    expect(band[0]).toMatchObject({ cls: 'caution', cause: 'treeline' });
    const none = classifySamples(inputs({ samples: samplesAt(undefined) }), await loaded(), SUMMER);
    expect(none[0]).toMatchObject({ cls: 'unknown', cause: 'unknown' });
  });
  it('points that lie outside Switzerland are not judged: unknown, said so', async () => {
    const samples = samplesAt(2500);
    const cells = classifySamples(inputs({ samples, cantonAt: samples.map((_, i) => (i < 30 ? 'BE' : 'OUT')) }), await loaded(), SUMMER);
    expect(cells[10]!.cls).toBe('ok');
    expect(cells[35]).toMatchObject({ cls: 'unknown', cause: 'unknown', why: 'Outside Switzerland' });
  });
  it('a ban wins over a caution at the same point', async () => {
    const zone = wrz('Z', '01.01. - 31.12.', square(2_619_000, 1_149_000, 2_631_000, 1_151_000));
    const cells = classifySamples(inputs({ zones: [zone], samples: samplesAt(900) }), await loaded(), SUMMER);
    expect(cells[3]!.cls).toBe('ban');
  });
  it('is the same verdict as for a single spot: the same assess, the same words', async () => {
    const zone = wrz('Zone Y', '01.01. - 31.12.', square(2_619_000, 1_149_000, 2_631_000, 1_151_000));
    const cell = classifySamples(inputs({ zones: [zone] }), await loaded(), SUMMER)[0]!;
    expect(cell.why).toContain('Zone Y');
  });
});

describe('stretches, shares and the nearest legal place', () => {
  const cell = (distM: number, c: Cell['cls'], why = '', cause: Cell['cause'] = 'none'): Cell => ({ distM, cls: c, cause, why });
  const cells = [cell(0, 'ok'), cell(250, 'ok'), cell(500, 'ban', 'Zone A', 'zone'), cell(750, 'ban', 'Zone A', 'zone'), cell(1000, 'caution', 'Below the treeline', 'treeline'), cell(1250, 'ok'), cell(1500, 'ban', 'Zone B', 'zone'), cell(1750, 'ok')];
  it('merges runs with the same finding and ends each at the next cell', () => {
    expect(stretchesOf(cells, 2000)).toEqual([
      { fromM: 500, toM: 1000, cls: 'ban', cause: 'zone', why: 'Zone A' },
      { fromM: 1000, toM: 1250, cls: 'caution', cause: 'treeline', why: 'Below the treeline' },
      { fromM: 1500, toM: 1750, cls: 'ban', cause: 'zone', why: 'Zone B' },
    ]);
  });
  it('two different zones in a row stay two stretches', () => {
    const two = [cell(0, 'ban', 'A', 'zone'), cell(250, 'ban', 'B', 'zone')];
    expect(stretchesOf(two, 500)).toHaveLength(2);
  });
  it('the last cell runs to the end of the route', () => {
    expect(stretchesOf([cell(0, 'ok'), cell(250, 'ban', 'Z', 'zone')], 400)).toEqual([{ fromM: 250, toM: 400, cls: 'ban', cause: 'zone', why: 'Z' }]);
  });
  it('shares add up to one', () => {
    const s = shares(cells, 2000);
    expect(s.ban).toBeCloseTo(750 / 2000, 5);
    expect(s.caution).toBeCloseTo(250 / 2000, 5);
    expect(s.ok + s.ban + s.caution + s.unknown).toBeCloseTo(1, 5);
    expect(shares([], 0)).toEqual({ ban: 0, caution: 0, ok: 0, unknown: 0 });
  });
  it('the nearest legal place prefers open ground to a caution, before or after', () => {
    expect(nearestLegal(cells, 600)).toMatchObject({ distM: 250, offsetM: -350, cls: 'ok' });
    expect(nearestLegal(cells, 900)).toMatchObject({ distM: 1250, offsetM: 350, cls: 'ok' });
    // inside the zone, with the caution closer than any open ground: open ground still wins when it is in reach
    expect(nearestLegal(cells, 1000)).toMatchObject({ cls: 'ok' });
  });
  it('nothing in reach gives nothing', () => {
    const all = [cell(0, 'ban', 'Z', 'zone'), cell(250, 'ban', 'Z', 'zone'), cell(500, 'unknown')];
    expect(nearestLegal(all, 250)).toBeUndefined();
    expect(nearestLegal(cells, 100_000)).toBeUndefined();
  });
  it('falls back to a caution when it is all there is', () => {
    const c = [cell(0, 'ban', 'Z', 'zone'), cell(250, 'caution', 'In forest', 'forest')];
    expect(nearestLegal(c, 0)).toMatchObject({ distM: 250, cls: 'caution' });
  });
  it('looks up the cell and the position at a distance', () => {
    expect(cellAt(cells, 600)!.distM).toBe(500);
    expect(cellAt(cells, 0)!.distM).toBe(0);
    expect(cellAt([], 5)).toBeUndefined();
    const s = samplesAt(2000, 5);
    expect(positionAt(s, 600)).toEqual({ lat: s[2]!.lat, lon: s[2]!.lon });
    expect(positionAt([], 5)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe('the report', () => {
  it('lists the cantons crossed and only the municipalities that have a recorded rule or note', async () => {
    const samples = samplesAt(2500);
    const inp = inputs({
      samples,
      cantonAt: samples.map((_, i) => (i < 20 ? 'BE' : 'TI')),
      municipalities: [
        { name: 'Kandersteg', bfs: 565, canton: 'BE' },
        { name: 'Nowhere', bfs: 99999, canton: 'BE' },
        { name: 'Adelboden', bfs: 561, canton: 'BE' },
      ],
    });
    const r = reportFor(inp, await loaded(), SUMMER);
    expect(r.cantons.map((c) => c.code)).toEqual(['BE', 'TI']);
    // a canton only a municipality tells of (a short crossing between two lookups) is listed too
    const more = reportFor({ ...inp, municipalities: [...inp.municipalities, { name: 'Bignasco', bfs: 5000, canton: 'VD' }] }, await loaded(), SUMMER);
    expect(more.cantons.map((c) => c.code)).toEqual(['BE', 'TI', 'VD']);
    expect(r.municipalities.map((m) => [m.name, m.stance])).toEqual([['Kandersteg', 'banned'], ['Adelboden', 'restricted']]);
    expect(r.lengthM).toBe(39 * 250);
    expect(r.failed).toEqual([]);
    expect(r.outsideShare).toBe(0);
    const out = reportFor({ ...inp, cantonAt: samples.map((_, i) => (i < 10 ? 'BE' : 'OUT')) }, await loaded(), SUMMER);
    expect(out.outsideShare).toBeCloseTo(30 / 40, 5);
  });
  it('carries what could not be looked up, including bundled data that did not load', async () => {
    const d = new LocalData('/', { forest: async () => { throw new Error('x'); }, treeline: async () => undefined as never, reserve: async () => ({ canton: 'XX', generated: '', reserves: [] }) });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await d.load();
    const r = reportFor(inputs({ failed: ['zones'] }), d, SUMMER);
    expect(r.failed).toEqual(['zones', 'local rule data']);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------------------------------------------------

describe('gathering the inputs', () => {
  afterEach(() => vi.unstubAllGlobals());

  type Call = { kind: string; url: string };
  function mock(over: { zones?: 'fail' | unknown; elevations?: 'fail'; municipalityOutline?: 'fail'; canton?: (e: number, n: number) => string | undefined | 'fail' } = {}) {
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        const kind = u.includes('profile.json') ? 'profile' : u.includes('gemeinde-flaeche.fill/') ? 'outline' : u.includes('gemeinde-flaeche') ? 'municipality' : u.includes('kanton-flaeche') ? 'canton' : 'zones';
        calls.push({ kind, url: u });
        const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
        if (kind === 'zones') {
          if (over.zones === 'fail') return new Response('x', { status: 503 });
          return ok(over.zones ?? { results: [{ layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', featureId: 7, attributes: { name: 'Zone 7', schutzzeit: '01.01. - 31.12.' }, geometry: { type: 'Polygon', coordinates: [square(2_600_000, 1_100_000, 2_700_000, 1_200_000)] }, bbox: [2_600_000, 1_100_000, 2_700_000, 1_200_000] }] });
        }
        if (kind === 'municipality') {
          return ok({
            results: [
              { layerBodId: 'g', featureId: 565, attributes: { gemname: 'Kandersteg', gde_nr: 565, kanton: 'BE', is_current_jahr: true } },
              { layerBodId: 'g', featureId: 99999, attributes: { gemname: 'Nowhere', gde_nr: 99999, kanton: 'BE', is_current_jahr: true } },
              { layerBodId: 'g', featureId: 1, attributes: { gemname: 'Old Name', gde_nr: 1, kanton: 'BE', is_current_jahr: false } },
            ],
          });
        }
        if (kind === 'outline') {
          if (over.municipalityOutline === 'fail') return new Response('x', { status: 500 });
          return ok({ feature: { geometry: { type: 'Polygon', coordinates: [square(2_600_000, 1_100_000, 2_700_000, 1_200_000)] }, bbox: [2_600_000, 1_100_000, 2_700_000, 1_200_000] } });
        }
        if (kind === 'canton') {
          const [e, n] = new URL(u).searchParams.get('geometry')!.split(',').map(Number) as [number, number];
          const ak = over.canton ? over.canton(e, n) : 'BE';
          if (ak === 'fail') return new Response('x', { status: 503 });
          return ok({ results: ak ? [{ layerBodId: 'k', attributes: { ak } }] : [] });
        }
        if (kind === 'profile') {
          if (over.elevations === 'fail') return new Response('x', { status: 503 });
          return ok([{ dist: 0, alts: { COMB: 2000 } }, { dist: 1000, alts: { COMB: 2200 } }]);
        }
        return new Response('?', { status: 404 });
      }),
    );
    return calls;
  }

  it('asks once per piece for zones and municipalities, a few times for the canton, and fetches an outline only for a municipality that has a rule', async () => {
    const calls = mock();
    const pts = line(1001, 100, () => 2200); // 100 km with heights of its own
    const chunks = queryChunks(pts).length;
    const inp = await gatherRouteInputs(pts);
    const count = (k: string) => calls.filter((c) => c.kind === k).length;
    expect(count('zones')).toBe(chunks);
    expect(count('municipality')).toBe(chunks);
    expect(count('canton')).toBeLessThanOrEqual(30); // one about every 4 km, not one per sample
    expect(count('canton')).toBeGreaterThan(10);
    expect(count('outline')).toBe(1); // Kandersteg has a rule; "Nowhere" does not
    expect(count('profile')).toBe(0); // the line has its own heights
    expect(inp.municipalities.map((m) => m.name)).toEqual(['Kandersteg', 'Nowhere']); // the renamed old municipality is left out
    expect(inp.municipalities[0]!.geometry).toBeDefined();
    expect(inp.municipalities[1]!.geometry).toBeUndefined();
    expect(inp.zones).toHaveLength(1); // the same zone seen in every piece is one zone
    expect(inp.failed).toEqual([]);
    expect(inp.cantonAt.every((c) => c === 'BE')).toBe(true);
    expect(calls.some((c) => c.url.includes('returnGeometry=true') && c.kind === 'zones')).toBe(true);
  });
  it('fetches heights from the elevation model when the line has none, and fills the samples', async () => {
    const calls = mock();
    const inp = await gatherRouteInputs(line(11, 100)); // 1 km, no ele
    expect(calls.filter((c) => c.kind === 'profile')).toHaveLength(1);
    expect(inp.samples[0]!.ele).toBeCloseTo(2000, 0);
    expect(inp.samples[inp.samples.length - 1]!.ele).toBeCloseTo(2200, 0);
    expect(inp.samples.every((s) => s.ele !== undefined)).toBe(true);
  });
  it('a zone request that fails is reported and never read as "no zones"', async () => {
    mock({ zones: 'fail' });
    const inp = await gatherRouteInputs(line(11, 100, () => 2000));
    expect(inp.failed).toContain('zones');
    expect(inp.zones).toEqual([]);
  });
  it('a failed outline or height request is reported', async () => {
    mock({ municipalityOutline: 'fail', elevations: 'fail' });
    const inp = await gatherRouteInputs(line(11, 100));
    expect(inp.failed).toEqual(expect.arrayContaining(['municipalities', 'elevation']));
    expect(inp.samples.every((s) => s.ele === undefined)).toBe(true);
  });
  it('cantons are told apart by a few lookups, and a point in no canton is marked as outside', async () => {
    // east of the first 12 km: Valais; beyond 2'643'000 (about 17 km in): no canton at all (the route has left Switzerland)
    const start = lv95ToWgs84(2_620_000, 1_150_000);
    const pts: RoutePoint[] = Array.from({ length: 301 }, (_, i) => {
      const p = lv95ToWgs84(2_620_000 + i * 100, 1_150_000);
      return { lat: p.lat, lon: p.lon, ele: 2000 };
    });
    expect(start.lat).toBeGreaterThan(46);
    const calls = mock({ canton: (e) => (e < 2_632_000 ? 'BE' : e < 2_637_000 ? 'VS' : undefined) });
    const inp = await gatherRouteInputs(pts); // 30 km
    expect(calls.filter((c) => c.kind === 'canton').length).toBeLessThan(40);
    const at = (km: number) => inp.cantonAt[Math.round((km * 1000) / 250)];
    expect([at(2), at(9), at(14), at(25)]).toEqual(['BE', 'BE', 'VS', 'OUT']);
    expect(inp.failed).not.toContain('cantons');
  });
  it('a failed canton lookup is reported and leaves the canton unknown, not guessed', async () => {
    mock({ canton: () => 'fail' });
    const inp = await gatherRouteInputs(line(201, 100, () => 2000));
    expect(inp.failed).toContain('cantons');
    expect(inp.cantonAt.every((c) => c === undefined)).toBe(true);
  });
  it('reports progress up to the total', async () => {
    mock();
    const seen: [number, number][] = [];
    await gatherRouteInputs(line(11, 100, () => 2000), { onProgress: (d, t) => seen.push([d, t]) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]![0]).toBe(seen[seen.length - 1]![1]);
  });
  it('a route of one point has nothing to check and makes no request', async () => {
    const calls = mock();
    const inp = await gatherRouteInputs(line(1, 100, () => 2000));
    expect(calls).toHaveLength(0);
    expect(inp).toEqual({ samples: [], zones: [], municipalities: [], cantonAt: [], failed: [] });
  });
});

describe('haversine sanity for the test line', () => {
  it('is about 100 m between neighbours', () => {
    const [a, b] = line(2, 100);
    expect(haversineM(a!, b!)).toBeGreaterThan(95);
    expect(haversineM(a!, b!)).toBeLessThan(105);
  });
});

describe('a walk over several days', () => {
  it('each part is judged for its own day: a zone that closes in April bans the early days and not the late ones', async () => {
    const zone = wrz('Winterzone', '15.12. - 30.04.', square(2_619_000, 1_149_000, 2_622_600, 1_151_000)); // covers the first 11 samples
    const data = await loaded();
    const day1 = new Date(2027, 3, 28, 12);
    const day3 = new Date(2027, 4, 2, 12);
    const r = reportForDates(inputs({ zones: [zone] }), data, [
      { fromM: 0, toM: 5000, date: day1 },
      { fromM: 5000, toM: Infinity, date: day3 },
    ]);
    expect(r.cells[2]!.cls).toBe('ban'); // 28 April: in force
    expect(r.cells[30]!.cls).toBe('ok');
    // a zone covering the later samples too: only the part walked on 28 April is banned
    const wide = wrz('Winterzone', '15.12. - 30.04.', square(2_619_000, 1_149_000, 2_640_000, 1_151_000));
    const r2 = reportForDates(inputs({ zones: [wide] }), data, [
      { fromM: 0, toM: 5000, date: day1 },
      { fromM: 5000, toM: Infinity, date: day3 },
    ]);
    // after the season the zone is still on the map: a caution (as for a single spot), no longer a ban
    expect(cls(r2.cells).slice(0, 24)).toBe('b'.repeat(20) + 'cccc');
  });
  it('a single date is the same as reportFor', async () => {
    const data = await loaded();
    const zone = wrz('Z', '01.01. - 31.12.', square(2_619_000, 1_149_000, 2_625_000, 1_151_000));
    const a = reportFor(inputs({ zones: [zone] }), data, SUMMER);
    const b = reportForDates(inputs({ zones: [zone] }), data, [{ fromM: 0, toM: Infinity, date: SUMMER }]);
    expect(a.cells).toEqual(b.cells);
  });
});
