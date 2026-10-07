import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AREAS_KEY, MAX_BULK_TILES, MAX_TILES, addArea, boxAround, corridorTiles, isNewer, loadAreas, megabytes, planCorridor, planSpots, planTiles, scriptsOf, shellUrls, sizeText, tileOf, tileUrl, tilesAt } from '../src/offline';
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
    expect(kind('https://app.test/wildcamp/forest-mask.bin.gz')).toBe('data');
    expect(kind('https://app.test/wildcamp/reserves-be.json.gz')).toBe('data');
  });
  it('never caches the forecast, search or any POST', () => {
    expect(kind('https://api.open-meteo.com/v1/forecast?x=1')).toBe('network');
    expect(kind('https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=bern')).toBe('network');
    expect(kind('https://api3.geo.admin.ch/rest/services/profile.json', 'POST')).toBe('network');
    expect(kind('https://example.com/a.js')).toBe('network');
  });
});

describe('bulk map plans', () => {
  // a straight line of about 10 km from Kandersteg towards the north-east
  const line = [
    { lat: 46.49, lon: 7.67 },
    { lat: 46.55, lon: 7.75 },
  ];
  it('makes a box of the asked radius', () => {
    const b = boxAround(46.5, 7.7, 1000);
    expect((b.north - b.south) * 111_320).toBeCloseTo(2000, -1);
    expect((b.east - b.west) * 111_320 * Math.cos((46.5 * Math.PI) / 180)).toBeCloseTo(2000, -1);
  });
  it('covers every vertex and stays near the line', () => {
    const tiles = corridorTiles(line, 800, 14);
    const keys = new Set(tiles.map((t) => `${t.x}/${t.y}`));
    for (const p of line) expect(keys.has(`${tileOf(p.lat, p.lon, 14).x}/${tileOf(p.lat, p.lon, 14).y}`)).toBe(true);
    // 10 km at zoom 14 (about 1.7 km a tile) with 800 m each side: a ribbon of a few tiles across, not a filled box
    const box = tilesAt({ south: 46.49, west: 7.67, north: 46.55, east: 7.75 }, 14);
    expect(tiles.length).toBeGreaterThan(8);
    expect(tiles.length).toBeLessThan(box.length + 40);
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(tiles.length);
  });
  it('does not skip tiles along a long, steep segment', () => {
    const tiles = corridorTiles([{ lat: 46.0, lon: 8.0 }, { lat: 46.4, lon: 8.0 }], 100, 15);
    const ys = tiles.map((t) => t.y);
    const have = new Set(ys);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) expect(have.has(y), `row ${y}`).toBe(true);
  });
  it('adds zoom levels while they fit and reports the range reached', () => {
    const p = planCorridor(line, 1200, 12, 16, 500);
    expect(p.tiles.length).toBeLessThanOrEqual(500);
    expect(p.from).toBe(12);
    expect(p.to).toBeGreaterThanOrEqual(12);
    expect(new Set(p.tiles.map((t) => t.z)).size).toBe(p.to - p.from + 1);
    const more = planCorridor(line, 1200, 12, 16, MAX_BULK_TILES);
    expect(more.to).toBeGreaterThanOrEqual(p.to);
  });
  it('refuses a corridor too long for even its lowest zoom', () => {
    const p = planCorridor([{ lat: 46.0, lon: 6.0 }, { lat: 47.4, lon: 9.9 }], 1200, 12, 16, 50);
    expect(p.tiles).toEqual([]);
    expect(p.to).toBeLessThan(p.from);
  });
  it('shares tiles between spots close together', () => {
    const one = planSpots([{ lat: 46.5, lon: 7.7 }], 1000, 13, 15, 3000);
    const two = planSpots([{ lat: 46.5, lon: 7.7 }, { lat: 46.5005, lon: 7.7005 }], 1000, 13, 15, 3000);
    expect(one.tiles.length).toBeGreaterThan(0);
    expect(two.tiles.length).toBeLessThan(one.tiles.length * 2);
    expect(two.tiles.length).toBeGreaterThanOrEqual(one.tiles.length);
    expect(new Set(two.tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(two.tiles.length);
  });
  it('writes sizes in words', () => {
    expect(sizeText(2048)).toBe('2 KB');
    expect(sizeText(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(sizeText(120 * 1024 * 1024)).toBe('120 MB');
  });
});

describe('notes about saved map areas', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const area = (name: string) => ({ name, at: '2026-10-07T10:00:00Z', from: 13, to: 15, tiles: 120 });
  it('keeps the newest first and replaces the same area saved again', () => {
    const store = mem();
    addArea(store, area('A'));
    addArea(store, area('B'));
    addArea(store, area('A'));
    expect(loadAreas(store).map((a) => a.name)).toEqual(['A', 'B']);
  });
  it('ignores damaged storage and survives a blocked write', () => {
    const store = mem();
    store.setItem(AREAS_KEY, '{"not":"a list"}');
    expect(loadAreas(store)).toEqual([]);
    store.setItem(AREAS_KEY, JSON.stringify([area('ok'), { name: 3 }, null]));
    expect(loadAreas(store).map((a) => a.name)).toEqual(['ok']);
    const blocked = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
    expect(addArea(blocked, area('x')).map((a) => a.name)).toEqual(['x']);
  });
});

describe('service worker updates, cleanup and data checks', () => {
  type Listener = (e: unknown) => void;
  const origin = 'https://app.test';
  const memCache = () => {
    const m = new Map<string, Response>();
    const url = (k: string | Request) => (typeof k === 'string' ? k : k.url);
    return {
      m,
      match: async (k: string | Request) => m.get(url(k))?.clone(),
      put: async (k: string | Request, r: Response) => void m.set(url(k), r),
      delete: async (k: string | Request) => m.delete(url(k)),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
    };
  };
  const boot = (names: string[] = []) => {
    const store = new Map<string, ReturnType<typeof memCache>>(names.map((n) => [n, memCache()]));
    const caches = {
      open: async (n: string) => (store.get(n) ?? store.set(n, memCache()).get(n)!),
      keys: async () => [...store.keys()],
      delete: async (n: string) => store.delete(n),
    };
    const listeners: Record<string, Listener> = {};
    const posted: unknown[] = [];
    const self = {
      addEventListener: (t: string, f: Listener) => (listeners[t] = f),
      location: { origin, href: `${origin}/wildcamp/sw.js` },
      clients: { claim: async () => undefined, matchAll: async () => [{ postMessage: (m: unknown) => posted.push(m) }] },
      skipWaiting: () => undefined,
    } as Record<string, unknown>;
    new Function('self', 'caches', readFileSync('public/sw.js', 'utf8'))(self, caches);
    return { self, store, listeners, posted };
  };

  it('compares the validators of a cached and a fresh file', () => {
    const { self } = boot();
    const changed = self.__wcChanged as (a: Response, b: Response) => boolean;
    const r = (h: Record<string, string>) => new Response('x', { headers: h });
    expect(changed(r({ etag: '"a"' }), r({ etag: '"a"' }))).toBe(false);
    expect(changed(r({ etag: '"a"' }), r({ etag: '"b"' }))).toBe(true);
    expect(changed(r({ 'last-modified': 'Mon' }), r({ 'last-modified': 'Tue' }))).toBe(true);
    expect(changed(r({ 'content-length': '10' }), r({ 'content-length': '11' }))).toBe(true);
    expect(changed(r({}), r({}))).toBe(false); // nothing to compare: no reason to replace the file
  });

  it('finds the hashed files a page is made of', () => {
    const { self } = boot();
    const assetsOf = self.__wcAssetsOf as (html: string, base: string) => Set<string>;
    const html = '<script type="module" src="./assets/index-ab12.js"></script><link rel="stylesheet" href="./assets/index-cd34.css"><link rel="icon" href="./icon.svg"><link href="https://x.test/assets/y.js">';
    expect([...assetsOf(html, `${origin}/wildcamp/`)].sort()).toEqual([`${origin}/wildcamp/assets/index-ab12.js`, `${origin}/wildcamp/assets/index-cd34.css`]);
  });

  it('removes caches of older versions and keeps the current ones', async () => {
    const { listeners, store } = boot(['wc-shell-v1', 'wc-saved-tiles-v1', 'wc-tiles-v0', 'wc-old', 'other-app']);
    let done: Promise<unknown> = Promise.resolve();
    listeners.activate!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...store.keys()].sort()).toEqual(['other-app', 'wc-saved-tiles-v1', 'wc-shell-v1']);
  });

  it('tells the open pages about a new version, and drops the old files only once nothing needs them', async () => {
    const { self, store, posted } = boot();
    const pageChanged = self.__wcPageChanged as (cache: ReturnType<typeof memCache>, old: Response, fresh: Response, url: string) => Promise<void>;
    const shell = (await store.get('wc-shell-v1')) ?? store.set('wc-shell-v1', memCache()).get('wc-shell-v1')!;
    await shell.put(`${origin}/wildcamp/assets/index-old.js`, new Response('old'));
    await shell.put(`${origin}/wildcamp/assets/index-same.css`, new Response('same'));
    await shell.put(`${origin}/wildcamp/icon.svg`, new Response('<svg/>'));
    const page = (js: string) => `<script src="./assets/${js}.js"></script><link href="./assets/index-same.css">`;
    // the new version shows up: announced, but the page on screen may still ask for the old script
    await pageChanged(shell, new Response(page('index-old')), new Response(page('index-new')), `${origin}/wildcamp/`);
    expect(posted).toEqual([{ type: 'wc-update' }]);
    expect([...shell.m.keys()].sort()).toEqual([`${origin}/wildcamp/assets/index-old.js`, `${origin}/wildcamp/assets/index-same.css`, `${origin}/wildcamp/icon.svg`]);
    // the next visit already runs the new page: the old script goes, other files stay
    posted.length = 0;
    await pageChanged(shell, new Response(page('index-new')), new Response(page('index-new') + '<!-- only a comment changed -->'), `${origin}/wildcamp/`);
    expect(posted).toEqual([]); // the same files: the same app, nothing to announce
    expect([...shell.m.keys()].sort()).toEqual([`${origin}/wildcamp/assets/index-same.css`, `${origin}/wildcamp/icon.svg`]);
  });

  it('checks a data file against the server at most once a day and replaces it when it changed', async () => {
    const { self, store } = boot();
    const revalidate = self.__wcRevalidate as (req: { url: string }, hit: Response) => Promise<void>;
    const url = `${origin}/wildcamp/forest-mask.bin.gz`;
    const fetchMock = vi.fn(async () => new Response('new', { headers: { etag: '"v2"' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const hit = new Response('old', { headers: { etag: '"v1"' } });
      await revalidate({ url }, hit);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await (await store.get('wc-data-v1')!.match(url))!.text()).toBe('new');
      await revalidate({ url }, hit);
      expect(fetchMock).toHaveBeenCalledTimes(1); // asked again the same day: no second request
      const unchanged = boot();
      const same = vi.fn(async () => new Response('old', { headers: { etag: '"v1"' } }));
      vi.stubGlobal('fetch', same);
      await (unchanged.self.__wcRevalidate as typeof revalidate)({ url }, new Response('old', { headers: { etag: '"v1"' } }));
      expect(await unchanged.store.get('wc-data-v1')?.match(url)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves the cached data alone when the check fails (offline)', async () => {
    const { self, store } = boot();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    try {
      await (self.__wcRevalidate as (r: { url: string }, h: Response) => Promise<void>)({ url: `${origin}/wildcamp/a.bin.gz` }, new Response('old'));
      expect(await store.get('wc-data-v1')?.match(`${origin}/wildcamp/a.bin.gz`)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('noticing a newer version from the cached page', () => {
  const page = (js: string) => `<html><script type="module" crossorigin src="./assets/${js}.js"></script><link rel="stylesheet" href="./assets/${js}.css"></html>`;
  it('reads the script names', () => {
    expect(scriptsOf(page('index-abc'))).toEqual(['index-abc.js']);
    expect(scriptsOf('<script>inline()</script><script src="https://x.test/lib.js"></script>')).toEqual([]);
  });
  it('is newer only when the cached page needs another script than the running one', () => {
    expect(isNewer(page('index-abc'), 'https://app.test/wildcamp/assets/index-abc.js')).toBe(false);
    expect(isNewer(page('index-new'), 'https://app.test/wildcamp/assets/index-abc.js?x=1#h')).toBe(true);
    expect(isNewer('<html>no scripts</html>', 'https://app.test/wildcamp/assets/index-abc.js')).toBe(false);
  });
});
