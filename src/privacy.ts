import { AREAS_KEY, loadAreas } from './offline';
import { SAVED_KEY, loadSaved, type Store } from './saved';
import { TRIP_KEY, TRIP_KEY_V2, loadTrip } from './trip';
import { ROUTE_KEY } from './routeplan';
import { LANG_KEY } from './i18n';

/** What this app keeps in the browser and what it sends away, for the privacy panel (plain facts, nothing else is collected). */

export const GEAR_KEY = 'wildcamp.gear.v1';
export const APP_KEY_PREFIX = 'wildcamp.';

/** Every place the app writes in localStorage. A test checks that no other `wildcamp.` key is written anywhere in the source. */
export const KEPT_KEYS = [SAVED_KEY, TRIP_KEY, TRIP_KEY_V2, ROUTE_KEY, LANG_KEY, AREAS_KEY, GEAR_KEY] as const;

export interface KeptSummary {
  spots: number;
  nights: number;
  route?: string;
  areas: number;
  /** Bytes of text in all the app's keys. */
  bytes: number;
}

export function keptSummary(store: Store | undefined, today: string): KeptSummary {
  let route: string | undefined;
  try {
    const r = JSON.parse(store?.getItem(ROUTE_KEY) ?? 'null') as { name?: unknown } | null;
    if (r && typeof r.name === 'string') route = r.name;
  } catch {
    /* unreadable: counts as none */
  }
  let bytes = 0;
  for (const k of KEPT_KEYS) bytes += (store?.getItem(k) ?? '').length * 2;
  return { spots: loadSaved(store).length, nights: loadTrip(store, today).length, route, areas: loadAreas(store).length, bytes };
}

/** What is sent where, when a spot is checked. `what` is in plain words for the panel. */
export const SENT: { host: string; what: string }[] = [
  { host: 'api3.geo.admin.ch', what: 'The spot you checked: its zones, municipality, elevation, land cover and springs, from swisstopo and the federal offices. Also the text you type in the search box.' },
  { host: 'wmts.geo.admin.ch, wms.geo.admin.ch', what: 'The map area you are looking at: map pictures, the zone layers and the mobile coverage prediction.' },
  { host: 'api.open-meteo.com', what: 'The spot (to about ten metres) and its elevation: the weather forecast.' },
  { host: 'aws.slf.ch', what: 'Nothing about you: the national avalanche bulletin is downloaded whole and matched here.' },
];

/** Remove everything the app stores about the user: saved spots, trips, the route, settings. Returns how many keys were removed. */
export function wipeKept(store: Pick<Storage, 'removeItem' | 'key' | 'length'> | undefined): number {
  if (!store) return 0;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(APP_KEY_PREFIX)) keys.push(k);
  }
  for (const k of keys) store.removeItem(k);
  return keys.length;
}

/** Remove the user's own plans only (saved spots, trips, the route), keeping the language, gear and saved-maps notes. */
export function wipePlans(store: Pick<Storage, 'removeItem'> | undefined): void {
  for (const k of [SAVED_KEY, TRIP_KEY, TRIP_KEY_V2, ROUTE_KEY]) store?.removeItem(k);
}
