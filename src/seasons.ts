import { tr } from './i18n';

/** Protection seasons of wildlife quiet zones ("dd.mm.-dd.mm.", possibly wrapping the new year) as a month calendar. */
export interface Season {
  from: { m: number; d: number };
  to: { m: number; d: number };
}

export function parseSeason(text: string | undefined): Season | undefined {
  const m = text?.match(/(\d{1,2})\.(\d{1,2})\.?\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?/);
  if (!m) return undefined;
  const [d1, m1, d2, m2] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!];
  if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12 || d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return undefined;
  return { from: { m: m1, d: d1 }, to: { m: m2, d: d2 } };
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const key = (m: number, d: number) => m * 100 + d;

/** True if a calendar day (month 1 to 12) is inside the season. */
export function inSeasonOn(s: Season, month: number, day: number): boolean {
  const from = key(s.from.m, s.from.d);
  const to = key(s.to.m, s.to.d);
  const now = key(month, day);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

export type MonthState = 'on' | 'part' | 'off';

/** Per month: restriction all month, part of it, or not at all. */
export function monthStates(s: Season): MonthState[] {
  return DAYS.map((n, i) => {
    let inside = 0;
    for (let d = 1; d <= n; d++) if (inSeasonOn(s, i + 1, d)) inside++;
    return inside === 0 ? 'off' : inside === n ? 'on' : 'part';
  });
}

export interface SeasonChange {
  /** What happens at `date`: the restriction starts or ends. */
  kind: 'starts' | 'ends';
  date: Date;
  days: number;
}

const MS = 86400000;

/** The next day the season starts or ends after `today` (looks up to 366 days ahead). */
export function nextChange(s: Season, today: Date): SeasonChange | undefined {
  const day0 = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const now = inSeasonOn(s, day0.getUTCMonth() + 1, day0.getUTCDate());
  for (let i = 1; i <= 366; i++) {
    const d = new Date(day0.getTime() + i * MS);
    if (inSeasonOn(s, d.getUTCMonth() + 1, d.getUTCDate()) !== now) return { kind: now ? 'ends' : 'starts', date: d, days: i };
  }
  return undefined;
}

/** "15 Dec to 30 Apr" */
export function seasonLabel(s: Season): string {
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return tr('{a} to {b}', { a: `${s.from.d} ${tr(mon[s.from.m - 1]!)}`, b: `${s.to.d} ${tr(mon[s.to.m - 1]!)}` });
}
