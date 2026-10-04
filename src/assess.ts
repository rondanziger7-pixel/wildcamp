import type { Canton, CantonRule } from './cantons';
import type { Severity, ZoneLayer } from './zones';

export type TreelineStatus = 'above' | 'forest' | 'below' | 'unknown';
export type Verdict = 'no' | 'caution' | 'likely_ok' | 'unknown';

export interface ZoneHit {
  layer: ZoneLayer;
  name?: string;
  /** Extra specifics from the source data, e.g. season or canton. */
  detail?: string;
}

/** One line of the result checklist shown to the user. */
export interface Item {
  tone: 'bad' | 'warn' | 'ok' | 'info';
  title: string;
  text: string;
  /** Official source links, if the item rests on a recorded rule. */
  sources?: string[];
}

export interface Assessment {
  verdict: Verdict;
  reasons: string[];
  /** Same findings as `reasons`, structured for display. */
  items: Item[];
  zones: ZoneHit[];
  treeline: TreelineStatus;
  canton?: Canton;
  municipality?: string;
  /** How the treeline status was determined, shown to the user. */
  treelineNote?: string;
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

const rank: Record<Severity, number> = { prohibited: 3, restricted: 2, caution: 1, info: 0 };

export function assess(input: {
  zones: ZoneHit[];
  treeline: TreelineStatus;
  /** Set when a zone lookup failed, so "no hits" can't be trusted. */
  zoneLookupFailed?: boolean;
  treelineNote?: string;
  /** Canton at the spot, if it could be determined. */
  canton?: Canton;
  /** Municipality at the spot, if it could be determined. */
  municipality?: string;
  /** A verified municipal rule for that municipality, if one is recorded. */
  municipalRule?: CantonRule;
}): Assessment {
  const { zones, treeline, treelineNote, canton, municipality, municipalRule } = input;
  const reasons: string[] = [];
  const items: Item[] = [];
  const worst = zones.reduce<number>((m, z) => Math.max(m, rank[z.layer.severity]), -1);

  for (const z of zones) {
    const where = z.name ? `${z.layer.label}: ${z.name}` : z.layer.label;
    reasons.push(`${where}. ${z.layer.note}${z.detail ? ` ${z.detail}` : ''}`);
    items.push({
      tone: rank[z.layer.severity] >= rank.restricted ? 'bad' : rank[z.layer.severity] === rank.caution ? 'warn' : 'info',
      title: where,
      text: `${z.layer.note}${z.detail ? ` ${z.detail}` : ''}`,
    });
  }

  let verdict: Verdict;
  if (worst >= rank.restricted) {
    verdict = 'no';
  } else if (input.zoneLookupFailed) {
    verdict = 'unknown';
    reasons.push('Protected-zone data could not be loaded, so this spot is unchecked.');
    items.push({ tone: 'warn', title: 'Protected zones', text: 'Protected-zone data could not be loaded, so this spot is unchecked.' });
  } else if (worst === rank.caution) {
    verdict = 'caution';
  } else if (treeline === 'forest' || treeline === 'below') {
    verdict = 'caution';
    const t =
      treeline === 'forest'
        ? 'In forest. Most cantons prohibit or restrict camping in forest.'
        : 'Below the treeline. Camping is tolerated in some cantons only above it.';
    reasons.push(t);
    items.push({ tone: 'warn', title: treeline === 'forest' ? 'In forest' : 'Below the treeline', text: t });
  } else if (treeline === 'unknown') {
    verdict = 'unknown';
    reasons.push('Could not determine whether this spot is above the treeline.');
    items.push({ tone: 'warn', title: 'Treeline', text: 'Could not determine whether this spot is above the treeline.' });
  } else {
    verdict = 'likely_ok';
    reasons.push('Above the treeline and outside the federal protected zones checked.');
    items.push({ tone: 'ok', title: 'Above the treeline', text: 'Outside the federal protected zones checked.' });
  }

  const rule = canton?.rule;
  if (canton) {
    if (!rule) {
      reasons.push(`${canton.name}: cantonal rules are not verified in this app. Check with the canton or municipality.`);
      items.push({ tone: 'info', title: `${canton.name} rules`, text: 'Cantonal rules are not verified in this app. Check with the canton or municipality.' });
    } else {
      const stance = treeline === 'above' && rule.aboveTreeline ? rule.aboveTreeline : rule.stance;
      const note = stance !== rule.stance ? ' Above the treeline is treated as "in the mountains", which the law does not define.' : '';
      reasons.push(`${canton.name}: ${rule.summary}${note} (source: ${rule.sources.map((x) => x.url).join(', ')}, checked ${rule.checkedOn})`);
      items.push({
        tone: stance === 'banned' ? 'bad' : stance === 'restricted' ? 'warn' : 'info',
        title: `${canton.name} rules`,
        text: `${rule.summary}${note} (checked ${rule.checkedOn})`,
        sources: rule.sources.map((x) => x.url),
      });
      if (stance === 'banned') verdict = 'no';
      else if (stance === 'restricted' && verdict === 'likely_ok') verdict = 'caution';
    }
  }
  if (treelineNote && !zones.some((z) => rank[z.layer.severity] >= rank.restricted)) {
    reasons.push(treelineNote);
    items.push({ tone: 'info', title: 'How the treeline was checked', text: treelineNote });
  }
  if (municipality) {
    if (municipalRule) {
      reasons.push(`${municipality} (municipality): ${municipalRule.summary} (source: ${municipalRule.sources.map((x) => x.url).join(', ')}, checked ${municipalRule.checkedOn})`);
      items.push({
        tone: municipalRule.stance === 'banned' ? 'bad' : municipalRule.stance === 'restricted' ? 'warn' : 'info',
        title: `${municipality} (municipality)`,
        text: `${municipalRule.summary} (checked ${municipalRule.checkedOn})`,
        sources: municipalRule.sources.map((x) => x.url),
      });
      if (municipalRule.stance === 'banned') verdict = 'no';
      else if (municipalRule.stance === 'restricted' && verdict === 'likely_ok') verdict = 'caution';
    } else {
      const t = `Municipal police regulations can add rules and are not checked here; look for the municipality's Polizeireglement / règlement de police.`;
      reasons.push(`Municipality: ${municipality}. ${t}`);
      items.push({ tone: 'info', title: `Municipality: ${municipality}`, text: t });
    }
  }
  if (verdict === 'likely_ok' || verdict === 'caution') {
    reasons.push('Cantonal and municipal rules, private land and wildlife quiet zones that are not yet mapped are not checked (the federal map is incomplete: its status varies between cantons).');
    items.push({ tone: 'info', title: 'Not checked', text: 'Cantonal and municipal rules, private land and wildlife quiet zones that are not yet mapped are not checked (the federal map is incomplete: its status varies between cantons).' });
  }
  return { verdict, reasons, items, zones, treeline, treelineNote, canton, municipality };
}
