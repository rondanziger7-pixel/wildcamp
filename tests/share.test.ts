import { describe, expect, it } from 'vitest';
import { LONG_LINK, MAX_SHARE_SPOTS, SHARE_PREFIX, decodeShare, encodeShare, isShareHash, shareLink } from '../src/share';

const BASE = 'https://example.github.io/wildcamp/';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');

describe('share links', () => {
  it('carry places with names and notes, and a dated trip, and come back as they went', () => {
    const payload = {
      spots: [
        { lat: 46.50901, lng: 7.75502, name: 'Gasterntal · 1400 m', note: 'Wasser am Bach. Ask the farmer ✓' },
        { lat: 46.6, lng: 8.1, name: 'Grimsel' },
        { lat: 46.7, lng: 8.2 },
      ],
      trip: [{ spot: 0, date: '2026-10-10' }, { spot: 1, date: '2026-10-11' }, { spot: 0, date: '2026-10-12' }],
    };
    const { url } = shareLink(BASE + '#46.5,7.7,14', payload);
    expect(url.startsWith(BASE + '#' + SHARE_PREFIX)).toBe(true);
    expect(url.split('#').length).toBe(2); // the old position in the hash is replaced, not kept
    const got = decodeShare(url.slice(url.indexOf('#')));
    expect(got?.payload).toEqual(payload);
    expect(got?.dropped).toBe(0);
  });
  it('keep the link safe for a message app: URL-safe characters only', () => {
    const { text } = encodeShare({ spots: [{ lat: 46.5, lng: 7.5, name: 'Äusserer Boden / ü?&=#%' }] });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('are short for a normal trip and warn when a link gets long', () => {
    const few = shareLink(BASE, { spots: Array.from({ length: 5 }, (_, i) => ({ lat: 46 + i / 10, lng: 7 + i / 10, name: `Spot ${i}` })) });
    expect(few.url.length).toBeLessThan(500);
    expect(few.long).toBe(false);
    const wordy = Array.from({ length: MAX_SHARE_SPOTS }, (_, i) => ({ lat: 46 + i / 100, lng: 7, name: 'N'.repeat(80), note: 'm'.repeat(200) }));
    const big = shareLink(BASE, { spots: wordy });
    expect(big.url.length).toBeGreaterThan(LONG_LINK);
    expect(big.long).toBe(true);
  });
  it('carry at most MAX_SHARE_SPOTS places and say when they trimmed', () => {
    const many = Array.from({ length: MAX_SHARE_SPOTS + 7 }, (_, i) => ({ lat: 46 + i / 100, lng: 7 }));
    const l = shareLink(BASE, { spots: many });
    expect(l.count).toBe(MAX_SHARE_SPOTS);
    expect(l.trimmed).toBe(true);
    expect(decodeShare(l.url.slice(l.url.indexOf('#')))!.payload.spots).toHaveLength(MAX_SHARE_SPOTS);
  });
  it('cut long notes and drop trip nights that point nowhere', () => {
    const { text } = encodeShare({ spots: [{ lat: 46.5, lng: 7.5, note: 'x'.repeat(900) }], trip: [{ spot: 0, date: '2026-10-10' }, { spot: 4, date: '2026-10-11' }, { spot: 0, date: 'tomorrow' }] });
    const got = decodeShare('#' + SHARE_PREFIX + text)!;
    expect(got.payload.spots[0]!.note).toHaveLength(200);
    expect(got.payload.trip).toEqual([{ spot: 0, date: '2026-10-10' }]);
  });
  it('are recognised by the fragment', () => {
    expect(isShareHash('#share=abc')).toBe(true);
    expect(isShareHash('share=abc')).toBe(true);
    expect(isShareHash('#46.5,7.5,14')).toBe(false);
    expect(isShareHash('')).toBe(false);
  });
});

describe('reading a link from somebody else', () => {
  const ok = (rows: unknown[], trip?: unknown) => '#' + SHARE_PREFIX + b64(trip === undefined ? [1, rows] : [1, rows, trip]);
  it('turns away garbage, other versions and empty lists', () => {
    for (const h of ['#share=', '#share=!!!', '#share=' + b64({ a: 1 }), '#share=' + b64([2, [[46.5, 7.5]]]), '#share=' + b64([1, []]), '#share=' + b64([1, 'x']), '#share=' + Buffer.from([0xff, 0xfe, 0x80]).toString('base64url'), '#share=' + 'A'.repeat(50000), '#nothing']) {
      expect(decodeShare(h), h.slice(0, 40)).toBeUndefined();
    }
  });
  it('drops places outside the area or that are not coordinates, and counts them', () => {
    const got = decodeShare(ok([[46.5, 7.5, 'ok'], [48.85, 2.35, 'Paris'], ['a', 'b'], [46.6], null, [46.7, 8.5], [0, 0]]));
    expect(got!.payload.spots.map((s) => s.name)).toEqual(['ok', undefined]);
    expect(got!.dropped).toBe(5);
  });
  it('cleans names and notes: no control characters, no markup kept as markup, limits applied', () => {
    const got = decodeShare(ok([[46.5, 7.5, '<img src=x onerror=alert(1)>\u0007Camp\n\n', 'line 1\r\nline 2\u0000' + 'z'.repeat(2000)]]));
    const s = got!.payload.spots[0]!;
    expect(s.name).not.toMatch(/[\u0000-\u001f]/);
    expect(s.name).toContain('Camp');
    expect(s.note).not.toContain('\u0000');
    expect(s.note!.length).toBeLessThanOrEqual(500);
    // the text is stored as text: the view sets textContent, so the angle brackets are harmless there
    expect(s.name).toContain('<img');
  });
  it('keeps only trip nights that point at kept places on real, distinct dates', () => {
    const rows = [[46.5, 7.5, 'a'], [48.85, 2.35, 'Paris'], [46.6, 7.6, 'b']];
    const got = decodeShare(ok(rows, [[0, '2026-10-10'], [1, '2026-10-11'], [2, '2026-10-12'], [2, '2026-10-12'], [2, '2026-02-30'], [9, '2026-10-13'], ['0', '2026-10-14'], [0, 5]]));
    // Paris was dropped, so "b" is now place 1
    expect(got!.payload.trip).toEqual([{ spot: 0, date: '2026-10-10' }, { spot: 1, date: '2026-10-12' }]);
  });
  it('rounds positions to a metre and accepts the hash with or without #', () => {
    const got = decodeShare(ok([[46.123456789, 7.987654321]]).slice(1));
    expect(got!.payload.spots[0]).toEqual({ lat: 46.12346, lng: 7.98765 });
  });
});
