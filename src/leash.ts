import type { Item } from './assess';
import { dateLocale, tr } from './i18n';

/**
 * Dogs and wildlife: what the law says about a lead, by canton, for the person who travels with a dog. Federal law has no general
 * leash duty (JSG Art. 7 para. 4 leaves the protection from disturbance to the cantons; Art. 18 para. 1 let. d fines letting a dog hunt
 * wildlife). Read on the primary texts on 2026-10-07 (docs/sources/CH/README_dogs_groups_drones.md): where a cantonal text sets a forest
 * leash period it is listed; where none was found that is said as "none found", never as "off the lead is fine".
 */

export interface LeashRule {
  /** Period as [month, day] to [month, day], both included. */
  from: [number, number];
  to: [number, number];
  /** Also within this many metres of the forest edge, where the text says so. */
  edgeM?: number;
  /** The law and article, as read. */
  /** The law names the forest edge or its vicinity without a distance. */
  edgeNear?: boolean;
  law: string;
  url: string;
  /** `announced`: an official announcement was read, the article was not found. */
  basis: 'law' | 'announced';
}

export const LEASH: Record<string, LeashRule> = {
  AG: { from: [4, 1], to: [7, 31], edgeM: 50, law: 'Jagdverordnung SAR 933.211 § 21', url: 'https://gesetzessammlungen.ag.ch/app/de/texts_of_law/933.211', basis: 'law' },
  LU: { from: [4, 1], to: [7, 31], edgeM: 50, law: 'Kantonale Jagdverordnung SRL 725a § 27', url: 'https://srl.lu.ch/app/de/texts_of_law/725a', basis: 'law' },
  SO: { from: [4, 1], to: [7, 31], law: 'Hundeverordnung BGS 614.72 § 4', url: 'https://bgs.so.ch/app/de/texts_of_law/614.72', basis: 'law' },
  TG: { from: [4, 1], to: [7, 31], edgeNear: true, law: 'Hundegesetz RB 641.2 § 3 para. 2', url: 'https://www.rechtsbuch.tg.ch/app/de/texts_of_law/641.2', basis: 'law' },
  BL: { from: [4, 1], to: [7, 31], edgeNear: true, law: 'Wildtier- und Jagdgesetz SGS 520 § 12', url: 'https://bl.clex.ch/app/de/texts_of_law/520', basis: 'law' },
  FR: { from: [4, 1], to: [7, 15], law: 'Règlement sur la détention des chiens RSF 725.31 Art. 26', url: 'https://bdlf.fr.ch/app/fr/texts_of_law/725.31', basis: 'law' },
  UR: { from: [4, 1], to: [7, 31], edgeM: 50, law: 'Jagdverordnung (announced in the Amtsblatt Nr. 13 of 28 March 2024)', url: 'https://www.ur.ch/newsarchiv/112567', basis: 'announced' },
};

/** Cantons whose texts were read and have no general forest leash period (leads come from wildlife areas, livestock and municipal rules). */
export const NO_FOREST_SEASON = ['BE', 'SG', 'GR', 'VS', 'NW', 'ZG'];

const JSG = 'https://www.fedlex.admin.ch/eli/cc/1988/506_506_506/de';
const NATIONAL_PARK = 'https://nationalpark.ch/schutzbestimmungen/';

const inPeriod = (d: Date, r: LeashRule) => {
  const v = (d.getMonth() + 1) * 100 + d.getDate();
  return v >= r.from[0] * 100 + r.from[1] && v <= r.to[0] * 100 + r.to[1];
};
const fmt = (p: [number, number]) => new Date(2001, p[0] - 1, p[1]).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' });

export interface DogContext {
  canton?: string;
  /** The night chosen (its evening). */
  date: Date;
  /** The spot lies in the Swiss National Park. */
  inNationalPark?: boolean;
  /** The forest map says the spot is in forest. */
  inForest?: boolean;
}

/** Notes for a person with a dog, from the leash rules read per canton. */
export function dogItems(c: DogContext): Item[] {
  const out: Item[] = [];
  if (c.inNationalPark) out.push({ tone: 'bad', title: tr('No dogs in the National Park'), text: tr('Dogs may not be taken into the Swiss National Park, not even on a lead (Nationalparkordnung Art. 5 para. 1 let. g). The same article bans bivouacking.'), sources: [NATIONAL_PARK] });
  const rule = c.canton ? LEASH[c.canton] : undefined;
  if (rule) {
    const period = tr('from {from} to {to}', { from: fmt(rule.from), to: fmt(rule.to) });
    const edge = rule.edgeM ? ' ' + tr('and within {m} m of its edge', { m: rule.edgeM }) : rule.edgeNear ? ' ' + tr('and at its edge') : '';
    const running = inPeriod(c.date, rule);
    const where = c.inForest ? ' ' + tr('The forest map puts this spot in forest.') : '';
    if (rule.basis === 'announced') {
      out.push({ tone: running ? 'warn' : 'info', title: tr('Dogs on a lead in forest (announced)'), text: tr('The canton announced a duty to keep dogs on a lead in forest and at its edge {period}. The article of the ordinance was not found: {law}.', { period, law: tr(rule.law) }) + where, sources: [rule.url] });
    } else if (running) {
      out.push({ tone: 'warn', title: tr('Dogs on a lead in forest'), text: tr('In this canton dogs must be kept on a lead in forest {period}{edge} ({law}). The night you chose falls in that period.', { period, edge, law: tr(rule.law) }) + where, sources: [rule.url] });
    } else {
      out.push({ tone: 'info', title: tr('Dogs on a lead in forest: not in this period'), text: tr('In this canton dogs must be on a lead in forest {period}{edge} ({law}). It is not running on the night you chose; wildlife areas, livestock and municipal rules can still ask for a lead.', { period, edge, law: tr(rule.law) }), sources: [rule.url] });
    }
  } else if (c.canton && NO_FOREST_SEASON.includes(c.canton)) {
    out.push({ tone: 'info', title: tr('No general forest leash period found'), text: tr('The cantonal texts read for this canton have no general leash period for forest. Leads are asked for in wildlife areas, near livestock and by municipal rules, so this is not a sign that dogs may run free.') });
  } else if (c.canton) {
    out.push({ tone: 'info', title: tr('The leash rules of this canton were not checked'), text: tr('This app has not read the dog rules of this canton. Many cantons require a lead in forest in spring and early summer: look at the signs and the canton\'s hunting or dog office.') });
  }
  out.push({ tone: 'info', title: tr('Federal law: no general leash duty'), text: tr('Federal law has no general leash duty. The cantons protect wild animals from disturbance, and letting a dog hunt wildlife is punishable with a fine of up to CHF 20,000 (Hunting Act Art. 18 para. 1 let. d). Pastures with herd-protection dogs are in the Hunting and animals tab.'), sources: [JSG] });
  return out;
}
