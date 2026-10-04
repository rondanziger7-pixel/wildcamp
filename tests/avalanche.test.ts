import { describe, expect, it } from 'vitest';
import bulletin from './fixtures/avalanche-bulletin.json';
import { bandText, bulletinAt, inGeometry, type BulletinCollection } from '../src/comfort/avalanche';
import { comfortFor } from '../src/comfort/comfort';
import { summariseNight, type Hourly } from '../src/comfort/weather';

const fc = bulletin as unknown as BulletinCollection;
const during = new Date('2026-05-17T20:00:00Z'); // inside the real bulletin's validity (15:00 to next day 15:00)

describe('avalanche bulletin (real SLF response from 17 May 2026)', () => {
  it('finds the bulletin covering a point and reads its rating and problems', () => {
    const a = bulletinAt(fc, 46.681, 8.5004, during);
    expect(a.status).toBe('ok');
    expect(a.level).toBe(2);
    expect(a.subdivision).toBe('plus');
    expect(a.problems!.map((p) => p.type)).toEqual(expect.arrayContaining(['new snow', 'persistent weak layers', 'wet snow']));
    expect(a.problems!.find((p) => p.type === 'new snow')).toMatchObject({ above: 2400, aspects: ['N', 'NE', 'E', 'NW'] });
    expect(a.validUntil).toBe('2026-05-18T15:00:00.000Z');
    expect(a.validUntilLocal).toBe('2026-05-18T17:00');
  });
  it('says outside for a point no polygon covers', () => {
    expect(bulletinAt(fc, 47.4, 9.9, during).status).toBe('outside');
  });
  it('treats an expired or not yet valid bulletin as none, as in summer', () => {
    expect(bulletinAt(fc, 46.681, 8.5004, new Date('2026-10-04T10:00:00Z')).status).toBe('none');
    expect(bulletinAt(fc, 46.681, 8.5004, new Date('2026-05-10T10:00:00Z')).status).toBe('none');
    expect(bulletinAt({ features: [] }, 46.6, 8.5, during).status).toBe('none');
    expect(bulletinAt(undefined, 46.6, 8.5, during).status).toBe('none');
  });
  it('takes the highest rating of the day and ignores unknown values', () => {
    const f = (ratings: unknown[]) => ({ features: [{ geometry: { type: 'Polygon', coordinates: [[[8, 46], [9, 46], [9, 47], [8, 47], [8, 46]]] }, properties: { validTime: { startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-02T00:00:00Z' }, dangerRatings: ratings, avalancheProblems: [{ problemType: 'favourable_situation' }, { problemType: 'wind_slab', aspects: ['N'], elevation: { lowerBound: '2000', upperBound: '2800' } }] } }] }) as unknown as BulletinCollection;
    const now = new Date('2026-01-01T12:00:00Z');
    const a = bulletinAt(f([{ mainValue: 'considerable', validTimePeriod: 'all_day' }, { mainValue: 'high', validTimePeriod: 'later' }, { mainValue: 'bogus' }]), 46.5, 8.5, now);
    expect(a.level).toBe(4);
    expect(a.problems).toEqual([{ type: 'wind slabs', aspects: ['N'], above: 2000, below: 2800 }]);
    expect(bulletinAt(f([{ mainValue: 'bogus' }]), 46.5, 8.5, now).status).toBe('outside');
  });
  it('respects holes in polygons', () => {
    const g = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
    expect(inGeometry(g, 2, 2)).toBe(true);
    expect(inGeometry(g, 5, 5)).toBe(false);
    expect(inGeometry({ type: 'Point', coordinates: [1, 1] }, 1, 1)).toBe(false);
  });
  it('words elevation bands', () => {
    expect(bandText(2400)).toBe('above 2400 m');
    expect(bandText(undefined, 2000)).toBe('below 2000 m');
    expect(bandText(2000, 2600)).toBe('2000 to 2600 m');
    expect(bandText()).toBe('at all elevations');
  });
});

describe('avalanche and snow factors', () => {
  const night = (snowDepthM?: number, from = '2026-05-17T18:00') => ({ from, to: '2026-05-18T08:00', minTempC: 0, maxGustKmh: 10, meanWindKmh: 5, windFromDeg: 0, precipMm: 0, thunder: false, snowDepthM });
  const terrain = (steep: boolean) => ({ elevation: 2500, slopeDeg: steep ? 30 : 3, horizon: Array(8).fill(10), meanHorizon: 10, tpi: 0, steepAboveM: steep ? 50 : undefined, dropNearM: undefined });
  const av = (level: number) => ({ status: 'ok' as const, level, subdivision: 'neutral', problems: [{ type: 'wind slabs', aspects: ['N'], above: 2400 }], region: 'Gadmertal', validUntil: '2026-05-18T15:00:00.000Z', validUntilLocal: '2026-05-18T17:00' });
  const run = (level: number, steep: boolean, n = night()) => comfortFor({ terrain: terrain(steep), night: n, avalanche: av(level) });
  const title = (c: ReturnType<typeof comfortFor>) => c.weatherFactors.find((f) => f.title.startsWith('Avalanche'))!;
  it('moderate and low are information only', () => {
    expect(title(run(2, true))).toMatchObject({ tone: 'info' });
    expect(title(run(1, false))).toMatchObject({ tone: 'info' });
  });
  it('considerable and high weigh more near steep terrain', () => {
    const flat = run(2, false).score;
    const steep = run(2, true).score;
    expect(run(3, false).score).toBe(flat - 1);
    expect(run(3, true).score).toBe(steep - 2);
    expect(run(4, false).score).toBe(flat - 2);
    expect(run(5, true).score).toBe(steep - 4);
    expect(title(run(4, true)).tone).toBe('bad');
    expect(title(run(3, true)).text).toMatch(/wind slabs on N slopes above 2400 m/);
  });
  it('counts as weather, not as the spot', () => {
    const c = run(3, true);
    expect(c.weatherFactors.some((f) => f.title.startsWith('Avalanche'))).toBe(true);
    expect(c.spotFactors.some((f) => f.title.startsWith('Avalanche'))).toBe(false);
    expect(c.weatherScore).toBeLessThan(run(2, true).weatherScore);
  });
  it('a bulletin that ends before the night does not count', () => {
    const c = run(4, true, night(undefined, '2026-05-19T18:00'));
    expect(title(c)).toMatchObject({ tone: 'info', title: 'Avalanche bulletin ends before this night' });
    expect(c.score).toBe(run(2, true).score);
  });
  it('says so when no bulletin is published, only high up, and lists a failed fetch as missing', () => {
    const none = comfortFor({ terrain: terrain(false), night: night(), avalanche: { status: 'none' } });
    expect(none.weatherFactors.map((f) => f.title)).toContain('No avalanche bulletin');
    expect(comfortFor({ terrain: { ...terrain(false), elevation: 900 }, night: night(), avalanche: { status: 'none' } }).weatherFactors.map((f) => f.title)).not.toContain('No avalanche bulletin');
    expect(comfortFor({ avalancheFailed: true }).missing).toContain('avalanche bulletin');
    expect(comfortFor({}).missing).not.toContain('avalanche bulletin');
  });
  it('snow depth from the forecast model: none below 5 cm, then minus 1 and minus 2', () => {
    const t = (d?: number) => comfortFor({ terrain: terrain(false), night: night(d) });
    expect(t(0.03).weatherFactors.some((f) => f.title.startsWith('Snow on the ground'))).toBe(false);
    expect(t(0.12).weatherFactors.find((f) => f.title.startsWith('Snow on the ground'))).toMatchObject({ title: 'Snow on the ground: about 12 cm', tone: 'warn' });
    expect(t(0.12).score).toBe(t(0).score - 1);
    expect(t(0.4).score).toBe(t(0).score - 2);
  });
  it('reads snow depth into the night summary', () => {
    const time = Array.from({ length: 14 }, (_, i) => `2026-05-17T${String(18 + i).padStart(2, '0')}:00`.replace(/T(2[4-9]|3\d)/, (_, h) => `T${String(Number(h) - 24).padStart(2, '0')}`));
    const hourly = { time: [...time.slice(0, 6), ...Array.from({ length: 8 }, (_, i) => `2026-05-18T${String(i).padStart(2, '0')}:00`)], temperature_2m: Array(14).fill(1), wind_speed_10m: Array(14).fill(5), wind_gusts_10m: Array(14).fill(9), wind_direction_10m: Array(14).fill(90), precipitation: Array(14).fill(0), snow_depth: [0, 0, 0.1, 0.2, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0] } as Hourly;
    expect(summariseNight(hourly, { from: '2026-05-17T18:00', to: '2026-05-18T08:00' })?.snowDepthM).toBeCloseTo(0.2, 6);
    expect(summariseNight({ ...hourly, snow_depth: undefined }, { from: '2026-05-17T18:00', to: '2026-05-18T08:00' })?.snowDepthM).toBeUndefined();
  });
});
