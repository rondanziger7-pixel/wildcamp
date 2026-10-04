import type { ZoneHit } from './assess';
import { tr } from './i18n';
import { monthStates, nextChange, parseSeason, seasonLabel } from './seasons';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m) => tr(m));
const LETTERS = MONTH.map((m) => m[0]!.toUpperCase());

/** One-line text on when a season next starts or is lifted. */
export function changeText(season: string, today: Date): string | undefined {
  const s = parseSeason(season);
  const c = s && nextChange(s, today);
  if (!s || !c) return undefined;
  const date = `${c.date.getUTCDate()} ${MONTH[c.date.getUTCMonth()]}`;
  const inDays = c.days === 1 ? tr('tomorrow') : tr('in {n} days', { n: c.days });
  return c.kind === 'starts' ? tr('Not in force today; starts {date} ({inDays}).', { date, inDays }) : tr('In force today; lifted from {date} ({inDays}).', { date, inDays });
}

/** A year strip for every zone with a protection season, or nothing if none has one. */
export function renderSeasons(zones: ZoneHit[], today: Date = new Date()): HTMLElement | undefined {
  const seen = new Set<string>();
  const rows = zones.filter((z) => {
    const k = `${z.name ?? ''}|${z.season ?? ''}`;
    if (!z.season || !parseSeason(z.season) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!rows.length) return undefined;
  const box = document.createElement('section');
  box.className = 'seasons';
  const h = document.createElement('h3');
  h.textContent = tr('Seasonal restrictions');
  box.append(h);
  for (const z of rows) {
    const s = parseSeason(z.season)!;
    const title = document.createElement('p');
    title.className = 'season-title';
    title.textContent = `${z.name ?? z.layer.label}: ${seasonLabel(s)}`;
    const strip = document.createElement('div');
    strip.className = 'season-strip';
    monthStates(s).forEach((st, i) => {
      const c = document.createElement('span');
      c.className = `season-cell ${st}${i === today.getMonth() ? ' now' : ''}`;
      c.textContent = LETTERS[i]!;
      c.title = `${MONTH[i]}: ${tr(st === 'on' ? 'restricted all month' : st === 'part' ? 'restricted part of the month' : 'not restricted')}`;
      strip.append(c);
    });
    const note = document.createElement('p');
    note.className = 'season-note';
    note.textContent = changeText(z.season!, today) ?? '';
    box.append(title, strip, note);
  }
  const foot = document.createElement('p');
  foot.className = 'disclaimer';
  foot.textContent = tr('Dark months: the zone\'s rule applies; the outlined month is now. Dates are the zone data\'s protection season; check the zone\'s own rule for what it forbids.');
  box.append(foot);
  return box;
}
