import type { TreelineStatus } from './assess';
import { estimateTreeline } from './assess';
import { FOREST_CLASS_LABEL, forestAt, nearestForestM, type ForestMask } from './forestmask';
import { treelineAt, type TreelineSurface } from './treelinesurface';

/** Elevation above which a spot with no forest nearby counts as above the treeline. */
export const ABOVE_TREELINE_MIN_M = 1800;
/** Below this, an unforested spot is valley/lowland, not alpine. */
export const BELOW_TREELINE_MAX_M = 1500;
/** "Above the treeline" is only claimed from this elevation, whatever a low local forest limit suggests (grazed alps sit under the natural limit). */
export const ABOVE_LOCAL_MIN_M = 1600;
/** With a local treeline estimate, spots within this many metres of it count as undecided. */
export const TREELINE_MARGIN_M = 100;
/** How far to look for forest before trusting that a spot is clear of it. */
export const FOREST_SEARCH_M = 500;

export interface TreelineResult {
  status: TreelineStatus;
  note: string;
}

/**
 * Combine the forest map, the local treeline altitude, and elevation. Where no
 * local treeline estimate exists, fixed elevation bands are used and unforested
 * spots near forest or at mid elevations stay "unknown" rather than guessing.
 */
export function classifyTreeline(
  mask: ForestMask | undefined,
  surface: TreelineSurface | undefined,
  e: number,
  n: number,
  elevationM: number | undefined,
): TreelineResult {
  if (!mask) {
    return {
      status: estimateTreeline(elevationM),
      note: 'Forest map unavailable; treeline estimated from elevation only.',
    };
  }
  const cls = forestAt(mask, e, n);
  if (cls !== 0) {
    return { status: 'forest', note: `Mapped as ${FOREST_CLASS_LABEL[cls]} (swissTLM3D).` };
  }
  const m = elevationM === undefined ? undefined : Math.round(elevationM);
  const local = surface ? treelineAt(surface, e, n) : undefined;
  if (elevationM !== undefined && local !== undefined && elevationM >= BELOW_TREELINE_MAX_M) {
    const where = `${m} m, upper forest limit nearby about ${local} m`;
    if (elevationM >= local + TREELINE_MARGIN_M) {
      if (elevationM < ABOVE_LOCAL_MIN_M) return { status: 'unknown', note: `Higher than the forest nearby, but ${m} m is low for a treeline, so it can't be called: ${where}.` };
      return { status: 'above', note: `Above the treeline: ${where}.` };
    }
    if (elevationM < local - TREELINE_MARGIN_M) return { status: 'below', note: `Not in forest, but below the local treeline: ${where}.` };
    return { status: 'unknown', note: `Close to the local treeline, can't tell which side: ${where}.` };
  }
  // Lowland is below the treeline whatever is around it.
  if (elevationM !== undefined && elevationM < BELOW_TREELINE_MAX_M) {
    return { status: 'below', note: `Not in forest, but ${m} m is below the usual treeline.` };
  }
  const near = nearestForestM(mask, e, n, FOREST_SEARCH_M);
  if (near !== undefined) {
    return {
      status: 'unknown',
      note: `Not in forest, but forest is ${near} m away, so the local treeline can't be judged.`,
    };
  }
  if (elevationM === undefined) {
    return { status: 'unknown', note: `No forest within ${FOREST_SEARCH_M} m; elevation unavailable.` };
  }
  if (elevationM >= ABOVE_TREELINE_MIN_M) {
    return { status: 'above', note: `No forest within ${FOREST_SEARCH_M} m at ${m} m elevation.` };
  }
  return { status: 'unknown', note: `No forest within ${FOREST_SEARCH_M} m, but ${m} m is within the treeline band.` };
}
