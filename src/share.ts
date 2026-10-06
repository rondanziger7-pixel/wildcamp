import { addDays } from './comfort/weather';
import { cleanName, cleanNote, type ImportedSpot } from './saved';

/**
 * Share links: places, names and notes, optionally a dated trip, packed into the part of the address after `#share=`.
 * Nothing is sent anywhere (the address never leaves the two phones), and no scores travel with it: whoever opens a link
 * checks the places for themselves, with today's rules and forecast, instead of trusting a number from another day.
 */

export interface SharedNight {
  /** Index into `spots`. */
  spot: number;
  /** The evening, "YYYY-MM-DD". */
  date: string;
}

export interface SharePayload {
  spots: ImportedSpot[];
  trip?: SharedNight[];
}

export const SHARE_PREFIX = 'share=';
/** Places in one link: more than this and the address gets too long for a message app. */
export const MAX_SHARE_SPOTS = 40;
/** Notes in a link are cut shorter than the notes kept on the phone. */
const SHARE_NOTE = 200;
/** An address longer than this is warned about: some apps cut or refuse it. */
export const LONG_LINK = 6000;
const MAX_HASH = 40000;

/** The area the app covers, a little generous: a place outside it is turned away on import. */
const AREA = { south: 45.7, north: 47.9, west: 5.8, east: 10.7 };
const inArea = (lat: number, lng: number) => lat >= AREA.south && lat <= AREA.north && lng >= AREA.west && lng <= AREA.east;

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The payload as text for the address: `[1, [[lat, lng, name, note?], ...], [[spotIndex, date], ...]]`, UTF-8, base64url. */
export function encodeShare(p: SharePayload): { text: string; count: number; trimmed: boolean } {
  const spots = p.spots.slice(0, MAX_SHARE_SPOTS);
  const rows = spots.map((s) => {
    const name = cleanName(s.name ?? '');
    const note = s.note ? cleanNote(s.note).slice(0, SHARE_NOTE) : '';
    return note ? [round5(s.lat), round5(s.lng), name, note] : name ? [round5(s.lat), round5(s.lng), name] : [round5(s.lat), round5(s.lng)];
  });
  const trip = (p.trip ?? []).filter((n) => n.spot >= 0 && n.spot < spots.length && isDay(n.date)).map((n) => [n.spot, n.date]);
  const body: unknown[] = [1, rows];
  if (trip.length) body.push(trip);
  return { text: toBase64Url(JSON.stringify(body)), count: spots.length, trimmed: p.spots.length > spots.length };
}

/** `https://…/wildcamp/#share=…` for the page the app is served from. */
export function shareLink(base: string, p: SharePayload): { url: string; count: number; trimmed: boolean; long: boolean } {
  const e = encodeShare(p);
  const url = `${base.split('#')[0]}#${SHARE_PREFIX}${e.text}`;
  return { url, count: e.count, trimmed: e.trimmed, long: url.length > LONG_LINK };
}

export interface DecodedShare {
  payload: SharePayload;
  /** Places in the link that were turned away (outside the area the app covers, or not coordinates). */
  dropped: number;
}

/** Whether an address fragment ("#share=…") is a share link. */
export const isShareHash = (hash: string) => hash.replace(/^#/, '').startsWith(SHARE_PREFIX);

/**
 * Read a share link's fragment. Anything that does not fit (a broken or hostile link, an unknown version, no usable place) gives
 * `undefined`; places outside the area are dropped and counted; names and notes are cleaned before they are used.
 */
export function decodeShare(hash: string): DecodedShare | undefined {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(SHARE_PREFIX) || raw.length > MAX_HASH) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(fromBase64Url(raw.slice(SHARE_PREFIX.length)));
  } catch {
    return undefined;
  }
  if (!Array.isArray(body) || body[0] !== 1 || !Array.isArray(body[1])) return undefined;
  const spots: ImportedSpot[] = [];
  const index = new Map<number, number>(); // position in the link → position in the kept list
  let dropped = 0;
  (body[1] as unknown[]).slice(0, MAX_SHARE_SPOTS * 2).forEach((row, i) => {
    if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'number' || !Number.isFinite(row[0]) || !Number.isFinite(row[1]) || !inArea(row[0], row[1])) {
      dropped++;
      return;
    }
    if (spots.length >= MAX_SHARE_SPOTS) {
      dropped++;
      return;
    }
    index.set(i, spots.length);
    const name = typeof row[2] === 'string' ? cleanName(row[2]) : '';
    const note = typeof row[3] === 'string' ? cleanNote(row[3]) : '';
    spots.push({ lat: round5(row[0]), lng: round5(row[1]), ...(name ? { name } : {}), ...(note ? { note } : {}) });
  });
  if (!spots.length) return undefined;
  const trip: SharedNight[] = [];
  if (Array.isArray(body[2])) {
    const seen = new Set<string>();
    for (const n of body[2] as unknown[]) {
      if (!Array.isArray(n) || typeof n[0] !== 'number' || !isDay(n[1])) continue;
      const spot = index.get(n[0]);
      if (spot === undefined || seen.has(n[1])) continue;
      seen.add(n[1]);
      trip.push({ spot, date: n[1] });
    }
  }
  return { payload: { spots, ...(trip.length ? { trip } : {}) }, dropped };
}
