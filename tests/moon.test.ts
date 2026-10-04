import { describe, expect, it } from 'vitest';
import { moonNight, phaseName, zurichToDate } from '../src/comfort/moon';
import { comfortFor } from '../src/comfort/comfort';
import { sunTimes } from '../src/comfort/sun';

describe('zurich time', () => {
  it('converts summer and winter local time to UTC', () => {
    expect(zurichToDate('2026-07-01T18:00').toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(zurichToDate('2026-01-15T18:00').toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(zurichToDate('2026-10-04T08:00').toISOString()).toBe('2026-10-04T06:00:00.000Z');
  });
});

describe('moon (checked against known lunations: full 7 Oct 2025 03:47 UTC, new 21 Oct 2025 12:25 UTC)', () => {
  it('is nearly full on the night around the full moon and nearly new around the new moon', () => {
    const full = moonNight(46.95, 7.44, { from: '2025-10-06T18:00', to: '2025-10-07T08:00' });
    expect(full.illumination).toBeGreaterThan(0.97);
    expect(['Full moon', 'Waxing gibbous', 'Waning gibbous']).toContain(full.phase);
    const nu = moonNight(46.95, 7.44, { from: '2025-10-20T18:00', to: '2025-10-21T08:00' });
    expect(nu.illumination).toBeLessThan(0.05);
    expect(nu.bright).toBe(false);
  });
  it('a full moon is up most of a night, so the night is bright', () => {
    const full = moonNight(46.95, 7.44, { from: '2025-10-06T18:00', to: '2025-10-07T08:00' });
    expect(full.upShare).toBeGreaterThan(0.7);
    expect(full.bright).toBe(true);
    expect(full.up).toBeDefined();
  });
  it('names the phases', () => {
    expect(phaseName(0)).toBe('New moon');
    expect(phaseName(0.25)).toBe('First quarter');
    expect(phaseName(0.5)).toBe('Full moon');
    expect(phaseName(0.75)).toBe('Last quarter');
    expect(phaseName(0.99)).toBe('New moon');
  });
});

describe('moon and evening sun factors', () => {
  it('moon is information only, in the weather list, and never moves the score', () => {
    const base = comfortFor({});
    const c = comfortFor({ moon: moonNight(46.95, 7.44, { from: '2025-10-06T18:00', to: '2025-10-07T08:00' }) });
    expect(c.score).toBe(base.score);
    expect(c.weatherFactors[0]!.title).toMatch(/^Bright moonlight/);
    const dark = comfortFor({ moon: moonNight(46.95, 7.44, { from: '2025-10-20T18:00', to: '2025-10-21T08:00' }) });
    expect(dark.weatherFactors[0]!.title).toMatch(/^Dark sky/);
  });
  const day = new Date('2026-06-21T12:00:00Z');
  it('evening sun to sunset scores +1, a shaded evening is only information', () => {
    const open = sunTimes(day, 46.5, 8, undefined);
    expect(comfortFor({ eveningSun: open }).factors.find((f) => f.title === 'Evening sun to sunset')).toBeDefined();
    expect(comfortFor({ eveningSun: open }).score).toBe(1);
    const west = sunTimes(day, 46.5, 8, [0, 0, 0, 0, 0, 0, 25, 25]); // a 25 degree wall to the west
    const c = comfortFor({ eveningSun: west });
    expect(c.factors[0]!.title).toMatch(/^In shade from/);
    expect(c.score).toBe(0);
  });
});
