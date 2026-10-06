import { formatDuration } from './route';
import { el } from './resultview';
import { tr } from './i18n';
import { addDays } from './comfort/weather';
import { MAX_AHEAD_DAYS } from './trip';
import type { Cell, RouteReport, StripClass } from './routecheck';
import type { RouteStats, StageInfo } from './routeplan';

export interface RouteViewState {
  name: string;
  stats: RouteStats;
  stageKm: number;
  /** The first day of the walk, "YYYY-MM-DD". */
  date: string;
  /** The first evening that can be planned. */
  today: string;
  status: 'checking' | 'done' | 'failed';
  progress?: { done: number; total: number };
  report?: RouteReport;
  stages: StageInfo[];
  /** Spots lookups were made for the page (the route checked at all): false when the line is not in Switzerland. */
  outside?: boolean;
}

export interface RouteHandlers {
  /** The text of a chosen GPX file. */
  onFile(text: string, fileName: string): void;
  onStageKm(km: number): void;
  onDate(date: string): void;
  /** Centre the map on a distance along the route, in metres. */
  onFocus(distM: number): void;
  onStage(stage: StageInfo): void;
  /** Look for the best spots around the stage's camp. */
  onFind(stage: StageInfo): void;
  /** Save the camps as spots and plan the nights. */
  onPlan(): void;
  onExport(): void;
  onRetry(): void;
  onClear(): void;
}

export const STAGE_KM = { min: 5, max: 40, step: 1, initial: 15 } as const;

const km = (m: number) => (m >= 10_000 ? Math.round(m / 100) / 10 : Math.round(m / 10) / 100);
const kmText = (m: number) => `${km(m).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const metres = (m: number) => `${Math.round(m).toLocaleString()} m`;

const CLASS_ICON: Record<StripClass, string> = { ban: '⛔', caution: '⚠️', ok: '✅', unknown: '❔' };
const classWord = (c: StripClass) => (c === 'ban' ? tr('Camping not allowed') : c === 'caution' ? tr('Rules or care needed') : c === 'ok' ? tr('No restriction found') : tr('Not checked'));

/** Neighbouring cells of one class as runs (from, to) for drawing. */
export function runsOf(cells: readonly Cell[], totalM: number): { fromM: number; toM: number; cls: StripClass }[] {
  const out: { fromM: number; toM: number; cls: StripClass }[] = [];
  cells.forEach((c, i) => {
    const toM = i + 1 < cells.length ? cells[i + 1]!.distM : totalM;
    const last = out[out.length - 1];
    if (last && last.cls === c.cls) last.toM = toM;
    else out.push({ fromM: c.distM, toM, cls: c.cls });
  });
  return out;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** The strip: the whole route as one bar coloured by what applies, with the stage ends marked. A tap or key press centres the map there. */
function strip(report: RouteReport, stages: StageInfo[], h: RouteHandlers): HTMLElement {
  const W = 1000;
  const total = report.lengthM || 1;
  const box = el('div', 'route-strip');
  const s = svg('svg', { viewBox: `0 0 ${W} 28`, preserveAspectRatio: 'none', role: 'img', class: 'route-strip-svg' });
  s.setAttribute('aria-label', tr('The route from start to finish, coloured by what applies along it. Tap a place on it to see it on the map.'));
  for (const r of runsOf(report.cells, report.lengthM)) {
    s.append(svg('rect', { x: (r.fromM / total) * W, y: 0, width: Math.max(1, ((r.toM - r.fromM) / total) * W), height: 28, class: `strip-${r.cls}` }));
  }
  for (const st of stages.slice(0, -1)) s.append(svg('rect', { x: (st.toM / total) * W - 1.5, y: 0, width: 3, height: 28, class: 'strip-tick' }));
  const at = (ev: MouseEvent) => {
    const r = s.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width))) * total;
  };
  s.addEventListener('click', (ev) => h.onFocus(at(ev)));
  box.append(s, el('div', 'route-axis', ...[el('span', undefined, '0'), el('span', undefined, kmText(report.lengthM))]));
  const legend = el('div', 'route-legend');
  for (const c of ['ok', 'caution', 'ban', 'unknown'] as StripClass[]) {
    if (c === 'unknown' && !report.shares.unknown) continue;
    legend.append(el('span', `legend-chip strip-${c}-dot`, `${classWord(c)} · ${Math.round(report.shares[c] * 100)} %`));
  }
  box.append(legend);
  return box;
}

function stretchRows(report: RouteReport, h: RouteHandlers): HTMLElement | undefined {
  // the findings that are about a place (a zone, a municipality, a canton); forest and treeline are said once, in the shares
  const named = report.stretches.filter((s) => s.cause === 'zone' || s.cause === 'municipality' || s.cause === 'canton');
  if (!named.length) return undefined;
  const order = [...named].sort((a, b) => (a.cls === b.cls ? a.fromM - b.fromM : a.cls === 'ban' ? -1 : 1));
  const box = el('div', 'route-stretches');
  box.append(el('h3', undefined, tr('Along the route')));
  const list = el('ul', 'route-list');
  const shown = order.slice(0, 8);
  const row = (s: (typeof named)[number]) => {
    const li = el('li');
    const b = el('button', `route-stretch ${s.cls}`);
    b.type = 'button';
    b.append(el('strong', undefined, `${CLASS_ICON[s.cls]} ${kmText(s.fromM)} – ${kmText(s.toM)}`), el('span', undefined, ` · ${kmText(s.toM - s.fromM)} · ${s.why}`));
    b.onclick = () => h.onFocus((s.fromM + s.toM) / 2);
    li.append(b);
    return li;
  };
  list.append(...shown.map(row));
  box.append(list);
  if (order.length > shown.length) {
    const more = el('details', 'more');
    const rest = el('ul', 'route-list');
    rest.append(...order.slice(shown.length).map(row));
    more.append(el('summary', undefined, tr('{n} more', { n: order.length - shown.length })), rest);
    box.append(more);
  }
  return box;
}

function municipalRows(report: RouteReport): HTMLElement | undefined {
  if (!report.municipalities.length && !report.cantons.some((c) => c.rule)) return undefined;
  const box = el('div', 'route-municipal');
  box.append(el('h3', undefined, tr('Rules of municipalities and cantons')));
  const ul = el('ul', 'route-list plain');
  for (const m of report.municipalities) {
    const word = m.unverified ? tr('a camping ban is reported, not verified') : m.stance === 'banned' ? tr('camping banned') : m.stance === 'restricted' ? tr('camping restricted') : tr('has a recorded rule');
    ul.append(el('li', undefined, `${m.name} (${m.canton}): ${word}`));
  }
  for (const c of report.cantons.filter((x) => x.rule)) ul.append(el('li', undefined, `${c.name}: ${c.rule!.stance === 'banned' ? tr('camping banned') : c.rule!.stance === 'restricted' ? tr('camping restricted') : tr('camping tolerated')}`));
  box.append(ul, el('p', 'where', tr('Tap a spot there to read the rule.')));
  return box;
}

function stageRow(s: StageInfo, h: RouteHandlers): HTMLElement {
  const li = el('li', 'plan-row route-stage');
  const head = el('div', 'finder-head');
  head.append(el('span', 'finder-num', String(s.n)), el('strong', undefined, tr('Day {n}', { n: s.n })));
  const facts = [kmText(s.distM), s.ascentM !== undefined ? `+${metres(s.ascentM)} / −${metres(s.descentM ?? 0)}` : '', tr('about {time}', { time: formatDuration(s.minutes) })].filter(Boolean).join(' · ');
  li.append(head, el('p', 'finder-note', facts));
  if (s.endCell) {
    const c = s.endCell;
    let line = `${CLASS_ICON[c.cls]} ${tr('The stage ends:')} ${c.cls === 'ok' ? classWord('ok').toLowerCase() : c.why || classWord(c.cls).toLowerCase()}.`;
    if (c.cls !== 'ok') {
      if (s.camp.moved) {
        const off = s.camp.distM - s.toM;
        line += ' ' + (off < 0 ? tr('Nearest place not banned: {m} m before the end.', { m: Math.round(-off / 10) * 10 }) : tr('Nearest place not banned: {m} m after the end.', { m: Math.round(off / 10) * 10 }));
      } else if (s.camp.blocked) line += ' ' + tr('Camping is not allowed anywhere within about {km} km of it along the route. Plan the day shorter or longer.', { km: 3 });
    }
    li.append(el('p', `finder-note stage-end ${c.cls}`, line));
  }
  const buttons = el('div', 'stage-buttons');
  const show = el('button', 'save-btn', tr('Show on the map'));
  show.type = 'button';
  show.onclick = () => h.onStage(s);
  const find = el('button', 'save-btn', '🔍 ' + tr('Best spots near the camp'));
  find.type = 'button';
  find.onclick = () => h.onFind(s);
  buttons.append(show, find);
  li.append(buttons);
  return li;
}

/** The route page: load a GPX file, see the route's length, climb and stages, and what applies along it. */
export function renderRoute(root: HTMLElement, state: RouteViewState | undefined, h: RouteHandlers): void {
  const title = el('h2', 'finder-title', tr('Route'));
  const input = el('input');
  input.type = 'file';
  input.accept = '.gpx,application/gpx+xml,text/xml,application/xml';
  input.hidden = true;
  input.onchange = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) h.onFile(await file.text(), file.name);
  };
  const choose = el('button', 'finder-btn', state ? tr('Choose another GPX file') : tr('Choose a GPX file'));
  choose.type = 'button';
  choose.onclick = () => input.click();

  if (!state) {
    root.replaceChildren(
      title,
      el('p', 'where', tr('Load a route (a GPX file from your hiking app) to see where along it camping is not allowed, and where you could sleep each night.')),
      choose,
      input,
      el('p', 'disclaimer', tr('The file is read on your phone. Only the outline of the route is sent to the federal map service to look up zones.')),
    );
    return;
  }
  const name = el('p', 'route-name', state.name);
  const facts = el('p', 'finder-note', [kmText(state.stats.lengthM), state.stats.ascentM !== undefined ? `+${metres(state.stats.ascentM)} / −${metres(state.stats.descentM ?? 0)}` : '', tr('about {time} of walking', { time: formatDuration(state.stats.minutes) })].filter(Boolean).join(' · '));

  // the walk: first day and stage length
  const date = el('input', 'trip-date');
  date.type = 'date';
  date.min = state.today;
  date.max = addDays(state.today, MAX_AHEAD_DAYS);
  date.value = state.date;
  date.setAttribute('aria-label', tr('First day of the walk'));
  date.onchange = () => (date.value ? h.onDate(date.value) : (date.value = state.date));
  const stageRow1 = el('div', 'route-controls');
  const minus = el('button', 'trip-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', tr('Shorter stages'));
  minus.disabled = state.stageKm <= STAGE_KM.min;
  minus.onclick = () => h.onStageKm(Math.max(STAGE_KM.min, state.stageKm - STAGE_KM.step));
  const plus = el('button', 'trip-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', tr('Longer stages'));
  plus.disabled = state.stageKm >= STAGE_KM.max;
  plus.onclick = () => h.onStageKm(Math.min(STAGE_KM.max, state.stageKm + STAGE_KM.step));
  stageRow1.append(el('span', undefined, tr('About')), minus, el('strong', 'route-km', `${state.stageKm} km`), plus, el('span', undefined, tr('a day')));
  const when = el('label', 'night-date-row');
  when.append(tr('First day') + ' ', date);

  const parts: Node[] = [title, name, facts, when, stageRow1];

  // the check
  if (state.status === 'checking') {
    const p = state.progress;
    parts.push(el('p', 'where', tr('Checking zones and rules along the route…') + (p ? ` ${p.done} / ${p.total}` : '')));
  } else if (state.status === 'failed') {
    const retry = el('button', 'save-btn retry-btn', '↻ ' + tr('Check again'));
    retry.type = 'button';
    retry.onclick = h.onRetry;
    parts.push(el('p', 'where warnnote', tr('The route could not be checked (no connection?).')), retry);
  } else if (state.report && state.report.outsideShare >= 0.95) {
    parts.push(el('p', 'where warnnote', tr('This route lies outside Switzerland, so the rules checked here do not apply. Look up the rules of that country.')));
  } else if (state.report) {
    const r = state.report;
    parts.push(strip(r, state.stages, h));
    if (r.failed.length) parts.push(el('p', 'where warnnote', tr('Not everything could be looked up: {list}. A stretch shown as fine may be banned.', { list: r.failed.map(failedLabel).join(', ') })));
    const st = stretchRows(r, h);
    if (st) parts.push(st);
    const muni = municipalRows(r);
    if (muni) parts.push(muni);
    if (!st && !r.failed.length && r.shares.ban === 0) parts.push(el('p', 'where', tr('No ban zone was found along the route for this date.')));
  }

  // the stages (not for a route that is all outside Switzerland: there is nothing to say about where to sleep)
  if (state.stages.length && !(state.report && state.report.outsideShare >= 0.95)) {
    parts.push(el('h3', 'trip-h3', tr(state.stages.length === 1 ? '{n} day' : '{n} days', { n: state.stages.length })));
    const list = el('ol', 'plan-list');
    list.append(...state.stages.map((s) => stageRow(s, h)));
    parts.push(list);
    const plan = el('button', 'finder-btn', tr('Plan the nights with these camps'));
    plan.type = 'button';
    plan.onclick = h.onPlan;
    const exp = el('button', 'linkish', tr('Download the route with the camps (GPX)'));
    exp.type = 'button';
    exp.onclick = h.onExport;
    parts.push(plan, exp);
  }
  const clear = el('button', 'linkish', tr('Remove the route'));
  clear.type = 'button';
  clear.onclick = h.onClear;
  parts.push(choose, input, clear);
  parts.push(
    el(
      'p',
      'disclaimer',
      tr('Checked for the date above: wildlife zone seasons and shooting days follow it. The strip shows what the map data says about each point. It does not check settlements, huts and inns nearby, private land, hunting, or the Jura reserves, and a green stretch is never a permission: tap a spot on the route for the full check.'),
    ),
  );
  root.replaceChildren(...parts);
}

function failedLabel(name: string): string {
  switch (name) {
    case 'zones':
      return tr('protected zones');
    case 'municipalities':
      return tr('municipalities');
    case 'cantons':
      return tr('cantons');
    case 'elevation':
      return tr('heights');
    case 'local rule data':
      return tr('the rule data bundled with the app');
    default:
      return name;
  }
}
