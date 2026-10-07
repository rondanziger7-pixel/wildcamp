import { LOCAL_DATA_FILES } from './localdata';

export const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
/** Tiles seen while browsing: trimmed by the service worker. */
export const TILE_CACHE = 'wc-tiles-v1';
/** Tiles the user saved on purpose: never trimmed, removed only by the user. */
export const SAVED_TILE_CACHE = 'wc-saved-tiles-v1';
export const SHELL_CACHE = 'wc-shell-v1';
export const DATA_CACHE = 'wc-data-v1';
/** Most tiles one download of the visible area may fetch: about 30 KB each, so roughly 15 MB. */
export const MAX_TILES = 500;
/** Most tiles a route corridor or the saved spots may fetch in one go: roughly 90 MB, asked about first. */
export const MAX_BULK_TILES = 3000;
/** Most tiles the user's saved maps may hold in all, roughly 180 MB. */
export const MAX_SAVED_TILES = 6000;
/** The most detailed zoom saved (the map goes to 18, but each level quadruples the download). */
export const SAVE_MAX_ZOOM = 16;

export const tileUrl = (z: number, x: number, y: number) => TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

/** Web-mercator tile column and row containing a position at a zoom. */
export function tileOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Tile numbers covering a box at one zoom. */
export function tilesAt(b: Bounds, z: number): { z: number; x: number; y: number }[] {
  const a = tileOf(b.north, b.west, z);
  const c = tileOf(b.south, b.east, z);
  const out: { z: number; x: number; y: number }[] = [];
  for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ z, x, y });
  return out;
}

/**
 * The tiles to save for a box: from the zoom of the current view up to `maxZoom`, as many zoom levels as fit
 * in `limit` tiles. Returns the zoom range reached, so the user can be told how detailed the saved map is.
 */
export function planTiles(b: Bounds, viewZoom: number, maxZoom = 15, limit = MAX_TILES): { tiles: { z: number; x: number; y: number }[]; from: number; to: number } {
  const from = Math.max(6, Math.min(viewZoom, maxZoom));
  let tiles = tilesAt(b, from);
  let to = from;
  // the lowest zoom alone may already be too many (a very wide view): the caller must zoom in
  if (tiles.length > limit) return { tiles: [], from, to: from - 1 };
  for (let z = from + 1; z <= maxZoom; z++) {
    const more = tilesAt(b, z);
    if (tiles.length + more.length > limit) break;
    tiles = tiles.concat(more);
    to = z;
  }
  return { tiles, from, to };
}

export type Tile = { z: number; x: number; y: number };
export interface TilePlan {
  tiles: Tile[];
  from: number;
  to: number;
}

const keyOf = (t: Tile) => `${t.z}/${t.x}/${t.y}`;

/** Metres across one tile at a zoom and latitude. */
const tileMetres = (lat: number, z: number) => (40_075_016 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** A box of `radiusM` around a position. */
export function boxAround(lat: number, lon: number, radiusM: number): Bounds {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

/** The tiles at one zoom within `bufferM` of a line (sampled finely enough that no tile on the way is skipped). */
export function corridorTiles(points: readonly { lat: number; lon: number }[], bufferM: number, z: number): Tile[] {
  const seen = new Map<string, Tile>();
  const add = (lat: number, lon: number) => {
    for (const t of tilesAt(boxAround(lat, lon, bufferM), z)) seen.set(keyOf(t), t);
  };
  if (points.length) add(points[0]!.lat, points[0]!.lon);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const step = Math.max(40, Math.min(tileMetres(a.lat, z), 2 * bufferM) / 2);
    const lenM = Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
    const n = Math.max(1, Math.ceil(lenM / step));
    for (let k = 1; k <= n; k++) add(a.lat + ((b.lat - a.lat) * k) / n, a.lon + ((b.lon - a.lon) * k) / n);
  }
  return [...seen.values()];
}

/** As many zoom levels as fit `limit` tiles, from `from` upwards: `tilesFor(z)` lists the tiles wanted at a zoom. */
function planLevels(tilesFor: (z: number) => Tile[], from: number, maxZoom: number, limit: number): TilePlan {
  let tiles = tilesFor(from);
  if (tiles.length > limit) return { tiles: [], from, to: from - 1 };
  let to = from;
  for (let z = from + 1; z <= maxZoom; z++) {
    const more = tilesFor(z);
    if (tiles.length + more.length > limit) break;
    tiles = tiles.concat(more);
    to = z;
  }
  return { tiles, from, to };
}

/** The map along a route: `bufferM` each side of the line, from zoom 12 up to the most detailed that fits `limit` tiles. */
export function planCorridor(points: readonly { lat: number; lon: number }[], bufferM = 1200, from = 12, maxZoom = SAVE_MAX_ZOOM, limit = MAX_BULK_TILES): TilePlan {
  return planLevels((z) => corridorTiles(points, bufferM, z), from, maxZoom, limit);
}

/** The map around each of some places (saved spots, a trip's nights): `radiusM` around each, zoom 13 up. Places close together share tiles. */
export function planSpots(places: readonly { lat: number; lon: number }[], radiusM = 1000, from = 13, maxZoom = SAVE_MAX_ZOOM, limit = MAX_BULK_TILES): TilePlan {
  return planLevels(
    (z) => {
      const seen = new Map<string, Tile>();
      for (const p of places) for (const t of tilesAt(boxAround(p.lat, p.lon, radiusM), z)) seen.set(keyOf(t), t);
      return [...seen.values()];
    },
    from,
    maxZoom,
    limit,
  );
}

/** Same-origin URLs the page loaded (scripts, styles, icons): the app shell, so the app opens offline. */
export function shellUrls(entries: { name: string }[], origin: string): string[] {
  return [...new Set(entries.map((e) => e.name).filter((u) => u.startsWith(origin)).map((u) => u.split('#')[0]!))];
}

export interface SaveProgress {
  done: number;
  total: number;
  failed: number;
}

/** Fetch tiles into the saved-maps cache, `parallel` at a time. Tiles already saved are skipped. */
export async function saveTiles(urls: string[], onProgress: (p: SaveProgress) => void, signal?: AbortSignal, parallel = 6): Promise<SaveProgress> {
  const cache = await caches.open(SAVED_TILE_CACHE);
  const p: SaveProgress = { done: 0, total: urls.length, failed: 0 };
  let next = 0;
  const worker = async () => {
    while (next < urls.length && !signal?.aborted) {
      const url = urls[next++]!;
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: 'cors', signal });
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(url, res);
        }
      } catch {
        p.failed++;
      }
      p.done++;
      onProgress({ ...p });
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  return p;
}

/** Cache the app's own files and the bundled data, so a later visit works without a connection. */
export async function saveShell(base: string): Promise<void> {
  const cache = await caches.open(SHELL_CACHE);
  const dataCache = await caches.open(DATA_CACHE);
  const urls = [location.href.split('#')[0]!, ...shellUrls(performance.getEntriesByType('resource') as PerformanceResourceTiming[], location.origin)].filter((u) => !/\.gz$/.test(u));
  const files = LOCAL_DATA_FILES.map((f) => new URL(f, new URL(base, location.href)).href);
  await Promise.allSettled([
    ...[...new Set(urls)].map((u) => cache.add(u)),
    // data files already in the cache are not downloaded again
    ...files.map(async (u) => ((await dataCache.match(u)) ? undefined : dataCache.add(u))),
  ]);
}

/** The hashed script files a page's html loads. */
export function scriptsOf(html: string): string[] {
  return [...html.matchAll(/<script[^>]*\ssrc="([^"#?]*\/assets\/[^"#?]+\.js)"/g)].map((m) => m[1]!.split('/').pop()!);
}

/** The cached page is made of another script than the one running: a newer version of the app has been downloaded. */
export function isNewer(cachedHtml: string, runningUrl: string): boolean {
  const running = runningUrl.split(/[?#]/)[0]!.split('/').pop()!;
  const names = scriptsOf(cachedHtml);
  return names.length > 0 && !names.includes(running);
}

/** True when the newest copy of the page in the shell cache needs another script than this one. */
export async function newerVersionReady(runningUrl: string): Promise<boolean> {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const page = await cache.match(new URL('./', location.href).href, { ignoreSearch: true });
    return page ? isNewer(await page.text(), runningUrl) : false;
  } catch {
    return false;
  }
}

/** Register the service worker (production builds only) and cache the shell once it is active. `onUpdate` is called when a newer version of the app has been downloaded in the background. */
export function registerOffline(base: string, onUpdate?: () => void): void {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  // the worker may announce a new version before this page was listening (it checks as the page loads), so the page also looks
  // at what the worker stored: a few seconds after loading and whenever it comes back to the front
  const look = () => void newerVersionReady(import.meta.url).then((yes) => yes && onUpdate?.());
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if ((ev.data as { type?: string } | undefined)?.type === 'wc-update') look();
  });
  window.setTimeout(look, 6000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && look());
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', new URL(base, location.href)).href)
      .then(() => navigator.serviceWorker.ready)
      .then(() => saveShell(base))
      .catch((err) => console.warn('offline support unavailable', err));
  });
}

/** How many tiles the user has saved. */
export async function savedTileCount(): Promise<number> {
  if (!('caches' in globalThis)) return 0;
  try {
    return (await (await caches.open(SAVED_TILE_CACHE)).keys()).length;
  } catch {
    return 0;
  }
}

/** Remove the maps the user saved (and the tiles seen while browsing); returns false when this browser has no cache to clear. */
export async function clearMaps(): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  await Promise.all([caches.delete(SAVED_TILE_CACHE), caches.delete(TILE_CACHE)]);
  return true;
}

/** Also remove the cached zone and forecast answers (they hold the spots that were checked). */
export async function clearAnswers(): Promise<void> {
  if (!('caches' in globalThis)) return;
  await Promise.all(['wc-api-v1', 'wc-meta-v1'].map((k) => caches.delete(k)));
}

/** The browser's estimate of what this site stores, in bytes (undefined where it cannot tell). */
export async function storageUsed(): Promise<{ used: number; quota?: number } | undefined> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.usage === undefined ? undefined : { used: e.usage, quota: e.quota };
  } catch {
    return undefined;
  }
}

/** A size in bytes, as "850 KB" or "42 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A saved map area, kept as a note for the settings page (the tiles themselves are in the saved-maps cache). */
export interface SavedArea {
  name: string;
  at: string;
  from: number;
  to: number;
  tiles: number;
}
export const AREAS_KEY = 'wildcamp.offline.v1';
const MAX_AREAS = 30;

export function loadAreas(store: Pick<Storage, 'getItem'> | undefined): SavedArea[] {
  try {
    const raw = JSON.parse(store?.getItem(AREAS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((a): a is SavedArea => !!a && typeof a.name === 'string' && typeof a.at === 'string' && Number.isFinite(a.tiles) && Number.isFinite(a.from) && Number.isFinite(a.to))
      .slice(0, MAX_AREAS);
  } catch {
    return [];
  }
}

export function addArea(store: Pick<Storage, 'getItem' | 'setItem'> | undefined, area: SavedArea): SavedArea[] {
  const list = [area, ...loadAreas(store).filter((a) => !(a.name === area.name && a.from === area.from && a.to === area.to))].slice(0, MAX_AREAS);
  try {
    store?.setItem(AREAS_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: the maps are saved all the same, only the note is lost */
  }
  return list;
}

export function megabytes(tiles: number): string {
  const mb = (tiles * 30) / 1024;
  return mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
}
