import { el } from './resultview';
import { tr } from './i18n';
import type { SavedSpot } from './saved';
import { MAX_NIGHTS } from './trip';
import { nightText } from './comfort/weather';

export interface TripHandlers {
  onAdd(id: string): void;
  onRemove(id: string): void;
  onMove(index: number, dir: -1 | 1): void;
  onOpen(spot: SavedSpot): void;
}

/**
 * The trip planner's page: the nights in order (with their labels), buttons to reorder or drop a night, saved spots to add,
 * and a host element the weather and legality plan is drawn into.
 */
export function renderTrip(root: HTMLElement, spots: SavedSpot[], inTrip: SavedSpot[], nightLabels: string[], h: TripHandlers): HTMLElement {
  const title = el('h2', 'finder-title', tr('Trip planner'));
  const intro = el('p', 'where', tr('Put saved spots in the order of your nights. The weather for each night and the saved legality of each spot appear below.'));
  const nights = el('ol', 'trip-nights');
  inTrip.forEach((s, i) => {
    const li = el('li', 'trip-night');
    const label = el('span', 'trip-label', nightLabels[i] ? nightText(nightLabels[i]!) : tr('Night {n}', { n: i + 1 }));
    const open = el('button', 'saved-open');
    open.type = 'button';
    open.append(el('strong', undefined, s.name));
    open.onclick = () => h.onOpen(s);
    const btn = (text: string, aria: string, disabled: boolean, fn: () => void) => {
      const b = el('button', 'trip-btn', text);
      b.type = 'button';
      b.title = aria;
      b.setAttribute('aria-label', aria);
      b.disabled = disabled;
      b.onclick = fn;
      return b;
    };
    li.append(
      label,
      open,
      btn('↑', tr('Move to an earlier night'), i === 0, () => h.onMove(i, -1)),
      btn('↓', tr('Move to a later night'), i === inTrip.length - 1, () => h.onMove(i, 1)),
      btn('✕', tr('Remove from the trip'), false, () => h.onRemove(s.id)),
    );
    nights.append(li);
  });
  const parts: Node[] = [title, intro];
  if (inTrip.length) parts.push(nights);
  else parts.push(el('p', 'where', tr('No nights yet. Add saved spots below.')));

  const free = spots.filter((s) => !inTrip.includes(s));
  const add = el('div', 'trip-add');
  if (!spots.length) {
    add.append(el('p', 'where', tr('You have no saved spots yet. Check a spot and press "Save this spot", then plan your nights here.')));
  } else if (inTrip.length >= MAX_NIGHTS) {
    add.append(el('p', 'where', tr('The forecast covers {n} nights, so a trip has at most {n} nights.', { n: MAX_NIGHTS })));
  } else if (free.length) {
    add.append(el('h3', 'trip-h3', tr('Add a saved spot')));
    for (const s of free) {
      const b = el('button', 'finder-btn trip-add-btn', `+ ${s.name}`);
      b.type = 'button';
      b.onclick = () => h.onAdd(s.id);
      add.append(b);
    }
  }
  parts.push(add);
  const planHost = el('div', 'trip-plan');
  parts.push(planHost);
  root.replaceChildren(...parts);
  return planHost;
}
