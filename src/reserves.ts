import { tr } from './i18n';
import { gunzipIfNeeded } from './binary';
import type { NearZone, ZoneHit } from './assess';
import { RESERVE_ZONES, type ZoneLayer } from './zones';

export type ReserveLevel = 'restricted' | 'caution';

/** A cantonal nature reserve with polygons in LV95; built by scripts/build_be_reserves.py. */
export interface Reserve {
  id: number;
  name: string;
  level: ReserveLevel;
  /** Link to the reserve's protection decree. */
  decree: string;
  /** How the legal text was classified: banned, entry, silent, notext, law (a regulation) or unchecked. */
  scan: string;
  /** Designated-place exception read from the decree, if any. */
  exception?: string;
  /** Flat [x0, y0, x1, y1, ...] rings in metres. Even-odd fill, so holes work. */
  rings: number[][];
  bbox: [number, number, number, number];
}

export interface ReserveSet {
  canton: string;
  generated: string;
  /** Zone wording carried by the data itself (cantons built by scripts/build_cantonal_reserves.py). */
  label?: string;
  notes?: { restricted: string; caution: string };
  reserves: Reserve[];
}

interface RawReserve extends Omit<Reserve, 'bbox'> {}

export function parseReserveSet(raw: { canton: string; generated: string; label?: string; notes?: { restricted: string; caution: string }; reserves: RawReserve[] }): ReserveSet {
  const reserves = raw.reserves.map((r) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of r.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i]!, y = ring[i + 1]!;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return { ...r, bbox: [x0, y0, x1, y1] as [number, number, number, number] };
  });
  return { canton: raw.canton, generated: raw.generated, label: raw.label, notes: raw.notes, reserves };
}

export async function decodeReserveSet(buf: ArrayBuffer): Promise<ReserveSet> {
  const bytes = await gunzipIfNeeded(buf);
  return parseReserveSet(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function loadReserveSet(url: string, init?: RequestInit): Promise<ReserveSet> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`reserves ${res.status}`);
  return decodeReserveSet(await res.arrayBuffer());
}

/** Even-odd point-in-polygon across all rings of one reserve. */
function inside(rings: number[][], x: number, y: number): boolean {
  let odd = false;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[2 * i]!, yi = ring[2 * i + 1]!, xj = ring[2 * j]!, yj = ring[2 * j + 1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

/** Reserves containing an LV95 point. */
export function reservesAt(set: ReserveSet, e: number, n: number): Reserve[] {
  return set.reserves.filter(
    (r) => e >= r.bbox[0] && e <= r.bbox[2] && n >= r.bbox[1] && n <= r.bbox[3] && inside(r.rings, e, n),
  );
}

const generated = new Map<string, ZoneLayer>();
function generatedLayer(set: ReserveSet, level: ReserveLevel): ZoneLayer {
  const key = `${set.canton}-${level}`;
  let layer = generated.get(key);
  if (!layer) {
    layer = {
      id: `${set.canton.toLowerCase()}-reserve-${level}`,
      // read at display time, so the language in force then decides; the texts come with the data and are translated by key
      get label() {
        return tr(set.label ?? `${set.canton} nature reserve`);
      },
      severity: level,
      get note() {
        return tr(set.notes?.[level] ?? '');
      },
    };
    generated.set(key, layer);
  }
  return layer;
}

function layerFor(set: ReserveSet, r: Reserve): ZoneLayer {
  const canton = set.canton;
  if (set.notes) return generatedLayer(set, r.level);
  if (canton === 'VS') {
    if (r.level !== 'restricted') return RESERVE_ZONES.vsOther;
    return r.scan === 'entry' ? RESERVE_ZONES.vsDecisionEntry : RESERVE_ZONES.vsDecisionBan;
  }
  if (canton === 'TI') return r.level === 'restricted' ? RESERVE_ZONES.tiDecreeBan : RESERVE_ZONES.tiOther;
  if (r.level !== 'restricted') return RESERVE_ZONES.beOther;
  return r.scan === 'entry' ? RESERVE_ZONES.beDecreeEntry : RESERVE_ZONES.beDecreeBan;
}

/** Distance in metres from a point to the nearest edge of a reserve's rings. */
function distanceToRings(rings: number[][], x: number, y: number): number {
  let best = Infinity;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = ring[2 * j]!, ay = ring[2 * j + 1]!, bx = ring[2 * i]!, by = ring[2 * i + 1]!;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
  }
  return best;
}

/** Reserves with a ban that begin within `radiusM` of an LV95 point without containing it, with the exact distance to their edge. */
export function reserveZonesNear(set: ReserveSet, e: number, n: number, radiusM: number): NearZone[] {
  const out: NearZone[] = [];
  for (const r of set.reserves) {
    if (r.level !== 'restricted') continue;
    if (e < r.bbox[0] - radiusM || e > r.bbox[2] + radiusM || n < r.bbox[1] - radiusM || n > r.bbox[3] + radiusM) continue;
    if (inside(r.rings, e, n)) continue;
    const d = distanceToRings(r.rings, e, n);
    if (d <= radiusM) out.push({ layer: layerFor(set, r), name: r.name, distanceM: d });
  }
  return out;
}

export function reserveZoneHits(set: ReserveSet, e: number, n: number): ZoneHit[] {
  return reservesAt(set, e, n).map((r) => ({
    layer: layerFor(set, r),
    name: r.name,
    detail: [r.exception && tr(r.exception), r.scan === 'unchecked' ? '' : `${r.scan === 'law' ? tr('Legal basis') : tr('Decree')}: ${r.decree}`].filter(Boolean).join(' '),
  }));
}
