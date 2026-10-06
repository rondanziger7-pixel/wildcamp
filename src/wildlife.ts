import type { Item } from './assess';
import { distanceTo } from './comfort/surroundings';
import { wgs84ToLv95 } from './coords';
import { getLang, tr } from './i18n';

/**
 * Hunting and animals: the reported pastures with herd-protection dogs (a federal layer), the hunting seasons of 2026 as the cantons
 * published them, and the official advice for camping where wolves and bears can pass. All of it is information; none of it changes the
 * camping verdict. Sources and what could not be verified: docs/sources/CH/README_wildlife.md.
 */

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer';
const DOG_LAYER = 'ch.bafu.alpweiden-mit_herdenschutzhunden';
/** Dogs can be at the edge of a pasture, and sometimes cross the sheep fences: pastures this close are told of. */
export const DOG_NEAR_M = 500;

// ---------------------------------------------------------------------------------------------------------------------
// Herd-protection dogs

export type DogSeasonState = 'in' | 'out' | 'unsure';

export interface DogArea {
  name: string;
  /** The pasture is one the dogs work on (the layer also holds pastures without dogs, which are not told of). */
  present: boolean;
  /** Distance from the spot to the pasture in metres; 0 when the spot is inside it. */
  meters: number;
  /** When the dogs are there, as the provider writes it (in the language of the page). */
  season?: string;
  /** The same in German, which the date is read from. */
  seasonDe?: string;
  /** Advice for walkers specific to this pasture (closed paths, detours), in the language of the page. */
  hint?: string;
  /** The provider's page on how to behave. */
  behaviourUrl?: string;
}

const MONTHS_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dayOfYear = (m: number, d: number) => DAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + d;

/**
 * Whether the dogs are on the pasture on `date`, from the provider's free text ("In der Regel von Anfang Juni bis Ende September.",
 * "das ganze Jahr", "05.10.2026-17.10.2026"). The texts say "in der Regel" (as a rule), so two weeks either side of the range are `unsure`;
 * a text that cannot be read (several areas, other wording) is `unsure` as well, never `out`.
 */
export function dogSeason(textDe: string | undefined, date: Date): DogSeasonState {
  const t = (textDe ?? '').toLowerCase();
  if (!t.trim()) return 'unsure';
  if (/ganze[nm]?\s+jahr|ganzjährig|das ganze jahr/.test(t)) return 'in';
  const dated = [...t.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/g)];
  if (dated.length === 1) {
    const m = dated[0]!;
    const from = new Date(+m[3]!, +m[2]! - 1, +m[1]!, 0, 0, 0).getTime();
    const to = new Date(+m[6]!, +m[5]! - 1, +m[4]!, 23, 59, 59).getTime();
    const x = date.getTime();
    return x >= from && x <= to ? 'in' : 'out';
  }
  const parts = [...t.matchAll(new RegExp(`(anfang|mitte|ende)\\s+(${MONTHS_DE.join('|')})`, 'g'))];
  if (parts.length !== 2 || dated.length) return 'unsure';
  const at = (p: RegExpMatchArray) => {
    const month = MONTHS_DE.indexOf(p[2]!) + 1;
    return dayOfYear(month, p[1] === 'anfang' ? 1 : p[1] === 'mitte' ? 15 : DAYS[month - 1]!);
  };
  const from = at(parts[0]!);
  const to = at(parts[1]!);
  const x = dayOfYear(date.getMonth() + 1, Math.min(date.getDate(), DAYS[date.getMonth()]!));
  const norm = (v: number) => ((v - 1 + 365) % 365) + 1;
  const within = (a: number, b: number) => (norm(a) <= norm(b) ? x >= norm(a) && x <= norm(b) : x >= norm(a) || x <= norm(b));
  if (within(from, to)) return 'in';
  return within(from - 14, to + 14) ? 'unsure' : 'out';
}

type Feature = { geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> };
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The pastures with dogs near a spot, nearest first. `body` is an identify response with outlines (GeoJSON) in LV95. */
export function parseDogAreas(body: { results?: Feature[] }, e: number, n: number, lang = getLang()): DogArea[] {
  const out: DogArea[] = [];
  for (const f of body.results ?? []) {
    const p = f.properties ?? {};
    const typ = `${text(p.typzone_en) ?? ''} ${text(p.typzone_de) ?? ''}`;
    const present = /presence|präsenz/i.test(typ);
    if (!present) continue; // pastures without dogs are not told of: a miss in this layer only means "not reported"
    const meters = f.geometry ? distanceTo(f.geometry as never, e, n) : Infinity;
    if (!Number.isFinite(meters) || meters > DOG_NEAR_M) continue;
    const localized = (key: string) => text(p[`${key}_${lang}`]) ?? text(p[`${key}_en`]);
    out.push({
      name: text(p.name) ?? tr('Alp pasture'),
      present,
      meters,
      season: localized('hundepraesenz'),
      seasonDe: text(p.hundepraesenz_de),
      hint: localized('hinweis'),
      behaviourUrl: localized('refverhalten'),
    });
  }
  return out.sort((a, b) => a.meters - b.meters);
}

export async function fetchDogAreas(lat: number, lon: number, signal?: AbortSignal): Promise<DogArea[]> {
  const { e, n } = wgs84ToLv95(lat, lon);
  // the service takes the tolerance in screen pixels: a virtual 1000 px map is scaled to give DOG_NEAR_M metres
  const mPerPx = Math.max(1, DOG_NEAR_M / 400);
  const half = 500 * mPerPx;
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${e},${n}`,
    sr: '2056',
    layers: `all:${DOG_LAYER}`,
    tolerance: String(Math.round(DOG_NEAR_M / mPerPx)),
    mapExtent: `${e - half},${n - half},${e + half},${n + half}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'true',
    geometryFormat: 'geojson',
    lang: 'en',
  });
  const res = await fetch(`${API}/identify?${q}`, { signal });
  if (!res.ok) throw new Error(`dogs ${res.status}`);
  return parseDogAreas((await res.json()) as never, e, n);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hunting

/** What was read, and when: the dates are those the cantons published for 2026. */
export const HUNT_YEAR = 2026;
export const HUNT_CHECKED = '2026-10-06';

/** The words the periods are described with (each is translated); a period can name several. */
export type HuntKind = 'main hunt' | 'small game' | 'red deer' | 'chamois' | 'roe deer' | 'wild boar' | 'marmot' | 'ibex' | 'hare' | 'follow-up hunt' | 'special hunt';

interface HuntPeriod {
  from: string; // 'MM-DD'
  to: string;
  kinds: HuntKind[];
  /** The hunt runs on some days of the period only (the canton names them). */
  some?: true;
}
interface CantonHunt {
  periods: HuntPeriod[];
  source: string;
  /** Hunting days, where the canton publishes a rule that differs. */
  days?: string;
}

/**
 * Main hunting periods of 2026 as the cantons published them (primary sources read on 2026-10-06; the species are named as the canton names
 * them). Cantons not listed run hunts whose dates follow rules or are set late in the year; for those only the general statement is shown.
 */
export const HUNT_2026: Record<string, CantonHunt> = {
  GR: { periods: [{ from: '09-03', to: '09-13', kinds: ['main hunt'] }, { from: '09-21', to: '09-30', kinds: ['main hunt'] }, { from: '10-01', to: '11-30', kinds: ['small game'] }, { from: '10-05', to: '11-08', kinds: ['ibex'] }], source: 'https://www.gr.ch/DE/institutionen/verwaltung/diem/ajf/jagd/JagenInGraubuenden/Seiten/Termine,-Patente,-Formulare.aspx' },
  VS: { periods: [{ from: '09-21', to: '10-03', kinds: ['red deer', 'chamois', 'wild boar', 'marmot'] }, { from: '10-06', to: '10-24', kinds: ['roe deer', 'wild boar', 'hare'] }], source: 'https://lex.vs.ch/app/fr/texts_of_law/922.110' },
  BE: { periods: [{ from: '09-01', to: '09-20', kinds: ['red deer'] }, { from: '09-10', to: '09-30', kinds: ['chamois'] }, { from: '10-10', to: '11-15', kinds: ['follow-up hunt'] }, { from: '11-23', to: '12-05', kinds: ['special hunt'] }], source: 'https://www.weu.be.ch/de/start/themen/jagd-fischerei/jagd-wildtiere/jagen-kanton-bern/jagdzeiten.html', days: 'No hunting on Sundays; in October and November not on Tuesday, Thursday and Friday during the day (with exceptions).' },
  TI: { periods: [{ from: '09-05', to: '09-19', kinds: ['main hunt'] }, { from: '09-23', to: '09-27', kinds: ['main hunt'] }, { from: '10-16', to: '11-30', kinds: ['small game'] }], source: 'https://www4.ti.ch/dt/da/ucp/temi/caccia/caccia/caccia-alta/' },
  UR: { periods: [{ from: '09-07', to: '09-19', kinds: ['chamois', 'marmot', 'red deer'] }, { from: '09-28', to: '09-30', kinds: ['red deer'] }, { from: '10-12', to: '11-30', kinds: ['small game'] }], source: 'https://www.ur.ch/dienstleistungen/3048' },
  GL: { periods: [{ from: '09-07', to: '09-21', kinds: ['main hunt'] }, { from: '10-01', to: '10-21', kinds: ['roe deer'] }], source: 'https://www.gl.ch/verwaltung/bau-und-umwelt/umwelt-wald-und-energie/jagd-und-fischerei/jagd/jagd-20222023.html/803', days: 'No hunting on Mondays and Fridays (with exceptions).' },
  SZ: { periods: [{ from: '09-01', to: '09-19', kinds: ['red deer', 'chamois', 'marmot'] }, { from: '11-07', to: '11-07', kinds: ['red deer'], some: true }, { from: '11-12', to: '11-14', kinds: ['red deer'], some: true }, { from: '11-19', to: '11-21', kinds: ['red deer'], some: true }], source: 'https://www.sz.ch/public/upload/assets/61126/Jaehrliche_Jagdbetriebsvorschriften.pdf' },
  OW: { periods: [{ from: '09-01', to: '09-24', kinds: ['main hunt'] }, { from: '10-05', to: '10-24', kinds: ['roe deer'] }, { from: '10-05', to: '11-30', kinds: ['small game'] }], source: 'https://www.ow.ch/dienstleistungen/2133' },
  NW: { periods: [{ from: '09-01', to: '09-22', kinds: ['main hunt'] }, { from: '10-15', to: '11-30', kinds: ['small game'] }], source: 'https://www.nw.ch/_docn/449392/Medienmitteilung_Jagdbetriebsvorschriften_2026.pdf' },
  AI: { periods: [{ from: '09-07', to: '10-03', kinds: ['main hunt'] }, { from: '10-05', to: '11-14', kinds: ['small game'] }], source: 'https://ai.clex.ch/app/de/texts_of_law/922.102/versions/2447' },
  AR: { periods: [{ from: '09-01', to: '09-19', kinds: ['red deer', 'chamois'] }, { from: '09-07', to: '11-07', kinds: ['roe deer'] }, { from: '11-09', to: '12-05', kinds: ['red deer'] }], source: 'https://ar.ch/verwaltung/departement-bau-und-volkswirtschaft/amt-fuer-raum-und-wald/abteilung-natur-und-wildtiere/jagd/jagdvorschriften/' },
  FR: { periods: [{ from: '09-21', to: '10-03', kinds: ['chamois'] }, { from: '09-21', to: '10-17', kinds: ['roe deer'] }, { from: '10-19', to: '10-31', kinds: ['red deer'] }, { from: '11-14', to: '11-30', kinds: ['red deer'] }], source: 'https://www.fr.ch/sport-et-loisirs/sport-de-loisirs/informations-et-periodes-de-chasse', days: 'No hunting on Sundays.' },
  VD: { periods: [{ from: '09-01', to: '09-05', kinds: ['red deer'] }, { from: '09-07', to: '09-11', kinds: ['red deer'] }, { from: '09-14', to: '09-18', kinds: ['chamois'] }, { from: '09-21', to: '09-24', kinds: ['chamois'] }, { from: '10-01', to: '10-30', kinds: ['roe deer', 'wild boar'] }], source: 'https://www.vd.ch/fileadmin/user_upload/themes/environnement/biodiversite/fichiers_pdf/chasse/Actualit%C3%A9/Directives_chasse_2026_2027.pdf', days: 'Hunting is allowed on Mondays, Tuesdays, Thursdays and Fridays.' },
  LU: { periods: [{ from: '08-01', to: '09-20', kinds: ['red deer'] }, { from: '09-01', to: '12-15', kinds: ['chamois'] }, { from: '10-01', to: '12-15', kinds: ['red deer', 'roe deer'] }], source: 'https://lawa.lu.ch/-/media/LAWA/Dokumente/njf/jagd/Jagdreviere/Vorschriften/jagdbetriebsvorschriften.pdf', days: 'No hunting on Sundays.' },
  ZG: { periods: [{ from: '09-01', to: '09-23', kinds: ['red deer', 'chamois', 'wild boar'] }, { from: '10-01', to: '10-31', kinds: ['roe deer'] }, { from: '11-07', to: '11-07', kinds: ['roe deer'], some: true }, { from: '11-14', to: '11-14', kinds: ['roe deer'], some: true }], source: 'https://bgs.zg.ch/app/de/texts_of_law/932.111' },
  JU: { periods: [{ from: '09-02', to: '09-30', kinds: ['chamois'] }, { from: '10-03', to: '11-30', kinds: ['main hunt'] }], source: 'https://www.jura.ch/Htdocs/Files/v/3afc751315d25a327903df8faf15a1b5cd8ed6e0266772be40522b3dfdc52034.pdf/260421-reglementChasse26-27.pdf?download=1', days: 'No hunting on Sundays.' },
  NE: { periods: [{ from: '09-12', to: '09-24', kinds: ['chamois'], some: true }, { from: '10-01', to: '11-09', kinds: ['roe deer'] }], source: 'https://www.ne.ch/sites/default/files/2026-05/FO19_04_2026_05_04_DDTE_103_ACE_Chasse_2026-2027.pdf', days: 'No hunting on Sundays.' },
};

/** Federal closed seasons (JSG Art. 5) leave most of August to December open; cantons choose the dates inside. */
const GENERAL_FROM = '08-01';
const GENERAL_TO = '12-31';

const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (md: string) => `${Number(md.slice(3))} ${tr(SHORT_MONTH[Number(md.slice(0, 2)) - 1]!)}`;

export interface HuntingNote {
  /** The canton's published hunt is on at this date (2026 only). */
  active: boolean;
  item: Item;
}

/**
 * The hunting note for a place and a night, or nothing outside the months hunting is mostly done in. For 2026 and a canton whose dates were read, the
 * published periods are listed and the item is a warning while one is on; for any other year or canton only the general statement is made, because
 * the dates are set every year.
 */
export function huntingNote(canton: string | undefined, date: Date): HuntingNote | undefined {
  const md = mmdd(date);
  if (md < GENERAL_FROM || md > GENERAL_TO) return undefined;
  const c = canton ? HUNT_2026[canton] : undefined;
  const sources = c ? [c.source] : ['https://fedlex.data.admin.ch/eli/cc/1988/506_506_506'];
  const common = tr('Hunters are out from about an hour before sunrise to an hour after sunset in several cantons, in forest and in open country, and the hunting days differ by canton. Expect shots and people early and late in the day.');
  if (c && date.getFullYear() === HUNT_YEAR) {
    const on = c.periods.filter((p) => md >= p.from && md <= p.to);
    const list = c.periods.map((p) => `${p.from === p.to ? dayLabel(p.from) : `${dayLabel(p.from)} – ${dayLabel(p.to)}`}: ${p.kinds.map((k) => tr(k)).join(', ')}${p.some ? ' ' + tr('(some days)') : ''}`).join('; ');
    const days = c.days ? ' ' + tr(c.days) : '';
    if (on.length) {
      return {
        active: true,
        item: { tone: 'warn', title: tr('Hunting season in this canton'), text: `${tr('The main hunting periods of the canton in {year}: {list}.', { year: HUNT_YEAR, list })} ${common}${days} ${tr('Dates as published on {date}; check the canton\'s notice before you go.', { date: HUNT_CHECKED })}`, sources },
      };
    }
    return { active: false, item: { tone: 'info', title: tr('Hunting season in this canton'), text: `${tr('The main hunting periods of the canton in {year}: {list}. None of them is on at this date; other hunts (small game, special hunts) may be.', { year: HUNT_YEAR, list })} ${tr('Dates as published on {date}; check the canton\'s notice.', { date: HUNT_CHECKED })}`, sources } };
  }
  return { active: false, item: { tone: 'info', title: tr('Hunting season'), text: `${tr('Hunting seasons run mainly from September to December and differ by canton; the federal law only sets closed seasons, and the cantons publish the dates every year. Check your canton\'s dates before you go.')} ${common}`, sources } };
}

// ---------------------------------------------------------------------------------------------------------------------
// The tab

const ALERT_DOGS = 'Herd-protection dogs on this pasture';

const SRC_DOGS = ['https://www.protectiondestroupeaux.ch/de/tourismus-und-herdenschutzhunde/karte-hsh-einsatzgebiete/allgemeine-informationen-sowie-vollstaendigkeit-und-aktualitaet-der-daten/', 'https://herdenschutzschweiz.ch/de/herdenschutzhunde/tourismus-und-herdenschutzhunde/verhaltensempfehlungen/'];
const SRC_CARNIVORES = ['https://www.bafu.admin.ch/de/braunbaer', 'https://www.gr.ch/DE/institutionen/verwaltung/diem/ajf/grossraubtiere/Documents/Merkbl%c3%a4tter%2c%20Publikationen%2c%20Projekte/Merkblatt%20-%20Zelten%20im%20B%c3%a4rengebiet.pdf', 'https://www.kora.ch/de/arten/wolf/faqs'];
const SRC_CATTLE = ['https://www.bfu.ch/media/xube1zai/13-01-00083-01_flyer_kuhmuetter-schuetzen-ihre-kaelber_2023_de.pdf'];

/** The advice to give on a pasture with herd-protection dogs (AGRIDEA / BAFU, the SAC leaflet). */
const DOG_ADVICE = () =>
  tr('Keep calm, walk slowly and keep your distance from the herd. Do not shout at the dogs, push your bike, and leave your own dog at home. If dogs bark or block your way, stand still and give them time, then go round the herd widely or turn back. The dogs are very alert at dusk and at night, in bad weather and when the herd moves. No official advice for camping near them was found: the advice is written for walkers.');

export interface WildlifeContext {
  dogs?: DogArea[];
  /** The dog lookup failed. */
  dogsFailed?: boolean;
  canton?: string;
  /** The night the page shows. */
  date: Date;
}

/** Whether a first-view alert is due for these pastures, and for which. */
export function dogAlert(dogs: DogArea[] | undefined, date: Date): boolean {
  return !!dogs?.some((d) => d.meters === 0 && dogSeason(d.seasonDe, date) !== 'out');
}

export const DOG_ALERT_TEXT = () => tr(ALERT_DOGS);

/** The items of the "Hunting and animals" tab. */
export function wildlifeItems(c: WildlifeContext): Item[] {
  const items: Item[] = [];
  for (const d of (c.dogs ?? []).slice(0, 2)) {
    const state = dogSeason(d.seasonDe, c.date);
    const season = d.season ? ` ${d.season}` : '';
    const hint = d.hint ? ` ${d.hint}` : '';
    const link = d.behaviourUrl ? [d.behaviourUrl, ...SRC_DOGS] : SRC_DOGS;
    if (d.meters === 0) {
      items.push(
        state === 'out'
          ? { tone: 'info', title: tr('Herd-protection dogs are reported on this pasture: {name}', { name: d.name }), text: `${tr('The provider gives their time here as:')}${season} ${tr('This date is outside it, but the reports can be out of date and the dogs can come early or stay late.')}${hint} ${DOG_ADVICE()}`, sources: link }
          : { tone: 'warn', title: tr('Herd-protection dogs on this pasture: {name}', { name: d.name }), text: `${tr('Reported working dogs.')}${season}${hint} ${DOG_ADVICE()}`, sources: link },
      );
    } else {
      items.push({
        tone: 'info',
        title: tr('A pasture with herd-protection dogs lies about {m} m away', { m: Math.max(10, Math.round(d.meters / 10) * 10) }),
        text: `${d.name}.${season} ${tr('The dogs can be at the edge of their pasture and sometimes cross sheep fences.')}${hint} ${DOG_ADVICE()}`,
        sources: link,
      });
    }
  }
  if (c.dogsFailed) items.push({ tone: 'info', title: tr('Herd-protection dog areas could not be checked'), text: tr('The federal map of pastures with herd-protection dogs could not be loaded. It is not complete either: a pasture that is not on it can have dogs.') });
  else if (c.dogs && !c.dogs.length) items.push({ tone: 'info', title: tr('No herd-protection dog pasture reported here'), text: tr('The federal map shows none within 500 m. Operators who do not report their dogs are not on it, so this does not mean there are none: look for signs.'), sources: SRC_DOGS });
  const hunt = huntingNote(c.canton, c.date);
  if (hunt) items.push(hunt.item);
  items.push({
    tone: 'info',
    title: tr('Wolves and bears'),
    text: tr('Wolves can turn up anywhere in Switzerland and one or two bears pass through each year. Official advice for camping: keep food, rubbish and strongly scented things (toothpaste, soap, perfume) out of the tent, in a closed container, a vehicle or a building, and cook well away from the tent (Graubünden: at least 50 m). Leave no scraps. If you meet one: stay calm, speak up so it notices you, do not approach, feed or chase it, do not run, back away slowly, keep dogs under control or on a lead, and report unusual behaviour to the game warden.'),
    sources: SRC_CARNIVORES,
  });
  items.push({
    tone: 'info',
    title: tr('Cattle on pastures'),
    text: tr('Keep your distance from cows with calves, never touch a calf, and keep your dog on a short lead: cattle see dogs as predators. Pass them calmly and in a wide arc.'),
    sources: SRC_CATTLE,
  });
  return items;
}
