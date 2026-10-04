import { downloadText, spotsToGpx } from './gpx';
import { ageLabel, compareRows, type SavedSpot } from './saved';
import { el } from './resultview';
import { tr } from './i18n';

export interface SavedHandlers {
  onOpen(s: SavedSpot): void;
  onRemove(id: string): void;
  /** Plan a trip: the ticked spots, in the order they were ticked, one per night. */
  onPlan(spots: SavedSpot[]): void;
}

const MAX_COMPARE = 4;

/** The saved-spots list with checkboxes; two or more ticked spots can be compared side by side. */
export function renderSaved(root: HTMLElement, spots: SavedSpot[], h: SavedHandlers): void {
  const title = el('h2', 'finder-title', tr('Saved spots ({n})', { n: spots.length }));
  if (!spots.length) {
    root.replaceChildren(title, el('p', 'where', tr('Nothing saved yet. Check a spot and press "Save this spot".')));
    return;
  }
  const picked = new Set<string>(); // insertion order = tick order
  const list = el('ul', 'saved-list');
  const out = el('div', 'saved-compare');
  const cmp = el('button', 'finder-btn', tr('Compare ticked spots'));
  cmp.type = 'button';
  cmp.disabled = true;
  const plan = el('button', 'finder-btn', tr('Plan nights with ticked spots'));
  plan.type = 'button';
  plan.disabled = true;
  const sync = () => {
    cmp.disabled = picked.size < 2;
    cmp.textContent = picked.size < 2 ? tr('Tick 2 to 4 spots to compare') : tr('Compare {n} spots', { n: picked.size });
    plan.disabled = picked.size < 1;
    plan.textContent = picked.size < 1 ? tr('Tick spots to plan nights (in tick order)') : tr(picked.size === 1 ? 'Plan {n} night in the order ticked' : 'Plan {n} nights in the order ticked', { n: picked.size });
  };
  sync();
  for (const s of spots) {
    const li = el('li', 'saved-row');
    const box = el('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', `Compare ${s.name}`);
    box.onchange = () => {
      if (box.checked && picked.size >= MAX_COMPARE) {
        box.checked = false;
        return;
      }
      if (box.checked) picked.add(s.id);
      else picked.delete(s.id);
      sync();
    };
    const open = el('button', 'saved-open');
    open.type = 'button';
    const sn = s.snapshot;
    open.append(el('strong', undefined, s.name), el('span', 'finder-note', `${tr('Legal')} ${sn.legal ?? '–'} · ${tr('Sleep')} ${sn.sleep ?? '–'}${sn.weather !== undefined ? ` · ${tr('Weather')} ${sn.weather}` : ''} · ${tr('saved')} ${ageLabel(sn.savedAt)}`));
    open.onclick = () => h.onOpen(s);
    const del = el('button', 'saved-del', '✕');
    del.type = 'button';
    del.title = tr('Remove this spot');
    del.setAttribute('aria-label', `Remove ${s.name}`);
    del.onclick = () => h.onRemove(s.id);
    li.append(box, open, del);
    list.append(li);
  }
  cmp.onclick = () => {
    const chosen = spots.filter((s) => picked.has(s.id));
    const table = el('table', 'compare');
    const head = el('tr');
    head.append(el('th'), ...chosen.map((s) => el('th', undefined, s.name)));
    table.append(head);
    for (const r of compareRows(chosen)) {
      const tr = el('tr');
      tr.append(el('th', undefined, r.label), ...r.cells.map((c, i) => el('td', r.best === i ? 'best' : undefined, c)));
      table.append(tr);
    }
    const wrap = el('div', 'compare-wrap');
    wrap.append(table);
    out.replaceChildren(wrap, el('p', 'disclaimer', tr('Scores are as they were when you saved each spot (weather for the night shown). Open a spot to check it again. The best score in a row is highlighted.')));
    out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  plan.onclick = () => h.onPlan([...picked].map((id) => spots.find((s) => s.id === id)!).filter(Boolean));
  const exp = el('button', 'linkish', tr('Export all as GPX (for a navigation app)'));
  exp.type = 'button';
  exp.onclick = () => downloadText('wildcamp-spots.gpx', spotsToGpx(spots));
  root.replaceChildren(title, list, cmp, plan, out, exp);
}
