import type { Lang } from '../i18n';

/**
 * A link to the SAC portal page of a hut (opening months, phone, beds, winter room), from swisstopo's layer "Unterkünfte Winter"
 * (huts, hotels and inns open in the winter season, made with the SAC; 329 of its 506 points carry a portal link). The portal page is
 * the source of the details, so the app links to it and says nothing of its own about opening: a hut that is not in the layer (a
 * summer-only hut) has no link here, which does not mean it is closed or unattended.
 */

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';
const LAYER = 'ch.swisstopo.unterkuenfte-winter';
/** How far from a hut of the names layer a point of this layer is taken to be the same hut. */
export const HUT_MATCH_M = 150;

export interface HutLink {
  name: string;
  url: string;
  /** Metres from the place asked about. */
  meters: number;
}

interface Feature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/** Only links to the SAC portal itself are used. */
const isPortal = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/www\.sac-cas\.ch\//.test(u);

/** The points of an identify response with a portal link in `lang`, nearest to (e, n) first. */
export function parseHutLinks(body: { results?: Feature[] }, e: number, n: number, lang: Lang): HutLink[] {
  const out: HutLink[] = [];
  for (const f of body.results ?? []) {
    const c = f.geometry?.coordinates;
    const name = f.properties?.name;
    const url = f.properties?.[`url_sac_${lang}`] ?? f.properties?.url_sac_en ?? f.properties?.url_sac_de;
    if (f.geometry?.type !== 'Point' || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number' || typeof name !== 'string' || !isPortal(url)) continue;
    out.push({ name, url, meters: Math.hypot(c[0] - e, c[1] - n) });
  }
  return out.sort((a, b) => a.meters - b.meters);
}

/** The portal link of the hut at a position (LV95), if the layer has it within `HUT_MATCH_M`. */
export async function fetchHutLink(at: { e: number; n: number }, lang: Lang, signal?: AbortSignal): Promise<HutLink | undefined> {
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${at.e},${at.n}`,
    sr: '2056',
    layers: `all:${LAYER}`,
    tolerance: String(HUT_MATCH_M),
    mapExtent: `${at.e - 500},${at.n - 500},${at.e + 500},${at.n + 500}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'true',
    geometryFormat: 'geojson',
    lang: 'en',
  });
  const res = await fetch(`${API}?${q}`, { signal });
  if (!res.ok) throw new Error(`hut link ${res.status}`);
  return parseHutLinks((await res.json()) as { results?: Feature[] }, at.e, at.n, lang)[0];
}
