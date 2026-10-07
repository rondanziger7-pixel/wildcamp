/* Wildcamp CH service worker: lets the app open and the saved map show without a connection.
 *  - own files (the app): stale-while-revalidate, the page falls back to the cached copy offline
 *  - bundled data files (.gz): cache first, never re-downloaded while cached
 *  - map tiles and map overlays (swisstopo): cache first, so saved areas and anything viewed stay available
 *  - geo.admin.ch lookups (zones, canton, water ...): network first, the cached copy only when offline
 *  - everything else (weather forecast, search): network only, never cached, so a stale forecast is never shown as current
 * Maps the user saved on purpose live in their own cache (SAVED) that is never trimmed; browsing tiles are trimmed to MAX_TILES. */
const SHELL = 'wc-shell-v1';
// Bundled data files (forest map, reserves ...) change rarely and are large, so they are served from the cache without
// re-downloading on every visit. Bump this name when a data file is replaced.
const DATA = 'wc-data-v1';
const TILES = 'wc-tiles-v1';
const SAVED = 'wc-saved-tiles-v1';
const API = 'wc-api-v1';
const META = 'wc-meta-v1';
const KNOWN = [SHELL, DATA, TILES, SAVED, API, META];
// Bundled data is checked against the server at most this often.
const DATA_CHECK_MS = 24 * 60 * 60 * 1000;
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
  const saved = await caches.open(SAVED);
  const kept = await saved.match(req.url);
  if (kept) return kept;
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

/** True when the server's copy differs from the cached one (the validators, or failing those the size). */
function changed(cached, fresh) {
  const a = cached.headers;
  const b = fresh.headers;
  for (const h of ['etag', 'last-modified']) if (a.get(h) && b.get(h)) return a.get(h) !== b.get(h);
  const la = a.get('content-length');
  const lb = b.get('content-length');
  return !!la && !!lb && la !== lb;
}

/** Looks at the server once a day: a data file that changed replaces the cached one, so the next visit uses it. */
async function revalidate(req, hit) {
  const meta = await caches.open(META);
  const key = new Request(self.location.origin + '/__meta__/' + encodeURIComponent(req.url));
  const last = await meta.match(key);
  if (last && Date.now() - Number(await last.text()) < DATA_CHECK_MS) return;
  try {
    const res = await fetch(req.url, { cache: 'no-cache' });
    if (!res.ok) return;
    await meta.put(key, new Response(String(Date.now())));
    if (changed(hit, res)) await (await caches.open(DATA)).put(req.url, res.clone());
  } catch {
    /* offline: try again on a later visit */
  }
}

async function data(e) {
  const req = e.request;
  const cache = await caches.open(DATA);
  const hit = await cache.match(req.url);
  if (hit) {
    e.waitUntil(revalidate(req, hit));
    return hit;
  }
  const res = await fetch(req);
  if (res.ok) await cache.put(req.url, res.clone());
  return res;
}

/** Hashed file names in a page's html (scripts, styles, icons): what that version of the app is made of. */
function assetsOf(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === self.location.origin && /\/assets\//.test(u.pathname)) out.add(u.href);
    } catch {
      /* not a url */
    }
  }
  return out;
}

/**
 * The page was fetched again. When it is made of other files than the cached copy, the open pages are told. Files that neither the
 * cached nor the fresh copy needs are dropped, but only once both agree (a page already on screen may still be asking for its files).
 */
async function pageChanged(cache, old, fresh, url) {
  const [a, b] = await Promise.all([old.text(), fresh.text()]);
  const was = assetsOf(a, url);
  const now = assetsOf(b, url);
  const keep = new Set([...was, ...now]);
  for (const r of await cache.keys()) if (/\/assets\//.test(new URL(r.url).pathname) && !keep.has(r.url)) await cache.delete(r.url);
  if (was.size === now.size && [...was].every((u) => now.has(u))) return; // the same files: the same app
  for (const c of await self.clients.matchAll()) c.postMessage({ type: 'wc-update' });
}

async function shell(e) {
  const req = e.request;
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req.url, { ignoreSearch: req.mode === 'navigate' });
  // the page itself is always asked about again (a cheap "not modified" when unchanged), so a new version is noticed even where the host lets browsers keep pages for minutes
  const fresh = (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req))
    .then(async (res) => {
      if (res.ok) {
        const copy = res.clone();
        if (hit && req.mode === 'navigate') await pageChanged(cache, hit.clone(), res.clone(), req.url).catch(() => undefined);
        await cache.put(req.url, copy);
      }
      return res;
    })
    .catch(() => undefined);
  // keeps the worker alive until the new copy is stored, although the cached one is answered at once
  e.waitUntil(fresh);
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
// Caches of older versions (other names starting with "wc-") are removed, so they do not fill the phone for good.
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('wc-') && !KNOWN.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  const kind = classify(e.request.url, e.request.method, self.location.origin);
  if (kind === 'tile') e.respondWith(tile(e));
  else if (kind === 'api') e.respondWith(api(e.request));
  else if (kind === 'data') e.respondWith(data(e));
  else if (kind === 'shell') e.respondWith(shell(e));
});

self.__wcClassify = classify;
self.__wcChanged = changed;
self.__wcAssetsOf = assetsOf;
self.__wcPageChanged = pageChanged;
self.__wcRevalidate = revalidate;
