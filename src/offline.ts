import { LOCAL_DATA_FILES } from './localdata';

export const TILE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
export const TILE_CACHE = 'wc-tiles-v1';
export const SHELL_CACHE = 'wc-shell-v1';
export const DATA_CACHE = 'wc-data-v1';
/** Most tiles one download may fetch: about 30 KB each, so roughly 15 MB. */
export const MAX_TILES = 500;

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

/** Same-origin URLs the page loaded (scripts, styles, icons): the app shell, so the app opens offline. */
export function shellUrls(entries: { name: string }[], origin: string): string[] {
  return [...new Set(entries.map((e) => e.name).filter((u) => u.startsWith(origin)).map((u) => u.split('#')[0]!))];
}

export interface SaveProgress {
  done: number;
  total: number;
  failed: number;
}

/** Fetch tiles into the tile cache, `parallel` at a time. Tiles already saved are skipped. */
export async function saveTiles(urls: string[], onProgress: (p: SaveProgress) => void, signal?: AbortSignal, parallel = 6): Promise<SaveProgress> {
  const cache = await caches.open(TILE_CACHE);
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

/** Register the service worker (production builds only) and cache the shell once it is active. */
export function registerOffline(base: string): void {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', new URL(base, location.href)).href)
      .then(() => navigator.serviceWorker.ready)
      .then(() => saveShell(base))
      .catch((err) => console.warn('offline support unavailable', err));
  });
}

export function megabytes(tiles: number): string {
  const mb = (tiles * 30) / 1024;
  return mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
}
