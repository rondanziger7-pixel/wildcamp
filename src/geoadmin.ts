import { wgs84ToLv95 } from './coords';
import { ZONE_LAYERS, type ZoneLayer } from './zones';
import type { ZoneHit } from './assess';
import { findCanton, type Canton } from './cantons';
import { tr } from './i18n';
import { seasonState } from './wrzseason';

const API = 'https://api3.geo.admin.ch/rest/services';

export async function fetchElevation(lat: number, lon: number): Promise<number | undefined> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const res = await fetch(`${API}/height?easting=${e}&northing=${n}&sr=2056`);
  if (!res.ok) throw new Error(`height ${res.status}`);
  const body = (await res.json()) as { height?: string };
  const h = Number(body.height);
  return Number.isFinite(h) ? h : undefined;
}

/** The identify response for the zone layers at a point (seasons and firing days are evaluated later, per date). */
export type ZoneBody = { results?: IdentifyResult[] };

/** Identify all protected-zone layers at a point. Throws if the request fails. */
export async function fetchZoneBody(lat: number, lon: number): Promise<ZoneBody> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const params = new URLSearchParams({
    geometry: `${e},${n}`,
    geometryType: 'esriGeometryPoint',
    sr: '2056',
    layers: 'all:' + ZONE_LAYERS.map((l) => l.id).join(','),
    tolerance: '0',
    mapExtent: `${e - 100},${n - 100},${e + 100},${n + 100}`,
    imageDisplay: '200,200,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/api/MapServer/identify?${params}`);
  if (!res.ok) throw new Error(`identify ${res.status}`);
  return (await res.json()) as ZoneBody;
}

/**
 * The zone layers within `radiusM` of a point (a small search around it, same layers as `fetchZoneBody`): the zones the spot is
 * in and the ones that begin close by. The service takes the tolerance in screen pixels, so a virtual 1000 px map is scaled.
 */
export async function fetchNearZoneBody(lat: number, lon: number, radiusM: number): Promise<ZoneBody> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const mPerPx = radiusM / 400;
  const half = 500 * mPerPx;
  const params = new URLSearchParams({
    geometry: `${e},${n}`,
    geometryType: 'esriGeometryPoint',
    sr: '2056',
    layers: 'all:' + ZONE_LAYERS.filter((l) => l.severity === 'prohibited' || l.severity === 'restricted').map((l) => l.id).filter((id, i, all) => all.indexOf(id) === i).join(','),
    tolerance: '400',
    mapExtent: `${e - half},${n - half},${e + half},${n + half}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/api/MapServer/identify?${params}`);
  if (!res.ok) throw new Error(`identify ${res.status}`);
  return (await res.json()) as ZoneBody;
}

/** The zones at a point for a date (default today). Throws if the request fails. */
export async function fetchZoneHits(lat: number, lon: number, date: Date = new Date()): Promise<ZoneHit[]> {
  return parseZoneHits(await fetchZoneBody(lat, lon), date);
}

export interface IdentifyResult {
  layerBodId: string;
  attributes?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);

/** True unless `today` is clearly outside the zone's protection season (see wrzseason.ts: texts that cannot be placed exactly are not "out"). */
export function inSeason(schutzzeit: string | undefined, today: Date): boolean {
  return seasonState(schutzzeit, today).state !== 'out';
}

const fmtDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

/**
 * A sentence in a zone's own free text (`zusatzinformation`) that forbids camping or bivouacking, e.g. "Freies/wildes Campieren
 * und Biwakieren sind verboten." 28 zones (BE, AR) say so while their rule code is only "other" or a winter-sports rule. A sentence
 * with its own dates ("vom 1. September bis zum 30. November") keeps them.
 */
export function campingBanSentence(extra: string | undefined): { text: string; season?: string } | undefined {
  if (!extra) return undefined;
  for (const raw of extra.split(/(?:(?<=\D\.)|(?<=;))\s+(?=[A-ZÄÖÜ])/)) {
    const sentence = raw.trim();
    const camping = /campier|biwak|zelt|camping|bivouac|tente|campeggio|bivacco/i.test(sentence);
    const ban = /verbot|verboten|nicht (?:erlaubt|gestattet)|interdit|interdetto|vietato/i.test(sentence);
    // "Wintersport ... verboten. Freies/wildes Campieren ..." are separate sentences; "Wegegebot ...; Campieren und Lagern verboten" is split at ';'
    if (camping && ban && !/\bmodell|drohne|luftfahrz/i.test(sentence)) {
      const dated = sentence.match(/(\d{1,2}\.\s*(?:\d{1,2}\.|\p{L}+)\s*(?:bis|-|–)\s*(?:zum\s*)?\d{1,2}\.\s*(?:\d{1,2}\.?|\p{L}+))/u);
      return { text: sentence, season: dated?.[1] };
    }
  }
  return undefined;
}

/**
 * A wildlife quiet zone's own data decides its severity. BAFU: in statutory zones only the marked paths may be used.
 * Entry bans and path-only rules count as restricted while in force; recommended zones, "other" rules and winter-sport
 * rules only as caution; a season that is not running today (or cannot be placed exactly) also lowers it to caution.
 * A statutory zone whose own text forbids camping is restricted for that reason.
 */
function wrzHit(a: Record<string, unknown>, layer: ZoneLayer, today: Date): { layer: ZoneLayer; detail: string; season?: string } {
  const rule = str(a.best_de);
  const season = str(a.schutzzeit);
  const statutory = str(a.schutzs_de) === 'rechtsverbindlich';
  const entryRule = !!rule && /Zutritt|Betretungsverbot|Wegegebot|Betreten oder befahren nur/i.test(rule);
  const winterSportsOnly = !!rule && /Wintersport/i.test(rule) && !/Zutritt|Wegegebot/i.test(rule);
  const bits = [rule, season && `(${season})`, str(a.kanton) && `[${str(a.kanton)}]`].filter(Boolean).join(' ');
  const ban = campingBanSentence(str(a.zusatzinformation));
  if (ban) {
    const st = seasonState(ban.season, today);
    const detail = `${bits} «${ban.text}»`;
    if (statutory && st.state === 'in') return { layer: { ...layer, note: tr('The zone\'s own rules forbid free camping and bivouacking (quoted below).') }, detail, season: ban.season ?? season };
    const note = !statutory
      ? tr('Wildlife quiet zone whose own rules forbid free camping, but only as a recommendation, not as a binding rule.')
      : st.state === 'out'
        ? tr('Wildlife quiet zone whose own rules forbid free camping, but not in this season ({date}); check the zone\'s notice.', { date: fmtDate(today) })
        : tr('Wildlife quiet zone whose own rules forbid free camping, but the dates cannot be placed exactly; check the zone\'s notice.');
    return { layer: { ...layer, severity: 'caution', note }, detail, season: ban.season ?? season };
  }
  const st = seasonState(season, today);
  if (statutory && entryRule && st.state === 'in') return { layer, detail: bits, season };
  let why: string;
  if (!statutory) why = tr('This zone is only recommended, not binding.');
  else if (winterSportsOnly) why = tr('The rule covers winter sports only.');
  else if (!entryRule) why = tr('The zone\'s rule is not a plain entry or path rule; read it.');
  else if (st.state === 'unsure') why = tr('The restriction applies "{season}", which cannot be placed exactly on a calendar (ski season, snow or lift operation), so it may be in force today ({date}); check the zone\'s notice.', { season: season ?? '', date: fmtDate(today) });
  else why = tr('The restriction applies {season} and is not running today ({date}), but check the zone\'s rule.', { season: season ?? '', date: fmtDate(today) });
  return {
    layer: { ...layer, severity: 'caution', note: tr('Wildlife quiet zone. {why}', { why }) },
    detail: bits,
    season,
  };
}

/** Turn an identify response into zone hits, dropping features a layer's filter rejects. */
export function parseZoneHits(body: { results?: IdentifyResult[] }, today: Date = new Date()): ZoneHit[] {
  const hits: ZoneHit[] = [];
  for (const r of body.results ?? []) {
    const a = r.attributes ?? {};
    const layer = ZONE_LAYERS.find((l) => l.id === r.layerBodId && (l.accept?.(a) ?? true));
    if (!layer) continue;
    if (r.layerBodId === 'ch.bafu.wrz-wildruhezonen_portal') {
      const h = wrzHit(a, layer, today);
      hits.push({ layer: h.layer, name: str(a.label) ?? str(a.name), detail: h.detail, season: h.season });
      continue;
    }
    let detail: string | undefined;
    if (r.layerBodId.startsWith('ch.bafu.bundesinventare-auen')) detail = str(a.auen_type_de) && tr('Type: {type}.', { type: str(a.auen_type_de)! });
    if (r.layerBodId === 'ch.vbs.schiessanzeigen') {
      const sh = shootingDetail(a, today);
      hits.push({
        layer: sh.active ? { ...layer, severity: 'caution', note: tr('Shooting is scheduled here today. Do not stay in the danger area; read the firing notice.') } : layer,
        name: str(a.label) ?? str(a.name),
        detail: sh.detail,
      });
      continue;
    }
    hits.push({ layer, name: str(a.label) ?? str(a.name), detail });
  }
  return hits;
}

/** Today's firing times from an army shooting-notice feature, with the notice link. */
function shootingDetail(a: Record<string, unknown>, today: Date): { detail: string; active: boolean } {
  const dates = Array.isArray(a.belegungsdatum) ? (a.belegungsdatum as string[]) : [];
  const i = dates.indexOf(`${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`);
  const off = Array.isArray(a.kein_schiessen) ? (a.kein_schiessen as boolean[])[i] : undefined;
  const from = Array.isArray(a.zeit_von) ? (a.zeit_von as string[])[i] : undefined;
  const to = Array.isArray(a.zeit_bis) ? (a.zeit_bis as string[])[i] : undefined;
  const link = str(a.url_en) ?? str(a.url_de);
  const fmt = (t?: string) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t);
  const state = i < 0 ? tr('No firing is listed for today.') : off ? tr('No shooting is listed for today.') : from ? tr('Shooting is listed for today ({from} to {to}).', { from: fmt(from)!, to: fmt(to) ?? '' }) : tr('Shooting is listed for today.');
  return { detail: `${state}${link ? ' ' + tr('Notice: {link}', { link }) : ''}`, active: i >= 0 && off === false };
}

/** Canton at a point from swissBOUNDARIES3D, or undefined if the point is outside every canton. */
export async function fetchCanton(lat: number, lon: number): Promise<Canton | undefined> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const params = new URLSearchParams({
    geometry: `${e},${n}`,
    geometryType: 'esriGeometryPoint',
    sr: '2056',
    layers: 'all:ch.swisstopo.swissboundaries3d-kanton-flaeche.fill',
    tolerance: '0',
    mapExtent: `${e - 100},${n - 100},${e + 100},${n + 100}`,
    imageDisplay: '200,200,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/api/MapServer/identify?${params}`);
  if (!res.ok) throw new Error(`canton ${res.status}`);
  return parseCanton(await res.json());
}

export function parseCanton(body: { results?: IdentifyResult[] }): Canton | undefined {
  const code = str(body.results?.[0]?.attributes?.ak);
  return findCanton(code);
}

export interface Municipality {
  name: string;
  /** BFS municipality number. */
  bfs: number;
  /** Two-letter canton code as reported by swissBOUNDARIES3D. */
  canton: string;
}

/** Current municipality at a point. The layer holds every historical year, so a year is passed to get one result. */
export async function fetchMunicipality(
  lat: number,
  lon: number,
  year = new Date().getFullYear(),
): Promise<Municipality | undefined> {
  const { e, n } = wgs84ToLv95(lat, lon);
  for (const y of [year, year - 1]) {
    const params = new URLSearchParams({
      geometry: `${e},${n}`,
      geometryType: 'esriGeometryPoint',
      sr: '2056',
      layers: 'all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill',
      timeInstant: String(y),
      tolerance: '0',
      mapExtent: `${e - 100},${n - 100},${e + 100},${n + 100}`,
      imageDisplay: '200,200,96',
      returnGeometry: 'false',
      lang: 'en',
    });
    const res = await fetch(`${API}/api/MapServer/identify?${params}`);
    if (!res.ok) throw new Error(`municipality ${res.status}`);
    const m = parseMunicipality(await res.json());
    if (m) return m;
  }
  return undefined;
}

export function parseMunicipality(body: { results?: IdentifyResult[] }): Municipality | undefined {
  const a = body.results?.find((r) => r.attributes?.is_current_jahr !== false)?.attributes;
  const name = str(a?.gemname);
  const bfs = Number(a?.gde_nr);
  const canton = str(a?.kanton);
  return name && Number.isFinite(bfs) && canton ? { name, bfs, canton } : undefined;
}
