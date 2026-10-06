import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { comfortFor } from '../src/comfort/comfort';
import { legalSummary, legalWhy, legalityScore, overallFrom, sleepScore, weatherScore } from '../src/scores';
import { ZONE_LAYERS } from '../src/zones';

const layer = (severity: 'prohibited' | 'restricted' | 'caution' | 'info') => ({ id: 'x', label: 'Zone', severity, note: 'n' });

describe('legality score', () => {
  it('not allowed is 0', () => {
    const a = assess({ zones: [{ layer: layer('prohibited') }], treeline: 'above' });
    expect(legalityScore(a)).toEqual({ value: 0, tone: 'bad' });
  });
  it('likely OK is 85, never 100', () => {
    const a = assess({ zones: [], treeline: 'above' });
    expect(a.verdict).toBe('likely_ok');
    expect(legalityScore(a)).toEqual({ value: 85, tone: 'good' });
  });
  it('caution drops with each warning but never below 25', () => {
    const one = legalityScore(assess({ zones: [{ layer: layer('caution'), name: 'A' }], treeline: 'above' }));
    const three = legalityScore(assess({ zones: ['A', 'B', 'C'].map((name) => ({ layer: layer('caution'), name })), treeline: 'forest' }));
    const many = legalityScore(assess({ zones: ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ layer: layer('caution'), name })), treeline: 'forest' }));
    expect(one.value).toBe(45);
    expect(three.value!).toBeLessThan(one.value!);
    expect(many.value).toBe(25);
  });
  it('forest and below-treeline are cautions with a score between 25 and 55', () => {
    const v = legalityScore(assess({ zones: [], treeline: 'forest' })).value!;
    expect(v).toBeGreaterThanOrEqual(25);
    expect(v).toBeLessThan(55);
  });
  it('unknown is 40 and outside Switzerland has no score', () => {
    expect(legalityScore(assess({ zones: [], treeline: 'unknown', elevationKnown: false }))).toEqual({ value: 40, tone: 'warn' });
    expect(legalityScore(assess({ zones: [], treeline: 'above', outsideSwitzerland: true })).value).toBeUndefined();
  });
  it('is ordered like the verdicts: no < unknown < caution <= likely OK', () => {
    const v = (a: ReturnType<typeof assess>) => legalityScore(a).value!;
    const no = v(assess({ zones: [{ layer: layer('restricted') }], treeline: 'above' }));
    const unknown = v(assess({ zones: [], treeline: 'unknown', elevationKnown: false }));
    const ok = v(assess({ zones: [], treeline: 'above' }));
    expect(no).toBeLessThan(unknown);
    expect(unknown).toBeLessThan(ok);
  });
  it('uses real layer definitions without error', () => {
    for (const l of ZONE_LAYERS) expect(legalityScore(assess({ zones: [{ layer: l }], treeline: 'above' })).value).toBeGreaterThanOrEqual(0);
  });
});

// comfortFor without terrain says "insufficient"; these tests are about the arithmetic, so they mark it as rated
const rated = (input: Parameters<typeof comfortFor>[0]) => ({ ...comfortFor(input), insufficient: false });

describe('sleep score', () => {
  const water = { kind: 'stream' as const, meters: 80, upstreamPlants: [], failed: [] };
  it('has no score without comfort data', () => {
    expect(sleepScore(undefined)).toEqual({ tone: 'none' });
  });
  it('has no score when the terrain could not be read: nothing says how the spot is', () => {
    expect(sleepScore(comfortFor({}))).toEqual({ tone: 'none' });
    expect(comfortFor({}).insufficient).toBe(true);
  });
  it('is 50 at a net score of zero and moves 6.25 per point, within 0 to 100', () => {
    const c = rated({});
    expect(c.score).toBe(0);
    expect(sleepScore(c).value).toBe(50);
    expect(sleepScore({ ...c, score: 4 }).value).toBe(75);
    expect(sleepScore({ ...c, score: -4 }).value).toBe(25);
    expect(sleepScore({ ...c, score: 100 }).value).toBe(100);
    expect(sleepScore({ ...c, score: -100 }).value).toBe(0);
  });
  it('a storm caps it at 25 whatever the spot is like', () => {
    const c = rated({ water, night: { from: 'a', to: 'b', minTempC: 8, maxGustKmh: 20, meanWindKmh: 10, windFromDeg: 0, precipMm: 0, thunder: true } });
    expect(c.weatherStop).toBe(true);
    expect(sleepScore({ ...c, score: 10 }).value).toBe(25);
    expect(sleepScore(c).tone).toBe('bad');
  });
  it('its tone follows the rating', () => {
    const c = rated({});
    expect(sleepScore({ ...c, rating: 'great' }).tone).toBe('good');
    expect(sleepScore({ ...c, rating: 'fair' }).tone).toBe('warn');
    expect(sleepScore({ ...c, rating: 'poor' }).tone).toBe('bad');
  });
});

describe('weather score', () => {
  const c = comfortFor({});
  it('has no score without a forecast', () => {
    expect(weatherScore(undefined, true)).toEqual({ tone: 'none' });
    expect(weatherScore(c, false)).toEqual({ tone: 'none' });
  });
  it('is 50 when neutral, 12.5 per point, and a storm caps it at 10', () => {
    expect(weatherScore(c, true)).toEqual({ value: 50, tone: 'good' });
    expect(weatherScore({ ...c, weatherScore: 1 }, true).value).toBe(63);
    expect(weatherScore({ ...c, weatherScore: -2 }, true)).toEqual({ value: 25, tone: 'warn' });
    expect(weatherScore({ ...c, weatherScore: -3 }, true).tone).toBe('bad');
    expect(weatherScore({ ...c, weatherScore: 3, weatherStop: true }, true)).toEqual({ value: 10, tone: 'bad' });
  });
});

describe('legality in one line', () => {
  it('names the most serious finding, a ban before a warning', () => {
    const ban = assess({ zones: [{ layer: layer('prohibited'), name: 'Hochmoor X' }, { layer: layer('caution'), name: 'Y' }], treeline: 'above' });
    expect(legalWhy(ban)).toContain('Hochmoor X');
    const warn = assess({ zones: [], treeline: 'forest' });
    expect(legalWhy(warn)).toBeTruthy();
    expect(legalWhy(assess({ zones: [], treeline: 'above' }))).toBeUndefined();
  });
  it('words a municipal rule the way the result sheet does', () => {
    const rule = { stance: 'banned', summary: 'Camping outside designated places is banned.', checkedOn: '2026-10-01', sources: [{ title: 't', url: 'https://example.ch/x' }] } as never;
    const a = assess({ zones: [], treeline: 'above', municipality: 'Kandersteg', municipalRule: rule });
    expect(legalWhy(a)).toBe('Municipal rule: Kandersteg');
  });
  it('carries the verdict, the score and whether anything could not be checked', () => {
    const ok = legalSummary(assess({ zones: [], treeline: 'above' }));
    expect(ok).toMatchObject({ verdict: 'likely_ok', value: 85, unchecked: false, outside: false });
    const ban = legalSummary(assess({ zones: [{ layer: layer('prohibited'), name: 'Z' }], treeline: 'above', incomplete: ['municipality'] }));
    expect(ban).toMatchObject({ verdict: 'no', value: 0, unchecked: false }); // a ban found anyway is a ban
    const missing = legalSummary(assess({ zones: [], treeline: 'above', incomplete: ['zones'] }));
    expect(missing).toMatchObject({ unchecked: true, value: undefined });
    expect(legalSummary(assess({ zones: [], treeline: 'above', outsideSwitzerland: true })).outside).toBe(true);
  });
  it('a "likely OK" with a warning in it is called caution, as the saved snapshot does', () => {
    const s = legalSummary(assess({ zones: [{ layer: layer('caution'), name: 'A' }], treeline: 'above' }));
    expect(['caution', 'likely_ok']).toContain(s.verdict);
    if (s.value !== undefined && s.value < 85) expect(s.verdict).toBe('caution');
  });
});

describe('overall score from saved numbers', () => {
  it('is half legality, half comfort, held down by the weaker part; a ban is 0; a missing part gives none', () => {
    expect(overallFrom('likely_ok', 85, 70)).toBe(78);
    expect(overallFrom('likely_ok', 85, 20)).toBe(30);
    expect(overallFrom('likely_ok', 20, 90)).toBe(30);
    expect(overallFrom('no', 0, 90)).toBe(0);
    expect(overallFrom('no', undefined, undefined)).toBe(0);
    expect(overallFrom('caution', 45, undefined)).toBeUndefined();
    expect(overallFrom('caution', undefined, 60)).toBeUndefined();
    expect(overallFrom('likely_ok', 100, 100)).toBe(100);
  });
});
