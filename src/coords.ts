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

/** Swiss LV95 (EPSG:2056) -> WGS84, swisstopo's approximate formulas (~1 m accuracy). */
export function lv95ToWgs84(e: number, n: number): { lat: number; lon: number } {
  const y = (e - 2600000) / 1000000;
  const x = (n - 1200000) / 1000000;
  const lonUnits = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x ** 2 - 0.0436 * y ** 3;
  const latUnits = 16.9023892 + 3.238272 * x - 0.270978 * y ** 2 - 0.002528 * x ** 2 - 0.0447 * y ** 2 * x - 0.014 * x ** 3;
  return { lat: (latUnits * 100) / 36, lon: (lonUnits * 100) / 36 };
}
