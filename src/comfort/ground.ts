import { wgs84ToLv95 } from '../coords';

const API = 'https://api3.geo.admin.ch/rest/services/api/MapServer';
const LAYER = 'ch.bfs.arealstatistik-bodenbedeckung';

export type Cover = 'grass' | 'shrub' | 'rock' | 'loose' | 'wet' | 'forest' | 'glacier' | 'water' | 'built' | 'farmland' | 'other';

export interface GroundInfo {
  cover: Cover;
  /** The category's English name in the land-cover statistics. */
  label: string;
  /** Distance in metres to the 100 m survey point the class comes from. */
  meters: number;
  /** Year of the survey record used. */
  year: number;
}

/** Map the statistics' basic category (NOLC04, 27 classes) to what matters for pitching a tent. */
export function classifyCover(desc: string): Cover {
  const d = desc.toLowerCase();
  if (/glacier|perpetual snow|firn/.test(d)) return 'glacier';
  if (/solid rock|rocky areas/.test(d)) return 'rock';
  if (/granular|scree|gravel|sand|debris/.test(d)) return 'loose';
  // settlement land comes before forest and grass: "Trees in artificial areas" and "Lawns" are town, not woods and meadows
  if (/lawns|mix of small structures|artificial|gardens with|build|consolidated|road|rail|urban|paved|hard|sport|industrial|construction|dump|mine|greenhouse/.test(d)) return 'built';
  // vineyards, orchards and crop land are private and in use (before "brush": "garden plants and brush crops")
  if (/vines|fruit trees|garden plants|orchard|crops/.test(d)) return 'farmland';
  if (/shrub|brush/.test(d)) return 'shrub';
  if (/wetland|reed|bog|marsh|mire/.test(d)) return 'wet';
  if (/forest|wood|tree|hedge/.test(d)) return 'forest';
  if (/^grass|meadow|pasture|alp|herb/.test(d)) return 'grass';
  if (/lake|river|stream|water/.test(d)) return 'water';
  return 'other';
}

type Body = { results?: { attributes?: Record<string, unknown> }[] };

/** The latest survey record of a point in the land-cover statistics response. */
export function parseGround(body: Body, meters: number): GroundInfo | undefined {
  let best: { year: number; desc: string } | undefined;
  for (const r of body.results ?? []) {
    const a = r.attributes ?? {};
    const year = Number(a.year);
    const desc = a.desc_lc09r_27_en;
    if (Number.isFinite(year) && typeof desc === 'string' && (!best || year > best.year)) best = { year, desc };
  }
  return best && { cover: classifyCover(best.desc), label: best.desc, meters, year: best.year };
}

/**
 * Ground cover at a spot. The statistics are sample points on a regular 100 m grid
 * (LV95 coordinates divisible by 100), so the nearest grid point, at most about 70 m away,
 * stands for the spot. It is visual interpretation of aerial photos, not a ground survey.
 */
export async function fetchGround(lat: number, lon: number, signal?: AbortSignal): Promise<GroundInfo | undefined> {
  const { e, n } = wgs84ToLv95(lat, lon);
  const ge = Math.round(e / 100) * 100;
  const gn = Math.round(n / 100) * 100;
  const q = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${ge},${gn}`,
    sr: '2056',
    layers: `all:${LAYER}`,
    tolerance: '1',
    mapExtent: `${ge - 500},${gn - 500},${ge + 500},${gn + 500}`,
    imageDisplay: '1000,1000,96',
    returnGeometry: 'false',
    lang: 'en',
  });
  const res = await fetch(`${API}/identify?${q}`, { signal });
  if (!res.ok) throw new Error(`ground ${res.status}`);
  return parseGround((await res.json()) as Body, Math.hypot(e - ge, n - gn));
}
