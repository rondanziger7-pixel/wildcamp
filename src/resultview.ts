import type { Assessment } from './assess';
import type { Comfort } from './comfort/comfort';
import { LEVEL_NAME, type AvalancheInfo } from './comfort/avalanche';
import { compassName, describeCode, nightText, type Night } from './comfort/weather';
import { missingText } from './comfort/comfort';
import type { WaterInfo } from './comfort/water';
import type { ShelterResult } from './comfort/shelters';
import type { SpotSnapshot } from './saved';
import { restrictionItems, type Restrictions } from './restrictions';
import { renderSeasons } from './seasonview';
import { legalityScore, sleepScore, weatherScore, type Score } from './scores';
import { tr } from './i18n';

const TONE_ORDER = { bad: 0, warn: 1, ok: 2, info: 3 } as const;
const VISIBLE = 3;

const BANNER: Record<Assessment['verdict'], { icon: string; label: string; sub: string }> = {
  no: { icon: '⛔', label: tr('Not allowed'), sub: tr('A recorded rule or protected zone prohibits camping here.') },
  caution: { icon: '⚠️', label: tr('Be careful'), sub: tr('Possibly restricted. Read the points below before you go.') },
  likely_ok: { icon: '✅', label: tr('Likely OK'), sub: tr('No restriction found in the data checked. Not a guarantee.') },
  unknown: { icon: '❔', label: tr('Unknown'), sub: tr('Not enough data to say. Check locally.') },
};
const RATING: Record<Comfort['rating'], string> = { great: tr('Great for sleeping'), good: tr('Good for sleeping'), fair: tr('Okay for sleeping'), poor: tr('Poor for sleeping') };
const RATING_SHORT: Record<Comfort['rating'], string> = { great: tr('Great'), good: tr('Good'), fair: tr('Okay'), poor: tr('Poor') };
/** The rating as a word inside a sentence. */
const ratingWord = (r: Comfort['rating']) => (r === 'great' ? tr('great') : r === 'good' ? tr('good') : r === 'fair' ? tr('okay') : tr('poor'));

/** What the sleep score still waits for (the names main.ts passes), in the current language. */
function loadingText(x: string): string {
  switch (x) {
    case 'terrain':
      return tr('terrain');
    case 'trails and roads':
      return tr('trails and roads');
    case 'water':
      return tr('water');
    case 'huts':
      return tr('huts');
    case 'ground cover':
      return tr('ground cover');
    case 'avalanche bulletin':
      return tr('avalanche bulletin');
    case 'noise':
      return tr('noise');
    case 'natural hazards':
      return tr('natural hazards');
    case 'forecast':
      return tr('forecast');
    default:
      return x;
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export type Focus = (e: number, n: number, label: string) => void;

type More = 'details' | 'weather details' | 'comfort details' | 'fire and drone details';

function checklist(items: { tone: keyof typeof TONE_ORDER; title: string; text: string; sources?: string[]; at?: { e: number; n: number; label: string } }[], more: More, focus?: Focus) {
  const list = el('ul', 'checks');
  const sorted = [...items].sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone]);
  sorted.forEach((it, i) => {
    const li = el('li', `check ${it.tone}${i >= VISIBLE ? ' more' : ''}`);
    const body = el('p', undefined, it.text);
    li.append(el('h3', undefined, it.title), body);
    // long text is cut to two lines; tapping the item shows all of it
    if (it.text.length > 110 || it.sources?.length) {
      li.classList.add('long');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-expanded', 'false');
      const toggle = () => li.setAttribute('aria-expanded', String(li.classList.toggle('open')));
      li.onclick = (ev) => {
        if (!(ev.target as HTMLElement).closest('a, button')) toggle();
      };
      li.onkeydown = (ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === li) {
          ev.preventDefault();
          toggle();
        }
      };
    }
    const at = it.at;
    if (at && focus) {
      const go = el('button', 'linkish', '📍 ' + tr('Show on map'));
      go.type = 'button';
      go.onclick = () => focus(at.e, at.n, at.label);
      li.append(go);
    }
    if (it.sources?.length) {
      const s = el('div', 'srcs');
      s.append(tr('Source:') + ' ');
      it.sources.forEach((u, k) => {
        if (k) s.append(', ');
        const link = el('a', undefined, new URL(u).hostname);
        link.href = u;
        link.target = '_blank';
        link.rel = 'noopener';
        s.append(link);
      });
      li.append(s);
    }
    list.append(li);
  });
  const parts: Node[] = [list];
  if (sorted.length > VISIBLE) {
    const n = sorted.length;
    const btn = el('button', 'linkish', more === 'details' ? tr('Show all {n} details', { n }) : more === 'weather details' ? tr('Show all {n} weather details', { n }) : more === 'comfort details' ? tr('Show all {n} comfort details', { n }) : tr('Show all {n} fire and drone details', { n }));
    btn.type = 'button';
    btn.onclick = () => {
      const open = list.classList.toggle('expanded');
      btn.textContent = open ? tr('Show fewer') : tr('Show all {n} items', { n });
    };
    parts.push(btn);
  }
  return parts;
}

export interface ResultUi {
  /** Where the weather card is drawn. */
  weatherHost: HTMLElement;
  setSleepLoading(): void;
  /** `loading` names the data still on its way; the score is shown meanwhile and refreshed as it arrives. */
  setSleep(c: Comfort, nightLabel: string, loading?: string[]): void;
  setSleepUnavailable(why: string): void;
  setWater(w: WaterInfo | undefined, failed?: boolean): void;
  setShelter(r: ShelterResult | undefined, failed?: boolean): void;
  setWeatherChip(night: Night | undefined, nightLabel: string, failed?: boolean): void;
  /** The avalanche chip; shown only while a bulletin covers the spot (or could not be fetched). */
  setAvalanche(a: AvalancheInfo | undefined, failed?: boolean): void;
  /** Fire and drone rules, shown under the legality details; they do not change the camping verdict. */
  setRules(r: Restrictions | undefined): void;
  /** What the result shows right now, for saving the spot. */
  snapshot(): Omit<SpotSnapshot, 'savedAt'>;
}

/** Fire and drone rules sit in a tab that starts closed. */
function fireTab(items: Parameters<typeof checklist>[0]) {
  const tab = el('details', 'more rules-tab');
  tab.append(el('summary', undefined, '🔥 ' + tr('Fire and drones')), el('p', 'where', tr('Live official data. These rules do not change the camping verdict above.')), ...checklist(items, 'fire and drone details'));
  return tab;
}

function scoreCard(kind: string, title: string) {
  const b = el('button', `score-card ${kind}`);
  b.type = 'button';
  b.setAttribute('aria-expanded', 'false');
  const value = el('strong', 'sc-value');
  const label = el('span', 'sc-label');
  const bar = el('div', 'sc-bar');
  bar.append(el('i'));
  b.append(el('span', 'sc-title', title), value, label, bar, el('span', 'sc-more', tr('Details')));
  const set = (score: Score, text: string) => {
    b.dataset.tone = score.tone;
    value.replaceChildren(score.value === undefined ? '–' : String(score.value), el('small', undefined, score.value === undefined ? '' : '/100'));
    label.textContent = text;
    (bar.firstChild as HTMLElement).style.width = `${score.value ?? 0}%`;
  };
  return { b, set };
}

function chip(kind: string) {
  const b = el('button', `chip ${kind}`);
  b.type = 'button';
  b.setAttribute('aria-expanded', 'false');
  return b;
}

/** Draws the result: two score cards (legality, sleep) that open into details, plus water and weather chips. */
export function renderResult(root: HTMLElement, a: Assessment, elevation: number | undefined, focus?: Focus): ResultUi {
  let waterAt: { e: number; n: number; label: string } | undefined;
  let hutAt: { e: number; n: number; label: string } | undefined;
  const snap: { sleep?: Score; weather?: Score; night?: string; label?: string; pros: string[]; cons: string[]; complete: boolean; water?: string; hut?: string } = { pros: [], cons: [], complete: false };
  const where = el('p', 'where', [a.municipality, a.canton?.name, elevation === undefined ? '' : `${Math.round(elevation)} m`].filter(Boolean).join(' · '));

  const legal = scoreCard('legal', tr('Legality'));
  const sleep = scoreCard('sleep', tr('Sleep'));
  const weather = scoreCard('weather', tr('Weather'));
  const L = legalityScore(a);
  const b = BANNER[a.verdict];
  legal.set(L, `${b.icon} ${b.label}`);
  legal.b.classList.add('primary');
  // one line of why, so the answer needs no further tap: the most serious finding, or the verdict's own sentence
  const why = a.items.find((i) => i.tone === 'bad') ?? a.items.find((i) => i.tone === 'warn');
  const reason = why ? (a.municipality && why.title === tr('{name} (municipality)', { name: a.municipality }) ? tr('Municipal rule: {name}', { name: a.municipality }) : why.title) : b.sub;
  legal.b.insertBefore(el('span', 'sc-reason', reason), legal.b.querySelector('.sc-bar'));
  sleep.set({ tone: 'none' }, tr('Checking…'));
  weather.set({ tone: 'none' }, tr('Checking…'));
  const scores = el('div', 'scores');
  scores.append(legal.b, sleep.b, weather.b);

  const waterChip = chip('water');
  const shelterChip = chip('shelter');
  const weatherChip = chip('weather');
  const avalancheChip = chip('avalanche');
  avalancheChip.hidden = true;
  shelterChip.textContent = '🏠 ' + tr('Checking for huts…');
  waterChip.textContent = '💧 ' + tr('Checking water…');
  weatherChip.textContent = '🌦️ ' + tr('Loading forecast…');
  // water and hut sit at the top of the sleep details, the avalanche line at the top of the weather details; the weather
  // card already says what the weather chip said, so that chip is not shown
  const nearby = el('div', 'chips');
  nearby.append(waterChip, shelterChip);

  const legalPanel = el('section', 'panel legal');
  legalPanel.hidden = true;
  legalPanel.append(el('p', 'panel-lead', b.sub), ...checklist(a.items, 'details'));
  const seasons = renderSeasons(a.zones);
  if (seasons) legalPanel.append(seasons);
  const rulesHost = el('section', 'rules');
  legalPanel.append(rulesHost);
  const sleepPanel = el('section', 'panel sleep');
  sleepPanel.hidden = true;
  const weatherPanel = el('section', 'panel weather');
  weatherPanel.hidden = true;
  const weatherHost = el('div');
  const weatherFactors = el('div');
  weatherPanel.append(avalancheChip, weatherHost, weatherFactors);

  const opener: [HTMLElement, HTMLElement][] = [
    [legal.b, legalPanel],
    [sleep.b, sleepPanel],
    [weather.b, weatherPanel],
  ];
  const panels = [legalPanel, sleepPanel, weatherPanel];
  for (const [button, panel] of opener) {
    button.onclick = () => {
      const open = panel.hidden;
      for (const p of panels) p.hidden = true;
      panel.hidden = !open;
      for (const [bt, pn] of opener) bt.setAttribute('aria-expanded', String(!pn.hidden));
      // while a section is open the cards shrink to a row of tabs, and the sheet returns to its top so they stay in view
      scores.classList.toggle('compact', !panel.hidden);
      document.getElementById('sheet')?.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  // Water and hut chips jump to the place on the map when it is known.
  const jump = (btn: HTMLElement, target: () => { e: number; n: number; label: string } | undefined) => {
    btn.onclick = () => {
      const t = target();
      if (t && focus) focus(t.e, t.n, t.label);
    };
  };
  jump(waterChip, () => waterAt);
  jump(shelterChip, () => hutAt);

  root.replaceChildren(where, scores, legalPanel, sleepPanel, weatherPanel);

  return {
    weatherHost,
    setSleepLoading() {
      sleep.set({ tone: 'none' }, tr('Checking…'));
      sleepPanel.replaceChildren(nearby, el('p', 'where', tr('Checking sleep comfort…')));
    },
    setSleep(c, nightLabel, loading = []) {
      const s = sleepScore(c);
      sleep.set(s, loading.length ? `${RATING_SHORT[c.rating]} …` : RATING_SHORT[c.rating]);
      const w = weatherScore(c, !c.missing.includes('overnight forecast'));
      Object.assign(snap, {
        sleep: s,
        weather: w.value === undefined ? undefined : w,
        night: nightLabel,
        label: RATING_SHORT[c.rating],
        complete: loading.length === 0,
        pros: c.spotFactors.filter((x) => x.tone === 'ok').slice(0, 3).map((x) => x.title),
        cons: c.spotFactors.filter((x) => x.tone === 'bad' || x.tone === 'warn').slice(0, 3).map((x) => x.title),
      });
      if (w.value !== undefined) weather.set(w, tr(c.weatherStop ? 'Dangerous' : c.weatherScore >= 1 ? 'Good' : c.weatherScore >= 0 ? 'Fine' : c.weatherScore > -3 ? 'Poor' : 'Bad'));
      weatherFactors.replaceChildren(...(c.weatherFactors.length ? [el('h3', 'wx-factors-title', tr('What the forecast means for {night}', { night: nightText(nightLabel) })), ...checklist(c.weatherFactors, 'weather details', focus)] : []));
      const wx = c.weatherStop ? tr('the weather rules this night out') : c.weatherScore > 0 ? tr('the weather helps') : c.weatherScore < 0 ? tr('the weather hurts') : tr('the weather is neutral');
      const head = el('div', `comfort-head ${c.rating}`);
      const t = el('div');
      t.append(el('h2', undefined, `${RATING[c.rating]} · ${nightText(nightLabel)}`), el('p', 'comfort-split', tr('The spot alone: {rating}. For this night {wx}.', { rating: ratingWord(c.spotRating), wx })), el('p', undefined, c.summary));
      head.append(t);
      const parts: Node[] = [];
      if (loading.length) parts.push(el('p', 'panel-lead', tr('Still checking: {list}. The score updates when they arrive.', { list: loading.map(loadingText).join(', ') })));
      if (a.verdict === 'no') parts.push(el('p', 'panel-lead warnnote', tr('Camping is not allowed here, so this only shows what the spot would be like.')));
      parts.push(head, nearby, ...checklist(c.spotFactors, 'comfort details', focus));
      if (c.missing.length) parts.push(el('p', 'where', tr('Could not check: {list}.', { list: c.missing.map(missingText).join(', ') })));
      const how = el('details', 'more how');
      how.append(el('summary', undefined, tr('How is this scored?')), el('p', 'disclaimer', tr('Comfort is a rule-of-thumb rating from terrain (swisstopo elevation model, within 5 km), the weather for the chosen night (Open-Meteo), distances to trails, huts and stops, and the nearest water. Trees and snow are not modelled, ground cover is read from 100 m survey points, and the thresholds are judgement, not measurements. The 0 to 100 score is the factor total mapped linearly; a storm caps it at 25.')));
      parts.push(how);
      sleepPanel.replaceChildren(...parts);
    },
    setSleepUnavailable(why) {
      sleep.set({ tone: 'none' }, tr('Unavailable'));
      sleepPanel.replaceChildren(nearby, el('p', 'where', why));
    },
    setWater(w, failed) {
      waterChip.className = 'chip water';
      if (failed || !w || w.failed.includes('water')) {
        waterChip.textContent = '💧 ' + tr('Water: could not check');
        return;
      }
      waterAt = w.kind !== 'none' && w.at ? { ...w.at, label: w.name ? `${w.kind === 'lake' ? tr('Lake') : tr('Stream')} ${w.name}` : w.kind === 'lake' ? tr('Nearest lake') : tr('Nearest stream') } : undefined;
      const kind = w.kind === 'lake' ? tr('Lake') : w.kind === 'stream' ? tr('Stream') : '';
      const base = w.kind === 'none' ? '💧 ' + tr('No water within 800 m') : `💧 ${kind}${w.name ? ` ${w.name}` : ''} · ${Math.round(w.meters / 10) * 10 || 5} m`;
      snap.water = base.replace('💧 ', '') + (w.kind !== 'none' && w.glacierM !== undefined ? ', ' + tr('glacier water') : '') + (w.upstreamPlants.length ? ', ' + tr('sewage upstream') : '');
      waterChip.replaceChildren(base);
      if (waterAt) waterChip.append(el('span', 'tag go', '📍 ' + tr('map')));
      if (w.kind !== 'none') {
        if (w.upstreamPlants.length) {
          waterChip.classList.add('dirty');
          waterChip.append(el('span', 'tag bad', tr('dirty: sewage upstream')));
        }
        if (w.glacierM !== undefined) {
          waterChip.classList.add('glacier');
          waterChip.append(el('span', 'tag ice', w.glacierM <= 1000 ? tr('glacier water') : tr('maybe glacier water')));
        }
      }
      if (w.meters > 400 || w.kind === 'none') waterChip.classList.add('far');
    },
    setShelter(r, failed) {
      shelterChip.className = 'chip shelter';
      if (failed || !r) {
        shelterChip.textContent = '🏠 ' + tr('Huts: could not check');
        return;
      }
      const hut = r.shelters.find((x) => x.kind === 'hut' || x.kind === 'biwak');
      const km = (m: number) => (m < 950 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`);
      if (hut) {
        hutAt = { ...hut.at, label: hut.name };
        snap.hut = `${hut.name} · ${km(hut.meters)}`;
        shelterChip.textContent = `🏠 ${hut.kind === 'biwak' ? tr('Bivouac shelter') : hut.club ? tr('Club hut') : tr('Hut')}: ${hut.name} · ${km(hut.meters)}`;
        shelterChip.append(el('span', 'tag go', '📍 ' + tr('map')));
        if (hut.meters > 1500) shelterChip.classList.add('far');
      } else if (r.incomplete) shelterChip.textContent = '🏠 ' + tr('Huts: could not check fully');
      else {
        const alp = r.shelters.find((x) => x.kind === 'alp');
        shelterChip.textContent = `🏠 ${tr('No hut within 5 km')}${alp ? ` · ${alp.name} ${km(alp.meters)}` : ''}`;
        shelterChip.classList.add('far');
      }
    },
    setRules(r) {
      const items = r ? restrictionItems(r) : [];
      rulesHost.replaceChildren(
        ...(items.length
          ? [fireTab(items)]
          : []),
      );
    },
    setAvalanche(av, failed) {
      avalancheChip.className = 'chip avalanche';
      avalancheChip.hidden = false;
      if (failed) {
        avalancheChip.textContent = '❄️ ' + tr('Avalanche bulletin: could not check');
        return;
      }
      if (av?.status !== 'ok' || av.level === undefined) {
        avalancheChip.hidden = true;
        return;
      }
      avalancheChip.textContent = `❄️ ${tr('Avalanche danger:')} ${tr(LEVEL_NAME[av.level]!)} (${av.level}${av.subdivision === 'plus' ? '+' : av.subdivision === 'minus' ? '-' : ''})`;
      if (av.level >= 4) avalancheChip.classList.add('bad');
      else if (av.level === 3) avalancheChip.classList.add('warn');
    },
    snapshot() {
      return {
        verdict: a.verdict,
        legal: L.value,
        sleep: snap.sleep?.value,
        weather: snap.weather?.value,
        night: snap.night,
        sleepLabel: snap.label,
        water: snap.water,
        hut: snap.hut,
        pros: snap.pros,
        cons: snap.cons,
        complete: snap.complete,
      };
    },
    setWeatherChip(night, nightLabel, failed) {
      weatherChip.className = 'chip weather';
      if (failed || !night) {
        weatherChip.textContent = '🌦️ ' + tr('Weather: unavailable');
        weather.set({ tone: 'none' }, tr('Unavailable'));
        return;
      }
      const sky = night.worstCode !== undefined ? describeCode(night.worstCode).emoji : '🌙';
      weatherChip.textContent = `${sky} ${tr('{night}: {low} °C, gusts {gust} km/h {dir}', { night: nightText(nightLabel), low: Math.round(night.minTempC), gust: Math.round(night.maxGustKmh), dir: compassName(night.windFromDeg) })}${night.precipMm >= 1 ? ', ' + tr('{mm} mm rain', { mm: night.precipMm.toFixed(0) }) : ''}`;
      if (night.thunder || night.maxGustKmh >= 80) weatherChip.classList.add('bad');
      else if (night.maxGustKmh >= 50 || night.precipMm >= 5 || night.minTempC <= -5) weatherChip.classList.add('warn');
    },
  };
}

/** Result for a spot outside Switzerland. */
export function renderOutside(root: HTMLElement) {
  const card = el('div', 'outside');
  card.append(el('strong', undefined, '🌍 ' + tr('Outside Switzerland')), el('p', undefined, tr('This spot is outside Switzerland (or in Liechtenstein). The rules, zones and parks checked here are Swiss, so nothing can be said about it. Look up the local rules of that country.')));
  root.replaceChildren(card);
}
