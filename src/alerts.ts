import type { Assessment } from './assess';
import type { Comfort } from './comfort/comfort';
import type { Night } from './comfort/weather';
import type { Restrictions } from './restrictions';
import { tr } from './i18n';

/** One danger on the first view. Tapping it opens the part of the details it comes from. */
export interface Alert {
  tone: 'bad' | 'warn';
  text: string;
  panel: 'legal' | 'sleep' | 'weather';
}

/**
 * The dangers that must be on the first view although the overall score ignores the weather: steep ground and drops, flood and
 * rockfall areas, a storm or strong wind for the chosen night (or the hours before it), avalanche danger, deep cold and snow,
 * a fire ban or high fire danger, army shooting today, and a ban zone that begins close by.
 */
export function buildAlerts(i: { comfort?: Comfort; assessment?: Assessment; fire?: Restrictions['fire']; soon?: Night }): Alert[] {
  const out: Alert[] = [];
  for (const a of i.comfort?.alerts ?? []) out.push({ tone: a.tone, text: a.title, panel: a.weather ? 'weather' : 'sleep' });
  const soon = i.soon;
  if (soon?.thunder) out.push({ tone: 'bad', text: tr('Thunderstorm forecast before this evening'), panel: 'weather' });
  else if (soon && soon.maxGustKmh >= 80) out.push({ tone: 'bad', text: tr('Storm-force gusts forecast before this evening'), panel: 'weather' });
  const fire = i.fire;
  if (fire?.measure?.ban) out.push({ tone: 'warn', text: tr('Fire ban in force here'), panel: 'legal' });
  else if (fire?.danger?.level !== undefined && fire.danger.level >= 4) out.push({ tone: 'warn', text: tr('High forest fire danger: no open fires'), panel: 'legal' });
  for (const z of i.assessment?.zones ?? []) {
    if (z.layer.id === 'ch.vbs.schiessanzeigen' && z.layer.severity === 'caution') out.push({ tone: 'warn', text: tr('Army shooting is scheduled here today'), panel: 'legal' });
  }
  for (const z of i.assessment?.nearZones ?? []) out.push({ tone: 'warn', text: z.distanceM !== undefined ? tr('A ban zone begins about {m} m away', { m: Math.max(10, Math.round(z.distanceM / 10) * 10) }) : tr('A ban zone begins within about {m} m', { m: z.withinM ?? 150 }), panel: 'legal' });
  const seen = new Set<string>();
  return out
    .filter((a) => (seen.has(a.text) ? false : (seen.add(a.text), true)))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1));
}
