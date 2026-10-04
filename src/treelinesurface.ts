import { gunzipIfNeeded } from './binary';

/** Local upper forest limit (m) on a 1 km grid, built by scripts/build_treeline_surface.py. */
export interface TreelineSurface {
  width: number;
  height: number;
  cell: number;
  x0: number;
  y0: number;
  heights: Int16Array;
}

const MAGIC = [0x57, 0x54, 0x4c, 0x31]; // "WTL1"
const HEADER = 24;

export function parseTreelineSurface(bytes: Uint8Array): TreelineSurface {
  if (bytes.length < HEADER || MAGIC.some((m, i) => bytes[i] !== m)) {
    throw new Error('not a treeline surface');
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = v.getInt32(4, true);
  const height = v.getInt32(8, true);
  const cell = v.getInt32(12, true);
  const x0 = v.getInt32(16, true);
  const y0 = v.getInt32(20, true);
  if (bytes.length < HEADER + width * height * 2) throw new Error('truncated treeline surface');
  const heights = new Int16Array(width * height);
  for (let i = 0; i < heights.length; i++) heights[i] = v.getInt16(HEADER + i * 2, true);
  return { width, height, cell, x0, y0, heights };
}

export async function decodeTreelineSurface(buf: ArrayBuffer): Promise<TreelineSurface> {
  return parseTreelineSurface(await gunzipIfNeeded(buf));
}

export async function loadTreelineSurface(url: string): Promise<TreelineSurface> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`treeline surface ${res.status}`);
  return decodeTreelineSurface(await res.arrayBuffer());
}

/** Estimated local treeline altitude in metres at an LV95 coordinate, or undefined if there is no estimate. */
export function treelineAt(s: TreelineSurface, e: number, n: number): number | undefined {
  const col = Math.floor((e - s.x0) / s.cell);
  const row = Math.floor((s.y0 - n) / s.cell);
  if (col < 0 || row < 0 || col >= s.width || row >= s.height) return undefined;
  const h = s.heights[row * s.width + col] ?? 0;
  return h > 0 ? h : undefined;
}
