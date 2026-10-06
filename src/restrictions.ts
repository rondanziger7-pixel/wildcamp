import type { Item } from './assess';
import { wgs84ToLv95 } from './coords';
import { tr } from './i18n';

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
  measure?: { title: string; description?: string; ban: boolean; validFrom?: string; canton?: string };
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
  /** Which lookups failed, so a missing answer is not read as "nothing applies". */
  failed: ('fire' | 'drones')[];
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
  if (m && mt) info.measure = { title: mt, description: str(m.description_en), ban: /\b(ban|prohibit)/i.test(`${mt} ${str(m.description_en) ?? ''}`) && !/\bno ban\b/i.test(mt), validFrom: str(m.valid_from), canton: str(m.canton) };
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
  const [danger, measures, drones] = await Promise.allSettled([identify(FIRE_DANGER, e, n, signal), identify(FIRE_MEASURES, e, n, signal), identify(DRONES, e, n, signal)]);
  const out: Restrictions = { failed: [] };
  if (danger.status === 'fulfilled' || measures.status === 'fulfilled') {
    out.fire = parseFire(danger.status === 'fulfilled' ? danger.value : {}, measures.status === 'fulfilled' ? measures.value : {});
    if (danger.status === 'rejected' || measures.status === 'rejected') out.failed.push('fire');
  } else out.failed.push('fire');
  if (drones.status === 'fulfilled') out.drones = parseDrones(drones.value);
  else out.failed.push('drones');
  return out;
}

const SRC_FIRE = ['https://map.geo.admin.ch/?layers=ch.bafu.gefahren-waldbrand_warnung,ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone'];
const SRC_DRONE = ['https://map.geo.admin.ch/?layers=ch.bazl.einschraenkungen-drohnen'];

/** Checklist items for the fire and drone section. These are information: they do not change the camping verdict. */
export function restrictionItems(r: Restrictions): Item[] {
  const items: Item[] = [];
  if (r.fire && (r.fire.danger || r.fire.measure)) {
    const { danger, measure } = r.fire;
    if (measure?.ban) {
      const canton = measure.canton ? ' ' + tr('(canton {canton})', { canton: measure.canton }) : '';
      items.push({ tone: 'bad', title: tr('Fire ban: {title}', { title: measure.title }), text: tr('{what}{canton}, in force since {date}. Do not light fires or use a stove outdoors where the ban applies; check the canton\'s notice for gas stoves.', { what: measure.description ?? measure.title, canton, date: measure.validFrom ?? tr('an unknown date') }), sources: SRC_FIRE });
    } else if (danger && (danger.level ?? 0) >= 3) {
      items.push({ tone: 'warn', title: tr('Forest-fire danger: {title}', { title: danger.title }), text: tr('{region}{title} (valid from {date}).{canton} Avoid open fires; cantons often ban them at this level.', { region: danger.region ? `${danger.region}: ` : '', title: danger.title, date: danger.validFrom ?? tr('unknown'), canton: measure ? ' ' + tr('Canton: {title}.', { title: measure.title }) : '' }), sources: SRC_FIRE });
    } else {
      const date = danger?.validFrom ?? tr('unknown');
      const dangerText = !danger ? '' : danger.region ? tr('Forest-fire danger for {region} is "{title}" (valid from {date}).', { region: danger.region, title: danger.title, date }) : tr('Forest-fire danger is "{title}" (valid from {date}).', { title: danger.title, date });
      const measureText = !measure ? '' : (measure.canton ? tr('Canton {canton}: {title}{description}.', { canton: measure.canton, title: measure.title, description: measure.description ? ` (${measure.description})` : '' }) : tr('Canton: {title}{description}.', { title: measure.title, description: measure.description ? ` (${measure.description})` : '' }));
      items.push({ tone: 'info', title: tr('Fire: {what}', { what: danger?.title ?? measure?.title ?? tr('no notice') }), text: [dangerText, measureText, tr('Cantons regulate open fires in and near forest; a stove on bare ground is a lower risk but follow any notice. Never leave a fire unattended.')].filter(Boolean).join(' '), sources: SRC_FIRE });
    }
  }
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
