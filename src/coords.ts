/** WGS84 -> Swiss LV95 (EPSG:2056), swisstopo's approximate formulas (~1 m accuracy). */
export function wgs84ToLv95(lat: number, lon: number): { e: number; n: number } {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e =
    2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p ** 2 - 44.54 * l ** 3;
  const n =
    1200147.07 + 308807.95 * p + 3745.25 * l ** 2 + 76.63 * p ** 2 - 194.56 * l ** 2 * p + 119.79 * p ** 3;
  return { e, n };
}

/** Rough bounding box of Switzerland incl. margin. */
export function isInSwitzerland(lat: number, lon: number): boolean {
  return lat >= 45.8 && lat <= 47.85 && lon >= 5.9 && lon <= 10.55;
}
