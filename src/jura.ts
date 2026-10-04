import type { ZoneHit } from './assess';
import { wgs84ToLv95 } from './coords';
import { RESERVE_ZONES } from './zones';

const WMS = 'https://geoservices.jura.ch/wms';
const LAYER = 'ju.env_04_01_reserves_naturelles_zones_protection_paysagere';

export interface JuraFeature {
  name: string;
  /** "Réserve naturelle - En vigueur" for reserves, "Zone de protection paysagère - ..." for landscape zones. */
  kind: string;
  rings: number[][];
}

const text = (block: string, tag: string): string =>
  (block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/** Parse the service's msGMLOutput into features with LV95 rings (outer and inner, for even-odd fill). */
export function parseJuraGml(gml: string): JuraFeature[] {
  const features: JuraFeature[] = [];
  for (const block of gml.split(/<[^>]*_feature>/).filter((b) => b.includes('<gml:coordinates>') && b.includes('<tri>'))) {
    const rings: number[][] = [];
    for (const m of block.matchAll(/<gml:LinearRing>\s*<gml:coordinates>([^<]+)<\/gml:coordinates>/g)) {
      rings.push(m[1]!.trim().split(/\s+/).flatMap((pair) => pair.split(',').slice(0, 2).map(Number)));
    }
    features.push({ name: text(block, 'nom'), kind: text(block, 'tri'), rings });
  }
  return features;
}

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

/** Nature reserves (not landscape zones) that contain the point, as zone hits. */
export function juraReserveHits(features: JuraFeature[], e: number, n: number): ZoneHit[] {
  return features
    .filter((f) => f.kind.startsWith('Réserve naturelle') && inside(f.rings, e, n))
    .map((f) => ({ layer: RESERVE_ZONES.ju, name: f.name }));
}

/**
 * Ask the canton's WMS which reserve polygons lie at a point, then test the exact point against the returned
 * polygons. The box is centred on the point at 15 m per pixel, the scale the layer answers at.
 */
export async function fetchJuraReserves(lat: number, lon: number): Promise<ZoneHit[]> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const half = 3000;
  const px = 400;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    CRS: 'EPSG:2056',
    STYLES: '',
    LAYERS: LAYER,
    QUERY_LAYERS: LAYER,
    // EPSG:2056 is easting-first in WMS 1.3.0; shifted half a pixel so the centre pixel is on the point
    BBOX: `${e - half - 7.5},${n - half + 7.5},${e + half - 7.5},${n + half + 7.5}`,
    WIDTH: String(px),
    HEIGHT: String(px),
    I: String(px / 2),
    J: String(px / 2),
    INFO_FORMAT: 'application/vnd.ogc.gml',
    FEATURE_COUNT: '10',
  });
  const res = await fetch(`${WMS}?${params}`);
  if (!res.ok) throw new Error(`jura wms ${res.status}`);
  return juraReserveHits(parseJuraGml(await res.text()), e, n);
}
