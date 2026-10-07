import { el } from './resultview';
import { tr } from './i18n';
import type { DecodedShare } from './share';
import { MAX_SAVED, defaultName } from './saved';

export interface SharedHandlers {
  /** Add the places to the saved list (unchecked). */
  onAddSpots(): void;
  /** Add the places and use the trip that came with them. */
  onAddTrip(): void;
  /** Check one of the places on the map. */
  onOpen(index: number): void;
  onClose(): void;
}

/**
 * What a share link carries: a list of places (and maybe a dated trip) to look at, add to the saved spots, or leave.
 * `savedCount` and `hasTrip` say what adding would change.
 */
export function renderShared(root: HTMLElement, d: DecodedShare, savedCount: number, hasTrip: boolean, h: SharedHandlers): void {
  const n = d.payload.spots.length;
  const nights = d.payload.trip?.length ?? 0;
  const title = el('h2', 'finder-title', tr(n === 1 ? 'Shared with you: {n} spot' : 'Shared with you: {n} spots', { n }));
  const lead = el(
    'p',
    'where',
    nights
      ? nights === 1
        ? tr('These spots and a trip of one night came in a link. Nothing is checked yet: each spot is judged with today\'s rules and forecast when you open it.')
        : tr('These spots and a trip of {nights} nights came in a link. Nothing is checked yet: each spot is judged with today\'s rules and forecast when you open it.', { nights })
      : tr('These spots came in a link. Nothing is checked yet: each spot is judged with today\'s rules and forecast when you open it.'),
  );
  const list = el('ol', 'plan-list');
  d.payload.spots.forEach((s, i) => {
    const li = el('li', 'plan-row');
    const head = el('div', 'finder-head');
    const open = el('button', 'saved-open');
    open.type = 'button';
    open.append(el('strong', undefined, s.name ?? defaultName(undefined, undefined, s.lat, s.lng)), el('span', 'finder-note', `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`));
    open.onclick = () => h.onOpen(i);
    head.append(el('span', 'finder-num', String(i + 1)), open);
    li.append(head);
    if (s.note) li.append(el('p', 'finder-note spot-note', '📝 ' + s.note));
    list.append(li);
  });
  const parts: Node[] = [title, lead, list];
  if (d.dropped) parts.push(el('p', 'where', d.dropped === 1 ? tr('{n} place in the link was outside Switzerland or unreadable and was left out.', { n: d.dropped }) : tr('{n} places in the link were outside Switzerland or unreadable and were left out.', { n: d.dropped })));
  const room = MAX_SAVED - savedCount;
  const buttons = el('div', 'shared-buttons');
  if (room <= 0) {
    parts.push(el('p', 'where', tr('The list of saved spots is full ({n}). Remove some to add these.', { n: MAX_SAVED })));
  } else {
    if (n > room) parts.push(el('p', 'where', tr('Only {room} more spots fit in the saved list; the rest would be left out.', { room })));
    const add = el('button', 'finder-btn', nights ? tr('Add the spots and the trip') : tr('Add to my saved spots'));
    add.type = 'button';
    add.onclick = nights ? h.onAddTrip : h.onAddSpots;
    buttons.append(add);
    if (nights) {
      const only = el('button', 'save-btn', tr('Add the spots only'));
      only.type = 'button';
      only.onclick = h.onAddSpots;
      buttons.append(only);
      if (hasTrip) parts.push(el('p', 'where', tr('Adding the trip replaces the trip you have now.')));
    }
  }
  const close = el('button', 'linkish', tr('Not now'));
  close.type = 'button';
  close.onclick = h.onClose;
  buttons.append(close);
  parts.push(buttons);
  root.replaceChildren(...parts);
}
