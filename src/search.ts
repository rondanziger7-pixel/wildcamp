import { getLang } from './i18n';
export interface Place {
  label: string;
  lat: number;
  lon: number;
  /** geo.admin data set the hit comes from ("gg25" is a municipality, whose point is its centroid). */
  origin?: string;
}

/**
 * A municipality's point is its centroid, which for a mountain municipality lies on a glacier (Saas-Fee, Zermatt, Davos). When the same
 * name also comes as a populated place, that place goes first, and the municipality stays in the list right after it.
 */
export function villageFirst(list: Place[]): Place[] {
  const first = list[0];
  if (first?.origin !== 'gg25') return list;
  const name = first.label.replace(/\s*\([A-Z]{2}\)\s*$/, '').toLowerCase();
  const i = list.findIndex((p, k) => k > 0 && p.origin === 'gazetteer' && p.label.toLowerCase().includes(name));
  if (i < 0) return list;
  return [list[i]!, ...list.slice(0, i), ...list.slice(i + 1)];
}

/** Parse a geo.admin SearchServer (type=locations, sr=4326) response; labels carry HTML markup. */
export function parsePlaces(json: unknown): Place[] {
  const results = (json as { results?: { attrs?: Record<string, unknown> }[] })?.results ?? [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const r of results) {
    const a = r.attrs;
    if (!a || typeof a.lat !== 'number' || typeof a.lon !== 'number' || typeof a.label !== 'string') continue;
    const label = a.label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lat: a.lat, lon: a.lon, origin: typeof a.origin === 'string' ? a.origin : undefined });
  }
  return villageFirst(out);
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  const q = new URLSearchParams({ searchText: text, type: 'locations', limit: '6', sr: '4326', lang: getLang() });
  const res = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${q}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return parsePlaces(await res.json());
}

const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** True when the hit really answers the typed text: at least one word of 3+ letters of the text starts a word of the hit. The service always returns something. */
export function answers(text: string, label: string): boolean {
  const words = plain(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (!words.length) return plain(label).includes(plain(text).trim());
  const have = plain(label).split(/[^a-z0-9]+/);
  return words.some((w) => have.some((h) => h.startsWith(w) || w.startsWith(h) && h.length >= 4));
}
