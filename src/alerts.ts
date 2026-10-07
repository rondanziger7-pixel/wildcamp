import type { Assessment } from './assess';
import type { Comfort } from './comfort/comfort';
import type { Night } from './comfort/weather';
import type { Restrictions } from './restrictions';
import { dateLocale, tr } from './i18n';
import { DOG_ALERT_TEXT, dogAlert, huntingNote, type DogArea } from './wildlife';

/** One danger on the first view. Tapping it opens the part of the details it comes from. */
export interface Alert {
  tone: 'bad' | 'warn';
  text: string;
  panel: 'legal' | 'sleep' | 'weather';
}

/**
 * The dangers that must be on the first view although the overall score ignores the weather: steep ground and drops, flood and
 * rockfall areas, a storm or strong wind for the chosen night (or the hours before it), avalanche danger, deep cold and snow,
 * a fire ban or high fire danger, a pasture with working herd-protection dogs, army shooting today, and a ban zone that begins close by.
 */
const sameDay = (d: Date | undefined) => !d || d.toDateString() === new Date().toDateString();

export function buildAlerts(i: { comfort?: Comfort; assessment?: Assessment; fire?: Restrictions['fire']; dogs?: DogArea[]; date?: Date; soon?: Night }): Alert[] {
  const out: Alert[] = [];
  for (const a of i.comfort?.alerts ?? []) out.push({ tone: a.tone, text: a.title, panel: a.weather ? 'weather' : 'sleep' });
  const soon = i.soon;
  if (soon?.thunder) out.push({ tone: 'bad', text: tr('Thunderstorm forecast before this evening'), panel: 'weather' });
  else if (soon && soon.maxGustKmh >= 80) out.push({ tone: 'bad', text: tr('Storm-force gusts forecast before this evening'), panel: 'weather' });
  const fire = i.fire;
  if (fire?.measure?.ban) out.push({ tone: 'warn', text: tr('Fire ban in force here'), panel: 'legal' });
  else if (fire?.danger?.level !== undefined && fire.danger.level >= 4) out.push({ tone: 'warn', text: tr('High forest fire danger: no open fires'), panel: 'legal' });
  if (dogAlert(i.dogs, i.date ?? new Date())) out.push({ tone: 'warn', text: DOG_ALERT_TEXT(), panel: 'legal' });
  for (const z of i.assessment?.zones ?? []) {
    if (z.layer.id === 'ch.vbs.schiessanzeigen' && z.layer.severity === 'caution') out.push({ tone: 'warn', text: sameDay(i.date) ? tr('Army shooting is scheduled here today') : tr('Army shooting is scheduled here on {date}', { date: (i.date ?? new Date()).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) }), panel: 'legal' });
  }
  for (const z of i.assessment?.nearZones ?? []) out.push({ tone: 'warn', text: z.distanceM !== undefined ? tr('A ban zone begins about {m} m away', { m: Math.max(10, Math.round(z.distanceM / 10) * 10) }) : tr('A ban zone begins within about {m} m', { m: z.withinM ?? 150 }), panel: 'legal' });
  // a village or city: the public right of access does not apply there, which the first view must not leave to the details
  if (i.assessment?.items.some((x) => x.title === tr('In a village or city (building zone)'))) out.push({ tone: 'warn', text: tr('In a village or city: the owner must agree'), panel: 'legal' });
  if (i.assessment?.municipality && i.assessment.items.some((x) => x.title === tr('{name}: reported camping ban, not verified', { name: i.assessment!.municipality! }))) out.push({ tone: 'warn', text: tr('A municipal camping ban is reported (not verified)'), panel: 'legal' });
  // a hunt that is on in the canton on this date (dates are published for 2026): shots and hunters at dawn and dusk
  const huntDay = i.date ?? new Date();
  if (huntingNote(i.assessment?.canton?.code, huntDay)?.active) out.push({ tone: 'warn', text: tr('Hunting season on in this canton'), panel: 'legal' });
  const seen = new Set<string>();
  return out
    .filter((a) => (seen.has(a.text) ? false : (seen.add(a.text), true)))
    // red first; within a colour the legal ones (a ban zone close by, shooting, dogs) before the terrain ones, so the three lines of the first view keep them
    .sort((a, b) => (a.tone === b.tone ? Number(b.panel === 'legal') - Number(a.panel === 'legal') : a.tone === 'bad' ? -1 : 1));
}
