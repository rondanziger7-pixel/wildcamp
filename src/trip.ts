import type { SavedSpot, Store } from './saved';
import { addDays } from './comfort/weather';

/**
 * The trip: nights with a date and a saved spot each, kept in this browser. A spot can be used on several nights (a base camp), a trip can
 * be as long as a person walks, and every night has its own date, so the legality (zone seasons, firing days) is judged for that date.
 */
export const TRIP_KEY = 'wildcamp.trip.v1'; // before dates: the spot ids in the order of the nights
export const TRIP_KEY_V2 = 'wildcamp.trip.v2';
/** Nights in one trip. */
export const MAX_NIGHTS = 21;
/** How far ahead a night can be planned: the legality can be judged a year ahead, the forecast only 16 days. */
export const MAX_AHEAD_DAYS = 365;

export interface TripNight {
  /** A saved spot's id. */
  spot: string;
  /** The evening the night begins on, "YYYY-MM-DD". */
  date: string;
}

export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

const byDate = (a: TripNight, b: TripNight) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** One night per date (the first of two on the same date wins), in date order, at most MAX_NIGHTS. */
export function tidy(nights: TripNight[]): TripNight[] {
  const seen = new Set<string>();
  const out: TripNight[] = [];
  for (const n of [...nights].sort(byDate)) {
    if (seen.has(n.date)) continue;
    seen.add(n.date);
    out.push(n);
    if (out.length >= MAX_NIGHTS) break;
  }
  return out;
}

/** `today` is the evening of the first night that is not over ("YYYY-MM-DD"). */
export function loadTrip(store: Store | undefined, today: string): TripNight[] {
  try {
    const v2 = store?.getItem(TRIP_KEY_V2);
    if (v2) {
      const list = JSON.parse(v2) as unknown;
      if (Array.isArray(list)) {
        return tidy(list.filter((n): n is TripNight => !!n && typeof (n as TripNight).spot === 'string' && isDay((n as TripNight).date)).map((n) => ({ spot: n.spot, date: n.date })));
      }
      return [];
    }
    // a trip made before dates existed: one spot per night, from today on
    const v1 = store?.getItem(TRIP_KEY);
    const ids = v1 ? (JSON.parse(v1) as unknown) : [];
    if (!Array.isArray(ids)) return [];
    return tidy(ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_NIGHTS).map((spot, i) => ({ spot, date: addDays(today, i) })));
  } catch {
    return [];
  }
}

export function saveTrip(store: Store | undefined, nights: TripNight[]): void {
  try {
    store?.setItem(TRIP_KEY_V2, JSON.stringify(tidy(nights)));
  } catch {
    /* storage blocked: the trip lasts until the page is reloaded */
  }
}

export interface PlannedNight {
  night: TripNight;
  spot: SavedSpot;
}

/** The nights that can be shown: spots that still exist, nights that are not over, in date order. */
export function tripNights(nights: TripNight[], spots: SavedSpot[], today: string): PlannedNight[] {
  const out: PlannedNight[] = [];
  for (const n of tidy(nights)) {
    const spot = spots.find((s) => s.id === n.spot);
    if (spot && n.date >= today) out.push({ night: n, spot });
  }
  return out;
}

/** The first free date from `from` on (within the planning horizon), or undefined when there is none. */
export function nextFreeDate(nights: TripNight[], from: string, today: string): string | undefined {
  const taken = new Set(nights.map((n) => n.date));
  const last = addDays(today, MAX_AHEAD_DAYS);
  for (let d = from < today ? today : from; d <= last; d = addDays(d, 1)) if (!taken.has(d)) return d;
  return undefined;
}

/** Add a night for `spot`: on `date`, or the evening after the last night (today when there are none). Unchanged when the trip is full or no date is free. */
export function addNight(nights: TripNight[], spot: string, today: string, date?: string): TripNight[] {
  if (nights.length >= MAX_NIGHTS) return nights;
  const last = nights.length ? [...nights].sort(byDate)[nights.length - 1]!.date : undefined;
  const from = date ?? (last ? addDays(last, 1) : today);
  const free = nextFreeDate(nights, from, today);
  return free ? tidy([...nights, { spot, date: free }]) : nights;
}

export function removeNight(nights: TripNight[], date: string): TripNight[] {
  return nights.filter((n) => n.date !== date);
}

/** Another spot on the night of `date`. */
export function setNightSpot(nights: TripNight[], date: string, spot: string): TripNight[] {
  return nights.map((n) => (n.date === date ? { ...n, spot } : n));
}

/**
 * Move a night to another evening. `undefined` when that evening already has a night, or is not a plannable day: the caller
 * says so and leaves the trip as it was, instead of guessing which night the person meant to replace.
 */
export function moveNight(nights: TripNight[], date: string, to: string, today: string): TripNight[] | undefined {
  if (!isDay(to) || to < today || to > addDays(today, MAX_AHEAD_DAYS)) return undefined;
  if (to !== date && nights.some((n) => n.date === to)) return undefined;
  return tidy(nights.map((n) => (n.date === date ? { ...n, date: to } : n)));
}

/** Nights for spots in a given order, one each evening from `today`. */
export function nightsFor(spotIds: string[], today: string): TripNight[] {
  return tidy(spotIds.slice(0, MAX_NIGHTS).map((spot, i) => ({ spot, date: addDays(today, i) })));
}

/** The number of days between two evenings. */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
