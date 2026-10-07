/**
 * Predicted mobile coverage outdoors (BAKOM "Breitbandatlas"): a grid of 100 m cells, each telling how many of the three operators can
 * theoretically provide the technology outdoors. Operator predictions, not measurements, not inside a tent or a hut, no signal strength, no operator
 * split: "no coverage in the model" does not mean no reception, and "covered" does not promise it (valley shadow, ridges). 2G is switched off in
 * Switzerland and 3G is nearly gone (no cell of the 3G layer was fully covered in 189 sample points), so only 4G and 5G are read.
 * docs/sources/CH/README_mobile_coverage.md has the sources.
 */
export const COVERAGE_LAYERS = { g4: 'ch.bakom.mobilnetz-4g', g5: 'ch.bakom.mobilnetz-5g' } as const;

/** all three providers, fewer than three, or none expected. */
export type Coverage = 'all' | 'some' | 'none';

export interface CoverageInfo {
  g4: Coverage;
  g5: Coverage;
}

/** A pixel more transparent than this counts as "no cell here". */
const MIN_ALPHA = 40;

/**
 * Read the centre pixel of the coverage image: green (0, 150, 0) is "covered by 3 providers", orange (255, 186, 0) "covered by less than 3", and a
 * transparent pixel no provider (or a place outside Switzerland).
 */
export function classifyCoverage(rgba: ArrayLike<number>, size = 3): Coverage {
  const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  const [r = 0, g = 0, b = 0, a = 0] = [rgba[mid], rgba[mid + 1], rgba[mid + 2], rgba[mid + 3]];
  if (a < MIN_ALPHA) return 'none';
  // green is "all three"; orange, and any colour that is not the green of the legend, is the cautious "some"
  return r < 80 && g > 100 && b < 80 ? 'all' : 'some';
}
