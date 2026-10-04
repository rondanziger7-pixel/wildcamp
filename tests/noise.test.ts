import { describe, expect, it } from 'vitest';
import road from './fixtures/noise-road.json';
import none from './fixtures/noise-none.json';
import { parseNoise, type NoiseInfo } from '../src/comfort/noise';
import { comfortFor } from '../src/comfort/comfort';
import type { ShelterResult } from '../src/comfort/shelters';

describe('noise (real BAFU GetFeatureInfo responses)', () => {
  it('reads the night dB(A) value', () => {
    expect(parseNoise(road as never)).toBeGreaterThan(30);
    expect(parseNoise(none as never)).toBeUndefined();
    expect(parseNoise({})).toBeUndefined();
    expect(parseNoise({ features: [{ properties: { value_0: 'n/a' } }, { properties: { value_0: '47.5' } }] })).toBe(47.5);
  });
});

describe('noise factors', () => {
  const n = (over: Partial<NoiseInfo>): NoiseInfo => ({ failed: [], ...over });
  const run = (noise: NoiseInfo) => comfortFor({ noise });
  const title = (c: ReturnType<typeof comfortFor>) => c.factors.map((f) => f.title);
  it('50-ish dB is a warning, 55+ is red, 35 to 45 is information, below is nothing', () => {
    expect(run(n({ roadDb: 44.6 })).factors[0]).toMatchObject({ tone: 'warn', title: 'Road noise at night: 45 dB(A)' }); // classified on the rounded value shown
    expect(run(n({ roadDb: 49.6 })).factors[0]).toMatchObject({ tone: 'warn', title: 'Road noise at night: 50 dB(A)' });
    expect(run(n({ roadDb: 56 })).factors[0]).toMatchObject({ tone: 'bad' });
    expect(run(n({ roadDb: 40 })).factors[0]).toMatchObject({ tone: 'info', title: 'Faint road noise at night: 40 dB(A)' });
    expect(run(n({ roadDb: 20 })).factors).toEqual([]);
    expect(run(n({ railDb: 47 })).factors[0]!.title).toBe('Rail noise at night: 47 dB(A)');
  });
  it('scores minus 1 and minus 2, and road and rail add up', () => {
    expect(run(n({ roadDb: 47 })).score).toBe(-1);
    expect(run(n({ roadDb: 60 })).score).toBe(-2);
    expect(run(n({ roadDb: 47, railDb: 60 })).score).toBe(-3);
  });
  it('no modelled noise is stated once, without a score, and failures are listed as missing', () => {
    const c = run(n({}));
    expect(title(c)).toEqual(['No modelled traffic noise']);
    expect(c.score).toBe(0);
    expect(run(n({ failed: ['road'] })).missing).toContain('night noise');
    expect(comfortFor({ noiseFailed: true }).missing).toContain('night noise');
    expect(comfortFor({}).missing).not.toContain('night noise');
  });
});

describe('cowbells near alps', () => {
  const alps = (meters: number): ShelterResult => ({ incomplete: false, shelters: [{ name: 'Alp Oberberg', kind: 'alp', meters, at: { e: 0, n: 0 } }] });
  const night = (from: string) => ({ from, to: from.slice(0, 8) + '30T08:00', minTempC: 8, maxGustKmh: 10, meanWindKmh: 5, windFromDeg: 0, precipMm: 0, thunder: false }) as never;
  const has = (c: ReturnType<typeof comfortFor>) => c.factors.some((f) => f.title === 'Cowbells and livestock likely');
  it('warns for an alp within 500 m in June to September only', () => {
    expect(has(comfortFor({ shelters: alps(300), night: night('2026-07-10T18:00') }))).toBe(true);
    expect(has(comfortFor({ shelters: alps(300), night: night('2026-10-10T18:00') }))).toBe(false);
    expect(has(comfortFor({ shelters: alps(300), night: night('2026-05-31T18:00') }))).toBe(false);
    expect(has(comfortFor({ shelters: alps(300), night: night('2026-09-30T18:00') }))).toBe(true);
  });
  it('not for a distant alp or without a forecast night', () => {
    expect(has(comfortFor({ shelters: alps(900), night: night('2026-07-10T18:00') }))).toBe(false);
    expect(has(comfortFor({ shelters: alps(300) }))).toBe(false);
  });
  it('costs one point', () => {
    const base = comfortFor({ shelters: alps(300), night: night('2026-10-10T18:00') }).score;
    expect(comfortFor({ shelters: alps(300), night: night('2026-07-10T18:00') }).score).toBe(base - 1);
  });
});
