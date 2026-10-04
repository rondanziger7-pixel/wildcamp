import { tr } from './i18n';

/** Spots the user saved, kept in this browser (localStorage) with the scores they had when saved. */
export const SAVED_KEY = 'wildcamp.saved.v1';
export const MAX_SAVED = 50;

export interface SpotSnapshot {
  verdict: 'no' | 'caution' | 'likely_ok' | 'unknown';
  /** Scores 0 to 100; undefined when that part had not arrived or could not be checked. */
  legal?: number;
  sleep?: number;
  weather?: number;
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

export function loadSaved(store: Store | undefined): SavedSpot[] {
  try {
    const raw = store?.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isSpot) : [];
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

/** Add or replace a spot (newest first, at most MAX_SAVED). Returns the list and whether it could be stored. */
export function saveSpot(store: Store | undefined, spot: SavedSpot): { list: SavedSpot[]; stored: boolean } {
  const list = [spot, ...loadSaved(store).filter((s) => s.id !== spot.id)].slice(0, MAX_SAVED);
  return { list, stored: write(store, list) };
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

const VERDICT = { no: tr('Not allowed'), caution: tr('Be careful'), likely_ok: tr('Likely OK'), unknown: tr('Unknown') } as const;

/** Side-by-side rows for 2 or more saved spots. Scores are as saved, not re-checked. */
export function compareRows(spots: SavedSpot[]): CompareRow[] {
  const s = spots.map((x) => x.snapshot);
  const row = (label: string, cells: string[], best?: number): CompareRow => ({ label, cells, best });
  const combined = s.map((x) => (x.legal === undefined || x.sleep === undefined ? undefined : Math.round(0.5 * x.legal + 0.5 * x.sleep)));
  return [
    row(tr('Legality'), s.map((x) => `${num(x.legal)} ${VERDICT[x.verdict]}`), bestIndex(s.map((x) => x.legal))),
    row(tr('Sleep'), s.map((x) => `${num(x.sleep)}${x.sleepLabel ? ` ${x.sleepLabel}` : ''}${x.sleep !== undefined && !x.complete ? ' ' + tr('(partial)') : ''}`), bestIndex(s.map((x) => x.sleep))),
    row(tr('Weather'), s.map((x) => (x.weather === undefined ? '–' : `${num(x.weather)}${x.night ? ` ${x.night}` : ''}`)), bestIndex(s.map((x) => x.weather))),
    row(tr('Both (half and half)'), combined.map(num), bestIndex(combined)),
    row(tr('Elevation'), spots.map((x) => (x.elevation === undefined ? '–' : `${Math.round(x.elevation)} m`))),
    row(tr('Place'), spots.map((x) => [x.municipality, x.canton].filter(Boolean).join(', ') || '–')),
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
