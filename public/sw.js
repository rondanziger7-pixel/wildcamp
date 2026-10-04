/* Wildcamp CH service worker: lets the app open and the saved map show without a connection.
 *  - own files (the app): stale-while-revalidate, the page falls back to the cached copy offline
 *  - bundled data files (.gz): cache first, never re-downloaded while cached
 *  - map tiles and map overlays (swisstopo): cache first, so saved areas and anything viewed stay available
 *  - geo.admin.ch lookups (zones, canton, water ...): network first, the cached copy only when offline
 *  - everything else (weather forecast, search): network only, never cached, so a stale forecast is never shown as current */
const SHELL = 'wc-shell-v1';
// Bundled data files (forest map, reserves ...) change rarely and are large, so they are served from the cache without
// re-downloading on every visit. Bump this name when a data file is replaced.
const DATA = 'wc-data-v1';
const TILES = 'wc-tiles-v1';
const API = 'wc-api-v1';
const MAX_TILES = 6000;
const MAX_API = 400;

function classify(url, method, origin) {
  if (method !== 'GET') return 'network';
  const u = new URL(url);
  if (u.hostname === 'wmts.geo.admin.ch' || u.hostname === 'wms.geo.admin.ch') return 'tile';
  if (u.hostname === 'api3.geo.admin.ch' && !u.pathname.includes('/SearchServer')) return 'api';
  if (u.origin === origin && /\.(bin|json)\.gz$/.test(u.pathname)) return 'data';
  if (u.origin === origin) return 'shell';
  return 'network';
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Trimming scans the whole cache, so it runs once per 200 stored responses, not after every tile.
const puts = { [TILES]: 0, [API]: 0 };
function stored(name, max) {
  if (++puts[name] % 200 === 0) trim(name, max);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One tile: from the cache, else the network. A failed request is retried once; as a last resort the plain image request
 *  is passed through, so a CORS hiccup shows the tile (uncached) instead of a grey hole. */
async function tile(e) {
  const req = e.request;
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // images are requested without CORS (an opaque response would cost megabytes of quota each), so ask again with CORS
      const res = await fetch(req.url, { mode: 'cors' });
      if (res.ok) {
        // answer at once and store in the background
        e.waitUntil(cache.put(req.url, res.clone()).then(() => stored(TILES, MAX_TILES)).catch(() => undefined));
        return res;
      }
      if (res.status < 500 && res.status !== 429) return res; // a real "not found": no point retrying
    } catch {
      /* network error: retry */
    }
    await wait(400);
  }
  return fetch(req);
}

async function api(req) {
  const cache = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req.url, res.clone());
      stored(API, MAX_API);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req.url);
    if (hit) return hit;
    throw err;
  }
}

async function data(req) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req.url, res.clone());
  return res;
}

async function shell(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req.url, { ignoreSearch: req.mode === 'navigate' });
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req.url, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) return hit;
  const res = await fresh;
  if (res) return res;
  if (req.mode === 'navigate') {
    const page = await cache.match(new URL('./', self.location.href).href);
    if (page) return page;
  }
  return Response.error();
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const kind = classify(e.request.url, e.request.method, self.location.origin);
  if (kind === 'tile') e.respondWith(tile(e));
  else if (kind === 'api') e.respondWith(api(e.request));
  else if (kind === 'data') e.respondWith(data(e.request));
  else if (kind === 'shell') e.respondWith(shell(e.request));
});

self.__wcClassify = classify;
