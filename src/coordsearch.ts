/**
 * Turns what a person types or pastes into a place: decimal degrees, degrees/minutes/seconds, Swiss grid
 * coordinates (LV95 and LV03), Plus Codes (Open Location Code) and links from map services.
 *
 * Pure: no DOM, no network, no translations (the messages are plain English; callers switch on `error`).
 * It is deliberately strict: a place name, an address, a postcode or a bare number is never a coordinate.
 */
import { lv95ToWgs84 } from './coords';

export type LocationKind = 'decimal' | 'dms' | 'lv95' | 'lv03' | 'pluscode' | 'maplink' | 'geo';

export interface ParsedLocation {
  lat: number;
  lon: number;
  /** Web-map zoom from a link, when it has one (never swisstopo's own 0-14 scale). */
  zoom?: number;
  kind: LocationKind;
}

/** Recognised, but cannot be used. */
export interface LocationError {
  error: 'short-link' | 'out-of-range';
  message: string;
}

export type LocationResult = ParsedLocation | LocationError;

export const SHORT_LINK_MESSAGE = 'Short links cannot be opened here. Open the link, then copy the coordinates or the full address from the browser.';
const SHORT_CODE_MESSAGE = 'A short plus code needs its town to be located and cannot be opened here. Use the full code (8 characters before the +, like 8FVC9G8F+6W) or the coordinates.';
const RANGE_MESSAGE = 'Latitude must be between -90 and 90 and longitude between -180 and 180.';

type Result = LocationResult | undefined;

const shortLinkError = (message = SHORT_LINK_MESSAGE): LocationError => ({ error: 'short-link', message });
const rangeError = (): LocationError => ({ error: 'out-of-range', message: RANGE_MESSAGE });

/** True for the `{ error, message }` result of `parseLocation`. */
export const isLocationError = (r: unknown): r is LocationError => typeof r === 'object' && r !== null && 'error' in r;

/** A location, or the range error; undefined for non-finite numbers. Zoom is kept only when it makes sense. */
function make(lat: number, lon: number, kind: LocationKind, zoom?: number): Result {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return rangeError();
  const out: ParsedLocation = { lat, lon, kind };
  if (zoom !== undefined && Number.isFinite(zoom) && zoom >= 0 && zoom <= 24) out.zoom = zoom;
  return out;
}

/** Box around Switzerland and its neighbours: a bare pair of numbers outside it is not taken as a place. */
const inNeighbourhood = (lat: number, lon: number) => lat >= 42.5 && lat <= 50.5 && lon >= 3 && lon <= 14.5;

// ---------------------------------------------------------------------------------------------
// Normalising the text
// ---------------------------------------------------------------------------------------------

function normalise(input: string): string {
  return input
    .replace(/^﻿/, '')
    .replace(/[   -​  　]/g, ' ')
    .replace(/[−‒–—―﹣－](?=[\d.])/g, '-')
    .replace(/[º˚∘]/g, '°')
    .replace(/[′ʹ´‘’ʼ`‵]/g, "'")
    .replace(/[″ʺ“”„‟‶]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "(46.85, 9.53)", "[...]", "<...>", "...", '...' and `...` (a pasted code span), once. */
function unwrap(s: string): string {
  const m = /^[(\[{<]\s*(.+?)\s*[)\]}>]$/.exec(s) ?? /^"\s*(.+?)\s*"$/.exec(s) ?? /^'\s*(.+?)\s*'$/.exec(s);
  return m ? m[1]! : s;
}

const LABEL_RE = /^(?:plus\s*code|pluscode|olc|open\s+location\s+code|coordinates?|coords?|koordinaten?|coordonn[eé]es|gps|position|wgs\s?84|standort|location|lat\s*[/,]\s*lo?n(?:g|gitude)?)\s*[:=]\s*/i;

// ---------------------------------------------------------------------------------------------
// Plus Codes (Open Location Code)
// ---------------------------------------------------------------------------------------------

const OLC_CHARS = '23456789CFGHJMPQRVWX';

export interface PlusCodeArea {
  /** Centre of the code's cell. */
  lat: number;
  lon: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Decodes a full Plus Code (8 characters, '+', then 2 or more: 10 digits is a 14 m cell, each further digit
 * refines it; codes padded with 0 before the '+' are areas). Short codes cannot be decoded without a
 * reference place and give undefined. 'out-of-range' when the first digits put the cell beyond the poles
 * or the antimeridian.
 */
export function decodePlusCode(code: string): PlusCodeArea | 'out-of-range' | undefined {
  const c = code.trim().toUpperCase();
  if (c.indexOf('+') !== 8 || c.indexOf('+', 9) >= 0) return undefined;
  const head = c.slice(0, 8);
  const tail = c.slice(9);
  const pad = /0*$/.exec(head)![0].length;
  if (pad % 2 !== 0 || pad > 6 || (pad > 0 && tail.length > 0) || tail.length === 1) return undefined;
  const digits = head.slice(0, 8 - pad) + tail;
  if (digits.length < 2 || digits.length > 15) return undefined;
  const idx: number[] = [];
  for (const ch of digits) {
    const i = OLC_CHARS.indexOf(ch);
    if (i < 0) return undefined;
    idx.push(i);
  }
  if (idx[0]! > 8 || idx[1]! > 17) return 'out-of-range';
  let south = -90;
  let west = -180;
  let res = 20;
  for (let i = 0; i < Math.min(digits.length, 10); i += 2) {
    res = 20 / 20 ** (i / 2);
    south += idx[i]! * res;
    west += idx[i + 1]! * res;
  }
  let latRes = res;
  let lonRes = res;
  for (let i = 10; i < digits.length; i++) {
    latRes /= 5;
    lonRes /= 4;
    south += Math.floor(idx[i]! / 4) * latRes;
    west += (idx[i]! % 4) * lonRes;
  }
  return { lat: south + latRes / 2, lon: west + lonRes / 2, south, west, north: south + latRes, east: west + lonRes };
}

const CODE_CH = '[23456789CFGHJMPQRVWX]';
const FULL_CODE_RE = new RegExp(`^(?:${CODE_CH}{2}){1,4}0{0,6}\\+(?:${CODE_CH}{2,7})?$`, 'i');
const SHORT_CODE_RE = new RegExp(`^(?:${CODE_CH}{2}){1,3}\\+${CODE_CH}{2,7}$`, 'i');

function parsePlusCode(s: string): Result {
  const tokens = s.split(' ');
  for (const t of tokens) {
    if (t.length < 9 || !FULL_CODE_RE.test(t) || t.indexOf('+') !== 8) continue;
    const area = decodePlusCode(t);
    if (area === 'out-of-range') return rangeError();
    if (area) return make(area.lat, area.lon, 'pluscode');
  }
  // a short code (and then maybe its town) as the first thing in the text
  if (SHORT_CODE_RE.test(tokens[0] ?? '')) return shortLinkError(SHORT_CODE_MESSAGE);
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Swiss grid (LV95 and LV03)
// ---------------------------------------------------------------------------------------------

// A grid number: 2600000, 2'600'000, 2 600 000, 2.600.000, 2,600,000, 2600000.5, 600000, 600'000 ...
const LV_NUM = String.raw`(?:\d{1,3}(?:[ '.,]\d{3}){1,2}(?:\.\d+)?|\d{5,7}(?:[.,]\d+)?)`;
const LV_LABEL = String.raw`(?:(?:e|n|x|y|ost|nord|east|north|rechtswert|hochwert)\s*[:=]?\s*)?`;
const LV_UNIT = String.raw`(?:\s*m)?`;
const LV_TAG = String.raw`(?:(?:lv\s?95|lv\s?03|ch\s?1903\s?\+?|epsg\s?:\s?\d{4,5}|swiss\s+grid)\s*[:/,-]?\s*){0,2}`;
const LV_RE = new RegExp(`^${LV_TAG}${LV_LABEL}(${LV_NUM})${LV_UNIT}\\s*(?:[;,/|]\\s*|\\s)${LV_LABEL}(${LV_NUM})${LV_UNIT}$`, 'i');

function lvNumber(tok: string): number {
  const g = /^(\d{1,3}(?:[ '.,]\d{3}){1,2})(\.\d+)?$/.exec(tok);
  if (g) return Number(g[1]!.replace(/[ '.,]/g, '') + (g[2] ?? ''));
  return Number(tok.replace(',', '.'));
}

type Axis = 'e95' | 'n95' | 'e03' | 'n03';

/** Switzerland spans E 2.48-2.84 and N 1.07-1.30 million in LV95; the same minus 2 and 1 million in LV03. */
function axisOf(v: number): Axis | undefined {
  if (v >= 2_480_000 && v <= 2_840_000) return 'e95';
  if (v >= 1_070_000 && v <= 1_300_000) return 'n95';
  if (v >= 480_000 && v <= 840_000) return 'e03';
  if (v >= 70_000 && v <= 300_000) return 'n03';
  return undefined;
}

/** East and north from two grid numbers in either order (the size says which is which); undefined if they do not fit one system. */
function gridPair(a: number, b: number): { lat: number; lon: number; kind: 'lv95' | 'lv03' } | undefined {
  const ka = axisOf(a);
  const kb = axisOf(b);
  if (!ka || !kb) return undefined;
  let e: number;
  let n: number;
  let kind: 'lv95' | 'lv03';
  if (ka === 'e95' && kb === 'n95') [e, n, kind] = [a, b, 'lv95'];
  else if (ka === 'n95' && kb === 'e95') [e, n, kind] = [b, a, 'lv95'];
  else if (ka === 'e03' && kb === 'n03') [e, n, kind] = [a + 2_000_000, b + 1_000_000, 'lv03'];
  else if (ka === 'n03' && kb === 'e03') [e, n, kind] = [b + 2_000_000, a + 1_000_000, 'lv03'];
  else return undefined;
  return { ...lv95ToWgs84(e, n), kind };
}

function parseSwissGrid(s: string): Result {
  const m = LV_RE.exec(s);
  if (!m) return undefined;
  const p = gridPair(lvNumber(m[1]!), lvNumber(m[2]!));
  return p ? make(p.lat, p.lon, p.kind) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Degrees: decimal, degrees + minutes, degrees + minutes + seconds
// ---------------------------------------------------------------------------------------------

interface Angle {
  /** Absolute value in degrees. */
  deg: number;
  /** The text had minutes (and maybe seconds). */
  minutes: boolean;
  negative: boolean;
}

const PLAIN_NUM = /^\d{1,3}(?:[.,]\d+)?$/;
const toNum = (t: string) => Number(t.replace(',', '.'));

/** One angle without its hemisphere letter: 46.8523, 46.8523°, 46°51.138', 46°51'08.3", 46 51 08.3, 46 51.138. */
function parseAngle(text: string): Angle | undefined {
  const m = /^([+-]?)\s*(.*)$/.exec(text.trim())!;
  const negative = m[1] === '-';
  const t = m[2]!.trim();
  let g: RegExpExecArray | null;
  let deg: number;
  let minutes = false;
  if ((g = /^(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:[.,]\d+)?)\s*"?$/.exec(t))) {
    if (toNum(g[2]!) >= 60 || toNum(g[3]!) >= 60) return undefined;
    deg = Number(g[1]) + toNum(g[2]!) / 60 + toNum(g[3]!) / 3600;
    minutes = true;
  } else if ((g = /^(\d{1,3})\s*°\s*(\d{1,2}(?:[.,]\d+)?)\s*'?$/.exec(t))) {
    if (toNum(g[2]!) >= 60) return undefined;
    deg = Number(g[1]) + toNum(g[2]!) / 60;
    minutes = true;
  } else if ((g = /^(\d{1,3}(?:[.,]\d+)?)\s*°$/.exec(t))) {
    deg = toNum(g[1]!);
  } else if ((g = /^(\d{1,3})\s+(\d{1,2})\s+(\d{1,2}(?:[.,]\d+)?)$/.exec(t))) {
    if (toNum(g[2]!) >= 60 || toNum(g[3]!) >= 60) return undefined;
    deg = Number(g[1]) + toNum(g[2]!) / 60 + toNum(g[3]!) / 3600;
    minutes = true;
  } else if ((g = /^(\d{1,3})\s+(\d{1,2}(?:[.,]\d+)?)$/.exec(t))) {
    if (toNum(g[2]!) >= 60) return undefined;
    deg = Number(g[1]) + toNum(g[2]!) / 60;
    minutes = true;
  } else if (PLAIN_NUM.test(t)) {
    deg = toNum(t);
  } else return undefined;
  return { deg, minutes, negative };
}

const MARKED = String.raw`[+-]?\s*(?:\d{1,3}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(?:[.,]\d+)?\s*"?|\d{1,3}\s*°\s*\d{1,2}(?:[.,]\d+)?\s*'?|\d{1,3}(?:[.,]\d+)?\s*°)`;
const MARKED_PAIR_RE = new RegExp(`^(${MARKED})\\s*[,;/|]?\\s*(${MARKED})$`);
const PLAIN_PAIR_RE = /^([+-]?\d+(?:[.,]\d+)?)\s*(?:[;,/|]|\s)\s*([+-]?\d+(?:[.,]\d+)?)$/;
const LABELLED_LAT = String.raw`(?:lat(?:itude)?|breite|latitudine)`;
const LABELLED_LON = String.raw`(?:lon(?:g(?:itude)?)?|lng|l[aä]nge|longitudine)`;
const LABELLED_NUM = String.raw`([+-]?\d+(?:\.\d+)?)`;
const LAT_FIRST_RE = new RegExp(`^${LABELLED_LAT}\\s*[:=]?\\s*${LABELLED_NUM}\\s*[,;/]?\\s*${LABELLED_LON}\\s*[:=]?\\s*${LABELLED_NUM}$`, 'i');
const LON_FIRST_RE = new RegExp(`^${LABELLED_LON}\\s*[:=]?\\s*${LABELLED_NUM}\\s*[,;/]?\\s*${LABELLED_LAT}\\s*[:=]?\\s*${LABELLED_NUM}$`, 'i');

/** 'Lat: 46.85, Lon: 9.53' and the other way round: the words say which is which. */
function parseLabelled(s: string): Result {
  let m = LAT_FIRST_RE.exec(s);
  if (m) return make(Number(m[1]), Number(m[2]), 'decimal');
  m = LON_FIRST_RE.exec(s);
  if (m) return make(Number(m[2]), Number(m[1]), 'decimal');
  return undefined;
}

const signed = (a: Angle, letter: string | undefined) => (a.negative || (letter !== undefined && /[SW]/i.test(letter)) ? -a.deg : a.deg);

/** A pair of angles; `explicit` (inside a link) also takes integers and any place on Earth, in lat, lon order. */
function parseAnglePair(s: string, explicit: boolean): Result {
  if (!/^[\d\s.,;°'"+\-NSEWOnsewo/|]+$/.test(s)) return undefined;
  const letters = [...s.matchAll(/[NSEWO]/gi)];
  if (letters.length === 0) return parseBarePair(s, explicit);
  if (letters.length !== 2) return undefined;
  const [l1, l2] = [letters[0]!, letters[1]!];
  const isLat = (l: string) => /[NS]/i.test(l);
  if (isLat(l1[0]) === isLat(l2[0])) return undefined; // one latitude letter and one longitude letter
  const prefix = !/\d/.test(s.slice(0, l1.index));
  let h1: string;
  let h2: string;
  if (prefix) {
    h1 = s.slice(l1.index! + 1, l2.index);
    h2 = s.slice(l2.index! + 1);
  } else {
    h1 = s.slice(0, l1.index);
    h2 = s.slice(l1.index! + 1, l2.index);
    if (!/^[\s.,;]*$/.test(s.slice(l2.index! + 1))) return undefined;
  }
  const trim = (h: string) => h.replace(/^[\s,;/|]+|[\s,;/|]+$/g, '');
  const a1 = parseAngle(trim(h1));
  const a2 = parseAngle(trim(h2));
  if (!a1 || !a2) return undefined;
  const v1 = signed(a1, l1[0]);
  const v2 = signed(a2, l2[0]);
  const [lat, lon] = isLat(l1[0]) ? [v1, v2] : [v2, v1];
  return make(lat, lon, a1.minutes || a2.minutes ? 'dms' : 'decimal');
}

function parseBarePair(s: string, explicit: boolean): Result {
  // with degree marks and no letters: 46.8523° 9.5302°, 46°51'08.3" 9°31'48.7"
  const marked = MARKED_PAIR_RE.exec(s);
  if (marked) {
    const a = parseAngle(marked[1]!);
    const b = parseAngle(marked[2]!);
    if (!a || !b) return undefined;
    return make(signed(a, undefined), signed(b, undefined), a.minutes || b.minutes ? 'dms' : 'decimal');
  }
  const m = PLAIN_PAIR_RE.exec(s);
  if (!m) return undefined;
  const [t1, t2] = [m[1]!, m[2]!];
  const a = toNum(t1);
  const b = toNum(t2);
  if (explicit) return make(a, b, 'decimal');
  // a bare pair is a place only if both numbers have decimals and it is somewhere near Switzerland
  if (!/[.,]\d/.test(t1) || !/[.,]\d/.test(t2)) return undefined;
  // 'lon, lat' only when the first is clearly a Swiss longitude and the second a Swiss latitude
  const swapped = a >= 5.9 && a <= 10.6 && b >= 45.7 && b <= 47.9;
  const [lat, lon] = swapped ? [b, a] : [a, b];
  return inNeighbourhood(lat, lon) ? make(lat, lon, 'decimal') : undefined;
}

// ---------------------------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------------------------

const SHORT_HOSTS = new Set([
  'maps.app.goo.gl', 'goo.gl', 'g.co', 'share.google', 's.geo.admin.ch', 'maps.apple',
  'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'kmt.to',
]);

interface LinkParts {
  host: string;
  path: string;
  query: string;
  hash: string;
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Splits a link without the URL class: with or without scheme; a bare '#...' counts (our own app links). */
function splitLink(s: string): LinkParts | undefined {
  if (s.startsWith('#')) return { host: '', path: '', query: '', hash: s.slice(1) };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
  if (!hasScheme && /\s/.test(s)) return undefined;
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(s);
  if (!m) return undefined;
  const host = m[1]!.toLowerCase().replace(/^.*@/, '').replace(/:\d+$/, '').replace(/^www\./, '');
  const [path, query, hash] = [m[2] ?? '', m[3] ?? '', m[4] ?? ''];
  if (!hasScheme) {
    // 'maps.app.goo.gl/x', 'google.com/maps?q=...': a domain followed by something, or a known short host
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return undefined;
    if (!path && !query && !hash && !SHORT_HOSTS.has(host)) return undefined;
  }
  return { host, path, query, hash };
}

function parseParams(q: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of q.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const key = safeDecode((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' ')).toLowerCase();
    if (!out.has(key)) out.set(key, i < 0 ? '' : safeDecode(part.slice(i + 1).replace(/\+/g, ' ')));
  }
  return out;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const zoomOf = (v: string | undefined): number | undefined => (v !== undefined && /^\d{1,2}(?:\.\d+)?$/.test(v.trim()) ? Number(v) : undefined);

interface CoordHit {
  lat: number;
  lon: number;
  /** From the Swiss grid: the zoom of such links is swisstopo's own scale and is left out. */
  swiss: boolean;
}

/** A value from a link parameter: 46.85,9.53 | 46.85 9.53 | 46.85~9.53 | loc:46.85,9.53 | 46.85,9.53(Label) | 2600000,1200000 | 8FVC9G8F+6W. */
function parseCoordParam(raw: string): CoordHit | LocationError | undefined {
  const t = raw.trim().replace(/^(?:loc:|ll\.|geo:)/i, '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  if (!t) return undefined;
  const grid = parseSwissGrid(t);
  if (grid) return isLocationError(grid) ? grid : { lat: grid.lat, lon: grid.lon, swiss: true };
  const code = parsePlusCode(t);
  if (code) return isLocationError(code) ? code : { lat: code.lat, lon: code.lon, swiss: false };
  const r = parseAnglePair(normalise(t.replace(/~/g, ',')), true);
  if (!r) return undefined;
  return isLocationError(r) ? r : { lat: r.lat, lon: r.lon, swiss: false };
}

function parseGeoUri(s: string): Result {
  const m = /^geo:([^?;]*)(?:;[^?]*)?(?:\?(.*))?$/i.exec(s);
  if (!m) return undefined;
  const [latText, lonText] = m[1]!.split(',').map((t) => t.trim());
  const params = parseParams(m[2] ?? '');
  const zoom = zoomOf(params.get('z'));
  const strict = /^[+-]?\d+(?:\.\d+)?$/;
  if (latText === undefined || lonText === undefined || !strict.test(latText) || !strict.test(lonText)) return undefined;
  const [lat, lon] = [Number(latText), Number(lonText)];
  const q = params.get('q');
  if (lat === 0 && lon === 0 && q !== undefined) {
    // geo:0,0?q=46.85,9.53(Label): the position is in the query (a text query has none)
    const hit = parseCoordParam(q);
    if (!hit) return undefined;
    return isLocationError(hit) ? hit : make(hit.lat, hit.lon, 'geo', zoom);
  }
  return make(lat, lon, 'geo', zoom);
}

const isSwissHost = (host: string) => /(?:^|\.)(?:geo\.admin\.ch|schweizmobil\.ch|swisstopo\.ch)$/.test(host);

function parseLink(s: string): Result {
  if (/^geo:/i.test(s)) return parseGeoUri(s);
  const parts = splitLink(s);
  if (!parts) return undefined;
  const { host, path, query, hash } = parts;
  if (SHORT_HOSTS.has(host) || (/^(?:osm\.org|openstreetmap\.org)$/.test(host) && path.startsWith('/go/'))) return shortLinkError();

  const swissHost = isSwissHost(host);
  const hit = (lat: number, lon: number, zoom?: number): Result => make(lat, lon, 'maplink', swissHost ? undefined : zoom);

  // our own links and Leaflet-style hashes: #46.85,9.53,14 and #15/46.85/9.53
  let m = new RegExp(`^(${NUM}),(${NUM})(?:,(\\d+(?:\\.\\d+)?))?$`).exec(hash);
  if (m) return hit(Number(m[1]), Number(m[2]), zoomOf(m[3]));
  m = new RegExp(`^(\\d{1,2}(?:\\.\\d+)?)/(${NUM})/(${NUM})(?:/.*)?$`).exec(hash);
  if (m) return hit(Number(m[2]), Number(m[3]), Number(m[1]));

  const params = parseParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash.includes('=') ? hash : '');
  for (const [k, v] of parseParams(query)) params.set(k, v);
  const zoomParam = zoomOf(params.get('z') ?? params.get('zoom') ?? params.get('lvl') ?? params.get('level'));
  const segments = path.split('/').filter(Boolean).map((p) => safeDecode(p.replace(/\+/g, ' ')));
  const isDir = /^\/maps\/dir\//i.test(path);
  const at = new RegExp(`@(${NUM}),(${NUM})(?:,(\\d+(?:\\.\\d+)?)([a-z]))?`, 'i').exec(path);
  const atZoom = at && at[4]?.toLowerCase() === 'z' ? Number(at[3]) : undefined;

  const fromSegments = (list: string[]): Result => {
    for (const seg of list) {
      if (seg.startsWith('@') || seg.startsWith('data=')) continue;
      const code = parsePlusCode(seg);
      if (code) return isLocationError(code) ? code : hit(code.lat, code.lon, atZoom ?? zoomParam);
      const r = parseAnglePair(normalise(seg), true);
      if (r) return isLocationError(r) ? r : hit(r.lat, r.lon, atZoom ?? zoomParam);
    }
    return undefined;
  };

  // Google directions: the destination is the last place in the path (the @ is only the view)
  if (isDir) {
    const dest = fromSegments(segments.slice(2).reverse());
    if (dest) return dest;
  }
  // Google place: the pin (!3d..!4d..) beats the view centre (@lat,lon,zoom)
  const pin = new RegExp(`!3d(${NUM})!4d(${NUM})`).exec(`${path}?${query}#${hash}`);
  if (pin) return hit(Number(pin[1]), Number(pin[2]), atZoom ?? zoomParam);
  if (at) return hit(Number(at[1]), Number(at[2]), atZoom ?? zoomParam);

  // parameters: a marker, lat/lon pairs, the usual single-value names, Swiss E/N, OpenStreetMap's map=z/lat/lon
  const num = (k: string) => {
    const v = params.get(k)?.trim();
    return v !== undefined && new RegExp(`^${NUM}$`).test(v) ? Number(v) : undefined;
  };
  const osm = new RegExp(`^(\\d{1,2}(?:\\.\\d+)?)/(${NUM})/(${NUM})`).exec(params.get('map') ?? '');
  const mlat = num('mlat');
  const mlon = num('mlon');
  if (mlat !== undefined && mlon !== undefined) return hit(mlat, mlon, osm ? Number(osm[1]) : zoomParam);
  for (const [la, lo] of [['lat', 'lon'], ['lat', 'lng'], ['lat', 'long'], ['latitude', 'longitude']] as const) {
    const [lat, lon] = [num(la), num(lo)];
    if (lat !== undefined && lon !== undefined) return hit(lat, lon, zoomParam);
  }
  for (const key of ['ll', 'q', 'query', 'center', 'coordinate', 'destination', 'daddr', 'sll', 'cp', 'to', 'viewpoint', 'swisssearch']) {
    const v = params.get(key);
    if (v === undefined) continue;
    const r = parseCoordParam(v);
    if (r) return isLocationError(r) ? r : hit(r.lat, r.lon, r.swiss ? undefined : zoomParam);
  }
  for (const [a, b] of [['e', 'n'], ['x', 'y']] as const) {
    const [ea, nb] = [num(a), num(b)];
    const grid = ea !== undefined && nb !== undefined ? gridPair(ea, nb) : undefined;
    if (grid) return hit(grid.lat, grid.lon);
  }
  if (osm) return hit(Number(osm[2]), Number(osm[3]), Number(osm[1]));

  // a place in the path: /maps/place/46.85,9.53, /maps/search/8FVC9G8F+6W, /place/46°51'08"N+9°31'48"E
  const named = segments.findIndex((p) => /^(?:place|search)$/i.test(p));
  if (named >= 0) return fromSegments(segments.slice(named + 1));
  return undefined;
}

/** The whole text is a link, or a link is inside it ('Camp here https://maps.google.com/?q=46.85,9.53'). */
function parseAnyLink(s: string): Result {
  const whole = parseLink(s);
  if (whole) return whole;
  const inside = /(?:https?:\/\/|geo:)\S+/i.exec(s);
  return inside && inside[0] !== s ? parseLink(inside[0].replace(/[)\]>.,;]+$/, '')) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/**
 * Recognises a place in typed or pasted text. Returns the location (`kind` says which format it was),
 * an `error` for text that is recognised but cannot be used ('short-link': a short map link or a short plus
 * code that needs its town; 'out-of-range': latitude beyond 90 or longitude beyond 180), or undefined when
 * the text is not a coordinate (a place name, an address, a postcode, a single number...).
 *
 * Bare pairs of numbers are the only ambiguous format: they need a decimal fraction in both numbers and
 * must lie around Switzerland (lat 42.5-50.5, lon 3-14.5); 'lon, lat' is understood only when the first
 * number is clearly a Swiss longitude (5.9-10.6) and the second a Swiss latitude (45.7-47.9). Everything
 * with a hemisphere letter, a degree mark, a Swiss grid size, a Plus Code or a link may be anywhere on
 * Earth. Swiss grid numbers are told apart by size, so the order (E, N) and the labels (x, y, Y, X, E, N)
 * do not matter; LV03 is converted by adding 2 000 000 and 1 000 000. German 'O' (Ost) means east.
 */
export function parseLocation(input: string): ParsedLocation | LocationError | undefined {
  if (typeof input !== 'string') return undefined;
  const text = unwrap(normalise(input));
  if (text.length === 0 || text.length > 4000) return undefined;
  const link = parseAnyLink(text);
  if (link) return link;
  // a leading 'Coordinates:' and a trailing '(Chur)' or full stop are not part of the coordinate
  const s = text
    .replace(LABEL_RE, '')
    .replace(/\s*\([^()]{1,80}\)[.,;]*$/, '')
    .replace(/([\dNSEWOnsewo"'°])[.,;]+$/, '$1');
  return parsePlusCode(s) ?? parseSwissGrid(s) ?? parseLabelled(s) ?? parseAnglePair(s, false);
}
