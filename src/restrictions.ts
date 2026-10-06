import type { Item } from './assess';
import { wgs84ToLv95 } from './coords';
import { tr } from './i18n';
import { fetchDogAreas, type DogArea } from './wildlife';

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer';
const FIRE_DANGER = 'ch.bafu.gefahren-waldbrand_warnung';
const FIRE_MEASURES = 'ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone';
const DRONES = 'ch.bazl.einschraenkungen-drohnen';

type Attrs = Record<string, unknown>;
type Body = { results?: { attributes?: Attrs }[] };
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

export interface FireInfo {
  /** BAFU forest-fire danger for the region: the title as published ("Moderate danger"), 1 to 5 where it could be read. */
  danger?: { title: string; level?: number; region?: string; validFrom?: string };
  /** The cantonal measure in force for the region (a warning to be careful, or a ban). */
  measure?: { title: string; description?: string; ban: boolean; kind?: FireKind; validFrom?: string; canton?: string };
}

/**
 * The five measure types the federal map publishes (BAFU, waldbrandgefahr.ch "Bedeutung der Massnahmen"): none, a warning (an appeal), a
 * conditional ban (fires only at permanent fire places), an absolute ban in the forest and near it, an absolute ban in the open.
 */
export type FireKind = 'none' | 'warning' | 'conditional' | 'forest' | 'open';

export function fireKind(title: string | undefined): FireKind | undefined {
  const t = (title ?? '').trim().toLowerCase();
  if (/^no measures/.test(t)) return 'none';
  if (/^warning/.test(t)) return 'warning';
  if (/^conditional ban/.test(t)) return 'conditional';
  if (/^absolute ban on fires in the forest/.test(t)) return 'forest';
  if (/^absolute ban on fires in the open/.test(t)) return 'open';
  return undefined;
}

export interface DroneZone {
  name: string;
  restriction: string;
  reason?: string;
  message?: string;
  authority?: string;
  url?: string;
  /** The zone applies to all drones, whatever their weight. */
  all: boolean;
}

export interface Restrictions {
  fire?: FireInfo;
  drones?: DroneZone[];
  /** Pastures with herd-protection dogs within reach (nearest first); empty when none is reported. */
  dogs?: DogArea[];
  /** Which lookups failed, so a missing answer is not read as "nothing applies". */
  failed: ('fire' | 'drones' | 'dogs')[];
}

const LEVELS: [RegExp, number][] = [
  [/very high|very great|sehr gross/i, 5],
  [/high|great|gross(e)? gefahr/i, 4],
  [/considerable|erheblich/i, 3],
  [/moderate|limited|mässig|mäßig/i, 2],
  [/low|no |gering|keine/i, 1],
];

export function fireLevel(title: string): number | undefined {
  for (const [re, n] of LEVELS) if (re.test(title)) return n;
  return undefined;
}

export function parseFire(danger: Body, measures: Body): FireInfo {
  const d = danger.results?.[0]?.attributes;
  const m = measures.results?.[0]?.attributes;
  const info: FireInfo = {};
  const dt = str(d?.title_en);
  if (d && dt) info.danger = { title: dt, level: fireLevel(dt), region: str(d.name_en), validFrom: str(d.valid_from) };
  const mt = str(m?.title_en);
  if (m && mt) info.measure = { title: mt, description: str(m.description_en), ban: /\b(ban|prohibit)/i.test(`${mt} ${str(m.description_en) ?? ''}`) && !/\bno ban\b/i.test(mt), kind: fireKind(mt), validFrom: str(m.valid_from), canton: str(m.canton) };
  return info;
}

export function parseDrones(body: Body): DroneZone[] {
  const out: DroneZone[] = [];
  for (const r of body.results ?? []) {
    const a = r.attributes ?? {};
    const restriction = str(a.zone_restriction_en);
    if (!restriction) continue;
    const urls = Array.isArray(a.auth_url_en) ? (a.auth_url_en as string[]) : [];
    const names = Array.isArray(a.auth_name_en) ? (a.auth_name_en as string[]) : [];
    out.push({
      name: str(a.zone_name_en) ?? tr('Drone zone'),
      restriction,
      reason: str(a.zone_reason_id),
      message: str(a.zone_message_en),
      authority: names[0],
      url: urls[0],
      all: /REQ_AUTHORISATION\.(MTOM_ALL)\b/.test(String(a.zone_restriction_id ?? '')) || /^The operation of unmanned aircraft is prohibited/i.test(restriction),
    });
  }
  // the zone that forbids the most comes first
  return out.sort((x, y) => Number(y.all) - Number(x.all));
}

async function identify(layer: string, e: number, n: number, signal?: AbortSignal): Promise<Body> {
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${layer}`,
    tolerance: '0',
    mapExtent: `${e - 1500},${n - 1500},${e + 1500},${n + 1500}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/identify?${q}`, { signal });
  if (!res.ok) throw new Error(`${layer} ${res.status}`);
  return (await res.json()) as Body;
}

export async function fetchRestrictions(lat: number, lon: number, signal?: AbortSignal): Promise<Restrictions> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const [danger, measures, drones, dogs] = await Promise.allSettled([identify(FIRE_DANGER, e, n, signal), identify(FIRE_MEASURES, e, n, signal), identify(DRONES, e, n, signal), fetchDogAreas(lat, lon, signal)]);
  const out: Restrictions = { failed: [] };
  if (danger.status === 'fulfilled' || measures.status === 'fulfilled') {
    out.fire = parseFire(danger.status === 'fulfilled' ? danger.value : {}, measures.status === 'fulfilled' ? measures.value : {});
    if (danger.status === 'rejected' || measures.status === 'rejected') out.failed.push('fire');
  } else out.failed.push('fire');
  if (drones.status === 'fulfilled') out.drones = parseDrones(drones.value);
  else out.failed.push('drones');
  if (dogs.status === 'fulfilled') out.dogs = dogs.value;
  else out.failed.push('dogs');
  return out;
}

const SRC_FIRE = ['https://map.geo.admin.ch/?layers=ch.bafu.gefahren-waldbrand_warnung,ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone'];
const SRC_DRONE = ['https://map.geo.admin.ch/?layers=ch.bazl.einschraenkungen-drohnen'];

const SRC_FIRE_OFFICES = 'https://www.waldbrandgefahr.ch/de/kantonale-fachstellen';

/**
 * The fire item, worded for the measure type the federal map shows. Every sentence is one an official source states (BAFU, the cantons of
 * Bern, Graubünden, Valais, Ticino and Vaud, read on 2026-10-06; docs/sources/CH/README_fire.md). What the sources do not say is said too: no text
 * names a camping gas stove except Bern's, so "a stove is allowed" is never claimed.
 */
function fireItems(f: FireInfo): Item[] {
  const { danger, measure } = f;
  const general = tr('Fire rules are set by the canton, and in some cantons by the commune: the notice of the canton and commune applies. The federal map is information, not the rule.');
  const sources = [...SRC_FIRE, SRC_FIRE_OFFICES];
  const dangerLine = !danger ? '' : danger.region ? tr('Forest-fire danger for {region}: "{title}" (valid from {date}).', { region: danger.region, title: danger.title, date: danger.validFrom ?? tr('unknown') }) : tr('Forest-fire danger: "{title}" (valid from {date}).', { title: danger.title, date: danger.validFrom ?? tr('unknown') });
  const canton = measure?.canton ? ' ' + tr('(canton {canton})', { canton: measure.canton }) : '';
  const entry = measure?.validFrom ? ' ' + tr('Federal map entry of {date}.', { date: measure.validFrom }) : '';
  const high = (danger?.level ?? 0) >= 3;
  const join = (...bits: string[]) => bits.filter(Boolean).join(' ');
  switch (measure?.kind) {
    case 'open':
      return [{ tone: 'bad', title: tr('Fire ban: no fires in the open'), text: join(tr('No fires in the open{canton}.', { canton }) + entry, tr('Some cantons still allow gas or electric grills on firm ground under constant supervision (Graubünden). Camping stoves are not named in the notices read: unless the canton says they are allowed, do not use one.'), dangerLine, general), sources }];
    case 'forest':
      return [{ tone: 'bad', title: tr('Fire ban in and near forest'), text: join(tr('No fires in the forest and in a strip around it{canton}; the distance is set by the canton (50 m in Bern, 100 m in Valais). Elsewhere in the open, fires are possible with due caution. In Bern, camping stoves are banned inside the ban zone.', { canton }) + entry, dangerLine, general), sources }];
    case 'conditional':
      return [{ tone: 'warn', title: tr('Conditional fire ban'), text: join(tr('Fires are only tolerated at permanently installed fire places{canton}. For camping this normally means no fire at your spot. Whether a camping stove is allowed is set by the canton and is not stated on the federal map: ask the commune or the forest service, and do not assume it is.', { canton }) + entry, dangerLine, general), sources }];
    default:
  }
  if (measure?.ban) {
    // a ban type this version does not know: said in the map's own words, with the safe default
    return [{ tone: 'bad', title: tr('Fire ban: {title}', { title: measure.title }), text: join(tr('{what}{canton}.', { what: measure.description ?? measure.title, canton }) + entry, tr('Do not light fires where the ban applies. Whether a camping stove is allowed is set by the canton: do not assume it is.'), dangerLine, general), sources }];
  }
  if (measure?.kind === 'warning') {
    return [{ tone: high ? 'warn' : 'info', title: tr('Fire: {what}', { what: danger?.title ?? tr('warning') }), text: join(dangerLine, tr('The canton asks people to avoid lighting fires in and near forest{canton}. This is an appeal, not a ban. Communes can have stricter rules. Never leave a fire unattended and put it out completely.', { canton }) + entry, high ? tr('A danger level alone is not a ban: check the canton\'s notice.') : '', general), sources }];
  }
  if (high) {
    return [{ tone: 'warn', title: tr('Forest-fire danger: {title}', { title: danger!.title }), text: join(dangerLine, measure ? tr('Canton: {title}.', { title: measure.title }) : '', tr('Cantons can order fire bans from this level; a level alone is not a ban. Check the canton\'s notice.'), general), sources }];
  }
  return [{ tone: 'info', title: tr('Fire: {what}', { what: danger?.title ?? measure?.title ?? tr('no notice') }), text: join(dangerLine, measure ? tr('No cantonal fire measure is listed for this region{canton}. Fires are possible with due caution. Forest rules still apply all year (in Vaud, for example, fires are prohibited in the forest and within 10 m of its edge except at designated places) and communes can ban fires. Never leave a fire unattended and put it out completely.', { canton }) : '', general), sources }];
}

/** Checklist items for the fire and drone section. These are information: they do not change the camping verdict. */
export function restrictionItems(r: Restrictions): Item[] {
  const items: Item[] = [];
  if (r.fire && (r.fire.danger || r.fire.measure)) items.push(...fireItems(r.fire));
  if (r.drones?.length) {
    for (const z of r.drones) {
      items.push({ tone: z.all ? 'bad' : 'warn', title: tr('Drones: {name}', { name: z.name }), text: `${z.restriction}${z.message ? ` ${z.message}` : ''}${z.authority ? ' ' + tr('Authority: {authority}.', { authority: `${z.authority}${z.url ? ` (${z.url})` : ''}` }) : ''}`, sources: SRC_DRONE });
    }
  } else if (r.drones) {
    items.push({ tone: 'info', title: tr('Drones: no geographic restriction listed'), text: tr('The federal map of geographic UAS zones lists nothing here. The general rules still apply: stay below 120 m above ground, keep the drone in sight, keep away from crowds, and respect people\'s privacy and nature reserves, where local rules can apply that are not on this map.'), sources: SRC_DRONE });
  }
  if (r.failed.includes('fire')) items.push({ tone: 'info', title: tr('Fire rules could not be checked'), text: tr('The forest-fire danger and canton measures could not be loaded. Check the canton\'s fire notices before lighting any fire or stove.') });
  if (r.failed.includes('drones')) items.push({ tone: 'info', title: tr('Drone zones could not be checked'), text: tr('The federal UAS zone map could not be loaded. Check it before flying.') });
  return items;
}
