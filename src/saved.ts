import { tr } from './i18n';
import { nightText } from './comfort/weather';
import { haversineM } from './route';

/** Spots the user saved, kept in this browser (localStorage) with the scores they had when saved. */
export const SAVED_KEY = 'wildcamp.saved.v1';
/** A long trip or a season of scouting fits; the list is never cut silently, a full list refuses new spots and says so. */
export const MAX_SAVED = 200;
export const MAX_NAME = 80;
export const MAX_NOTE = 500;

export interface SpotSnapshot {
  verdict: 'no' | 'caution' | 'likely_ok' | 'unknown';
  /** Scores 0 to 100; undefined when that part had not arrived or could not be checked. */
  legal?: number;
  sleep?: number;
  weather?: number;
  /** The overall score the result sheet showed (legality and the spot's comfort, no weather); undefined when it could not be given. */
  overall?: number;
  /** The spot's comfort on its own (0 to 100, no weather, no legality): what the overall score is worked out from, so it can be redone when the legality is checked again. */
  comfort?: number;
  /** Which night the weather score is for. */
  night?: string;
  /** Sleep rating word (Great, Good, Okay, Poor). */
  sleepLabel?: string;
  water?: string;
  hut?: string;
  pros: string[];
  cons: string[];
  /** True when every sleep input had arrived, so the sleep score is the final one. */
  complete: boolean;
  /** Legality lookups that had failed when the spot was saved (names, English): the verdict was never complete. */
  unchecked?: string[];
  /** True for a spot that came from a link or a GPX file: it has never been checked here, so it carries no scores. */
  unrated?: boolean;
  /** When the legality was last judged again (a re-check of the saved list), if after the save. */
  legalAt?: number;
  savedAt: number;
}

export interface SavedSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  elevation?: number;
  municipality?: string;
  canton?: string;
  /** The person's own words about the spot ("water at the hut", "ask the farmer"). */
  note?: string;
  snapshot: SpotSnapshot;
}

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** One spot per place: positions are rounded to 5 decimals (about a metre). */
export const spotId = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

const isSpot = (x: unknown): x is SavedSpot => {
  const s = x as SavedSpot;
  return !!s && typeof s.id === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lng) && typeof s.name === 'string' && !!s.snapshot && Array.isArray(s.snapshot.pros) && Array.isArray(s.snapshot.cons);
};

/** A name or note as stored: trimmed, control characters and line breaks in a name removed, cut to its limit. */
export const cleanName = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_NAME);
export const cleanNote = (v: string) => v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_NOTE);

export function loadSaved(store: Store | undefined): SavedSpot[] {
  try {
    const raw = store?.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    // what is read is held to the same limits as what is written: a damaged or hand-edited list must not carry a huge name, an odd position or too many spots
    return list
      .filter(isSpot)
      .filter((x) => Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180)
      .slice(0, MAX_SAVED)
      .map((x) => ({ ...x, name: cleanName(x.name) || x.id, note: typeof x.note === 'string' ? cleanNote(x.note) : undefined, snapshot: { ...x.snapshot, pros: x.snapshot.pros.slice(0, 12).map((v) => String(v).slice(0, 300)), cons: x.snapshot.cons.slice(0, 12).map((v) => String(v).slice(0, 300)) } }));
  } catch {
    return [];
  }
}

function write(store: Store | undefined, list: SavedSpot[]): boolean {
  try {
    store?.setItem(SAVED_KEY, JSON.stringify(list));
    return !!store;
  } catch {
    return false;
  }
}

/**
 * Add a spot at the top, or replace the one at the same place (keeping the person's own name and note, which a fresh check must not wipe).
 * A new spot is refused when the list is full (`full`): nothing already saved is ever dropped to make room.
 */
export function saveSpot(store: Store | undefined, spot: SavedSpot): { list: SavedSpot[]; stored: boolean; full?: boolean } {
  const current = loadSaved(store);
  const old = current.find((s) => s.id === spot.id);
  if (!old && current.length >= MAX_SAVED) return { list: current, stored: false, full: true };
  const merged: SavedSpot = old ? { ...spot, name: old.name, note: old.note ?? spot.note } : spot;
  const list = [merged, ...current.filter((s) => s.id !== spot.id)];
  return { list, stored: write(store, list) };
}

/** Change a saved spot's name or note (an empty note removes it; an empty name is ignored). Returns false if the spot is gone or storage failed. */
export function updateSpot(store: Store | undefined, id: string, patch: { name?: string; note?: string }): boolean {
  const list = loadSaved(store);
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const next = { ...list[i]! };
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (name) next.name = name;
  }
  if (patch.note !== undefined) {
    const note = cleanNote(patch.note);
    if (note) next.note = note;
    else delete next.note;
  }
  list[i] = next;
  return write(store, list);
}

export interface ImportedSpot {
  lat: number;
  lng: number;
  name?: string;
  note?: string;
  elevation?: number;
  municipality?: string;
  canton?: string;
}

/** The snapshot of a spot that has not been checked here: no scores, no verdict. */
export const unratedSnapshot = (now = Date.now()): SpotSnapshot => ({ verdict: 'unknown', pros: [], cons: [], complete: false, unrated: true, savedAt: now });

/**
 * Add spots that came from a link or a GPX file, unchecked. Places already saved are left as they are; once the list is full
 * the rest is turned away. Returns how many were added, already there, and turned away.
 */
export function importSpots(store: Store | undefined, incoming: ImportedSpot[], now = Date.now()): { added: number; existing: number; refused: number; stored: boolean } {
  const list = loadSaved(store);
  const ids = new Set(list.map((s) => s.id));
  const fresh: SavedSpot[] = [];
  let existing = 0;
  let refused = 0;
  for (const p of incoming) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const id = spotId(p.lat, p.lng);
    if (ids.has(id)) {
      existing++;
      continue;
    }
    if (list.length + fresh.length >= MAX_SAVED) {
      refused++;
      continue;
    }
    ids.add(id);
    const note = p.note ? cleanNote(p.note) : '';
    fresh.push({
      id,
      lat: p.lat,
      lng: p.lng,
      name: cleanName(p.name ?? '') || defaultName(p.municipality, p.elevation, p.lat, p.lng),
      elevation: p.elevation,
      municipality: p.municipality,
      canton: p.canton,
      ...(note ? { note } : {}),
      snapshot: unratedSnapshot(now),
    });
  }
  const stored = fresh.length ? write(store, [...fresh, ...list]) : true;
  return { added: fresh.length, existing, refused, stored };
}

/** Replace a saved spot's snapshot in place (same position and name), e.g. once the checks that were still running have finished. */
export function updateSnapshot(store: Store | undefined, id: string, snapshot: Omit<SpotSnapshot, 'savedAt'>): boolean {
  const list = loadSaved(store);
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i]!, snapshot: { ...snapshot, savedAt: list[i]!.snapshot.savedAt } };
  return write(store, list);
}

export interface LegalPatch {
  verdict: SpotSnapshot['verdict'];
  legal?: number;
  overall?: number;
  unchecked?: string[];
  municipality?: string;
  canton?: string;
}

/** Write the result of judging a saved spot's legality again; the rest of the snapshot (sleep, weather, notes) is kept. */
export function updateLegality(store: Store | undefined, id: string, p: LegalPatch, now = Date.now()): boolean {
  const list = loadSaved(store);
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const old = list[i]!;
  const snapshot: SpotSnapshot = { ...old.snapshot, verdict: p.verdict, legal: p.legal, overall: p.overall, unchecked: p.unchecked?.length ? p.unchecked : undefined, legalAt: now };
  delete snapshot.unrated;
  list[i] = { ...old, municipality: old.municipality ?? p.municipality, canton: old.canton ?? p.canton, snapshot };
  return write(store, list);
}

export function removeSpot(store: Store | undefined, id: string): SavedSpot[] {
  const list = loadSaved(store).filter((s) => s.id !== id);
  write(store, list);
  return list;
}

export const isSaved = (store: Store | undefined, id: string) => loadSaved(store).some((s) => s.id === id);

export function defaultName(municipality: string | undefined, elevation: number | undefined, lat: number, lng: number): string {
  const place = municipality ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  return elevation === undefined ? place : `${place} · ${Math.round(elevation)} m`;
}

export interface CompareRow {
  label: string;
  /** One cell per spot, in the order given. */
  cells: string[];
  /** Index of the best cell for numeric rows, if one stands out (no ties). */
  best?: number;
}

const num = (v: number | undefined) => (v === undefined ? '–' : `${v}/100`);

function bestIndex(values: (number | undefined)[]): number | undefined {
  const known = values.filter((v): v is number => v !== undefined);
  if (known.length < 2) return undefined;
  const max = Math.max(...known);
  return known.filter((v) => v === max).length === 1 ? values.indexOf(max) : undefined;
}

/** Read when the table is built, so it follows the language in force then. */
export const verdictLabel = (v: SpotSnapshot['verdict']) => (v === 'no' ? tr('Not allowed') : v === 'caution' ? tr('Be careful') : v === 'likely_ok' ? tr('Likely OK') : tr('Unknown'));

/**
 * The overall score of a saved spot. Newer saves carry the number the result sheet showed; older ones are worked out the same way from
 * legality and sleep (a ban is 0; a spot with only one of them has no number). An unchecked spot has none.
 */
export function overallOf(s: SpotSnapshot): number | undefined {
  if (s.unrated) return undefined;
  if (s.verdict === 'no') return 0;
  if (s.overall !== undefined) return s.overall;
  if (s.unchecked?.length || s.legal === undefined || s.sleep === undefined) return undefined;
  return Math.round(Math.min(0.5 * s.legal + 0.5 * s.sleep, Math.min(s.legal, s.sleep) + 10));
}

export type SortKey = 'recent' | 'name' | 'distance' | 'score';

/** The list in the order asked for: newest save, name, distance from a point (spots far away last), or best overall score (unrated last). */
export function sortSpots(spots: SavedSpot[], by: SortKey, from?: { lat: number; lng: number }): SavedSpot[] {
  const out = [...spots];
  switch (by) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    case 'distance': {
      if (!from) return out;
      const d = (s: SavedSpot) => haversineM({ lat: from.lat, lon: from.lng }, { lat: s.lat, lon: s.lng });
      return out.sort((a, b) => d(a) - d(b));
    }
    case 'score':
      return out.sort((a, b) => (overallOf(b.snapshot) ?? -1) - (overallOf(a.snapshot) ?? -1));
    default:
      return out.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt);
  }
}

/** Side-by-side rows for 2 or more saved spots. Scores are as saved, not re-checked. */
export function compareRows(spots: SavedSpot[]): CompareRow[] {
  const s = spots.map((x) => x.snapshot);
  const row = (label: string, cells: string[], best?: number): CompareRow => ({ label, cells, best });
  const overall = s.map(overallOf);
  return [
    row(tr('Legality'), s.map((x) => `${num(x.legal)} ${verdictLabel(x.verdict)}`), bestIndex(s.map((x) => x.legal))),
    row(tr('Sleep'), s.map((x) => `${num(x.sleep)}${x.sleepLabel ? ` ${x.sleepLabel}` : ''}${x.sleep !== undefined && !x.complete ? ' ' + tr('(partial)') : ''}`), bestIndex(s.map((x) => x.sleep))),
    row(tr('Weather'), s.map((x) => (x.weather === undefined ? '–' : `${num(x.weather)}${x.night ? ` ${nightText(x.night)}` : ''}`)), bestIndex(s.map((x) => x.weather))),
    row(tr('Overall'), overall.map(num), bestIndex(overall)),
    row(tr('Elevation'), spots.map((x) => (x.elevation === undefined ? '–' : `${Math.round(x.elevation)} m`))),
    row(tr('Place'), spots.map((x) => [x.municipality, x.canton].filter(Boolean).join(', ') || '–')),
    ...(spots.some((x) => x.note) ? [row(tr('Note'), spots.map((x) => x.note ?? '–'))] : []),
    row(tr('Water'), s.map((x) => x.water ?? '–')),
    row(tr('Hut'), s.map((x) => x.hut ?? '–')),
    row(tr('For'), s.map((x) => x.pros.join('; ') || '–')),
    row(tr('Against'), s.map((x) => x.cons.join('; ') || '–')),
  ];
}

export function ageLabel(savedAt: number, now = Date.now()): string {
  const d = Math.floor((now - savedAt) / 86400000);
  return d <= 0 ? tr('today') : d === 1 ? tr('yesterday') : tr('{n} days ago', { n: d });
}
