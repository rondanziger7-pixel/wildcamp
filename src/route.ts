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
 * track/route points are kept (the rest of the file is ignored). A file with a gpx root but no points gives
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
        if (!d || !d.ok || !line || total >= MAX_POINTS) break;
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
  while (stack.length > 0) finish(stack.pop()!); // truncated file

  if (!sawRoot) throw new Error('not a GPX file');
  const out: ParsedGpx = { tracks, routes, waypoints };
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

// __PART2__
