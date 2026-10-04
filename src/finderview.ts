import type { Candidate } from './finder';
import { compass8 } from './finder';
import { el } from './resultview';
import type { Score } from './scores';

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
}

const VERDICT_ICON = { no: '⛔', caution: '⚠️', likely_ok: '✅', unknown: '❔' } as const;

/** Combined ranking value: half legality, half sleep. Unchecked legality counts as unknown (40). */
export const combined = (r: FinderRow) => 0.5 * (r.legal?.value ?? 40) + 0.5 * (r.sleep.value ?? 0);

export interface FinderUi {
  update(rows: FinderRow[], status: string, done: boolean): void;
}

/** The "best spots nearby" list: tap a row to open that spot's full check. */
export function renderFinder(root: HTMLElement, heading: string, onPick: (c: Candidate, index: number) => void): FinderUi {
  const title = el('h2', 'finder-title', heading);
  const status = el('p', 'where');
  const list = el('ol', 'finder-list');
  const note = el('p', 'disclaimer');
  note.textContent =
    'A first screening: slope and wind shelter come from a 100 m elevation grid, the ground from land-cover sample points on the same grid, water and legality are looked up for the best few. The ranking is half legality, half sleep score and ignores the weather. Tap a spot for the full check.';
  root.replaceChildren(title, status, list, note);
  return {
    update(rows, text, done) {
      status.replaceChildren(...(done ? [] : [el('span', 'spinner')]), text);
      list.replaceChildren(
        ...rows.map((r, i) => {
          const li = el('li', 'finder-row');
          const b = el('button');
          b.type = 'button';
          b.onclick = () => onPick(r.candidate, i);
          const c = r.candidate;
          const head = el('div', 'finder-head');
          head.append(el('span', 'finder-num', String(i + 1)), el('strong', undefined, `${Math.round(c.elevation)} m · ${Math.round(c.meters / 10) * 10} m ${compass8(c.bearing)}`));
          const scores = el('div', 'finder-scores');
          scores.append(
            el('span', `chip-score ${r.legal ? r.legal.tone : 'none'}`, r.legal ? `${VERDICT_ICON[r.legal.verdict]} Legal ${r.legal.value ?? '–'}` : '… checking legality'),
            el('span', `chip-score ${r.sleep.tone}`, `😴 Sleep ${r.sleep.value ?? '–'}`),
          );
          b.append(head, scores, el('p', 'finder-note', r.note + (r.waterDone ? '' : ' Looking up water…')));
          li.append(b);
          return li;
        }),
      );
    },
  };
}
