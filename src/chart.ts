/** Pure helpers for the small SVG charts in the weather card. */

/** Round range to clean tick values: about `count` ticks at a 1, 2, 2.5 or 5 step. */
export function niceScale(min: number, max: number, count = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: lo, max: hi, ticks };
}

/** Index of the data point nearest to a pointer x inside the plot area. */
export function nearestIndex(x: number, count: number, left: number, right: number): number {
  if (count <= 1) return 0;
  const f = (x - left) / (right - left);
  return Math.max(0, Math.min(count - 1, Math.round(f * (count - 1))));
}

/** x position of point i of n inside [left, right]. */
export const xAt = (i: number, n: number, left: number, right: number) => (n <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));

/** SVG path through points, skipping gaps (null values break the line). */
export function linePath(xs: number[], ys: (number | null)[]): string {
  let d = '';
  let pen = false;
  ys.forEach((y, i) => {
    if (y === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xs[i]!.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Local hour label "18", "00" from "YYYY-MM-DDTHH:MM". */
export const hourLabel = (t: string) => t.slice(11, 13);
