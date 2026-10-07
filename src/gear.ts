import type { Item } from './assess';
import type { CantonRule } from './cantons';
import { dogItems } from './leash';
import { tr } from './i18n';

/**
 * How the person sleeps: the shelter, how many people, a dog. The rules the app knows are written for tents, so a different set-up
 * gets notes on how the texts read for it. Notes only quote what the rule texts say (the same summaries the legality details
 * show); they never change the verdict and never say that something is allowed which a text does not.
 */

export type Shelter = 'tent' | 'tarp' | 'bivy' | 'vehicle';
export const SHELTERS: Shelter[] = ['tent', 'tarp', 'bivy', 'vehicle'];
export const MAX_PEOPLE = 30;

export interface Gear {
  shelter: Shelter;
  people: number;
  dog: boolean;
}

export const DEFAULT_GEAR: Gear = { shelter: 'tent', people: 1, dog: false };
export const GEAR_KEY = 'wildcamp.gear.v1';

export const isDefaultGear = (g: Gear) => g.shelter === DEFAULT_GEAR.shelter && g.people === DEFAULT_GEAR.people && g.dog === DEFAULT_GEAR.dog;

export function cleanGear(raw: unknown): Gear {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const people = typeof r.people === 'number' && Number.isFinite(r.people) ? Math.max(1, Math.min(MAX_PEOPLE, Math.round(r.people))) : DEFAULT_GEAR.people;
  return { shelter: SHELTERS.includes(r.shelter as Shelter) ? (r.shelter as Shelter) : DEFAULT_GEAR.shelter, people, dog: r.dog === true };
}

export function loadGear(store: Pick<Storage, 'getItem'> | undefined): Gear {
  try {
    return cleanGear(JSON.parse(store?.getItem(GEAR_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_GEAR };
  }
}

/** False when the browser would not keep it (the choice then lasts until the page is closed). */
export function saveGear(store: Pick<Storage, 'setItem' | 'removeItem'> | undefined, g: Gear): boolean {
  try {
    if (isDefaultGear(g)) store?.removeItem(GEAR_KEY);
    else store?.setItem(GEAR_KEY, JSON.stringify(g));
    return !!store;
  } catch {
    return false;
  }
}

export const shelterName = (s: Shelter) => (s === 'tent' ? tr('Tent') : s === 'tarp' ? tr('Tarp or hammock') : s === 'bivy' ? tr('Bivy bag or under the stars') : tr('Car, van or motorhome'));

/** "Bivy bag or under the stars · 2 people · with a dog", the set-up in one line. */
export function gearLine(g: Gear): string {
  return [shelterName(g.shelter), g.people === 1 ? tr('1 person') : tr('{n} people', { n: g.people }), g.dog ? tr('with a dog') : ''].filter(Boolean).join(' · ');
}

/** How a rule text treats sleeping outdoors without a tent. */
export type Tentless = 'covered' | 'left-out' | 'silent';

/** Read from the wording the repository's summaries use for it (a test pins the classification of every recorded municipality). */
export function tentlessStance(summary: string): Tentless {
  if (/expressly includes sleeping outdoors without a tent/i.test(summary)) return 'covered';
  if (/expressly excludes sleeping outdoors without a tent|sleeping outdoors without a tent is expressly allowed|overnighting without a tent in public parks/i.test(summary)) return 'left-out';
  return 'silent';
}

const namesVehicles = (s: string) => /\b(vehicles?|caravans?|motorhomes?|campers?|mobile homes?|car parks?)\b/i.test(s);
const namesTarps = (s: string) => /\b(tarps?|emergency roofs?|camper roofs?)\b/i.test(s);
const namesGroups = (s: string) => /\bgroups?\b/i.test(s);
const namesBivouac = (s: string) => /\bbivou?ac(k|king|s)?\b/i.test(s);

export interface GearContext {
  canton?: { code?: string; name: string; rule?: CantonRule };
  municipality?: string;
  municipalRule?: CantonRule;
  /** The night chosen (its evening); today when not given. */
  date?: Date;
  inNationalPark?: boolean;
  inForest?: boolean;
}

/**
 * Notes for a set-up other than a tent for one person, from how the rule texts of this place read. Empty for the default set-up.
 * The place's own rule items stay in the details above; these only say what to look for in them.
 */
export function gearItems(g: Gear, c: GearContext): Item[] {
  const out: Item[] = [];
  const muni = c.municipalRule;
  const canton = c.canton?.rule;
  const place = c.municipality ?? c.canton?.name ?? '';
  const both = [muni?.summary, canton?.summary].filter((x): x is string => !!x);

  if (g.shelter === 'bivy') {
    const stance = muni ? tentlessStance(muni.summary) : undefined;
    if (stance === 'covered') out.push({ tone: 'warn', title: tr('A bivy bag does not avoid the municipal rule'), text: tr('The rule of {place} expressly counts sleeping outdoors without a tent as camping, so a bivy bag or sleeping under the stars is banned there like a tent.', { place }) });
    else if (stance === 'left-out') out.push({ tone: 'info', title: tr('No tent: the municipal rule treats it differently'), text: tr('The rule of {place} treats sleeping outdoors without a tent differently from camping with a tent: it names it as allowed or leaves it out, with conditions you will find in the rule above. That does not by itself make this spot legal: the canton, protected zones, the landowner and the other points above still apply.', { place }) });
    else if (stance === 'silent') out.push({ tone: 'info', title: tr('No tent: the municipal rule does not say'), text: tr('The rule of {place} is written for tents, caravans and similar shelters and does not mention sleeping outdoors without a tent. Its text does not say a bivy bag is allowed: ask the municipality.', { place }) });
    else if (canton && namesBivouac(canton.summary)) out.push({ tone: 'info', title: tr('The cantonal text names bivouacking'), text: tr('The cantonal rule for {place} names bivouacking separately: read it in the details above, as it can differ from camping with a tent.', { place: c.canton?.name ?? place }) });
    else out.push({ tone: 'info', title: tr('A bivy bag is not named in the rules read here'), text: tr('None of the municipal or cantonal texts read for this place says how a bivy bag is treated. Do not assume it is exempt: zones and landowners apply to any night outdoors.') });
  }

  if (g.shelter === 'tarp') {
    if (both.some(namesTarps)) out.push({ tone: 'warn', title: tr('Tarps are named like tents here'), text: tr('A rule text for this place names tarps or emergency roofs next to tents: a tarp or a hammock with a tarp is treated as a tent there. Read the rule in the details above.') });
    else out.push({ tone: 'info', title: tr('A tarp or hammock is not named in the rules read here'), text: tr('No rule text read for this place defines a tarp or a hammock. Where a text names them (emergency roofs, tarps), it treats them like a tent, so plan as if a tarp were a tent.') });
  }

  if (g.shelter === 'vehicle') {
    if (both.some(namesVehicles)) out.push({ tone: 'warn', title: tr('The rule texts name vehicles'), text: tr('A rule text for this place names caravans, motorhomes, cars or car parks: read it in the details above to see whether it is a rule in force, a guidance or only a plan.') });
    else out.push({ tone: 'warn', title: tr('The rules read here are about tents'), text: tr('None of the rule texts read for this place mentions vehicles, and this app has no source on sleeping in a vehicle here. Parking rules and municipal police rules can apply to a vehicle: look for signs, and ask the municipality.') });
  }

  if (g.people >= 3) {
    if (both.some(namesGroups)) out.push({ tone: 'warn', title: tr('The rule texts mention groups'), text: tr('A rule text for this place mentions groups: with {n} people you may be a group in its sense. Read the rule in the details above.', { n: g.people }) });
    else out.push({ tone: 'info', title: tr('No group-size limit found'), text: tr('No law read sets a group size for camping. What exists are permits for large events in forest (hundreds of people, or over 100 at night in Aargau), municipal permits for youth tent camps (Obwalden), and a registration of groups of more than 20 in the National Park. A private group is not clearly an event, so ask the landowner and the municipality.'), sources: ['https://fedlex.data.admin.ch/eli/cc/1992/2521_2521_2521/20250101', 'https://gdb.ow.ch/app/de/texts_of_law/971.4'] });
  }

  if (g.dog) out.push(...dogItems({ canton: c.canton?.code, date: c.date ?? new Date(), inNationalPark: c.inNationalPark, inForest: c.inForest }));

  return out;
}
