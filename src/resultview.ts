import { checkLabel, type Assessment } from './assess';
import { localCantonName } from './cantons';
import type { Comfort } from './comfort/comfort';
import { LEVEL_NAME, type AvalancheInfo } from './comfort/avalanche';
import { RELIABLE_DAYS, addDays, compassName, describeCode, nightText, type Night, type NightWindow } from './comfort/weather';
import { missingText } from './comfort/comfort';
import type { WaterInfo } from './comfort/water';
import type { ShelterResult } from './comfort/shelters';
import type { SpotSnapshot } from './saved';
import { restrictionItems, type Restrictions } from './restrictions';
import { wildlifeItems, type DogArea } from './wildlife';
import { renderSeasons } from './seasonview';
import { legalWhy, legalityScore, overallScore, sleepScore, spotComfortValue, weatherScore, type Score } from './scores';
import { buildAlerts, type Alert } from './alerts';
import { dateLocale, tr } from './i18n';
import { applyNearBuilding, type NearBuildingNote } from './comfort/nearbuilding';

const TONE_ORDER = { bad: 0, warn: 1, ok: 2, info: 3 } as const;
/** The tone as a sign and a word, so it does not depend on the colour of the item's edge (the word is for screen readers). */
const toneMark = (tone: keyof typeof TONE_ORDER): [string, string] => (tone === 'bad' ? ['⛔', tr('Problem')] : tone === 'warn' ? ['⚠️', tr('Caution')] : tone === 'ok' ? ['✅', tr('Fine')] : ['', tr('Note')]);
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

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...kids: (string | Node | undefined)[]) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== undefined) e.append(k);
  return e;
}

export type Focus = (e: number, n: number, label: string) => void;

type More = 'details' | 'weather details' | 'comfort details' | 'fire and drone details' | 'animal details';

function checklist(items: { tone: keyof typeof TONE_ORDER; title: string; text: string; sources?: string[]; at?: { e: number; n: number; label: string } }[], more: More, focus?: Focus) {
  const list = el('ul', 'checks');
  const sorted = [...items].sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone]);
  sorted.forEach((it, i) => {
    const li = el('li', `check ${it.tone}${i >= VISIBLE ? ' more' : ''}`);
    const body = el('p', undefined, it.text);
    const [sign, word] = toneMark(it.tone);
    li.append(el('h3', undefined, ...(sign ? [el('span', 'tone-mark', sign)] : []), el('span', 'sr-only', `${word}: `), it.title), body);
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
    const btn = el('button', 'linkish', more === 'details' ? tr('Show all {n} details', { n }) : more === 'weather details' ? tr('Show all {n} weather details', { n }) : more === 'comfort details' ? tr('Show all {n} comfort details', { n }) : more === 'animal details' ? tr('Show all {n} hunting and animal details', { n }) : tr('Show all {n} fire and drone details', { n }));
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
  /** The SAC portal page of the hut named in the hut chip (opening months, phone, beds), when swisstopo's winter-accommodation layer has one. */
  setHutLink(link: { name: string; url: string } | undefined): void;
  setWeatherChip(night: Night | undefined, nightLabel: string, failed?: boolean): void;
  /** The avalanche chip; shown only while a bulletin covers the spot (or could not be fetched). */
  setAvalanche(a: AvalancheInfo | undefined, failed?: boolean): void;
  /** Fire and drone rules, shown under the legality details; they do not change the camping verdict. */
  setRules(r: Restrictions | undefined): void;
  /** Where to sleep instead: the nearest official campsites, as one line (shown on the first view when the spot is not allowed or doubtful). */
  setCampsites(line: string | undefined): void;
  /** A hut, inn or alp right next to the spot: a note in the legality details (and "likely OK" becomes "caution"). */
  setNearBuilding(n: NearBuildingNote | undefined): void;
  /** A new verdict for the same spot (another date, or bundled data that arrived late). */
  setAssessment(next: Assessment): void;
  /** The night the result is for (legality seasons, comfort and weather follow it). */
  setNights(p: NightPicker): void;
  /** What the first view needs to show the dangers: the comfort result (with the chosen night's weather), the fire situation, the hours before evening. */
  setHazards(h: { comfort?: Comfort; fire?: Restrictions['fire']; dogs?: DogArea[]; date?: Date; soon?: Night }): void;
  /** What the result shows right now, for saving the spot. */
  snapshot(): Omit<SpotSnapshot, 'savedAt'>;
}

/** Fire and drone rules sit in a tab that starts closed. */
function fireTab(items: Parameters<typeof checklist>[0], laterNote?: string) {
  const tab = el('details', 'more rules-tab');
  tab.append(el('summary', undefined, '🔥 ' + tr('Fire and drones')), el('p', 'where', tr('Live official data. These rules do not change the camping verdict above.')), ...(laterNote ? [el('p', 'night-hint', laterNote)] : []), ...checklist(items, 'fire and drone details'));
  return tab;
}

/** Hunting and animals (herd-protection dogs, wolves and bears, cattle) sit in a tab that starts closed, beside the fire tab. */
function animalTab(items: Parameters<typeof checklist>[0]) {
  const tab = el('details', 'more rules-tab animals-tab');
  tab.append(el('summary', undefined, '🐾 ' + tr('Hunting and animals')), el('p', 'where', tr('Official guidance and reported areas. This does not change the camping verdict above.')), ...checklist(items, 'animal details'));
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

/** What the night picker needs: the nights offered, the one chosen, and how to choose another. */
export interface NightPicker {
  windows: NightWindow[];
  selected: NightWindow;
  /** The last hour the forecast covers ("YYYY-MM-DDTHH:MM"): nights after it have no weather. */
  forecastEnd?: string;
  /** Today (Zurich), "YYYY-MM-DD". */
  today: string;
  onSelect(w: NightWindow): void;
  /** A window for any evening, for a date typed or picked far ahead. */
  windowFor(day: string): NightWindow;
}

export interface ResultHooks {
  /** "Check again": the lookups that failed are made again. */
  onRetry?: () => void;
  /** The spot is where a GPS fix put it: how far off that may be, in metres. */
  accuracyM?: number;
}

/** Draws the result: an overall score first, then the legality, sleep and weather cards that open into details. */
export function renderResult(root: HTMLElement, a0: Assessment, elevation: number | undefined, focus?: Focus, hooks: ResultHooks = {}): ResultUi {
  let a = a0;
  /** A hut, inn or alp right next to the spot: arrives with the hut lookup, after the first paint. */
  let near: NearBuildingNote | undefined;
  let waterAt: { e: number; n: number; label: string } | undefined;
  let hutAt: { e: number; n: number; label: string } | undefined;
  const snap: { sleep?: Score; weather?: Score; night?: string; label?: string; pros: string[]; cons: string[]; complete: boolean; water?: string; hut?: string } = { pros: [], cons: [], complete: false };
  const where = el('p', 'where', [a.municipality, a.canton ? localCantonName(a.canton) : '', elevation === undefined ? '' : `${Math.round(elevation)} m`, hooks.accuracyM === undefined ? '' : tr('GPS ±{m} m', { m: Math.max(1, Math.round(hooks.accuracyM)) })].filter(Boolean).join(' · '));

  const legal = scoreCard('legal', tr('Legality'));
  const sleep = scoreCard('sleep', tr('Sleep'));
  const weather = scoreCard('weather', tr('Weather'));
  /** The assessment as shown: with the hut note, which turns "likely OK" into "caution". */
  const shown = (): Assessment => applyNearBuilding(a, near);
  let L = legalityScore(shown());
  legal.b.classList.add('primary');
  const reasonLine = el('p', 'scores-reason');
  const makeRetry = () => {
    const btn = el('button', 'save-btn retry-btn', '↻ ' + tr('Check again'));
    btn.type = 'button';
    btn.hidden = true;
    btn.onclick = () => hooks.onRetry?.();
    return btn;
  };
  const retryBtn = makeRetry(); // in the legality details
  const retryTop = makeRetry(); // under the overall score
  let uncheckedNow = false;
  let inDetails = false;
  const syncRetry = () => {
    retryTop.hidden = !uncheckedNow || inDetails;
    retryBtn.hidden = !uncheckedNow;
  };
  const lead = el('p', 'panel-lead');
  const legalList = el('div', 'legal-list');
  const seasonsHost = el('div', 'seasons-host');
  sleep.set({ tone: 'none' }, tr('Checking…'));
  weather.set({ tone: 'none' }, tr('Checking…'));
  const scores = el('div', 'scores');
  scores.append(legal.b, sleep.b, weather.b);
  scores.hidden = true;

  // The first view is one overall score (legality and the spot's comfort, no weather) and a way to the three details.
  const total = scoreCard('total', tr('Overall'));
  total.b.querySelector('.sc-more')!.textContent = tr('View details');
  let spotComfort: number | undefined;
  let comfortUnavailable = false;
  const paintTotal = () => {
    const s = shown();
    const unchecked = !!a.incomplete?.length && s.verdict !== 'no';
    const t = overallScore(s, L, spotComfort, comfortUnavailable);
    let word: string;
    if (s.verdict === 'no') word = '⛔ ' + tr('Not allowed');
    else if (unchecked) word = '❔ ' + tr('Unchecked');
    else if (t.value === undefined) word = tr('Checking…');
    else {
      word = t.value >= 70 && t.tone === 'good' ? '✅ ' + tr('Good spot') : t.value >= 50 ? '👍 ' + tr('Okay spot') : t.value >= 30 ? '⚠️ ' + tr('Poor spot') : '⚠️ ' + tr('Not recommended');
      if (comfortUnavailable && spotComfort === undefined) word += ' · ' + tr('comfort not checked');
    }
    total.set(t, word);
  };
  const paintLegal = () => {
    const s = shown();
    const b = BANNER[s.verdict];
    L = legalityScore(s);
    const unchecked = !!a.incomplete?.length && s.verdict !== 'no';
    legal.set(L, unchecked ? '❔ ' + tr('Unchecked') : `${b.icon} ${b.label}`);
    // one line of why, so the answer needs no further tap: the most serious finding, or the verdict's own sentence
    const why = legalWhy(s);
    reasonLine.textContent = unchecked ? tr('Could not check: {list}', { list: a.incomplete!.map(checkLabel).join(', ') }) : why ?? b.sub;
    uncheckedNow = unchecked;
    syncRetry();
    lead.textContent = unchecked ? tr('Some checks could not be made. Check again, or do not rely on this result.') : b.sub;
    legalList.replaceChildren(...checklist(s.items, 'details', focus));
    const seasons = renderSeasons(s.zones);
    seasonsHost.replaceChildren(...(seasons ? [seasons] : []));
    paintTotal();
    paintAlerts();
    paintCampsites();
  };
  // where to sleep instead, only for a spot that is not allowed or doubtful
  const campsiteHost = el('p', 'campsite-line');
  let campsiteText: string | undefined;
  const paintCampsites = () => {
    const v = shown().verdict;
    campsiteHost.textContent = campsiteText ?? '';
    campsiteHost.hidden = inDetails || !campsiteText || (v !== 'no' && v !== 'caution');
  };
  campsiteHost.hidden = true;
  // dangers on the first view: steep ground, a storm tonight, avalanche danger, a fire ban, a ban zone a few metres away ...
  const alertsHost = el('ul', 'alerts');
  let hazardInput: { comfort?: Comfort; fire?: Restrictions['fire']; dogs?: DogArea[]; date?: Date; soon?: Night } = {};
  let openFromAlert: (alert: Alert) => void = () => undefined;
  const paintAlerts = () => {
    const list = buildAlerts({ ...hazardInput, assessment: shown() });
    alertsHost.hidden = list.length === 0;
    const rows = list.slice(0, 3).map((al) => {
      const li = el('li');
      const b = el('button', `alert ${al.tone}`, `${al.tone === 'bad' ? '⛔' : '⚠️'} ${al.text}`);
      b.type = 'button';
      b.onclick = () => openFromAlert(al);
      li.append(b);
      return li;
    });
    if (list.length > 3) rows.push(el('li', 'alert-more', tr('+{n} more in the details', { n: list.length - 3 })));
    alertsHost.replaceChildren(...rows);
  };
  // the night the result is for: legality (seasons, firing days), comfort and weather all follow it
  const nightHost = el('div', 'night-picker');
  let nightsOpen = false;
  let nightsState: NightPicker | undefined;
  const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const paintNights = () => {
    const st = nightsState;
    if (!st) return;
    const w = st.selected;
    const toggle = el('button', 'night-toggle', `🌙 ${w.label === 'Tonight' || w.label === 'Tomorrow' ? `${nightText(w.label)} · ` : ''}${dayText(w.day)}`);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(nightsOpen));
    toggle.append(el('span', 'night-change', nightsOpen ? tr('Close') : tr('Change night')));
    toggle.onclick = () => {
      nightsOpen = !nightsOpen;
      paintNights();
    };
    const parts: HTMLElement[] = [toggle];
    const beyondReliable = w.day > addDays(st.today, RELIABLE_DAYS);
    const noForecast = st.forecastEnd !== undefined && w.from.slice(0, 13) > st.forecastEnd.slice(0, 13);
    if (noForecast) parts.push(el('p', 'night-hint', tr('No weather forecast reaches this far ahead. Legality, sun and moon are still worked out for this date.')));
    else if (beyondReliable) parts.push(el('p', 'night-hint', tr('A forecast more than a week ahead is a rough guide only.')));
    if (nightsOpen) {
      const strip = el('div', 'night-strip');
      strip.setAttribute('role', 'listbox');
      for (const nw of st.windows) {
        const b = el('button', `night-chip${nw.day === w.day ? ' on' : ''}${st.forecastEnd !== undefined && nw.from.slice(0, 13) > st.forecastEnd.slice(0, 13) ? ' far' : ''}`, nw.label === 'Tonight' || nw.label === 'Tomorrow' ? nightText(nw.label) : nw.short);
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(nw.day === w.day));
        b.onclick = () => {
          nightsOpen = false;
          st.onSelect(nw);
        };
        strip.append(b);
      }
      const date = document.createElement('input');
      date.type = 'date';
      date.className = 'night-date';
      date.id = 'night-date';
      date.min = st.today;
      date.max = addDays(st.today, 366);
      date.value = w.day;
      date.setAttribute('aria-label', tr('Pick any date'));
      date.onchange = () => {
        if (!date.value || date.value < date.min || date.value > date.max) return;
        nightsOpen = false;
        st.onSelect(st.windowFor(date.value));
      };
      parts.push(strip, el('label', 'night-date-row', tr('Or pick any date:')));
      parts[parts.length - 1]!.append(' ', date);
    }
    nightHost.replaceChildren(...parts);
  };
  // fire and drone information is live data for today; for another night it is only a hint
  let rulesState: Restrictions | undefined;
  const paintRules = () => {
    const items = rulesState ? restrictionItems(rulesState) : [];
    const later = !!nightsState && nightsState.selected.day > nightsState.today;
    const when = nightsState ? new Date(`${nightsState.selected.day}T12:00:00`) : new Date();
    // hunting and the general advice on animals need no lookup; the reported dog pastures arrive with the rules
    const animals = wildlifeItems({ dogs: rulesState?.dogs, dogsFailed: rulesState?.failed.includes('dogs'), canton: a.canton?.code, date: when });
    rulesHost.replaceChildren(
      ...(items.length ? [fireTab(items, later ? tr('This is live data for today. Fire danger, fire bans and drone notices can change before {date}.', { date: dayText(nightsState!.selected.day) }) : undefined)] : []),
      animalTab(animals),
    );
  };
  const backBtn = el('button', 'linkish back-btn', '← ' + tr('Overall score'));
  backBtn.type = 'button';
  backBtn.hidden = true;

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
  const hutLinkEl = el('a', 'hut-link');
  hutLinkEl.hidden = true;
  hutLinkEl.target = '_blank';
  hutLinkEl.rel = 'noopener';
  nearby.append(waterChip, shelterChip, hutLinkEl);

  const legalPanel = el('section', 'panel legal');
  legalPanel.hidden = true;
  legalPanel.append(lead, retryBtn, legalList, seasonsHost);
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
  const showDetails = (on: boolean) => {
    total.b.hidden = reasonLine.hidden = on;
    alertsHost.hidden = on || alertsHost.childElementCount === 0;
    scores.hidden = backBtn.hidden = !on;
    inDetails = on;
    paintCampsites();
    syncRetry();
    if (!on) {
      for (const p of panels) p.hidden = true;
      for (const [bt] of opener) bt.setAttribute('aria-expanded', 'false');
      scores.classList.remove('compact');
    }
    document.getElementById('sheet')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  total.b.onclick = () => showDetails(true);
  backBtn.onclick = () => showDetails(false);
  openFromAlert = (al) => {
    showDetails(true);
    const target = al.panel === 'legal' ? 0 : al.panel === 'sleep' ? 1 : 2;
    if (opener[target]![1].hidden) opener[target]![0].click();
  };
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

  paintLegal();
  root.replaceChildren(where, nightHost, total.b, reasonLine, alertsHost, campsiteHost, retryTop, backBtn, scores, legalPanel, sleepPanel, weatherPanel);

  const markSleepUnavailable = (why: string) => {
    sleep.set({ tone: 'none' }, tr('Unavailable'));
    spotComfort = undefined;
    comfortUnavailable = true;
    snap.sleep = undefined;
    paintTotal();
    sleepPanel.replaceChildren(nearby, el('p', 'where', why));
  };

  return {
    weatherHost,
    setSleepLoading() {
      sleep.set({ tone: 'none' }, tr('Checking…'));
      sleepPanel.replaceChildren(nearby, el('p', 'where', tr('Checking sleep comfort…')));
    },
    setSleep(c, nightLabel, loading = []) {
      if (c.insufficient) {
        // no terrain: nothing says how the spot is, so it is not rated (and never called "okay")
        if (!loading.includes('terrain')) markSleepUnavailable(tr('The terrain could not be loaded, so the spot cannot be rated. Check again when you have a connection.'));
        return;
      }
      comfortUnavailable = false;
      const s = sleepScore(c);
      spotComfort = spotComfortValue(c.spotScore);
      paintTotal();
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
      markSleepUnavailable(why);
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
    setHutLink(link) {
      hutLinkEl.hidden = !link;
      if (!link) return;
      hutLinkEl.href = link.url;
      hutLinkEl.textContent = '↗ ' + tr('{name} on the SAC site: opening months, phone, beds', { name: link.name });
    },
    setNearBuilding(note) {
      near = note;
      paintLegal();
    },
    setAssessment(next) {
      a = next;
      paintLegal();
    },
    setCampsites(line) {
      campsiteText = line;
      paintCampsites();
    },
    setNights(p) {
      nightsState = p;
      paintNights();
      paintRules();
    },
    setHazards(h) {
      hazardInput = h;
      paintAlerts();
      alertsHost.hidden = inDetails || alertsHost.childElementCount === 0;
    },
    setRules(r) {
      rulesState = r;
      paintRules();
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
        verdict: a.verdict === 'likely_ok' && L.tone === 'warn' ? 'caution' : a.verdict,
        legal: L.value,
        sleep: snap.sleep?.value,
        weather: snap.weather?.value,
        overall: overallScore(shown(), L, spotComfort, comfortUnavailable).value,
        comfort: spotComfort,
        night: snap.night,
        sleepLabel: snap.label,
        water: snap.water,
        hut: snap.hut,
        pros: snap.pros,
        cons: snap.cons,
        complete: snap.complete,
        unchecked: a.incomplete?.length && a.verdict !== 'no' ? [...a.incomplete] : undefined,
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
