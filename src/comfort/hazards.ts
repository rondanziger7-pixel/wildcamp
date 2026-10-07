import { wgs84ToLv95 } from '../coords';
import { COVERAGE_LAYERS, classifyCoverage, type CoverageInfo } from './coverage';

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
/** Mobile coverage cells are 100 m wide; a 3 x 3 px image at 1 m per pixel reads the exact cell (a 1 x 1 image comes back blank, a wide one blends cell edges). */
const COVER_SIZE = 3;
const COVER_HALF_M = 1.5;
/** A pixel counts as covered when at least this opaque (0 to 255). */
const MIN_ALPHA = 40;

export interface HazardInfo {
  /** Hazard areas the spot lies in. */
  inside: HazardKey[];
  /** Hazards whose lookup failed, so a missing hit is not read as "none". */
  failed: HazardKey[];
  /** Predicted mobile coverage outdoors (BAKOM), when it could be read. */
  coverage?: CoverageInfo;
  /** The coverage lookup failed (it is told of as unknown, never as "no signal"). */
  coverageFailed?: boolean;
}

/** True if the centre pixel of an RGBA image (size x size) is coloured. */
export function centreCovered(rgba: ArrayLike<number>, size = SIZE): boolean {
  const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  return (rgba[mid + 3] ?? 0) >= MIN_ALPHA;
}

async function decode(blob: Blob, size = SIZE): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, size, size).data;
}

/** A tiny map image of a WMS layer around a point, as RGBA pixels. */
async function pixels(layer: string, e: number, n: number, halfM: number, size: number, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    CRS: 'EPSG:2056',
    BBOX: `${e - halfM},${n - halfM},${e + halfM},${n + halfM}`,
    WIDTH: String(size),
    HEIGHT: String(size),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  });
  const res = await fetch(`${WMS}?${q}`, { signal });
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`${layer} returned ${type}`);
  return decode(await res.blob(), size);
}

async function covered(layer: string, e: number, n: number, signal?: AbortSignal): Promise<boolean> {
  return centreCovered(await pixels(layer, e, n, HALF_M, SIZE, signal));
}

export async function fetchHazards(lat: number, lon: number, signal?: AbortSignal): Promise<HazardInfo> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const keys = Object.keys(HAZARD_LAYERS) as HazardKey[];
  const [res, cov4, cov5] = await Promise.all([
    Promise.allSettled(keys.map((k) => covered(HAZARD_LAYERS[k], e, n, signal))),
    Promise.allSettled([pixels(COVERAGE_LAYERS.g4, e, n, COVER_HALF_M, COVER_SIZE, signal)]),
    Promise.allSettled([pixels(COVERAGE_LAYERS.g5, e, n, COVER_HALF_M, COVER_SIZE, signal)]),
  ]);
  const out: HazardInfo = { inside: [], failed: [] };
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value) out.inside.push(keys[i]!);
    } else out.failed.push(keys[i]!);
  });
  const a = cov4[0]!;
  const b = cov5[0]!;
  if (a.status === 'fulfilled' && b.status === 'fulfilled') out.coverage = { g4: classifyCoverage(a.value, COVER_SIZE), g5: classifyCoverage(b.value, COVER_SIZE) };
  else out.coverageFailed = true;
  return out;
}
