import { gunzipIfNeeded } from './binary';
import { wgs84ToLv95 } from './coords';

/** Forest cover grid built by scripts/build_forest_mask.py from swissTLM3D. */
export type ForestClass = 0 | 1 | 2 | 3; // none, Wald, Wald offen, Gebueschwald

export const FOREST_CLASS_LABEL: Record<Exclude<ForestClass, 0>, string> = {
  1: 'forest',
  2: 'open forest',
  3: 'shrub forest',
};

export interface ForestMask {
  width: number;
  height: number;
  cell: number;
  x0: number;
  y0: number;
  data: Uint8Array;
}

const MAGIC = [0x57, 0x46, 0x4d, 0x31]; // "WFM1"
const HEADER = 24;

/** Parse the decompressed mask format. */
export function parseForestMask(bytes: Uint8Array): ForestMask {
  if (bytes.length < HEADER || MAGIC.some((m, i) => bytes[i] !== m)) {
    throw new Error('not a forest mask');
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getInt32(4, true);
  const height = v.getInt32(8, true);
  const cell = v.getInt32(12, true);
  const x0 = v.getInt32(16, true);
  const y0 = v.getInt32(20, true);
  if (bytes.length < HEADER + (width * height) / 4) throw new Error('truncated forest mask');
  return { width, height, cell, x0, y0, data: bytes.subarray(HEADER) };
}

export async function decodeForestMask(buf: ArrayBuffer): Promise<ForestMask> {
  return parseForestMask(await gunzipIfNeeded(buf));
}

export async function loadForestMask(url: string, init?: RequestInit): Promise<ForestMask> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`forest mask ${res.status}`);
  return decodeForestMask(await res.arrayBuffer());
}

/** Forest class at an LV95 coordinate; cells outside the grid read as 0. */
export function forestAt(m: ForestMask, e: number, n: number): ForestClass {
  const col = Math.floor((e - m.x0) / m.cell);
  const row = Math.floor((m.y0 - n) / m.cell);
  return cellAt(m, col, row);
}

function cellAt(m: ForestMask, col: number, row: number): ForestClass {
  if (col < 0 || row < 0 || col >= m.width || row >= m.height) return 0;
  const i = row * m.width + col;
  return (((m.data[i >> 2] ?? 0) >> ((i & 3) * 2)) & 3) as ForestClass;
}

/** Distance in metres to the nearest forest cell within maxM, or undefined if none. */
export function nearestForestM(m: ForestMask, e: number, n: number, maxM: number): number | undefined {
  const c0 = Math.floor((e - m.x0) / m.cell);
  const r0 = Math.floor((m.y0 - n) / m.cell);
  const reach = Math.ceil(maxM / m.cell);
  let best = Infinity;
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      if (cellAt(m, c0 + dc, r0 + dr) === 0) continue;
      best = Math.min(best, Math.hypot(dc, dr) * m.cell);
    }
  }
  return best <= maxM ? Math.round(best) : undefined;
}

export function forestAtWgs84(m: ForestMask, lat: number, lon: number) {
  const { e, n } = wgs84ToLv95(lat, lon);
  return { e, n, cls: forestAt(m, e, n) };
}
