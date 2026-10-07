import { getLang } from './i18n';
export interface Place {
  label: string;
  lat: number;
  lon: number;
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
    out.push({ label, lat: a.lat, lon: a.lon });
  }
  return out;
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  const q = new URLSearchParams({ searchText: text, type: 'locations', limit: '6', sr: '4326', lang: getLang() });
  const res = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${q}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return parsePlaces(await res.json());
}
