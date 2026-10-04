import { describe, expect, it } from 'vitest';
import data from './fixtures/shelters.json';
import { comfortFor } from '../src/comfort/comfort';
import { classifyShelter, isClubHut, placeShelters, shelterCandidates, type ShelterResult } from '../src/comfort/shelters';

type Fx = { e: number; n: number; results: never[]; geoms: Record<string, { type: string; coordinates: unknown }> };
const D = data as unknown as Record<string, Fx>;
const at = (k: string) => {
  const f = D[k]!;
  const c = shelterCandidates({ results: f.results });
  return placeShelters(c, c.map((x) => f.geoms[String((f.results as { featureId: number; attributes: { name: string } }[]).find((r) => r.attributes.name === x.name)!.featureId)]), f.e, f.n);
};

describe('classifying swissNAMES3D names (names taken from real data)', () => {
  it('club huts, Italian rifugi and capanne, bivouac boxes', () => {
    expect(classifyShelter('Fründenhütte SAC', 'Gebaeude')).toBe('hut');
    expect(classifyShelter('Blüemlisalphütte SAC', 'Gebaeude')).toBe('hut'); // a club hut despite "alphütte" in the name
    expect(classifyShelter('Capanna Barone', 'Gebaeude')).toBe('hut');
    expect(classifyShelter('Rifugio Pradói', 'Gebaeude')).toBe('hut');
    expect(classifyShelter('Chamanna Val Champagna', 'Gebaeude')).toBe('hut');
    expect(classifyShelter('Cabane de Moiry CAS', 'Gebaeude')).toBe('hut');
    expect(classifyShelter('Biwak Rothorn', 'Gebaeude')).toBe('biwak');
    expect(classifyShelter('Bivacco Gandini', 'Gebaeude')).toBe('biwak');
  });
  it('inns and restaurants are not huts, even with hütte in the name', () => {
    expect(classifyShelter('Berghaus Oberbärgli', 'Gebaeude')).toBe('inn');
    expect(classifyShelter('Restaurant zur Sennhütte', 'Gebaeude')).toBe('inn');
    expect(classifyShelter('Berghotel Oeschinensee', 'Gebaeude')).toBe('inn');
    expect(classifyShelter('Buvette Sur En', 'Gebaeude')).toBe('inn');
  });
  it('alp buildings and named alps', () => {
    expect(classifyShelter('Obere Dündenalphütte', 'Gebaeude')).toBe('alp');
    expect(classifyShelter('Sennhütte Läger', 'Gebaeude')).toBe('alp');
    expect(classifyShelter('Alp Müsella', 'Gebiet')).toBe('alp');
    expect(classifyShelter('Alpe Barone', 'Lokalname swisstopo')).toBe('alp');
    expect(classifyShelter('Alp Muottas', 'Gebiet')).toBe('alp');
  });
  it('things that are not shelters', () => {
    expect(classifyShelter('Hüttenbergli', 'Hauptgipfel')).toBeUndefined();
    expect(classifyShelter('Alpstein', 'Gebiet')).toBeUndefined();
    expect(classifyShelter('Alpiglen', 'Ort')).toBeUndefined();
    expect(classifyShelter('Fründenhütte SAC', 'Gipfel')).toBeUndefined(); // wrong object type
    expect(classifyShelter(undefined, 'Gebaeude')).toBeUndefined();
    expect(classifyShelter('X', null)).toBeUndefined();
  });
  it('recognises club names', () => {
    expect(isClubHut('Fründenhütte SAC')).toBe(true);
    expect(isClubHut('Cabane de Moiry CAS')).toBe(true);
    expect(isClubHut('Capanna Cristallina CAS')).toBe(true);
    expect(isClubHut('Hüttenbergli')).toBe(false);
  });
});

describe('shelters around real spots', () => {
  it('Oeschinensee north shore: inns at the lake, club huts a few km up', () => {
    const s = at('oeschinen');
    expect(s.length).toBeGreaterThan(5);
    expect(s[0]!.kind).toBe('inn');
    expect(s.map((x) => x.meters)).toEqual([...s.map((x) => x.meters)].sort((a, b) => a - b));
    const fr = s.find((x) => x.name === 'Fründenhütte SAC')!;
    expect(fr.kind).toBe('hut');
    expect(fr.club).toBe(true);
    expect(fr.meters).toBeGreaterThan(1500);
    expect(fr.meters).toBeLessThan(3500);
    expect(s.find((x) => x.name === 'Blüemlisalphütte SAC')?.kind).toBe('hut');
  });
  it('Capanna Barone is the nearest shelter near the Barone spot', () => {
    const s = at('barone');
    expect(s[0]).toMatchObject({ kind: 'hut', name: 'Capanna Barone' });
    expect(s[0]!.meters).toBeLessThan(300);
  });
  it('the Gotthard spot has a club hut and an inn but no alp within 5 km in the data', () => {
    const s = at('gotthard');
    expect(s.some((x) => x.club)).toBe(true);
    expect(s.every((x) => x.meters <= 5000)).toBe(true);
  });
  it('drops shelters beyond 5 km and ones whose position is missing', () => {
    const far = placeShelters([{ name: 'Far hut', kind: 'hut' }, { name: 'Lost hut', kind: 'hut' }], [{ type: 'Point', coordinates: [6000, 0] }, undefined], 0, 0);
    expect(far).toEqual([]);
  });
});

describe('what shelters do to the comfort result', () => {
  const res = (shelters: ShelterResult['shelters'], incomplete = false): ShelterResult => ({ shelters, incomplete });
  const titles = (r?: ShelterResult) => comfortFor({ shelters: r }).factors.map((f) => f.title);
  it('a hut within 1.5 km scores +1, a farther one 0, and says distances are straight lines', () => {
    const near = comfortFor({ shelters: res([{ name: 'Capanna Barone', kind: 'hut', meters: 190, at: { e: 0, n: 0 } }]) });
    expect(near.score).toBe(1);
    expect(near.factors[0]).toMatchObject({ title: 'Mountain hut nearby', tone: 'ok' });
    expect(near.factors[0]!.text).toMatch(/straight line/);
    expect(near.factors[0]!.text).toMatch(/staffed only in summer/);
    const far = comfortFor({ shelters: res([{ name: 'Fründenhütte SAC', kind: 'hut', meters: 2433, club: true, at: { e: 0, n: 0 } }]) });
    expect(far.score).toBe(0);
    expect(far.factors[0]!.title).toBe('Mountain hut within 5 km');
    expect(far.factors[0]!.text).toMatch(/club hut/);
  });
  it('a bivouac shelter is named as such', () => {
    expect(titles(res([{ name: 'Rothorn', kind: 'biwak', meters: 900, at: { e: 0, n: 0 } }]))).toContain('Bivouac shelter nearby');
  });
  it('no hut within 5 km is stated, but only when the lookup was complete', () => {
    expect(titles(res([]))).toContain('No hut within 5 km');
    expect(titles(res([], true))).not.toContain('No hut within 5 km');
    expect(comfortFor({ shelters: res([], true) }).missing).toContain('huts nearby');
    expect(comfortFor({}).missing).toContain('huts nearby');
  });
  it('inns and alps are information only and are described honestly', () => {
    const c = comfortFor({ shelters: res([{ name: 'Berghaus X', kind: 'inn', meters: 700, at: { e: 0, n: 0 } }, { name: 'Alp Y', kind: 'alp', meters: 1200, at: { e: 0, n: 0 } }]) });
    expect(c.factors.find((f) => f.title === 'Mountain inn nearby')!.text).toMatch(/open only in season/);
    expect(c.factors.find((f) => f.title === 'Alp nearby')!.text).toMatch(/private and locked outside the summer season/);
    expect(c.score).toBe(0);
  });
  it('an alp farther than 3 km is not mentioned', () => {
    expect(titles(res([{ name: 'Alp Y', kind: 'alp', meters: 3500, at: { e: 0, n: 0 } }]))).not.toContain('Alp nearby');
  });
  it('storm warnings name the nearest hut', () => {
    const c = comfortFor({
      shelters: res([{ name: 'Capanna Barone', kind: 'hut', meters: 800, at: { e: 0, n: 0 } }]),
      night: { from: 'a', to: 'b', minTempC: 5, maxGustKmh: 95, meanWindKmh: 50, windFromDeg: 270, precipMm: 0, thunder: true },
    });
    for (const t of ['Thunderstorm forecast', 'Storm-force gusts']) expect(c.factors.find((f) => f.title === t)!.text).toMatch(/Capanna Barone, is about 800 m away/);
    expect(c.weatherStop).toBe(true);
  });
});
