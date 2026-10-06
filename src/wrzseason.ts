/**
 * The protection season of a wildlife quiet zone, read from the free text in the federal data (`schutzzeit`).
 *
 * 91 % of the zones use "dd.mm. - dd.mm." (a year-round zone is "01.01. - 31.12."); the rest is free text in German,
 * French or Italian ("15.12. bis Ende Skisaison", "En cas de neige", "Betriebszeiten der Bahn", "De février à mi-juillet" ...).
 * A season that cannot be placed exactly is reported as `unsure`, never silently as "in force" (which showed "Not allowed"
 * in July for zones that only exist in the ski season) and never silently as "not in force".
 */

export type SeasonState = 'in' | 'out' | 'unsure';
/** Why a season could not be decided exactly. */
export type SeasonNote = 'ski season' | 'snow' | 'lifts' | 'easter' | 'approximate' | 'undefined';

export interface SeasonResult {
  state: SeasonState;
  /** Present when the dates are not exact. */
  note?: SeasonNote;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** A day of the year on a 365-day calendar (29 February counts as 28 February). */
const ord = (m: number, d: number) => MONTH_DAYS.slice(0, m - 1).reduce((a, b) => a + b, 0) + Math.min(d, MONTH_DAYS[m - 1]!);
const YEAR = 365;
const lastDay = (m: number) => MONTH_DAYS[m - 1]!;

/** Easter Sunday (Gregorian), month 1-12 and day. */
export function easter(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { m: month, d: day };
}

interface Range {
  from: number;
  to: number;
  /** Days of doubt at each end: inside the core the season is in force, inside the margin it is unsure. 0 = exact. */
  fuzzFrom: number;
  fuzzTo: number;
}

const within = (x: number, from: number, to: number) => {
  const a = ((from % YEAR) + YEAR) % YEAR;
  const b = ((to % YEAR) + YEAR) % YEAR;
  const v = ((x % YEAR) + YEAR) % YEAR;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
};

function stateIn(r: Range, x: number): SeasonState {
  if (r.fuzzFrom === 0 && r.fuzzTo === 0) return within(x, r.from, r.to) ? 'in' : 'out';
  if (within(x, r.from + r.fuzzFrom, r.to - r.fuzzTo)) return 'in';
  if (within(x, r.from - r.fuzzFrom, r.to + r.fuzzTo)) return 'unsure';
  return 'out';
}

const exact = (m1: number, d1: number, m2: number, d2: number): Range => ({ from: ord(m1, d1), to: ord(m2, d2), fuzzFrom: 0, fuzzTo: 0 });

const DE_MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const IT_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const monthNo = (name: string): number => {
  const n = name.toLowerCase().replace('maerz', 'märz').replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre');
  for (const list of [DE_MONTHS, FR_MONTHS, IT_MONTHS]) {
    const i = list.indexOf(n);
    if (i >= 0) return i + 1;
  }
  return 0;
};
const MONTH_RE = [...DE_MONTHS, ...FR_MONTHS, ...IT_MONTHS, 'maerz', 'fevrier', 'aout', 'decembre'].join('|');

/** The ranges a season text stands for, or a marker for the texts that are not date ranges. */
type Parsed = { kind: 'ranges'; ranges: Range[]; note?: SeasonNote } | { kind: 'snow' } | { kind: 'lifts' } | { kind: 'undefined' };

export function parseSeasonText(raw: string | undefined, year = new Date().getFullYear()): Parsed {
  const text = (raw ?? '').trim();
  if (!text || /^[-–—]+$/.test(text) || /keine\s+definierte\s+periode|nessun[ao]?\s+period|aucune\s+p[ée]riode/i.test(text)) return { kind: 'undefined' };

  // "16.12. bis Ende Skisaison" (a start date, the end is whenever the lifts close: about the end of April)
  const toEnd = text.match(/(\d{1,2})\.(\d{1,2})\.?\s*bis\s*(?:zum\s*)?ende\s+(?:der\s+)?skisaison/i);
  if (toEnd) {
    const r = exact(+toEnd[2]!, +toEnd[1]!, 4, 30);
    return { kind: 'ranges', ranges: [{ ...r, fuzzTo: 21 }], note: 'ski season' };
  }
  // "01.12. bis Ostern": to Easter Sunday of the year asked about
  const toEaster = text.match(/(\d{1,2})\.(\d{1,2})\.?\s*bis\s*ostern/i);
  if (toEaster) {
    const e = easter(year);
    const r = exact(+toEaster[2]!, +toEaster[1]!, e.m, e.d);
    return { kind: 'ranges', ranges: [{ ...r, fuzzTo: 7 }], note: 'easter' };
  }
  // numeric ranges "dd.mm. - dd.mm." (the first part of "16.12. - 15.05. resp. bis zur Öffnung der Strasse" too), possibly several
  const numeric = [...text.matchAll(/(\d{1,2})\.(\d{1,2})\.?\s*(?:[-–—]|bis|à|au)\s*(\d{1,2})\.(\d{1,2})\.?/g)]
    .map((m) => ({ d1: +m[1]!, m1: +m[2]!, d2: +m[3]!, m2: +m[4]!, resp: false }))
    .filter((r) => r.m1 >= 1 && r.m1 <= 12 && r.m2 >= 1 && r.m2 <= 12 && r.d1 >= 1 && r.d1 <= 31 && r.d2 >= 1 && r.d2 <= 31);
  if (numeric.length) {
    const open = /resp\.|bis zur|jusqu'à l'ouverture|fino all'apertura/i.test(text);
    return { kind: 'ranges', ranges: numeric.map((r) => (open ? { ...exact(r.m1, r.d1, r.m2, r.d2), fuzzTo: 21 } : exact(r.m1, r.d1, r.m2, r.d2))), note: open ? 'approximate' : undefined };
  }
  // "Betretungsverbot vom 15. Dezember bis 15. April", Italian "24 dicembre - 31 marzo / 15 aprile - 15 agosto"
  const named = [...text.matchAll(new RegExp(`(\\d{1,2})\\.?\\s*(${MONTH_RE})\\s*(?:[-–—]|bis|à|al?|au)\\s*(?:zum\\s*)?(\\d{1,2})\\.?\\s*(${MONTH_RE})`, 'gi'))]
    .map((m) => ({ d1: +m[1]!, m1: monthNo(m[2]!), d2: +m[3]!, m2: monthNo(m[4]!) }))
    .filter((r) => r.m1 && r.m2);
  if (named.length) return { kind: 'ranges', ranges: named.map((r) => exact(r.m1, r.d1, r.m2, r.d2)) };

  // snow (it can fall in any month at altitude, but the restriction is about the snow-covered season)
  if (/neige|schnee|\bneve\b/i.test(text)) return { kind: 'snow' };
  // "Skisaison": no dates at all, about December to April
  if (/ski-?saison|saison de ski|stagione sciistica/i.test(text) && !/betriebszeit/i.test(text)) {
    return { kind: 'ranges', ranges: [{ ...exact(12, 1, 4, 30), fuzzFrom: 21, fuzzTo: 21 }], note: 'ski season' };
  }
  // French "De début mai à fin juillet", "De février à mi-juillet"
  const fr = text.match(new RegExp(`de\\s+(d[ée]but\\s+|mi-|fin\\s+)?(${MONTH_RE})\\s+[àa]\\s+(d[ée]but\\s+|mi-|fin\\s+)?(${MONTH_RE})`, 'i'));
  if (fr) {
    const m1 = monthNo(fr[2]!);
    const m2 = monthNo(fr[4]!);
    const d1 = /^mi/i.test(fr[1] ?? '') ? 15 : /^fin/i.test(fr[1] ?? '') ? lastDay(m1) : 1;
    const d2 = /^mi/i.test(fr[3] ?? '') ? 15 : /^d[ée]but/i.test(fr[3] ?? '') ? 1 : lastDay(m2);
    return { kind: 'ranges', ranges: [{ ...exact(m1, d1, m2, d2), fuzzFrom: 7, fuzzTo: 7 }], note: 'approximate' };
  }
  // "De Pâques ... à fin mai"
  if (/p[âa]ques/i.test(text)) {
    const e = easter(year);
    return { kind: 'ranges', ranges: [{ ...exact(e.m, e.d, 5, 31), fuzzFrom: 14, fuzzTo: 0 }], note: 'easter' };
  }
  // "während Betriebszeiten der Bahn": whenever the lift runs, summer or winter
  if (/betriebszeit|bahn|remont[ée]es|impianti|installations/i.test(text)) return { kind: 'lifts' };
  return { kind: 'undefined' };
}

/**
 * Whether a zone's restriction is in force on `date`: `in`, `out`, or `unsure` when the text names only a ski season, snow,
 * lift operation or loose months. A season with no defined period counts as in force (nothing limits it).
 */
export function seasonState(text: string | undefined, date: Date): SeasonResult {
  const p = parseSeasonText(text, date.getFullYear());
  const x = ord(date.getMonth() + 1, date.getDate());
  if (p.kind === 'undefined') return { state: 'in', note: 'undefined' };
  if (p.kind === 'lifts') return { state: 'unsure', note: 'lifts' };
  if (p.kind === 'snow') {
    // snow-dependent: the restriction can be live from autumn to early summer, and not in high summer
    return { state: within(x, ord(10, 15), ord(6, 15)) ? 'unsure' : 'out', note: 'snow' };
  }
  const states = p.ranges.map((r) => stateIn(r, x));
  const state: SeasonState = states.includes('in') ? 'in' : states.includes('unsure') ? 'unsure' : 'out';
  return { state, note: p.note };
}
