import { el } from './resultview';
import { dateLocale, tr } from './i18n';
import type { SavedSpot } from './saved';
import { MAX_AHEAD_DAYS, MAX_NIGHTS, type PlannedNight } from './trip';
import { addDays, nightText, nightWindowFor } from './comfort/weather';

export interface TripHandlers {
  /** Add a night after the last one, with the spot of the last night (or the first saved spot). */
  onAdd(spot: string): void;
  onRemove(date: string): void;
  onSpot(date: string, spot: string): void;
  /** A night moved to another evening; the page puts it back when that is refused. */
  onDate(date: string, to: string): void;
  onOpen(spot: SavedSpot): void;
  onShare(): void;
  /** Save the map around the nights' spots for offline use. */
  onSaveMaps(): void;
  onPrint(): void;
}

/**
 * The trip planner's page: the nights in date order (each with its date and its saved spot), a button to add a night, and a host
 * element the legality and weather plan is drawn into. `today` is the first evening that can be planned.
 */
export function renderTrip(root: HTMLElement, spots: SavedSpot[], nights: PlannedNight[], today: string, now: string, h: TripHandlers): HTMLElement {
  const title = el('h2', 'finder-title', tr('Trip planner'));
  const intro = el('p', 'where', tr('Plan your nights: a date and a saved spot for each. The legality is judged for each date, and the forecast for each night appears below.'));
  const list = el('ol', 'trip-nights');
  const max = addDays(today, MAX_AHEAD_DAYS);
  nights.forEach(({ night, spot }, i) => {
    const li = el('li', 'trip-night');
    const w = nightWindowFor(night.date, now);
    const date = el('input', 'trip-date');
    date.type = 'date';
    date.min = today;
    date.max = max;
    date.value = night.date;
    date.setAttribute('aria-label', tr('Date of night {n}', { n: i + 1 }));
    date.onchange = () => {
      if (date.value) h.onDate(night.date, date.value);
      else date.value = night.date;
    };
    const label = el('span', 'trip-label', `${nightText(w.label)}`);
    const pick = el('select', 'trip-spot');
    pick.setAttribute('aria-label', tr('Spot for night {n}', { n: i + 1 }));
    for (const s of spots) pick.append(Object.assign(document.createElement('option'), { value: s.id, textContent: s.name, selected: s.id === night.spot }));
    pick.onchange = () => h.onSpot(night.date, pick.value);
    const open = el('button', 'trip-btn', '🔍');
    open.type = 'button';
    open.title = tr('Open this spot on the map');
    open.setAttribute('aria-label', tr('Open this spot on the map'));
    open.onclick = () => h.onOpen(spot);
    const del = el('button', 'trip-btn', '✕');
    del.type = 'button';
    del.title = tr('Remove from the trip');
    del.setAttribute('aria-label', tr('Remove from the trip'));
    del.onclick = () => h.onRemove(night.date);
    li.append(date, label, del, pick, open);
    list.append(li);
  });
  const parts: Node[] = [title, intro];
  if (nights.length) parts.push(list);
  else parts.push(el('p', 'where', tr('No nights yet.')));

  const add = el('div', 'trip-add');
  if (!spots.length) {
    add.append(el('p', 'where', tr('You have no saved spots yet. Check a spot and press "Save this spot", then plan your nights here.')));
  } else if (nights.length >= MAX_NIGHTS) {
    add.append(el('p', 'where', tr('A trip has at most {n} nights.', { n: MAX_NIGHTS })));
  } else {
    const b = el('button', 'finder-btn trip-add-btn', '＋ ' + tr('Add a night'));
    b.type = 'button';
    b.onclick = () => h.onAdd(nights.length ? nights[nights.length - 1]!.spot.id : spots[0]!.id);
    add.append(b);
  }
  parts.push(add);
  if (nights.length) {
    const tools = el('div', 'trip-tools');
    const share = el('button', 'save-btn', '↗ ' + tr('Share the trip'));
    share.type = 'button';
    share.onclick = h.onShare;
    const print = el('button', 'save-btn', '🖨 ' + tr('Print'));
    print.type = 'button';
    print.onclick = h.onPrint;
    const maps = el('button', 'save-btn', '⤓ ' + tr('Save the maps'));
    maps.type = 'button';
    maps.onclick = h.onSaveMaps;
    tools.append(share, print, maps);
    parts.push(tools);
  }
  const planHost = el('div', 'trip-plan');
  parts.push(planHost);
  // only on paper: when it was made, what it rests on, and the numbers to have in the mountains
  parts.push(
    el(
      'div',
      'print-only',
      el('p', undefined, tr('Printed {date} from Wildcamp CH. Guidance only, not legal advice: rules, closures and the weather can change, and a spot that looks fine here may still be banned.', { date: new Date().toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) })),
      el('p', undefined, tr('Sources: swisstopo and the federal offices (zones, map), cantons and municipalities (rules), Open-Meteo (forecast).')),
      el('p', undefined, tr('Emergency: 112 (all emergencies), 144 (ambulance), 1414 (Rega air rescue), 117 (police).')),
    ),
  );
  root.replaceChildren(...parts);
  return planHost;
}
