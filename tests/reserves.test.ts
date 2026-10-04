import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { decodeReserveSet, parseReserveSet, reserveZoneHits, reservesAt, type ReserveSet } from '../src/reserves';
import { wgs84ToLv95 } from '../src/coords';
import fixture from './fixtures/be-reserve-points.json';
import tiFixture from './fixtures/ti-reserve-points.json';
import vsFixture from './fixtures/vs-reserve-points.json';
import geFixture from './fixtures/ge-reserve-points.json';
import glFixture from './fixtures/gl-reserve-points.json';
import luFixture from './fixtures/lu-reserve-points.json';
import frFixture from './fixtures/fr-reserve-points.json';

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

describe('real Ticino protection areas (public/reserves-ti.json.gz)', () => {
  let set: ReserveSet;
  beforeAll(async () => {
    const b = readFileSync('public/reserves-ti.json.gz');
    set = await decodeReserveSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });
  it('has the 351 in-force polygons, each linked to a decree PDF on ti.ch', () => {
    expect(set.canton).toBe('TI');
    expect(set.reserves).toHaveLength(351);
    for (const r of set.reserves) {
      expect(r.decree).toMatch(/^https:\/\/www4\.ti\.ch\/.+\.pdf$/);
      expect(r.scan).not.toBe('notext');
    }
  });
  it('splits decrees into camping bans and silent ones', () => {
    const banned = set.reserves.filter((r) => r.level === 'restricted').length;
    expect(banned).toBeGreaterThan(250);
    expect(set.reserves.length - banned).toBeGreaterThan(40);
  });
  it('contains points taken from inside the source polygons', () => {
    const hits = tiFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / tiFixture.length).toBeGreaterThan(0.93);
  });
  it('Bolle di Magadino bans camping per its ordinance, with the zone C exception', () => {
    const { e, n } = wgs84ToLv95(46.156, 8.862);
    const hits = reserveZoneHits(set, e, n);
    expect(hits.length).toBeGreaterThan(0);
    const ban = hits.find((h) => h.layer.severity === 'restricted')!;
    expect(ban.layer.label).toMatch(/Ticino/);
    expect(ban.name).toMatch(/Bolle di Magadino/);
    expect(ban.detail).not.toMatch(/zone C/); // this point is in the absolute protection zone A
    expect(assess({ zones: hits, treeline: 'above' }).verdict).toBe('no');
    // the zone C exception is carried only by zone C polygons
    const zoneC = set.reserves.filter((r) => /Bolle di Magadino/.test(r.name) && /\(C:/.test(r.name));
    expect(zoneC.length).toBeGreaterThan(0);
    expect(zoneC.every((r) => /zone C/.test(r.exception ?? ''))).toBe(true);
  });
  it('does not flag Lugano city centre or Gornergrat', () => {
    expect(reservesAt(set, ...(Object.values(wgs84ToLv95(46.0037, 8.9511)) as [number, number]))).toEqual([]);
  });
});

describe('real Valais protected sites (public/reserves-vs.json.gz)', () => {
  let set: ReserveSet;
  beforeAll(async () => {
    const b = readFileSync('public/reserves-vs.json.gz');
    set = await decodeReserveSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });
  it('has the 100 sites, each linked to its decision on lex.vs.ch', () => {
    expect(set.canton).toBe('VS');
    expect(set.reserves).toHaveLength(100);
    for (const r of set.reserves) {
      expect(r.decree).toMatch(/^https:\/\/lex\.vs\.ch\/app\/fr\/texts_of_law\/45\d\.\d+$/);
      expect(r.scan).not.toBe('notext');
    }
  });
  it('classifies known decisions: bans, entry bans, and the Sand permission', () => {
    const by = (prefix: string) => set.reserves.find((r) => r.name.startsWith(prefix))!;
    expect([by('Aletschwald').scan, by('Aletschwald').level]).toEqual(['banned', 'restricted']);
    expect([by('Pfynwald').scan, by('Pfynwald').level]).toEqual(['banned', 'restricted']);
    expect([by('Marais de Champex').scan, by('Marais de Champex').level]).toEqual(['entry', 'restricted']);
    expect(by('Sand').level).toBe('caution'); // the commune may authorise camping temporarily: not a ban
    expect(by('Lac Noir').level).toBe('caution'); // long prohibition list without camping
  });
  it('contains points taken from inside the source polygons', () => {
    const hits = vsFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / vsFixture.length).toBeGreaterThan(0.93);
  });
  it('flags a point inside the Aletschwald site as not allowed, and not Zermatt village', () => {
    const al = set.reserves.find((r) => r.name.startsWith('Aletschwald'))!;
    const [x, y] = [al.rings[0]![0]!, al.rings[0]![1]!];
    const cx = (al.bbox[0] + al.bbox[2]) / 2, cy = (al.bbox[1] + al.bbox[3]) / 2;
    const p = [0.05, 0.1, 0.2, 0.3, 0.5].map((t) => [x + (cx - x) * t, y + (cy - y) * t] as const).find(([px, py]) => reservesAt(set, px, py).some((q) => q.id === al.id))!;
    expect(assess({ zones: reserveZoneHits(set, p[0], p[1]), treeline: 'above' }).verdict).toBe('no');
    expect(reservesAt(set, ...(Object.values(wgs84ToLv95(46.0207, 7.7491)) as [number, number]))).toEqual([]);
  });
});

describe('cantons built from their own data (Geneva, Glarus)', () => {
  const load = async (file: string) => {
    const b = readFileSync(file);
    return decodeReserveSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  it('Geneva: nature reserves are prohibited by regulation, with the legal basis cited', async () => {
    const set = await load('public/reserves-ge.json.gz');
    expect(set.canton).toBe('GE');
    expect(set.reserves.length).toBe(68);
    expect(set.reserves.filter((r) => r.level === 'restricted').length).toBeGreaterThan(60);
    const hits = geFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / geFixture.length).toBeGreaterThan(0.9);
    const p = geFixture.find((q) => set.reserves.find((r) => r.id === q.id)?.level === 'restricted')!;
    const zone = reserveZoneHits(set, p.e, p.n).find((h) => h.layer.severity === 'restricted')!;
    expect(zone.layer.label).toBe('Geneva nature reserve');
    expect(zone.layer.note).toMatch(/Art\. 19/);
    expect(zone.detail).toContain('https://silgeneve.ch/legis/data/rsg_l4_05p11.htm');
    expect(assess({ zones: [zone], treeline: 'above' }).verdict).toBe('no');
  });
  it('Glarus: protected areas only trigger caution and say the rules were not checked', async () => {
    const set = await load('public/reserves-gl.json.gz');
    expect(set.reserves.length).toBeGreaterThan(8);
    expect(set.reserves.every((r) => r.level === 'caution' && r.scan === 'unchecked')).toBe(true);
    const hits = glFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / glFixture.length).toBeGreaterThan(0.85);
    const p = glFixture[0]!;
    const zone = reserveZoneHits(set, p.e, p.n)[0]!;
    expect(zone.layer.note).toMatch(/not checked/);
    expect(zone.detail ?? '').not.toMatch(/Decree/);
    expect(assess({ zones: [zone], treeline: 'above' }).verdict).toBe('caution');
  });
  // Fixture points for LU/FR are interior points of the stored polygons (not re-fetched from the source).
  it('Lucerne: ordinances that ban camping make the area restricted, the rest only caution', async () => {
    const set = await load('public/reserves-lu.json.gz');
    expect(set.canton).toBe('LU');
    expect(set.reserves.filter((r) => r.scan === 'banned').every((r) => r.level === 'restricted')).toBe(true);
    expect(set.reserves.filter((r) => r.scan === 'silent').every((r) => r.level === 'caution')).toBe(true);
    const hits = luFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / luFixture.length).toBeGreaterThan(0.9);
    const p = luFixture.find((q) => set.reserves.find((r) => r.id === q.id)?.level === 'restricted')!;
    const zone = reserveZoneHits(set, p.e, p.n).find((h) => h.layer.severity === 'restricted')!;
    expect(assess({ zones: [zone], treeline: 'above' }).verdict).toBe('no');
  });
  it('Fribourg: reserves are caution only, since their rules were not checked', async () => {
    const set = await load('public/reserves-fr.json.gz');
    expect(set.canton).toBe('FR');
    expect(set.reserves.every((r) => r.level === 'caution' && r.scan === 'unchecked')).toBe(true);
    const hits = frFixture.filter((p) => reservesAt(set, p.e, p.n).some((r) => r.id === p.id)).length;
    expect(hits / frFixture.length).toBeGreaterThan(0.9);
    const p = frFixture[0]!;
    const zone = reserveZoneHits(set, p.e, p.n)[0]!;
    expect(zone.layer.note).toMatch(/not checked/);
    expect(assess({ zones: [zone], treeline: 'above' }).verdict).toBe('caution');
  });
});
