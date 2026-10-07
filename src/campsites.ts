import { gunzipIfNeeded } from './binary';
import { haversineM } from './route';
import { tr } from './i18n';
import { CAMPSITES_FILE } from './localdata';

/**
 * Official campsites, for "where instead" when a spot is not allowed. The list is swisstopo's swissNAMES3D objects "Campingplatzareal"
 * (campsite area) and "Standplatzareal" (area for caravans and bungalows with permanent use), bundled with the app (see
 * scripts/build_campsites.py). The data says that such an area is mapped there. It says nothing about opening times, space for tents or
 * prices, so the app says only that, and never that a place is open or has room.
 */

export interface Campsite {
  name: string;
  lat: number;
  lon: number;
  /** `c`: a campsite area; `s`: only an area for caravans (often permanent pitches). */
  kind: 'c' | 's';
}

export interface CampsiteList {
  asOf: string;
  sites: Campsite[];
}

export function parseCampsites(raw: unknown): CampsiteList {
  const r = raw as { asOf?: unknown; sites?: unknown } | null;
  if (!r || !Array.isArray(r.sites)) throw new Error('campsites: unexpected data');
  const sites: Campsite[] = [];
  for (const s of r.sites) {
    if (!Array.isArray(s) || typeof s[0] !== 'string' || !Number.isFinite(s[1]) || !Number.isFinite(s[2]) || (s[3] !== 'c' && s[3] !== 's')) continue;
    sites.push({ name: s[0], lat: s[1], lon: s[2], kind: s[3] });
  }
  return { asOf: typeof r.asOf === 'string' ? r.asOf : '', sites };
}

let cached: Promise<CampsiteList> | undefined;

/** Load the list once (a failed load is tried again next time). */
export function loadCampsites(base: string): Promise<CampsiteList> {
  cached ??= (async () => {
    const res = await fetch(`${base}${CAMPSITES_FILE}`);
    if (!res.ok) throw new Error(`campsites ${res.status}`);
    return parseCampsites(JSON.parse(new TextDecoder().decode(await gunzipIfNeeded(await res.arrayBuffer()))));
  })();
  cached.catch(() => (cached = undefined));
  return cached;
}

export interface NearCampsite {
  site: Campsite;
  /** Metres from the spot to the middle of the campsite area (a large area can be nearer at its edge). */
  distM: number;
}

/** The `count` campsites nearest to a place, within `maxM`. A caravan-only area is listed only when no campsite is as near. */
export function nearestCampsites(list: CampsiteList, lat: number, lon: number, count = 3, maxM = 30_000): NearCampsite[] {
  const near = list.sites
    .map((site) => ({ site, distM: haversineM({ lat, lon }, { lat: site.lat, lon: site.lon }) }))
    .filter((c) => c.distM <= maxM)
    .sort((a, b) => a.distM - b.distM);
  const firstCamp = near.find((c) => c.site.kind === 'c');
  return near.filter((c) => c.site.kind === 'c' || (firstCamp ? c.distM < firstCamp.distM : true)).slice(0, count);
}

/** "1.2 km" or "850 m". */
export function distanceText(m: number): string {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** The campsite's name with what it is: "Campsite Rendez-vous", or "Caravan site Sion" for an area that is only for caravans. */
export function campsiteLabel(c: Campsite): string {
  const what = c.kind === 'c' ? tr('Campsite') : tr('Caravan site');
  return c.name ? `${what} ${c.name}` : what;
}

/** One line for a result page: the nearest campsites with distances, or nothing when there are none within reach. */
export function campsiteLine(found: NearCampsite[]): string | undefined {
  if (!found.length) return undefined;
  const list = found.map((f) => `${campsiteLabel(f.site)} (${distanceText(f.distM)})`).join(', ');
  return tr('Official campsites nearby: {list}. The map shows where a campsite is, not whether it is open or takes tents.', { list });
}
