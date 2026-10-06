import { wgs84ToLv95 } from './coords';
import { tr } from './i18n';

/**
 * The emergency page: numbers and what to say, taken from the Federal Office of Communications (BAKOM), Rega and the Swiss Alpine
 * Club (SAC), read 2026-10-06 (docs/sources/CH/README_emergency.md). Nothing here needs a network: the numbers and the advice are
 * text in the app, and only the position comes from the phone.
 */

export interface EmergencyNumber {
  number: string;
  label: string;
  /** When to use it. */
  when: string;
}

/** The numbers worth having in the mountains. Read when the page is built, so the language in force then decides. */
export function emergencyNumbers(): EmergencyNumber[] {
  return [
    { number: '112', label: tr('European emergency number'), when: tr('Any emergency. In Switzerland it reaches the police alarm centre. If your own provider has no signal, the phone tries another network.') },
    { number: '144', label: tr('Ambulance and medical emergency'), when: tr('In the canton of Valais the cantonal rescue organisation (KWRO) is alerted on 144, also for mountain rescue.') },
    { number: '1414', label: tr('Rega air rescue'), when: tr('Call it directly when a rescue helicopter can reach the injured person faster than other help, for example in rough terrain. In Valais, call 144.') },
    { number: '117', label: tr('Police'), when: tr('Police emergency call.') },
  ];
}

/** "2'775'733 / 1'166'227": the Swiss grid, rounded to the metre, with apostrophes as thousands separators. */
export function formatLv95(e: number, n: number): string {
  const f = (v: number) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${f(e)} / ${f(n)}`;
}

function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const mFull = (a - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}'${s.padStart(4, '0')}"${v >= 0 ? pos : neg}`;
}

export interface Position {
  lat: number;
  lng: number;
  /** Height above sea level in metres, if known. */
  elevation?: number;
  /** How far the fix may be off, in metres (a GPS fix); absent for a spot picked on the map. */
  accuracyM?: number;
}

export interface PositionText {
  /** "46.64560, 9.87520" */
  decimal: string;
  /** `46°38'44.2"N 9°52'30.7"E` */
  dms: string;
  /** "2'775'733 / 1'166'227 (LV95)" */
  lv95: string;
  elevation?: string;
  accuracy?: string;
}

export function positionText(p: Position): PositionText {
  const { e, n } = wgs84ToLv95(p.lat, p.lng);
  return {
    decimal: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    dms: `${dms(p.lat, 'N', 'S')} ${dms(p.lng, 'E', 'W')}`,
    lv95: `${formatLv95(e, n)} (LV95)`,
    elevation: p.elevation === undefined ? undefined : `${Math.round(p.elevation)} m`,
    accuracy: p.accuracyM === undefined ? undefined : `±${Math.max(1, Math.round(p.accuracyM))} m`,
  };
}

/** The position as one message to read out, copy or send. */
export function positionMessage(p: Position): string {
  const t = positionText(p);
  return [tr('Position:'), t.decimal, t.dms, t.lv95, t.elevation && `${tr('Elevation')} ${t.elevation}`, t.accuracy && `${tr('GPS accuracy')} ${t.accuracy}`].filter(Boolean).join('\n');
}

/** An `sms:` link with the message; the number is left to the person (112 does not take texts). */
export const smsLink = (message: string) => `sms:?&body=${encodeURIComponent(message)}`;

/** The checklist Rega asks callers to be ready for. */
export function whatToSay(): string[] {
  return [
    tr('Where are you? Give the coordinates.'),
    tr('Who can be reached, and how?'),
    tr('What exactly happened?'),
    tr('How many people are hurt, and how badly?'),
    tr('What is the situation on site, and the weather: visibility, rain or snow, wind?'),
  ];
}

/** Sources of the page, shown on it. */
export const EMERGENCY_SOURCES: { label: string; url: string }[] = [
  { label: 'BAKOM: emergency numbers', url: 'https://www.bakom.admin.ch/de/notrufdienste' },
  { label: 'Rega: raising the alarm correctly', url: 'https://www.rega.ch/en/news/news-from-the-world-of-rega/detail/how-to-raise-the-alarm-correctly' },
  { label: 'Rega app', url: 'https://www.rega.ch/en/our-missions/this-is-how-we-help-you/rega-app' },
  { label: 'Rega emergency radio', url: 'https://www.rega.ch/en/our-missions/sites-and-infrastructure/emergency-radio' },
  { label: 'SAC emergency sheet (Notfallblatt)', url: 'https://www.sac-cas.ch/fileadmin/Ausbildung_und_Sicherheit/Tourenplanung/Alpinmerkbl%C3%A4tter/Notfallblatt.pdf' },
];
