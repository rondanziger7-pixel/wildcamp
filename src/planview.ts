import { compassName, nightText } from './comfort/weather';
import { el } from './resultview';
import type { PlanRow, TripPlan } from './planner';
import { FORECAST_DAYS } from './comfort/weather';
import { tr } from './i18n';

const tone = (v: number | undefined) => (v === undefined ? 'none' : v >= 60 ? 'good' : v >= 35 ? 'warn' : 'bad');

const VERDICT = (r: PlanRow) => (r.outside ? tr('Outside Switzerland') : r.verdict === 'no' ? tr('Not allowed') : r.unchecked ? tr('Unchecked') : r.verdict === 'caution' ? tr('Be careful') : r.verdict === 'likely_ok' ? tr('Likely OK') : tr('Unknown'));

/** The sentence for one night: the weather, or why there is none. */
function weatherLine(r: PlanRow, weakest: boolean, many: boolean): string {
  const f = r.forecast;
  const parts: string[] = [];
  if (f) {
    parts.push(
      tr('{low} °C low, gusts {gust} km/h from {dir}, {rain}{watch}.', {
        low: Math.round(f.minTempC),
        gust: Math.round(f.maxGustKmh),
        dir: compassName(f.windFromDeg),
        rain: f.precipMm >= 1 ? tr('{mm} mm rain', { mm: f.precipMm.toFixed(0) }) : tr('dry'),
        watch: r.flags.length ? '. ' + tr('Watch for: {list}', { list: r.flags.join(', ') }) : '',
      }),
    );
  } else if (r.forecastState === 'beyond') {
    parts.push(tr('No forecast this far ahead (it covers {n} days). Look again nearer the date.', { n: FORECAST_DAYS }));
  } else {
    parts.push(tr('The forecast could not be loaded for this spot.'));
  }
  if (r.stop) parts.push(tr('The weather rules this night out.'));
  if (weakest && many) parts.push(tr('Weakest night of the trip.'));
  return parts.join(' ');
}

/** The trip table: one row per night with the legality judged for that night's date and the fresh weather for that spot. */
export function renderPlan(root: HTMLElement, plan: TripPlan, failed: { forecasts: number; legality: number }, back?: () => void): void {
  const back1 = el('button', 'linkish', '← ' + tr('Back to saved spots'));
  back1.type = 'button';
  back1.onclick = () => back?.();
  const many = plan.rows.length > 1;
  const title = el('h2', 'finder-title', tr(plan.rows.length === 1 ? 'Trip plan: {n} night' : 'Trip plan: {n} nights', { n: plan.rows.length }));
  const list = el('ol', 'plan-list');
  plan.rows.forEach((r: PlanRow, i) => {
    const li = el('li', `plan-row${plan.weakest === i ? ' weakest' : ''}`);
    const head = el('div', 'finder-head');
    // "Tue 6 · Tonight", "Fri 9": the weekday is not said twice
    const when = r.night === 'Tonight' || r.night === 'Tomorrow' ? `${r.short} · ${nightText(r.night)}` : r.short;
    head.append(el('span', 'finder-num', String(i + 1)), el('strong', undefined, `${when}: ${r.spot.name}`));
    const chips = el('div', 'finder-scores');
    chips.append(
      el('span', `chip-score ${r.outside ? 'none' : r.verdict === 'no' ? 'bad' : r.unchecked ? 'none' : tone(r.legal)}`, `${tr('Legal')} ${r.outside ? '–' : r.verdict === 'no' ? 0 : r.unchecked ? '?' : r.legal ?? '–'} · ${VERDICT(r)}`),
      el('span', `chip-score ${r.stop ? 'bad' : tone(r.weather)}`, r.forecast ? `${tr('Weather')} ${r.weather ?? '–'}` : r.forecastState === 'beyond' ? tr('Weather: too far ahead') : tr('Weather: no forecast')),
    );
    li.append(head, chips);
    // where it is, in a form that survives a dead phone on paper
    const place = [r.spot.municipality, r.spot.canton].filter(Boolean).join(', ');
    li.append(el('p', 'finder-note plan-coords', [`${r.spot.lat.toFixed(5)}, ${r.spot.lng.toFixed(5)}`, r.spot.elevation === undefined ? '' : `${Math.round(r.spot.elevation)} m`, place].filter(Boolean).join(' · ')));
    // what the legal check found for this date, and what has changed since the spot was saved
    const legalBits: string[] = [];
    if (r.verdict === 'no' || r.verdict === 'caution') if (r.why) legalBits.push(r.why);
    if (r.changed === 'worse') legalBits.push(tr('Worse than when you saved it.'));
    else if (r.changed === 'better') legalBits.push(tr('Better than when you saved it.'));
    if (!r.legalFresh) legalBits.push(tr('Not checked again: this is the score saved with the spot.'));
    if (legalBits.length) li.append(el('p', `finder-note legal-note${r.verdict === 'no' || r.changed === 'worse' ? ' bad' : ''}`, legalBits.join(' · ')));
    if (r.spot.note) li.append(el('p', 'finder-note spot-note', '📝 ' + r.spot.note));
    li.append(el('p', 'finder-note', weatherLine(r, plan.weakest === i, many)));
    list.append(li);
  });
  const foot = el('p', 'disclaimer');
  foot.textContent = [
    tr('Legality is judged again for each night\'s date, with the same checks as the map: zone seasons and shooting days follow the date. The weather score is the forecast for that night at the spot\'s elevation, without the shelter of the terrain, so it can differ from the sleep score you see when you open the spot.'),
    failed.legality ? (failed.legality === 1 ? tr('{n} legality check could not be made; the saved score is shown.', { n: failed.legality }) : tr('{n} legality checks could not be made; the saved scores are shown.', { n: failed.legality })) : '',
    failed.forecasts ? (failed.forecasts === 1 ? tr('{n} forecast could not be loaded.', { n: failed.forecasts }) : tr('{n} forecasts could not be loaded.', { n: failed.forecasts })) : '',
  ]
    .filter(Boolean)
    .join(' ');
  // inside the trip planner the page already has its own header
  root.replaceChildren(...(back ? [back1, title] : []), list, foot);
}
