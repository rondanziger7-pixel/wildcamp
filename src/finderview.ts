import type { Candidate } from './finder';
import { compass8 } from './finder';
import { el } from './resultview';
import type { Score } from './scores';
import { formatDuration } from './route';
import { tr } from './i18n';

export interface FinderRow {
  candidate: Candidate;
  /** Sleep score of the spot alone (terrain, ground, water), 0 to 100. */
  sleep: Score;
  /** Legality once checked; undefined while it is being looked up. */
  legal?: Score & { label: string; verdict: 'no' | 'caution' | 'likely_ok' | 'unknown' };
  /** One line about the spot: ground, nearest water. */
  note: string;
  /** True when the water lookup has finished (or failed). */
  waterDone: boolean;
  /** True when the 20 m profile showed the spot to be too steep to pitch on (the 100 m grid under-reads slope). */
  steep?: boolean;
}

const VERDICT_ICON = { no: '⛔', caution: '⚠️', likely_ok: '✅', unknown: '❔' } as const;

/** Combined ranking value: half legality, half sleep. Unchecked legality counts as unknown (40). */
export const combined = (r: FinderRow) => 0.5 * (r.legal?.value ?? 40) + 0.5 * (r.sleep.value ?? 0);

/** "700 m", "1.5 km". */
export const radiusText = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

export interface FinderUi {
  /** `offer` is a button under the status line: look wider when little or nothing was found. */
  update(rows: FinderRow[], status: string, done: boolean, offer?: { label: string; run: () => void }): void;
  /** One line above the list about the place as a whole (tonight's weather there). */
  setHeadline(text: string | undefined): void;
}

export interface FinderRadius {
  radius: number;
  radii: readonly number[];
  onRadius(m: number): void;
}

/** The "best spots nearby" list: tap a row to open that spot's full check. */
export function renderFinder(root: HTMLElement, heading: string, onPick: (c: Candidate, index: number) => void, radius?: FinderRadius): FinderUi {
  const title = el('h2', 'finder-title', heading);
  const status = el('p', 'where');
  const headline = el('p', 'finder-headline');
  headline.hidden = true;
  const offerHost = el('div', 'finder-offer');
  const list = el('ol', 'finder-list');
  const note = el('p', 'disclaimer');
  note.textContent = tr('A first screening: slope and wind shelter come from a 100 m elevation grid, the ground from land-cover sample points on the same grid, water and legality are looked up for the best few. The ranking is half legality, half sleep score and ignores the weather. Tap a spot for the full check.');
  const chips = el('div', 'finder-radius');
  if (radius) {
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', tr('How far to look'));
    for (const m of radius.radii) {
      const b = el('button', `night-chip${m === radius.radius ? ' on' : ''}`, tr('within {radius}', { radius: radiusText(m) }));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(m === radius.radius));
      b.onclick = () => m !== radius.radius && radius.onRadius(m);
      chips.append(b);
    }
  }
  root.replaceChildren(title, ...(radius ? [chips] : []), headline, status, offerHost, list, note);
  return {
    setHeadline(text) {
      headline.hidden = !text;
      headline.textContent = text ?? '';
    },
    update(rows, text, done, offer) {
      status.replaceChildren(...(done ? [] : [el('span', 'spinner')]), text);
      if (offer) {
        const b = el('button', 'finder-btn', offer.label);
        b.type = 'button';
        b.onclick = offer.run;
        offerHost.replaceChildren(b);
      } else offerHost.replaceChildren();
      list.replaceChildren(
        ...rows.map((r, i) => {
          const li = el('li', 'finder-row');
          const b = el('button');
          b.type = 'button';
          b.onclick = () => onPick(r.candidate, i);
          const c = r.candidate;
          const head = el('div', 'finder-head');
          head.append(
            el('span', 'finder-num', String(i + 1)),
            el('strong', undefined, `${Math.round(c.elevation)} m · ${Math.round(c.meters / 10) * 10} m ${compass8(c.bearing)}${c.walkMin !== undefined ? ' · ' + tr('about {time} on foot', { time: formatDuration(Math.max(1, Math.round(c.walkMin / 5) * 5)) }) : ''}`),
          );
          const scores = el('div', 'finder-scores');
          scores.append(
            el('span', `chip-score ${r.legal ? r.legal.tone : 'none'}`, r.legal ? `${VERDICT_ICON[r.legal.verdict]} ${tr('Legal')} ${r.legal.value ?? '–'}` : '… ' + tr('checking legality')),
            el('span', `chip-score ${r.sleep.tone}`, `😴 ${tr('Sleep')} ${r.sleep.value ?? '–'}`),
          );
          b.append(head, scores, el('p', 'finder-note', r.note + (r.waterDone ? '' : ' ' + tr('Looking up water…'))));
          li.append(b);
          return li;
        }),
      );
    },
  };
}
