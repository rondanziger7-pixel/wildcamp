import { hourLabel, linePath, nearestIndex, niceScale, xAt } from './chart';
import { compassName, describeCode, nightText, type HourPoint, type Night, type NightWindow } from './comfort/weather';
import { dateLocale, tr } from './i18n';

const SVG = 'http://www.w3.org/2000/svg';
const W = 340;
const H = 104;
const PAD = { l: 34, r: 8, t: 10, b: 20 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

interface ChartSpec {
  title: string;
  unit: string;
  kind: 'line' | 'bars';
  /** CSS custom property holding the series colour. */
  color: string;
  values: (number | null)[];
  hours: HourPoint[];
  /** A horizontal reference line, e.g. freezing point. */
  ref?: { value: number; label: string };
  /** Force the scale to include these values. */
  include?: number[];
  decimals?: number;
  /** Extra text for the tooltip of point i. */
  extra?: (i: number) => string;
}

/** One single-series chart with recessive grid, a crosshair and a tooltip that also follow the keyboard. */
function chart(spec: ChartSpec): HTMLElement {
  const wrap = el('figure', 'wx-chart');
  wrap.append(el('figcaption', undefined, spec.title));
  const present = spec.values.filter((v): v is number => v !== null);
  const dec = spec.decimals ?? 0;
  const fmt = (v: number) => `${v.toFixed(dec)} ${spec.unit}`;
  if (!present.length) {
    wrap.append(el('p', 'where', tr('No data for this window.')));
    return wrap;
  }
  const lo = Math.min(...present, ...(spec.include ?? []), ...(spec.kind === 'bars' ? [0] : []));
  const hi = Math.max(...present, ...(spec.include ?? []), spec.kind === 'bars' ? 1 : -Infinity);
  const sc = niceScale(lo, hi, 3);
  const n = spec.values.length;
  const L = PAD.l;
  const R = W - PAD.r;
  const y = (v: number) => PAD.t + ((sc.max - v) / (sc.max - sc.min)) * (H - PAD.t - PAD.b);
  const xs = spec.values.map((_, i) => xAt(i, n, L, R));
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': tr('{title}: {from} to {to}', { title: spec.title, from: fmt(Math.min(...present)), to: fmt(Math.max(...present)) }) });
  s.style.setProperty('--c', `var(${spec.color})`);

  for (const t of sc.ticks) {
    s.append(svg('line', { class: 'grid', x1: L, x2: R, y1: y(t), y2: y(t) }));
    const lab = svg('text', { class: 'tick', x: L - 5, y: y(t) + 3, 'text-anchor': 'end' });
    lab.textContent = String(t);
    s.append(lab);
  }
  if (spec.ref && spec.ref.value >= sc.min && spec.ref.value <= sc.max) {
    s.append(svg('line', { class: 'ref', x1: L, x2: R, y1: y(spec.ref.value), y2: y(spec.ref.value) }));
    const lab = svg('text', { class: 'tick ref-label', x: R, y: y(spec.ref.value) - 3, 'text-anchor': 'end' });
    lab.textContent = spec.ref.label;
    s.append(lab);
  }
  // x labels every 3 hours
  spec.hours.forEach((h, i) => {
    if (Number(hourLabel(h.time)) % 3 === 0) {
      const lab = svg('text', { class: 'tick', x: xs[i]!, y: H - 5, 'text-anchor': 'middle' });
      lab.textContent = hourLabel(h.time);
      s.append(lab);
    }
  });

  const slot = n > 1 ? (R - L) / (n - 1) : R - L;
  if (spec.kind === 'bars') {
    const bw = Math.min(14, Math.max(3, slot - 2));
    spec.values.forEach((v, i) => {
      if (!v || v <= 0) return;
      const top = y(v);
      const base = y(Math.max(0, sc.min));
      const h = Math.max(2, base - top);
      s.append(svg('path', { class: 'bar', d: `M${xs[i]! - bw / 2},${base} V${base - h + 4} Q${xs[i]! - bw / 2},${base - h} ${xs[i]! - bw / 2 + 4},${base - h} H${xs[i]! + bw / 2 - 4} Q${xs[i]! + bw / 2},${base - h} ${xs[i]! + bw / 2},${base - h + 4} V${base} Z` }));
    });
  } else {
    const path = svg('path', { class: 'line', d: linePath(xs, spec.values.map((v) => (v === null ? null : y(v)))) });
    s.append(path);
  }
  const cross = svg('line', { class: 'cross', y1: PAD.t, y2: H - PAD.b, visibility: 'hidden' });
  const dot = svg('circle', { class: 'dot', r: 4, visibility: 'hidden' });
  s.append(cross, dot);

  const tip = el('div', 'wx-tip');
  tip.hidden = true;
  let cur = -1;
  const show = (i: number) => {
    cur = i;
    const v = spec.values[i];
    cross.setAttribute('x1', String(xs[i]));
    cross.setAttribute('x2', String(xs[i]));
    cross.setAttribute('visibility', 'visible');
    if (v === null || v === undefined) dot.setAttribute('visibility', 'hidden');
    else {
      dot.setAttribute('cx', String(xs[i]));
      dot.setAttribute('cy', String(y(v)));
      dot.setAttribute('visibility', 'visible');
    }
    tip.replaceChildren();
    tip.append(el('strong', undefined, v === null || v === undefined ? tr('n/a') : fmt(v)), el('span', undefined, ` ${hourLabel(spec.hours[i]!.time)}:00`));
    const extra = spec.extra?.(i);
    if (extra) tip.append(el('div', 'sub', extra));
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max((xs[i]! / W) * 100, 14), 86)}%`;
  };
  const hide = () => {
    cur = -1;
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
  };
  const holder = el('div', 'wx-plot');
  holder.tabIndex = 0;
  holder.append(s, tip);
  holder.addEventListener('pointermove', (ev) => {
    const r = s.getBoundingClientRect();
    show(nearestIndex(((ev.clientX - r.left) / r.width) * W, n, L, R));
  });
  holder.addEventListener('pointerleave', hide);
  holder.addEventListener('blur', hide);
  holder.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') show(Math.min(n - 1, cur < 0 ? 0 : cur + 1));
    else if (ev.key === 'ArrowLeft') show(Math.max(0, cur < 0 ? n - 1 : cur - 1));
    else if (ev.key === 'Escape') hide();
    else return;
    ev.preventDefault();
  });
  wrap.append(holder);
  return wrap;
}

function tile(label: string, value: string, sub?: string, tone?: 'good' | 'warn' | 'bad') {
  const t = el('div', `wx-tile${tone ? ` ${tone}` : ''}`);
  t.append(el('span', 'wx-label', label), el('strong', undefined, value));
  if (sub) t.append(el('span', 'wx-sub', sub));
  return t;
}

function table(hours: HourPoint[]) {
  const t = el('table', 'wx-table');
  const head = el('tr');
  for (const h of ['Hour', 'Sky', '°C', 'Rain mm', 'Rain %', 'Wind km/h', 'Gusts', 'From']) head.append(el('th', undefined, tr(h)));
  t.append(head);
  for (const h of hours) {
    const r = el('tr');
    const cells = [
      `${hourLabel(h.time)}:00`,
      h.code === null ? '' : describeCode(h.code).label,
      h.temp === null ? '' : h.temp.toFixed(1),
      h.rain === null ? '' : h.rain.toFixed(1),
      h.prob === null ? '' : String(Math.round(h.prob)),
      h.wind === null ? '' : String(Math.round(h.wind)),
      h.gust === null ? '' : String(Math.round(h.gust)),
      h.dir === null ? '' : compassName(h.dir),
    ];
    for (const c of cells) r.append(el('td', undefined, c));
    t.append(r);
  }
  return t;
}

const fmtDay = (t: string) => new Date(`${t.slice(0, 10)}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export interface WeatherView {
  windows: NightWindow[];
  selected: number;
  night?: Night;
  hours: HourPoint[];
  /** Comfort verdict text for the chosen night, if comfort is shown (English; translated here). */
  note?: string;
  onSelect: (i: number) => void;
}

/** Renders the weather card: night picker, headline tiles, hourly charts, table. */
export function renderWeather(host: HTMLElement, v: WeatherView) {
  const w = v.windows[v.selected]!;
  const picker = el('div', 'wx-picker');
  picker.setAttribute('role', 'tablist');
  v.windows.forEach((nw, i) => {
    const b = el('button', i === v.selected ? 'on' : '', nightText(nw.label));
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === v.selected));
    b.onclick = () => v.onSelect(i);
    picker.append(b);
  });
  const span = el('p', 'where', tr('{a} to {b}', { a: `${fmtDay(w.from)} ${w.from.slice(11, 16)}`, b: `${fmtDay(w.to)} ${w.to.slice(11, 16)}` }));

  const parts: Node[] = [el('h2', 'wx-title', tr('Weather')), picker, span];
  const n = v.night;
  if (!n) {
    parts.push(el('p', 'where', tr('No forecast for this night.')));
    host.replaceChildren(...parts);
    return;
  }
  const sky = n.worstCode !== undefined ? describeCode(n.worstCode) : undefined;
  const tiles = el('div', 'wx-tiles');
  tiles.append(
    tile(tr('Sky'), sky ? `${sky.emoji} ${sky.label}` : '—', n.meanCloud !== undefined ? tr('{n} % cloud', { n: Math.round(n.meanCloud) }) : undefined, n.thunder ? 'bad' : undefined),
    tile(tr('Low'), `${Math.round(n.minTempC)} °C`, n.freezingLevelM !== undefined ? tr('freezing level {m} m', { m: Math.round(n.freezingLevelM / 10) * 10 }) : undefined, n.minTempC <= -5 ? 'warn' : undefined),
    tile(tr('Gusts'), `${Math.round(n.maxGustKmh)} km/h`, tr('from {dir}, mean {mean}', { dir: compassName(n.windFromDeg), mean: Math.round(n.meanWindKmh) }), n.maxGustKmh >= 80 ? 'bad' : n.maxGustKmh >= 50 ? 'warn' : undefined),
    tile(tr('Rain'), `${n.precipMm.toFixed(1)} mm`, n.maxPrecipProb !== undefined ? tr('up to {p} %', { p: Math.round(n.maxPrecipProb) }) : undefined, n.precipMm >= 5 ? 'warn' : undefined),
  );
  parts.push(tiles);
  if (v.note) parts.push(el('p', 'wx-note', v.note === 'This weather rules the night out, however good the spot is.' ? tr('This weather rules the night out, however good the spot is.') : v.note));

  const hours = v.hours;
  const dirName = (i: number) => (hours[i]?.dir == null ? '' : tr('from {dir}', { dir: compassName(hours[i]!.dir!) }));
  parts.push(
    chart({ title: tr('Temperature'), unit: '°C', kind: 'line', color: '--viz-temp', values: hours.map((h) => h.temp), hours, ref: { value: 0, label: '0 °C' }, decimals: 1 }),
    chart({ title: tr('Rain'), unit: 'mm', kind: 'bars', color: '--viz-rain', values: hours.map((h) => h.rain), hours, decimals: 1, extra: (i) => (hours[i]?.prob == null ? '' : tr('{p} % chance', { p: Math.round(hours[i]!.prob!) })) }),
    chart({ title: tr('Wind gusts'), unit: 'km/h', kind: 'line', color: '--viz-wind', values: hours.map((h) => h.gust), hours, include: [0], extra: (i) => tr('wind {w} km/h {dir}', { w: hours[i]?.wind == null ? tr('n/a') : Math.round(hours[i]!.wind!), dir: dirName(i) }) }),
  );
  const details = el('details', 'wx-details');
  details.append(el('summary', undefined, tr('Show as table')), table(hours));
  parts.push(details, el('p', 'disclaimer', tr('Forecast: Open-Meteo.com (CC BY 4.0), adjusted to the spot’s elevation. Mountain weather changes fast; check the MeteoSwiss forecast and the avalanche bulletin before you go.')));
  host.replaceChildren(...parts);
}
