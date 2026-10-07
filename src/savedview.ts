import { downloadText, spotsToGpx } from './gpx';
import { ageLabel, compareRows, MAX_NAME, MAX_NOTE, MAX_SAVED, overallOf, sortSpots, type SavedSpot, type SortKey } from './saved';
import { el } from './resultview';
import { tr } from './i18n';

/** What the legality check of a saved spot found when it was made again. */
export interface RefreshChange {
  spot: SavedSpot;
  /** Verdict before and after (words), or `failed` when the check could not be made. */
  before: string;
  after?: string;
  failed: boolean;
  changed: boolean;
}

export interface SavedHandlers {
  onOpen(s: SavedSpot): void;
  onRemove(id: string): void;
  /** Plan a trip: the ticked spots, in the order they were ticked, one per night. */
  onPlan(spots: SavedSpot[]): void;
  onEdit(id: string, patch: { name: string; note: string }): void;
  /** Draw every saved spot on the map and fit the view to them. */
  onShowAll(): void;
  /** Judge the legality of every saved spot again for today, reporting progress; resolves with what changed and the list as it is now. */
  onRefresh(progress: (done: number, total: number) => void): Promise<{ changes: RefreshChange[]; spots: SavedSpot[] }>;
  /** A link carrying these spots (the ticked ones, or all when none is ticked). */
  onShare(spots: SavedSpot[]): void;
  /** The text of a chosen GPX file. */
  onImport(text: string, fileName: string): void;
  /** Save the map around these spots (the ticked ones, or all when none is ticked) for offline use. */
  onSaveMaps(spots: SavedSpot[]): void;
  /** The map centre or the person's position, for sorting by distance. */
  origin(): { lat: number; lng: number };
}

const MAX_COMPARE = 4;
let lastSort: SortKey = 'recent';

const SORTS: [SortKey, string][] = [
  ['recent', 'Newest first'],
  ['name', 'Name'],
  ['distance', 'Nearest to the map centre'],
  ['score', 'Best overall score'],
];

/** The saved-spots list: sorted, with notes, with checkboxes; two or more ticked spots can be compared side by side or planned as nights. */
export function renderSaved(root: HTMLElement, initial: SavedSpot[], h: SavedHandlers): void {
  let spots = initial;
  const title = el('h2', 'finder-title', tr('Saved spots ({n})', { n: spots.length }));
  const importBtn = fileButton(h);
  if (!spots.length) {
    root.replaceChildren(title, el('p', 'where', tr('Nothing saved yet. Check a spot and press "Save this spot".')), importBtn.button, importBtn.input);
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

  const sort = el('select', 'saved-sort');
  sort.setAttribute('aria-label', tr('Sort the list'));
  for (const [key, label] of SORTS) sort.append(Object.assign(document.createElement('option'), { value: key, textContent: tr(label), selected: key === lastSort }));

  const drawRows = () => {
    const sorted = sortSpots(spots, lastSort, h.origin());
    list.replaceChildren(...sorted.map((s) => row(s)));
  };
  sort.onchange = () => {
    lastSort = sort.value as SortKey;
    drawRows();
  };

  /** One saved spot: a checkbox, the name with its scores and note, an edit button and a two-step delete. */
  const row = (s: SavedSpot): HTMLElement => {
    const li = el('li', 'saved-row');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = picked.has(s.id);
    box.setAttribute('aria-label', tr('Compare {name}', { name: s.name }));
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
    const overall = overallOf(sn);
    const scores = sn.unrated
      ? tr('Not checked yet: open it to check')
      : `${overall !== undefined ? `${tr('Overall')} ${overall} · ` : ''}${tr('Legal')} ${sn.legal ?? '–'} · ${tr('Sleep')} ${sn.sleep ?? '–'}${sn.weather !== undefined ? ` · ${tr('Weather')} ${sn.weather}` : ''} · ${tr('saved')} ${ageLabel(sn.savedAt)}`;
    open.append(el('strong', undefined, s.name), el('span', 'finder-note', scores));
    if (s.note) open.append(el('span', 'saved-note', '📝 ' + s.note));
    open.onclick = () => h.onOpen(s);

    const edit = el('button', 'saved-edit', '✎');
    edit.type = 'button';
    edit.title = tr('Rename or add a note');
    edit.setAttribute('aria-label', tr('Rename or add a note to {name}', { name: s.name }));
    edit.onclick = () => li.replaceWith(editor(s));

    const del = el('button', 'saved-del', '✕');
    del.type = 'button';
    del.title = tr('Remove this spot');
    del.setAttribute('aria-label', tr('Remove {name}', { name: s.name }));
    del.onclick = () => li.replaceWith(confirmRow(s));
    li.append(box, open, edit, del);
    return li;
  };

  const confirmRow = (s: SavedSpot): HTMLElement => {
    const li = el('li', 'saved-row confirm');
    const text = el('span', 'confirm-text', tr('Remove "{name}"?', { name: s.name }));
    const yes = el('button', 'saved-yes', tr('Remove'));
    yes.type = 'button';
    yes.onclick = () => {
      picked.delete(s.id);
      h.onRemove(s.id);
    };
    const no = el('button', 'saved-no', tr('Keep'));
    no.type = 'button';
    no.onclick = () => li.replaceWith(row(s));
    li.append(text, yes, no);
    window.setTimeout(() => {
      if (li.isConnected && li.classList.contains('confirm')) li.replaceWith(row(s)); // a forgotten question goes away
    }, 8000);
    return li;
  };

  const editor = (s: SavedSpot): HTMLElement => {
    const li = el('li', 'saved-row editing');
    const name = el('input', 'saved-name');
    name.type = 'text';
    name.value = s.name;
    name.maxLength = MAX_NAME;
    name.setAttribute('aria-label', tr('Name'));
    const note = el('textarea', 'saved-note-input');
    note.value = s.note ?? '';
    note.maxLength = MAX_NOTE;
    note.rows = 3;
    note.placeholder = tr('A note for yourself: water at the hut, ask the farmer, where the tent stood…');
    note.setAttribute('aria-label', tr('Note'));
    const save = el('button', 'saved-yes', tr('Save'));
    save.type = 'button';
    save.onclick = () => h.onEdit(s.id, { name: name.value, note: note.value });
    const cancel = el('button', 'saved-no', tr('Cancel'));
    cancel.type = 'button';
    cancel.onclick = () => li.replaceWith(row(s));
    li.append(name, note, el('div', 'saved-edit-buttons', save, cancel));
    window.setTimeout(() => name.focus(), 0);
    return li;
  };

  drawRows();

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

  // the less common actions, one tap away
  const more = el('details', 'more');
  const showAll = el('button', 'linkish', tr('Show all on the map'));
  showAll.type = 'button';
  showAll.onclick = h.onShowAll;
  const refresh = el('button', 'linkish', tr('Check the legality of all again'));
  refresh.type = 'button';
  const changes = el('div', 'refresh-changes');
  let armed: number | undefined;
  refresh.onclick = async () => {
    // a long list means many requests on mobile data (about seven per spot): ask once first
    if (spots.length > 25 && armed === undefined) {
      refresh.textContent = tr('Check {n} spots (about {req} requests)? Tap again', { n: spots.length, req: spots.length * 7 });
      armed = window.setTimeout(() => {
        armed = undefined;
        refresh.textContent = tr('Check the legality of all again');
      }, 8000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    refresh.disabled = true;
    changes.replaceChildren();
    try {
      const res = await h.onRefresh((d, t) => (refresh.textContent = tr('Checking {done} of {total}…', { done: d, total: t })));
      refresh.textContent = tr('Check the legality of all again');
      changes.replaceChildren(refreshSummary(res.changes));
      spots = res.spots; // the rows show the new scores, the summary stays
      drawRows();
    } finally {
      refresh.disabled = false;
    }
  };
  const share = el('button', 'linkish', tr('Share a link to these spots'));
  share.type = 'button';
  share.onclick = () => h.onShare(picked.size ? spots.filter((s) => picked.has(s.id)) : spots);
  const maps = el('button', 'linkish', tr('Save the map around these spots for offline use'));
  maps.type = 'button';
  maps.onclick = () => h.onSaveMaps(picked.size ? spots.filter((s) => picked.has(s.id)) : spots);
  const exp = el('button', 'linkish', tr('Export all as GPX (for a navigation app)'));
  exp.type = 'button';
  exp.onclick = () => downloadText('wildcamp-spots.gpx', spotsToGpx(spots));
  more.append(el('summary', undefined, tr('More options')), el('div', 'more-actions', showAll, refresh, share, maps, exp, importBtn.button, importBtn.input));
  const full = spots.length >= MAX_SAVED - 20 ? [el('p', 'disclaimer', spots.length >= MAX_SAVED ? tr('The list is full ({n} spots). Remove some to save more.', { n: MAX_SAVED }) : tr('{n} of {max} spots used.', { n: spots.length, max: MAX_SAVED }))] : [];
  root.replaceChildren(title, el('div', 'saved-toolbar', sort), list, cmp, plan, out, more, changes, ...full);
}

function refreshSummary(done: RefreshChange[]): HTMLElement {
  const box = el('div', 'refresh-summary');
  const changed = done.filter((c) => c.changed);
  const failed = done.filter((c) => c.failed);
  box.append(el('strong', undefined, changed.length ? tr(changed.length === 1 ? '{n} spot changed' : '{n} spots changed', { n: changed.length }) : tr('Nothing changed: every spot that could be checked has the same verdict as before.')));
  if (changed.length) {
    const ul = el('ul');
    for (const c of changed) ul.append(el('li', undefined, `${c.spot.name}: ${c.before} → ${c.after}`));
    box.append(ul);
  }
  if (failed.length) {
    const names = failed.slice(0, 5).map((c) => c.spot.name).join(', ') + (failed.length > 5 ? ', …' : '');
    box.append(el('p', 'where', (failed.length === 1 ? tr('{n} spot could not be checked (no connection?).', { n: failed.length }) : tr('{n} spots could not be checked (no connection?).', { n: failed.length })) + ' ' + tr('Their scores are as saved: {names}.', { names })));
  }
  return box;
}

/** A button that opens the file picker for a GPX file, and the hidden input behind it. */
function fileButton(h: SavedHandlers): { button: HTMLButtonElement; input: HTMLInputElement } {
  const input = el('input');
  input.type = 'file';
  input.accept = '.gpx,application/gpx+xml,text/xml,application/xml';
  input.hidden = true;
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    h.onImport(await file.text(), file.name);
  };
  const button = el('button', 'linkish', tr('Import spots from a GPX file'));
  button.type = 'button';
  button.onclick = () => input.click();
  return { button, input };
}
