import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { decodeReserveSet, parseReserveSet, reserveZoneHits, reservesAt, type ReserveSet } from '../src/reserves';
import fixture from './fixtures/be-reserve-points.json';

const square = (x: number, y: number, s: number) => [x, y, x + s, y, x + s, y + s, x, y + s];
const synthetic = parseReserveSet({
  canton: 'BE',
  generated: 'test',
  reserves: [
    { id: 1, name: 'Ring', level: 'restricted', decree: 'https://x/1.pdf', scan: 'banned', rings: [square(0, 0, 100), square(40, 40, 20)] },
    { id: 2, name: 'Plain', level: 'caution', decree: 'https://x/2.pdf', scan: 'silent', exception: 'Only at marked places.', rings: [square(200, 0, 50)] },
  ],
});

describe('reserve lookup (synthetic)', () => {
  it('finds a point inside, and not outside or in a hole', () => {
    expect(reservesAt(synthetic, 10, 10).map((r) => r.id)).toEqual([1]);
    expect(reservesAt(synthetic, 50, 50)).toEqual([]); // inside the hole
    expect(reservesAt(synthetic, 150, 50)).toEqual([]);
    expect(reservesAt(synthetic, 225, 25).map((r) => r.id)).toEqual([2]);
  });
  it('turns hits into zones with the right severity and detail', () => {
    const [a] = reserveZoneHits(synthetic, 10, 10);
    expect(a?.layer.severity).toBe('restricted');
    expect(a?.detail).toContain('https://x/1.pdf');
    const [b] = reserveZoneHits(synthetic, 225, 25);
    expect(b?.layer.severity).toBe('caution');
    expect(b?.detail).toContain('Only at marked places.');
  });
  it('drives the verdict: decree ban means no, other reserve means caution', () => {
    expect(assess({ zones: reserveZoneHits(synthetic, 10, 10), treeline: 'above' }).verdict).toBe('no');
    expect(assess({ zones: reserveZoneHits(synthetic, 225, 25), treeline: 'above' }).verdict).toBe('caution');
  });
});

describe('real Bern reserves (public/reserves-be.json.gz)', () => {
  let set: ReserveSet;
  beforeAll(async () => {
    const b = readFileSync('public/reserves-be.json.gz');
    set = await decodeReserveSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });
  it('has all 244 reserves, each with a decree link and polygons', () => {
    expect(set.canton).toBe('BE');
    expect(set.reserves).toHaveLength(244);
    for (const r of set.reserves) {
      expect(r.decree).toMatch(/^https:\/\/oerebfiles\.apps\.be\.ch\//);
      expect(r.rings.length).toBeGreaterThan(0);
    }
  });
  it('is in the expected split of decree classifications', () => {
    const n = (l: string) => set.reserves.filter((r) => r.level === l).length;
    expect(n('restricted')).toBeGreaterThan(190);
    expect(n('caution')).toBeGreaterThan(30);
    expect(n('caution')).toBeLessThan(60);
  });
  it('classifies known decrees correctly, including French, entry-ban and OCR\'d scans', () => {
    const by = (id: number) => set.reserves.find((r) => r.id === id)!;
    expect([by(41).scan, by(41).level]).toEqual(['banned', 'restricted']); // Wengimoos: camping and tents named
    expect([by(10).scan, by(10).level]).toEqual(['banned', 'restricted']); // Derrière la Gruère: French decree
    expect([by(47).scan, by(47).level]).toEqual(['banned', 'restricted']); // Grosser Moossee: scan, OCR'd
    expect([by(94).scan, by(94).level]).toEqual(['banned', 'restricted']); // Enggisteinmoos: heavily garbled text
    expect([by(70).scan, by(70).level]).toEqual(['entry', 'restricted']); // Siehenmoos: "das Betreten" prohibited
    expect(set.reserves.every((r) => r.scan !== 'notext')).toBe(true);
  });
  it('an entry-ban reserve explains why camping is prohibited', () => {
    const r = set.reserves.find((x) => x.id === 70)!;
    const [x, y] = [r.rings[0]![0]!, r.rings[0]![1]!];
    // nudge from a vertex toward the bbox centre until inside
    const cx = (r.bbox[0] + r.bbox[2]) / 2, cy = (r.bbox[1] + r.bbox[3]) / 2;
    const p = [0.05, 0.1, 0.2, 0.3, 0.5].map((t) => [x + (cx - x) * t, y + (cy - y) * t] as const).find(([px, py]) => reservesAt(set, px, py).some((q) => q.id === 70))!;
    const hit = reserveZoneHits(set, p[0], p[1]).find((h) => h.name === r.name)!;
    expect(hit.layer.severity).toBe('restricted');
    expect(hit.layer.note).toMatch(/entering/);
  });
  it('contains points taken from inside the source polygons', () => {
    const hits = fixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / fixture.length).toBeGreaterThan(0.95);
  });
  it('does not flag Bern city centre or a high alpine spot', () => {
    expect(reservesAt(set, 2600000, 1199950)).toEqual([]);
    expect(reservesAt(set, 2640000, 1156000)).toEqual([]);
  });
  it('Engstlensee reserve (no. 86) bans camping per its decree', () => {
    const r = set.reserves.find((x) => x.id === 86)!;
    expect(r.name).toMatch(/Engstlensee/);
    expect(r.level).toBe('restricted');
  });
});
