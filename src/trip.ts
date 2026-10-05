import type { SavedSpot, Store } from './saved';

/** The trip: saved spots in the order of the nights, kept in this browser. */
export const TRIP_KEY = 'wildcamp.trip.v1';
/** The forecast covers about four nights. */
export const MAX_NIGHTS = 4;

export function loadTrip(store: Store | undefined): string[] {
  try {
    const raw = store?.getItem(TRIP_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveTrip(store: Store | undefined, ids: string[]): void {
  try {
    store?.setItem(TRIP_KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: the trip lasts until the page is reloaded */
  }
}

/** Keep only spots that still exist, without repeats, at most MAX_NIGHTS, in trip order. */
export function tripSpots(ids: string[], spots: SavedSpot[]): SavedSpot[] {
  const out: SavedSpot[] = [];
  for (const id of ids) {
    const s = spots.find((x) => x.id === id);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_NIGHTS) break;
  }
  return out;
}

export function addToTrip(ids: string[], id: string): string[] {
  return ids.includes(id) || ids.length >= MAX_NIGHTS ? ids : [...ids, id];
}

export function removeFromTrip(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/** Move the spot at `index` one night earlier (-1) or later (+1). */
export function moveInTrip(ids: string[], index: number, dir: -1 | 1): string[] {
  const j = index + dir;
  if (index < 0 || index >= ids.length || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}
