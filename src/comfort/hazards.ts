import { wgs84ToLv95 } from '../coords';

/**
 * National natural-hazard indications (FOEN): flood areas from Aquaprotect for 50 and 100 year events, and SilvaProtect-CH
 * rockfall, landslide and debris-flow indications. They are raster layers without a query service, so a tiny map image of
 * the spot is requested and the centre pixel read: coloured means the spot is inside the mapped area.
 * These are coarse national models, not the cantonal hazard maps, and a blank pixel does not mean "safe".
 */
const WMS = 'https://wms.geo.admin.ch/';
export const HAZARD_LAYERS = {
  flood50: 'ch.bafu.aquaprotect_050',
  flood100: 'ch.bafu.aquaprotect_100',
  rockfall: 'ch.bafu.silvaprotect-sturz',
  landslide: 'ch.bafu.silvaprotect-hangmuren',
  debris: 'ch.bafu.silvaprotect-murgang',
} as const;
export type HazardKey = keyof typeof HAZARD_LAYERS;
const SIZE = 9;
const HALF_M = 60;
/** A pixel counts as covered when at least this opaque (0 to 255). */
const MIN_ALPHA = 40;

export interface HazardInfo {
  /** Hazard areas the spot lies in. */
  inside: HazardKey[];
  /** Hazards whose lookup failed, so a missing hit is not read as "none". */
  failed: HazardKey[];
}

/** True if the centre pixel of an RGBA image (size x size) is coloured. */
export function centreCovered(rgba: ArrayLike<number>, size = SIZE): boolean {
  const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  return (rgba[mid + 3] ?? 0) >= MIN_ALPHA;
}

async function decode(blob: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(SIZE, SIZE) : Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

async function covered(layer: string, e: number, n: number, signal?: AbortSignal): Promise<boolean> {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    CRS: 'EPSG:2056',
    BBOX: `${e - HALF_M},${n - HALF_M},${e + HALF_M},${n + HALF_M}`,
    WIDTH: String(SIZE),
    HEIGHT: String(SIZE),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  });
  const res = await fetch(`${WMS}?${q}`, { signal });
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`${layer} returned ${type}`);
  return centreCovered(await decode(await res.blob()));
}

export async function fetchHazards(lat: number, lon: number, signal?: AbortSignal): Promise<HazardInfo> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const keys = Object.keys(HAZARD_LAYERS) as HazardKey[];
  const res = await Promise.allSettled(keys.map((k) => covered(HAZARD_LAYERS[k], e, n, signal)));
  const out: HazardInfo = { inside: [], failed: [] };
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value) out.inside.push(keys[i]!);
    } else out.failed.push(keys[i]!);
  });
  return out;
}
