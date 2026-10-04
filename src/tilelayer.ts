import L from 'leaflet';

import { retryDelay } from './retry';

interface RetryTile extends HTMLImageElement {
  __retries?: number;
  __src?: string;
}

/** Leaflet shows a failed tile as a grey hole for good. This asks for it again a few times first. */
function onTileError(this: L.TileLayer, done: L.DoneCallback, tile: RetryTile, e: Event) {
  const n = tile.__retries ?? 0;
  const wait = retryDelay(n, navigator.onLine !== false);
  if (wait !== undefined) {
    tile.__retries = n + 1;
    const base = (tile.__src ??= tile.src);
    setTimeout(() => {
      tile.src = `${base}${base.includes('?') ? '&' : '?'}_r=${n + 1}`;
    }, wait);
    return;
  }
  // out of retries: Leaflet's own handling (the tile stays empty)
  (L.TileLayer.prototype as unknown as { _tileOnError: (d: L.DoneCallback, t: HTMLImageElement, ev: Event) => void })._tileOnError.call(this, done, tile, e);
}

export const RetryTileLayer = L.TileLayer.extend({ _tileOnError: onTileError }) as unknown as typeof L.TileLayer;
export const RetryWmsLayer = L.TileLayer.WMS.extend({ _tileOnError: onTileError }) as unknown as typeof L.TileLayer.WMS;
