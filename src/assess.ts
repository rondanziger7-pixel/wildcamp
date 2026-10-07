import type { BuildingZoneInfo } from './buildingzone';
import type { Canton, CantonRule } from './cantons';
import type { Severity, ZoneLayer } from './zones';
import { tr } from './i18n';
import { localCantonName } from './cantons';

export type TreelineStatus = 'above' | 'forest' | 'below' | 'unknown';
export type Verdict = 'no' | 'caution' | 'likely_ok' | 'unknown';

export interface ZoneHit {
  layer: ZoneLayer;
  name?: string;
  /** Extra specifics from the source data, e.g. season or canton. */
  detail?: string;
  /** The zone's protection season as the source gives it ("dd.mm.-dd.mm."), if it has one. */
  season?: string;
}

/** A ban zone that begins close to the spot without containing it. */
export interface NearZone {
  layer: ZoneLayer;
  name?: string;
  /** Distance to its boundary in metres, when the boundary is known exactly (the bundled polygons). */
  distanceM?: number;
  /** Otherwise: it lies within this many metres (the federal layers are searched within a radius, not measured). */
  withinM?: number;
}

/** One line of the result checklist shown to the user. */
export interface Item {
  tone: 'bad' | 'warn' | 'ok' | 'info';
  title: string;
  text: string;
  /** Official source links, if the item rests on a recorded rule. */
  sources?: string[];
  /** A place the item is about (LV95), so the interface can show it on the map. */
  at?: { e: number; n: number; label: string };
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
  /** The verified municipal rule that was applied, for the notes that depend on how a rule is worded (gear, vehicles). */
  municipalRule?: CantonRule;
  /** True when the spot is outside Switzerland, where none of these checks apply. */
  outside?: boolean;
  /** How the treeline status was determined, shown to the user. */
  treelineNote?: string;
  /** Lookups that failed or are missing (zones, municipality, bundled data ...): the result may miss a ban. Empty or absent when everything was checked. */
  incomplete?: string[];
  /** Ban zones that begin close to the spot (GPS and the map can be off by that much). */
  nearZones?: NearZone[];
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
  /** False when the elevation could not be read (the treeline cannot be judged at all). Default true. */
  elevationKnown?: boolean;
  /** Lookups that failed or ran out of time, by name. A result made without them is never "likely OK". */
  incomplete?: string[];
  /** Ban zones that begin within reach of the spot but do not contain it. */
  nearZones?: NearZone[];
  /** Canton at the spot, if it could be determined. */
  canton?: Canton;
  /** Municipality at the spot, if it could be determined. */
  municipality?: string;
  /** A verified municipal rule for that municipality, if one is recorded. */
  municipalRule?: CantonRule;
  /** A reported but unverified municipal rule: shown as a warning, never as a ban. */
  municipalNote?: { text: string; sources: { url: string }[]; checkedOn: string };
  /** The national building-zone lookup for the spot (inside, near, or failed). */
  buildingZone?: BuildingZoneInfo;
  /** Set when the canton lookup worked but found no canton: the spot is outside Switzerland. */
  outsideSwitzerland?: boolean;
}): Assessment {
  if (input.outsideSwitzerland) {
    const text = tr('This spot is outside Switzerland (or in Liechtenstein). The rules, zones and parks checked here are Swiss, so nothing can be said about it. Look up the local rules of that country.');
    return { verdict: 'unknown', reasons: [text], items: [{ tone: 'warn', title: tr('Outside Switzerland'), text }], zones: [], treeline: input.treeline, outside: true };
  }
  const { zones, treeline, treelineNote, canton, municipality, municipalRule, municipalNote } = input;
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
    reasons.push(tr('Protected-zone data could not be loaded, so this spot is unchecked.'));
    items.push({ tone: 'warn', title: tr('Protected zones'), text: tr('Protected-zone data could not be loaded, so this spot is unchecked.') });
  } else if (worst === rank.caution) {
    verdict = 'caution';
  } else if (treeline === 'forest' || treeline === 'below') {
    verdict = 'caution';
    const t =
      treeline === 'forest'
        ? tr('In forest. Most cantons prohibit or restrict camping in forest.')
        : tr('Below the treeline. Camping is tolerated in some cantons only above it.');
    reasons.push(t);
    items.push({ tone: 'warn', title: treeline === 'forest' ? tr('In forest') : tr('Below the treeline'), text: t });
  } else if (treeline === 'unknown' && input.elevationKnown !== false) {
    // elevation known but the spot sits in the band where the treeline can't be placed: judge it as the cautious case
    // (below the treeline) instead of giving no answer, and say why
    verdict = 'caution';
    const t = tr('It is unclear whether this spot counts as above the treeline. Treat it as below it, where most cantons restrict camping.');
    reasons.push(t);
    items.push({ tone: 'warn', title: tr('Close to the treeline'), text: t });
  } else if (treeline === 'unknown') {
    verdict = 'unknown';
    reasons.push(tr('Could not determine whether this spot is above the treeline.'));
    items.push({ tone: 'warn', title: tr('Treeline'), text: tr('Could not determine whether this spot is above the treeline.') });
  } else {
    verdict = 'likely_ok';
    reasons.push(tr('Above the treeline and outside the federal protected zones checked.'));
    items.push({ tone: 'ok', title: tr('Above the treeline'), text: tr('Outside the federal protected zones checked.') });
  }

  const rule = canton?.rule;
  if (canton) {
    // No recorded cantonal rule: nothing is shown per spot. The footer disclaimer already says that cantons and
    // municipalities set the rules, and a notice repeated on every spot in 20 cantons drowned out the real ones.
    if (rule) {
      const stance = treeline === 'above' && rule.aboveTreeline ? rule.aboveTreeline : rule.stance;
      const note = stance !== rule.stance ? ' ' + tr('Above the treeline is treated as "in the mountains", which the law does not define.') : '';
      reasons.push(tr('{name}: {summary}{note} (source: {sources}, checked {date})', { name: localCantonName(canton), summary: tr(rule.summary), note, sources: rule.sources.map((x) => x.url).join(', '), date: rule.checkedOn }));
      items.push({
        tone: stance === 'banned' ? 'bad' : stance === 'restricted' ? 'warn' : 'info',
        title: tr('{name} rules', { name: localCantonName(canton) }),
        text: tr('{summary}{note} (checked {date})', { summary: tr(rule.summary), note, date: rule.checkedOn }),
        sources: rule.sources.map((x) => x.url),
      });
      if (stance === 'banned') verdict = 'no';
      else if (stance === 'restricted' && verdict === 'likely_ok') verdict = 'caution';
    }
  }
  if (treelineNote && !zones.some((z) => rank[z.layer.severity] >= rank.restricted)) {
    reasons.push(treelineNote);
    items.push({ tone: 'info', title: tr('How the treeline was checked'), text: treelineNote });
  }
  if (municipality) {
    if (municipalRule) {
      reasons.push(tr('{name} (municipality): {summary} (source: {sources}, checked {date})', { name: municipality, summary: tr(municipalRule.summary), sources: municipalRule.sources.map((x) => x.url).join(', '), date: municipalRule.checkedOn }));
      items.push({
        tone: municipalRule.stance === 'banned' ? 'bad' : municipalRule.stance === 'restricted' ? 'warn' : 'info',
        title: tr('{name} (municipality)', { name: municipality }),
        text: tr('{summary} (checked {date})', { summary: tr(municipalRule.summary), date: municipalRule.checkedOn }),
        sources: municipalRule.sources.map((x) => x.url),
      });
      if (municipalRule.stance === 'banned') verdict = 'no';
      else if (municipalRule.stance === 'restricted' && verdict === 'likely_ok') verdict = 'caution';
    } else if (municipalNote) {
      reasons.push(tr('{name} (municipality, unverified): {text}', { name: municipality, text: tr(municipalNote.text) }));
      items.push({ tone: 'warn', title: tr('{name}: reported camping ban, not verified', { name: municipality }), text: tr('{text} (checked {date})', { text: tr(municipalNote.text), date: municipalNote.checkedOn }), sources: municipalNote.sources.map((x) => x.url) });
      if (verdict === 'likely_ok') verdict = 'caution';
    } else {
      const t = tr('Municipal police regulations can add rules and are not checked here; look for the municipality\'s Polizeireglement / règlement de police.');
      reasons.push(tr('Municipality: {name}. {text}', { name: municipality, text: t }));
      items.push({ tone: 'info', title: tr('Municipality: {name}', { name: municipality }), text: t });
    }
  }
  const bz = input.buildingZone;
  if (bz?.failed) {
    items.push({ tone: 'info', title: tr('Building zones could not be checked'), text: tr('Whether this spot is inside a village or city could not be checked. Land in settlements is private or municipal and outside the public access right; check before you camp.') });
  } else if (bz?.inside) {
    const t = tr('The spot lies inside a building zone ({name}, national harmonised map of building zones). In settlements the public right of access does not apply: Art. 699 ZGB opens only forest and pasture to everyone. Built-up land is private or municipal, so camping needs the owner\'s consent (the owner may repel any unjustified use, Art. 641 ZGB), an enclosed garden or yard is also protected by the trespass offence (Art. 186 StGB), and municipal police regulations commonly ban camping on public ground (see the municipality line). Move out of the settlement, or ask.', { name: bz.inside.name });
    reasons.push(t);
    items.push({ tone: 'warn', title: tr('In a village or city (building zone)'), text: t, sources: ['https://fedlex.data.admin.ch/eli/cc/24/233_245_233', 'https://fedlex.data.admin.ch/eli/cc/54/757_781_799', 'https://map.geo.admin.ch/?layers=ch.are.bauzonen'] });
    if (verdict === 'likely_ok' || verdict === 'unknown') verdict = 'caution';
  } else if (bz?.near) {
    items.push({ tone: 'info', title: tr('Close to a village or city'), text: tr('A building zone lies within about 150 m. Land next to settlements is mostly private farmland or gardens: Art. 699 ZGB gives access to forest and pasture only, owners can refuse camping on their land, and a tent here is rarely unnoticed. Ask the landowner, or walk further out.'), sources: ['https://fedlex.data.admin.ch/eli/cc/24/233_245_233', 'https://map.geo.admin.ch/?layers=ch.are.bauzonen'] });
  }
  if (verdict === 'likely_ok' || verdict === 'caution') {
    reasons.push(tr('Cantonal and municipal rules, private land and wildlife quiet zones that are not yet mapped are not checked (the federal map is incomplete: its status varies between cantons).'));
    items.push({ tone: 'info', title: tr('Not checked'), text: tr('Cantonal and municipal rules, private land and wildlife quiet zones that are not yet mapped are not checked (the federal map is incomplete: its status varies between cantons).') });
  }
  const nearZones = input.nearZones ?? [];
  for (const z of nearZones) {
    const where = z.name ? `${z.layer.label}: ${z.name}` : z.layer.label;
    const m = z.distanceM !== undefined ? Math.max(10, Math.round(z.distanceM / 10) * 10) : (z.withinM ?? 150);
    const text = z.distanceM !== undefined
      ? tr('Its boundary is about {m} m away. A GPS fix and a map can be off by that much, so look at the boundary on the map before you pitch.', { m })
      : tr('Its boundary is within about {m} m. A GPS fix and a map can be off by that much, so look at the boundary on the map before you pitch.', { m });
    reasons.push(`${where}. ${text}`);
    items.push({ tone: 'warn', title: tr('{zone} begins close by', { zone: where }), text });
    if (verdict === 'likely_ok') verdict = 'caution';
  }
  const incomplete = input.incomplete ?? [];
  if (incomplete.length) {
    const text = tr('These checks could not be made: {list}. A ban or restriction may be missing from this result, so do not rely on it.', { list: incomplete.map(checkLabel).join(', ') });
    reasons.push(text);
    items.push({ tone: 'warn', title: tr('Not fully checked'), text });
    // a ban that was found stays a ban; anything softer cannot be called "likely OK" with a check missing
    if (verdict === 'likely_ok') verdict = 'unknown';
  }
  return { verdict, reasons, items, zones, treeline, treelineNote, canton, municipality, municipalRule, incomplete: incomplete.length ? [...incomplete] : undefined, nearZones: nearZones.length ? nearZones : undefined };
}

/** A lookup's name as shown to the user. */
export function checkLabel(name: string): string {
  switch (name) {
    case 'zones':
      return tr('protected zones');
    case 'canton':
      return tr('canton');
    case 'municipality':
      return tr('municipality');
    case 'elevation':
      return tr('elevation');
    case 'building zones':
      return tr('building zones');
    case 'Jura reserves':
      return tr('Jura reserves');
    case 'local rule data':
      return tr('the rule data bundled with the app');
    default:
      return name;
  }
}
