import { compassName } from './comfort/weather';
import { el } from './resultview';
import type { PlanRow, TripPlan } from './planner';
import { tr } from './i18n';

const tone = (v: number | undefined) => (v === undefined ? 'none' : v >= 60 ? 'good' : v >= 35 ? 'warn' : 'bad');

/** The trip table: one row per night with the saved legality and the fresh weather for that spot. */
export function renderPlan(root: HTMLElement, plan: TripPlan, failed: number, back: () => void): void {
  const back1 = el('button', 'linkish', '← ' + tr('Back to saved spots'));
  back1.type = 'button';
  back1.onclick = back;
  const title = el('h2', 'finder-title', tr(plan.rows.length === 1 ? 'Trip plan: {n} night' : 'Trip plan: {n} nights', { n: plan.rows.length }));
  const list = el('ol', 'plan-list');
  plan.rows.forEach((r: PlanRow, i) => {
    const li = el('li', `plan-row${plan.weakest === i && plan.rows.length > 1 ? ' weakest' : ''}`);
    const head = el('div', 'finder-head');
    head.append(el('span', 'finder-num', String(i + 1)), el('strong', undefined, `${r.night}: ${r.spot.name}`));
    const chips = el('div', 'finder-scores');
    chips.append(
      el('span', `chip-score ${tone(r.legal)}`, `${tr('Legal')} ${r.legal ?? '–'}`),
      el('span', `chip-score ${r.stop ? 'bad' : tone(r.weather)}`, r.forecast ? `${tr('Weather')} ${r.weather ?? '–'}` : tr('Weather: no forecast')),
    );
    const f = r.forecast;
    const detail = f
      ? `${Math.round(f.minTempC)} °C low, gusts ${Math.round(f.maxGustKmh)} km/h from ${compassName(f.windFromDeg)}, ${f.precipMm >= 1 ? `${f.precipMm.toFixed(0)} mm rain` : 'dry'}${r.flags.length ? `. Watch for: ${r.flags.join(', ')}` : ''}.`
      : 'The forecast could not be loaded for this spot.';
    const note = el('p', 'finder-note', `${detail}${r.stop ? ' The weather rules this night out.' : ''}${plan.weakest === i && plan.rows.length > 1 ? ' Weakest night of the trip.' : ''}`);
    li.append(head, chips, note);
    list.append(li);
  });
  const foot = el('p', 'disclaimer');
  foot.textContent = `Legality is the saved check of each spot, not re-checked: open a spot to check it again before you go. The weather score is the forecast for that night at the spot's elevation, without the shelter of the terrain. Nights are assigned in the order you ticked the spots; the forecast covers about four nights.${plan.dropped.length ? ` Left out beyond the forecast: ${plan.dropped.map((d) => d.name).join(', ')}.` : ''}${failed ? ` ${failed} forecast${failed === 1 ? '' : 's'} could not be loaded.` : ''}`;
  root.replaceChildren(back1, title, list, foot);
}
