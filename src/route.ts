/**
 * Route helpers: a dependency-free GPX reader, distance / ascent / duration maths, simplification,
 * equal-distance sampling, stage splitting and a GPX writer.
 *
 * Pure functions only: no DOM (no DOMParser), no network, no translations.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RoutePoint extends LatLon {
  ele?: number;
  time?: string;
}

export interface Waypoint extends LatLon {
  name?: string;
  ele?: number;
  desc?: string;
}

export interface ParsedLine {
  name?: string;
  points: RoutePoint[];
}

export interface ParsedGpx {
  /** metadata/name (GPX 1.1) or the root's name (GPX 1.0). */
  name?: string;
  tracks: ParsedLine[];
  routes: ParsedLine[];
  waypoints: Waypoint[];
  /** The file ends in the middle (cut off): only what was before the cut was read. */
  truncated?: boolean;
  /** The file had more than `MAX_POINTS` points: they were thinned evenly, so the line keeps its shape but its length and climb are approximate. */
  thinned?: boolean;
}

/** Track and route points kept per file (tracks + routes together); further points are dropped. */
export const MAX_POINTS = 200_000;
/** Waypoints kept per file. */
export const MAX_WAYPOINTS = 20_000;

// ---------------------------------------------------------------------------------------------
// A small, forgiving XML scanner (no DOMParser, so it runs in Node and in workers).
// It never expands DTD entities, so a hostile file cannot blow up.
// ---------------------------------------------------------------------------------------------

interface XmlHandler {
  open(name: string, rawAttrs: string, selfClosing: boolean): void;
  close(name: string): void;
  text(raw: string, cdata: boolean): void;
}

const ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,15});/g, (whole, body: string) => {
    if (body.charCodeAt(0) === 35) {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES.get(body) ?? whole;
  });
}

/** `gpxtpx:TrackPointExtension` -> `trackpointextension`; prefixes are dropped and case is ignored. */
function localName(n: string): string {
  const i = n.lastIndexOf(':');
  return (i >= 0 ? n.slice(i + 1) : n).toLowerCase();
}

const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Attributes in any order, with double, single or no quotes. Names are lower-cased without prefix. */
function parseAttrs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const v = m[2] ?? m[3] ?? m[4];
    if (v !== undefined) out.set(localName(m[1] ?? ''), decodeEntities(v));
  }
  return out;
}

/** Index of the `>` that ends the tag starting after `from`, or -1 (malformed, or the file ends first). */
function findTagEnd(xml: string, from: number): number {
  let quote = 0;
  for (let i = from; i < xml.length; i++) {
    const c = xml.charCodeAt(i);
    if (c === 60) return -1; // a '<' inside a tag: malformed
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) quote = c;
    else if (c === 62) return i;
  }
  return -1;
}

/** Skips `<!DOCTYPE ...>` (with an optional internal subset) and similar declarations. */
function skipDeclaration(xml: string, lt: number): number {
  const gt = xml.indexOf('>', lt + 2);
  if (gt < 0) return xml.length;
  const bracket = xml.indexOf('[', lt + 2);
  if (bracket >= 0 && bracket < gt) {
    const close = xml.indexOf(']', bracket);
    if (close < 0) return xml.length;
    const gt2 = xml.indexOf('>', close);
    return gt2 < 0 ? xml.length : gt2 + 1;
  }
  return gt + 1;
}

const isNameStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58 || c >= 128;

function scanXml(xml: string, h: XmlHandler): void {
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      h.text(xml.slice(i), false);
      return;
    }
    if (lt > i) h.text(xml.slice(i, lt), false);
    const c1 = xml.charCodeAt(lt + 1);
    if (c1 === 33) {
      // '<!'
      if (xml.startsWith('<!--', lt)) {
        const e = xml.indexOf('-->', lt + 4);
        if (e < 0) return;
        i = e + 3;
      } else if (xml.startsWith('<![CDATA[', lt)) {
        const e = xml.indexOf(']]>', lt + 9);
        h.text(xml.slice(lt + 9, e < 0 ? n : e), true);
        if (e < 0) return;
        i = e + 3;
      } else i = skipDeclaration(xml, lt);
      continue;
    }
    if (c1 === 63) {
      // '<?'
      const e = xml.indexOf('?>', lt + 2);
      if (e < 0) return;
      i = e + 2;
      continue;
    }
    if (c1 === 47) {
      // '</'
      const e = xml.indexOf('>', lt + 2);
      if (e < 0) return;
      h.close(localName(xml.slice(lt + 2, e).trim()));
      i = e + 1;
      continue;
    }
    const end = isNameStart(c1) ? findTagEnd(xml, lt + 1) : -1;
    if (end < 0) {
      h.text('<', false); // a stray '<' in text
      i = lt + 1;
      continue;
    }
    let body = xml.slice(lt + 1, end);
    const selfClosing = body.endsWith('/');
    if (selfClosing) body = body.slice(0, -1);
    const sp = body.search(/\s/);
    h.open(localName(sp < 0 ? body : body.slice(0, sp)), sp < 0 ? '' : body.slice(sp), selfClosing);
    i = end + 1;
  }
}

// ---------------------------------------------------------------------------------------------
// GPX reader
// ---------------------------------------------------------------------------------------------

const NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A strict number: no empty string, no units, no NaN/Infinity. */
function parseNum(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  if (!NUM_RE.test(t)) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

/** Elevations outside this range are sentinels (-9999, 32768, ...) and are left out. */
function parseEle(s: string): number | undefined {
  const v = parseNum(s);
  return v !== undefined && v >= -1000 && v <= 10000 ? v : undefined;
}

interface PointDraft {
  lat: number;
  lon: number;
  ok: boolean;
  ele?: number;
  time?: string;
  name?: string;
  desc?: string;
  cmt?: string;
}

interface Frame {
  name: string;
  text: string;
  collect: boolean;
  pt?: PointDraft;
  line?: ParsedLine;
}

const COLLECT = new Set(['name', 'ele', 'time', 'desc', 'cmt']);

function pointDraft(rawAttrs: string): PointDraft {
  const a = parseAttrs(rawAttrs);
  const lat = parseNum(a.get('lat'));
  const lon = parseNum(a.get('lon'));
  // (0, 0) is the "no fix yet" value of many devices, never a place in a Swiss trip.
  const ok = lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  return { lat: lat ?? 0, lon: lon ?? 0, ok };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const multiLine = (s: string) => s.replace(/\r\n?/g, '\n').trim();

/**
 * Reads tracks, routes and waypoints from GPX text (1.0 and 1.1; Garmin, Komoot, Wikiloc, Outdooractive and
 * this app's own files). Handles namespace prefixes, extensions (skipped), CDATA, entities, any attribute
 * order and quote style, self-closing tags, a BOM and Windows line endings. Points with a missing, junk or
 * out-of-range coordinate are skipped; multiple `trkseg` of one track are joined. At most `MAX_POINTS`
 * track/route points are kept: a longer file is thinned evenly (`thinned`). A file with a gpx root but no points gives
 * empty arrays; a truncated file gives what was read before the cut.
 * @throws Error('not a GPX file') when there is no gpx root element.
 */
export function parseGpx(xml: string): ParsedGpx {
  if (typeof xml !== 'string') throw new Error('not a GPX file');
  const src = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;

  const stack: Frame[] = [];
  const tracks: ParsedLine[] = [];
  const routes: ParsedLine[] = [];
  const waypoints: Waypoint[] = [];
  let extDepth = 0;
  let sawRoot = false;
  let metaName: string | undefined;
  let rootName: string | undefined;
  let total = 0;
  // too many points: every second point of every line is dropped and only every second new point is kept from then on (and again, and again)
  let step = 1;
  let seen = 0;
  let thinned = false;

  const enclosingLine = (name: string): ParsedLine | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i]!;
      if (f.name === name) return f.line;
    }
    return undefined;
  };

  const finish = (f: Frame): void => {
    const parent = stack[stack.length - 1];
    switch (f.name) {
      case 'ele': {
        const v = parent?.pt ? parseEle(f.text) : undefined;
        if (parent?.pt && v !== undefined) parent.pt.ele = v;
        break;
      }
      case 'time': {
        const t = f.text.trim();
        if (parent?.pt && t) parent.pt.time = t;
        break;
      }
      case 'desc':
      case 'cmt': {
        const t = multiLine(f.text);
        if (parent?.pt && t) parent.pt[f.name] = t;
        break;
      }
      case 'name': {
        const t = oneLine(f.text);
        if (!t || !parent) break;
        if (parent.pt) parent.pt.name = t;
        else if (parent.line) parent.line.name = t;
        else if (parent.name === 'metadata') metaName ??= t;
        else if (parent.name === 'gpx') rootName ??= t;
        break;
      }
      case 'trkpt':
      case 'rtept': {
        const d = f.pt;
        const line = enclosingLine(f.name === 'trkpt' ? 'trk' : 'rte');
        if (!d || !d.ok || !line) break;
        if (seen++ % step !== 0) break;
        if (total >= MAX_POINTS) {
          const lines = [...tracks, ...routes, ...stack.flatMap((fr) => (fr.line ? [fr.line] : []))];
          for (const l of lines) l.points = l.points.filter((_, i) => i % 2 === 0 || i === l.points.length - 1);
          total = lines.reduce((n, l) => n + l.points.length, 0);
          step *= 2;
          thinned = true;
        }
        const p: RoutePoint = { lat: d.lat, lon: d.lon };
        if (d.ele !== undefined) p.ele = d.ele;
        if (d.time !== undefined) p.time = d.time;
        line.points.push(p);
        total++;
        break;
      }
      case 'wpt': {
        const d = f.pt;
        if (!d || !d.ok || waypoints.length >= MAX_WAYPOINTS) break;
        const w: Waypoint = { lat: d.lat, lon: d.lon };
        if (d.name !== undefined) w.name = d.name;
        if (d.ele !== undefined) w.ele = d.ele;
        const desc = d.desc ?? d.cmt;
        if (desc !== undefined) w.desc = desc;
        waypoints.push(w);
        break;
      }
      case 'trk':
      case 'rte':
        if (f.line && f.line.points.length > 0) (f.name === 'trk' ? tracks : routes).push(f.line);
        break;
    }
  };

  scanXml(src, {
    open(name, rawAttrs, selfClosing) {
      if (extDepth > 0) {
        if (!selfClosing) extDepth++;
        return;
      }
      if (name === 'extensions') {
        if (!selfClosing) extDepth = 1;
        return;
      }
      if (name === 'gpx') sawRoot = true;
      const f: Frame = { name, text: '', collect: COLLECT.has(name) };
      if (name === 'trkpt' || name === 'rtept' || name === 'wpt') f.pt = pointDraft(rawAttrs);
      else if (name === 'trk' || name === 'rte') f.line = { points: [] };
      stack.push(f);
      if (selfClosing) finish(stack.pop()!);
    },
    close(name) {
      if (extDepth > 0) {
        extDepth = name === 'extensions' ? 0 : Math.max(1, extDepth - 1);
        return;
      }
      let idx = stack.length - 1;
      while (idx >= 0 && stack[idx]!.name !== name) idx--;
      if (idx < 0) return; // a stray closing tag
      while (stack.length > idx) finish(stack.pop()!); // also closes anything left open inside
    },
    text(raw, cdata) {
      const top = stack[stack.length - 1];
      if (extDepth > 0 || !top || !top.collect) return;
      top.text += cdata ? raw : decodeEntities(raw);
    },
  });
  const truncated = stack.length > 0; // closing tags are missing: the file was cut off
  // A file cut off mid-way: a half-read value (say '10' of an elevation '1000') is dropped, the rest is kept.
  while (stack.length > 0 && stack[stack.length - 1]!.collect) stack.pop();
  while (stack.length > 0) finish(stack.pop()!);

  if (!sawRoot) throw new Error('not a GPX file');
  const out: ParsedGpx = { tracks, routes, waypoints };
  if (truncated) out.truncated = true;
  if (thinned) out.thinned = true;
  const name = metaName ?? rootName;
  if (name !== undefined) out.name = name;
  return out;
}

/** The line to plan with: the longest track, else the longest route, else an empty array. */
export function mainLine(g: ParsedGpx): RoutePoint[] {
  const longest = (lines: ParsedLine[]): RoutePoint[] | undefined => {
    let best: RoutePoint[] | undefined;
    let bestLen = -1;
    for (const l of lines) {
      if (l.points.length === 0) continue;
      const len = lengthM(l.points);
      if (len > bestLen || (len === bestLen && best !== undefined && l.points.length > best.length)) {
        best = l.points;
        bestLen = len;
      }
    }
    return best;
  };
  return longest(g.tracks) ?? longest(g.routes) ?? [];
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

const EARTH_R = 6371008.8; // mean earth radius in metres (IUGG)
const RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance along the line in metres from the first point to each point (first entry 0). */
export function cumulativeM(points: readonly LatLon[]): number[] {
  const out: number[] = new Array<number>(points.length);
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) sum += haversineM(points[i - 1]!, points[i]!);
    out[i] = sum;
  }
  return out;
}

/** Length of the line in metres. */
export function lengthM(points: readonly LatLon[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineM(points[i - 1]!, points[i]!);
  return sum;
}

/**
 * Total climb and descent in metres from the points that carry an elevation, or undefined when fewer than
 * two do. GPS and barometer noise would otherwise add hundreds of metres to a flat track, so the
 * elevations are smoothed with a 3-point moving average (the first and last stay as they are) and then run
 * through a dead band: a change only counts once it is `minStepM` (default 3 m) away from the last counted
 * level. Values are not rounded.
 */
export function ascentDescent(points: readonly { ele?: number }[], minStepM = 3): { ascentM: number; descentM: number } | undefined {
  const e: number[] = [];
  for (const p of points) if (p.ele !== undefined && Number.isFinite(p.ele)) e.push(p.ele);
  if (e.length < 2) return undefined;
  const last = e.length - 1;
  const s = e.map((v, i) => (i === 0 || i === last ? v : (e[i - 1]! + v + e[i + 1]!) / 3));
  let ref = s[0]!;
  let ascentM = 0;
  let descentM = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s[i]! - ref;
    if (d >= minStepM) {
      ascentM += d;
      ref = s[i]!;
    } else if (d <= -minStepM) {
      descentM -= d;
      ref = s[i]!;
    }
  }
  return { ascentM, descentM };
}

/** Local metric (equirectangular) projection around a reference latitude/longitude. */
function projector(lat0: number, lon0: number): (p: LatLon) => [number, number] {
  const ky = EARTH_R * RAD;
  const kx = ky * Math.cos(lat0 * RAD);
  return (p) => [(p.lon - lon0) * kx, (p.lat - lat0) * ky];
}

/** Squared distance from (px, py) to the segment (ax, ay)-(bx, by); a zero-length segment is a point. */
function distToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Douglas-Peucker in a local metric projection: keeps the first and last point and every point that
 * deviates more than `toleranceM` from the simplified line. Returns the original point objects (so `ele`
 * and `time` survive), never mutates the input; a tolerance of 0 or less keeps everything.
 */
export function simplify<T extends LatLon>(points: readonly T[], toleranceM: number): T[] {
  const n = points.length;
  if (n <= 2 || !(toleranceM > 0)) return points.slice();
  const first = points[0]!;
  const project = projector(first.lat, first.lon);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = project(points[i]!);
    xs[i] = x;
    ys[i] = y;
  }
  const tol2 = toleranceM * toleranceM;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const work: number[] = [0, n - 1];
  while (work.length > 0) {
    const hi = work.pop()!;
    const lo = work.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegmentSq(xs[i]!, ys[i]!, xs[lo]!, ys[lo]!, xs[hi]!, ys[hi]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tol2) {
      keep[at] = 1;
      work.push(lo, at, at, hi);
    }
  }
  const out: T[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]!);
  return out;
}

export interface SamplePoint extends RoutePoint {
  /** Distance along the line from the first point, in metres. */
  distM: number;
  /** Index of the source point at or before this position (the sample lies on the segment index..index+1). */
  index: number;
}

/**
 * Points at equal distances along the line: 0, everyM, 2*everyM, ... and finally the last point (so the
 * last gap is shorter). Positions between two source points are interpolated linearly, elevation too when
 * both have one. A line of one point gives that point; an invalid `everyM` gives only the first and last.
 */
export function sampleEvery(points: readonly RoutePoint[], everyM: number): SamplePoint[] {
  const n = points.length;
  if (n === 0) return [];
  const first = points[0]!;
  if (n === 1) return [{ ...first, distM: 0, index: 0 }];
  const cum = cumulativeM(points);
  const total = cum[n - 1]!;
  const out: SamplePoint[] = [{ ...first, distM: 0, index: 0 }];
  if (everyM > 0 && Number.isFinite(everyM)) {
    let seg = 0;
    for (let k = 1; k * everyM < total - 1e-6; k++) {
      const t = k * everyM;
      while (seg < n - 2 && cum[seg + 1]! <= t) seg++;
      const a = points[seg]!;
      const b = points[seg + 1]!;
      const span = cum[seg + 1]! - cum[seg]!;
      const f = span > 0 ? (t - cum[seg]!) / span : 0;
      const p: SamplePoint = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, distM: t, index: seg };
      if (a.ele !== undefined && b.ele !== undefined) p.ele = a.ele + (b.ele - a.ele) * f;
      out.push(p);
    }
  }
  out.push({ ...points[n - 1]!, distM: total, index: n - 1 });
  return out;
}

export interface Stage {
  from: RoutePoint;
  to: RoutePoint;
  /** Length of the stage in metres. */
  distM: number;
  /** Distance along the whole line at which the stage starts, in metres. */
  startDistM: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Splits a line into stages of about `targetKm` by distance. The stage count is chosen so that no stage is
 * more than about 30 % over the target or 35 % under it (unless the whole line is shorter than that), and
 * the stages are of equal length, so the last one is never tiny: 52 km at 20 km gives 3 x 17.3 km, 29 km
 * gives 2 x 14.5 km, 45 km gives 2 x 22.5 km. Stages start and end at points of the line (nearest to the
 * ideal cut), share their boundary point and add up to the length of the line. A sparse line (few points
 * far apart) may give fewer stages than asked. A target of 0 or less gives a single stage.
 */
export function splitStages(points: readonly RoutePoint[], targetKm: number): Stage[] {
  const n = points.length;
  if (n < 2) return [];
  const cum = cumulativeM(points);
  const total = cum[n - 1]!;
  const targetM = targetKm * 1000;
  let count = 1;
  if (targetM > 0 && Number.isFinite(targetM)) {
    const whole = Math.floor(total / targetM);
    count = Math.max(1, total - whole * targetM >= 0.3 * targetM - 1 ? whole + 1 : whole); // 1 m slack: 66.000 km at 20 gives 4
  }
  const cuts: number[] = [0];
  for (let j = 1; j < count; j++) {
    const ideal = (total * j) / count;
    // nearest point by distance along the line (binary search)
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < ideal) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo > 0 && ideal - cum[lo - 1]! < cum[lo]! - ideal ? lo - 1 : lo;
    if (idx > cuts[cuts.length - 1]! && idx < n - 1) cuts.push(idx);
  }
  cuts.push(n - 1);
  const stages: Stage[] = [];
  for (let s = 0; s + 1 < cuts.length; s++) {
    const a = cuts[s]!;
    const b = cuts[s + 1]!;
    stages.push({ from: points[a]!, to: points[b]!, distM: cum[b]! - cum[a]!, startDistM: cum[a]!, startIndex: a, endIndex: b });
  }
  return stages;
}

export interface NearestOnLine extends LatLon {
  /** Distance from the query to the line, in metres. */
  distM: number;
  /** Index of the line point before the nearest position (it lies on the segment index..index+1). */
  index: number;
  /** Distance along the line from its first point to the nearest position, in metres. */
  distAlongM: number;
}

/**
 * The closest position on the line (projected onto its segments, not just its vertices) to a point, or
 * undefined for an empty line. `lat`/`lon` are the position found.
 */
export function nearestOnLine(points: readonly RoutePoint[], lat: number, lon: number): NearestOnLine | undefined {
  const n = points.length;
  if (n === 0) return undefined;
  const q: LatLon = { lat, lon };
  if (n === 1) {
    const p = points[0]!;
    return { lat: p.lat, lon: p.lon, distM: haversineM(q, p), index: 0, distAlongM: 0 };
  }
  const project = projector(lat, lon);
  let bestSq = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  let [ax, ay] = project(points[0]!);
  for (let i = 0; i + 1 < n; i++) {
    const [bx, by] = project(points[i + 1]!);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2)) : 0;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = cx * cx + cy * cy;
    if (d < bestSq) {
      bestSq = d;
      bestIndex = i;
      bestT = t;
    }
    ax = bx;
    ay = by;
  }
  const a = points[bestIndex]!;
  const b = points[bestIndex + 1]!;
  const at: LatLon = { lat: a.lat + (b.lat - a.lat) * bestT, lon: a.lon + (b.lon - a.lon) * bestT };
  let along = 0;
  for (let i = 1; i <= bestIndex; i++) along += haversineM(points[i - 1]!, points[i]!);
  along += haversineM(a, b) * bestT;
  return { lat: at.lat, lon: at.lon, distM: haversineM(q, at), index: bestIndex, distAlongM: along };
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Bounding box of the points, or undefined for none. */
export function bounds(points: readonly LatLon[]): Bounds | undefined {
  if (points.length === 0) return undefined;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  return { south, west, north, east };
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/**
 * Walking time in minutes by Naismith's rule: 4 km/h on the flat plus 10 minutes for every 100 m of ascent
 * (not rounded; negative or non-finite inputs count as 0). `descentM` is accepted for callers that have it
 * but does not change the result: Langmuir's correction (a credit on gentle descents, a penalty on steep
 * ones) needs the slope of each stretch, and over mixed terrain the two roughly cancel. Naismith is
 * optimistic on rough or very steep ground, so plan with a margin.
 */
export function naismithMinutes(distM: number, ascentM: number, descentM = 0): number {
  const flat = Number.isFinite(distM) && distM > 0 ? (distM / 4000) * 60 : 0;
  const climb = Number.isFinite(ascentM) && ascentM > 0 ? (ascentM / 100) * 10 : 0;
  return flat + climb;
}

/** `80` -> '1 h 20 min', `45` -> '45 min', `120` -> '2 h'. Rounded to whole minutes; below 0 gives '0 min'. */
export function formatDuration(minutes: number): string {
  const total = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------------------------
// GPX writer
// ---------------------------------------------------------------------------------------------

const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: string) => s.replace(XML_ILLEGAL, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const validLatLon = (p: LatLon) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const eleText = (v: number) => String(Math.round(v * 10) / 10 + 0); // 1602.4 -> '1602.4', no '-0'

/**
 * GPX 1.1 with the waypoints first (as the schema wants) and then one `<trk>` with one `<trkseg>`; the
 * track is left out when there are no points. Names and descriptions are XML-escaped, points with a
 * non-finite or out-of-range coordinate are skipped, elevations are written to 0.1 m, positions to 6
 * decimals. Waypoint names such as 'Night 2: Alp Grüm' are the caller's.
 */
export function routeToGpx(name: string, points: readonly RoutePoint[], waypoints: readonly Waypoint[] = []): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">', `  <metadata><name>${esc(name)}</name></metadata>`];
  for (const w of waypoints) {
    if (!validLatLon(w)) continue;
    out.push(`  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">`);
    if (w.ele !== undefined && Number.isFinite(w.ele)) out.push(`    <ele>${eleText(w.ele)}</ele>`);
    if (w.name) out.push(`    <name>${esc(w.name)}</name>`);
    if (w.desc) out.push(`    <desc>${esc(w.desc)}</desc>`);
    out.push('  </wpt>');
  }
  const line = points.filter(validLatLon);
  if (line.length > 0) {
    out.push('  <trk>', `    <name>${esc(name)}</name>`, '    <trkseg>');
    for (const p of line) {
      const open = `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"`;
      const ele = p.ele !== undefined && Number.isFinite(p.ele) ? `<ele>${eleText(p.ele)}</ele>` : '';
      const time = p.time ? `<time>${esc(p.time)}</time>` : '';
      out.push(ele || time ? `${open}>${ele}${time}</trkpt>` : `${open}/>`);
    }
    out.push('    </trkseg>', '  </trk>');
  }
  out.push('</gpx>', '');
  return out.join('\n');
}
