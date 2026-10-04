/* Wildcamp CH service worker: lets the app open and the saved map show without a connection.
 *  - own files (app, bundled data): stale-while-revalidate, the page falls back to the cached copy offline
 *  - map tiles and map overlays (swisstopo): cache first, so saved areas and anything viewed stay available
 *  - geo.admin.ch lookups (zones, canton, water ...): network first, the cached copy only when offline
 *  - everything else (weather forecast, search): network only, never cached, so a stale forecast is never shown as current */
const SHELL = 'wc-shell-v1';
const TILES = 'wc-tiles-v1';
const API = 'wc-api-v1';
const MAX_TILES = 6000;
const MAX_API = 400;

function classify(url, method, origin) {
  if (method !== 'GET') return 'network';
  const u = new URL(url);
  if (u.hostname === 'wmts.geo.admin.ch' || u.hostname === 'wms.geo.admin.ch') return 'tile';
  if (u.hostname === 'api3.geo.admin.ch' && !u.pathname.includes('/SearchServer')) return 'api';
  if (u.origin === origin) return 'shell';
  return 'network';
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  // images are requested without CORS (an opaque response would cost megabytes of quota each), so ask again with CORS
  const res = await fetch(req.url, { mode: 'cors' });
  if (res.ok) {
    await cache.put(req.url, res.clone());
    trim(TILES, MAX_TILES);
  }
  return res;
}

async function api(req) {
  const cache = await caches.open(API);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req.url, res.clone());
      trim(API, MAX_API);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req.url);
    if (hit) return hit;
    throw err;
  }
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
  if (kind === 'tile') e.respondWith(tile(e.request));
  else if (kind === 'api') e.respondWith(api(e.request));
  else if (kind === 'shell') e.respondWith(shell(e.request));
});

self.__wcClassify = classify;
