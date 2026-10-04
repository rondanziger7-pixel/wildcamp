import type { Severity, ZoneLayer } from './zones';

export type TreelineStatus = 'above' | 'forest' | 'below' | 'unknown';
export type Verdict = 'no' | 'caution' | 'likely_ok' | 'unknown';

export interface ZoneHit {
  layer: ZoneLayer;
  name?: string;
}

export interface Assessment {
  verdict: Verdict;
  reasons: string[];
  zones: ZoneHit[];
  treeline: TreelineStatus;
}

/**
 * Elevation-only fallback. Treeline in Switzerland runs ~1800-2300 m depending on
 * region and aspect, so only the clear cases are decided.
 */
export function estimateTreeline(elevationM: number | undefined): TreelineStatus {
  if (elevationM === undefined || Number.isNaN(elevationM)) return 'unknown';
  if (elevationM >= 2300) return 'above';
  if (elevationM < 1500) return 'below';
  return 'unknown';
}

const rank: Record<Severity, number> = { prohibited: 2, restricted: 1, info: 0 };

export function assess(input: {
  zones: ZoneHit[];
  treeline: TreelineStatus;
  /** Set when a zone lookup failed, so "no hits" can't be trusted. */
  zoneLookupFailed?: boolean;
}): Assessment {
  const { zones, treeline } = input;
  const reasons: string[] = [];
  const worst = zones.reduce<number>((m, z) => Math.max(m, rank[z.layer.severity]), -1);

  for (const z of zones) {
    const where = z.name ? `${z.layer.label}: ${z.name}` : z.layer.label;
    reasons.push(`${where}. ${z.layer.note}`);
  }

  let verdict: Verdict;
  if (worst === rank.prohibited) {
    verdict = 'no';
  } else if (worst === rank.restricted) {
    verdict = 'no';
  } else if (input.zoneLookupFailed) {
    verdict = 'unknown';
    reasons.push('Protected-zone data could not be loaded, so this spot is unchecked.');
  } else if (treeline === 'forest' || treeline === 'below') {
    verdict = 'caution';
    reasons.push(
      treeline === 'forest'
        ? 'In forest. Most cantons prohibit or restrict camping in forest.'
        : 'Below the treeline. Camping is tolerated in some cantons only above it.',
    );
  } else if (treeline === 'unknown') {
    verdict = 'unknown';
    reasons.push('Could not determine whether this spot is above the treeline.');
  } else {
    verdict = 'likely_ok';
    reasons.push('Above the treeline and outside the federal protected zones checked.');
  }

  if (verdict === 'likely_ok' || verdict === 'caution') {
    reasons.push('Cantonal and municipal rules, and private land, are not checked.');
  }
  return { verdict, reasons, zones, treeline };
}
