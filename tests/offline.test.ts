import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_TILES, megabytes, planTiles, shellUrls, tileOf, tileUrl, tilesAt } from '../src/offline';
import { LOCAL_DATA_FILES, RESERVE_FILES } from '../src/localdata';
import { existsSync } from 'node:fs';

describe('tile maths', () => {
  it('finds the web-mercator tile of a position', () => {
    expect(tileOf(46.95, 7.44, 10)).toEqual({ x: 533, y: 360 });
    expect(tileOf(46.95, 7.44, 15)).toEqual({ x: 17061, y: 11532 });
    expect(tileOf(0, -180, 3)).toEqual({ x: 0, y: 4 });
  });
  it('builds the tile url the map layer uses', () => {
    expect(tileUrl(12, 2134, 1437)).toBe('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/12/2134/1437.jpeg');
  });
  const bern = { south: 46.93, west: 7.41, north: 46.97, east: 7.47 };
  it('lists the tiles covering a box', () => {
    const t = tilesAt(bern, 12);
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t.every((x) => x.z === 12)).toBe(true);
    expect(tilesAt(bern, 14).length).toBeGreaterThan(t.length);
  });
  it('plans as many zoom levels as fit the budget, never more than the limit', () => {
    const p = planTiles(bern, 12, 15);
    expect(p.from).toBe(12);
    expect(p.to).toBeGreaterThanOrEqual(12);
    expect(p.tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(new Set(p.tiles.map((t) => t.z)).size).toBe(p.to - p.from + 1);
    const small = planTiles(bern, 12, 15, 10);
    expect(small.tiles.length).toBeLessThanOrEqual(10);
  });
  it('refuses a view that is too wide even at its own zoom', () => {
    const wide = { south: 45.8, west: 5.9, north: 47.8, east: 10.5 };
    const p = planTiles(wide, 12);
    expect(p.tiles).toEqual([]);
    expect(p.to).toBeLessThan(p.from);
  });
  it('gives a rough size', () => {
    expect(megabytes(100)).toBe('2.9');
    expect(megabytes(500)).toBe('15');
  });
});

describe('app shell list', () => {
  it('keeps only same-origin urls without fragments', () => {
    const e = [{ name: 'https://x.test/app/assets/a.js' }, { name: 'https://other.test/b.js' }, { name: 'https://x.test/app/assets/a.js' }, { name: 'https://x.test/app/#1,2' }];
    expect(shellUrls(e, 'https://x.test')).toEqual(['https://x.test/app/assets/a.js', 'https://x.test/app/']);
  });
  it('bundled data files exist in public/', () => {
    for (const f of LOCAL_DATA_FILES) expect(existsSync(`public/${f}`), f).toBe(true);
    expect(LOCAL_DATA_FILES).toEqual(expect.arrayContaining(RESERVE_FILES));
  });
});

describe('service worker routing', () => {
  const src = readFileSync('public/sw.js', 'utf8');
  const self = { addEventListener: () => {}, location: { origin: 'https://app.test', href: 'https://app.test/wildcamp/sw.js' } } as Record<string, unknown>;
  new Function('self', 'caches', src)(self, {});
  const classify = self.__wcClassify as (url: string, method: string, origin: string) => string;
  const kind = (u: string, m = 'GET') => classify(u, m, 'https://app.test');
  it('caches tiles and overlays, lookups network-first, own files stale-while-revalidate', () => {
    expect(kind('https://wmts.geo.admin.ch/1.0.0/x/default/current/3857/10/1/2.jpeg')).toBe('tile');
    expect(kind('https://wms.geo.admin.ch/?layers=a')).toBe('tile');
    expect(kind('https://api3.geo.admin.ch/rest/services/api/MapServer/identify?x=1')).toBe('api');
    expect(kind('https://app.test/wildcamp/assets/index-abc.js')).toBe('shell');
    expect(kind('https://app.test/wildcamp/forest-mask.bin.gz')).toBe('shell');
  });
  it('never caches the forecast, search or any POST', () => {
    expect(kind('https://api.open-meteo.com/v1/forecast?x=1')).toBe('network');
    expect(kind('https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=bern')).toBe('network');
    expect(kind('https://api3.geo.admin.ch/rest/services/profile.json', 'POST')).toBe('network');
    expect(kind('https://example.com/a.js')).toBe('network');
  });
});
