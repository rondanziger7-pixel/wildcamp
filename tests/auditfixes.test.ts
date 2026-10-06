import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { comfortFor } from '../src/comfort/comfort';
import { sleepScore } from '../src/scores';
import type { TerrainMetrics } from '../src/comfort/terrain';

// Findings of the 1000-spot audit (random spots across Switzerland).
const terrain = (slopeDeg: number): TerrainMetrics => ({ slopeDeg, meanHorizon: 12, tpi: 0, horizon: Array(8).fill(12), dropNearM: undefined }) as unknown as TerrainMetrics;
const ground = (cover: string) => ({ cover, label: cover, meters: 20, year: 2023 }) as never;
const grass = ground('grass');

describe('spots that cannot hold a tent are never rated better than the ground allows', () => {
  it('a grassy flat spot is still good', () => {
    expect(['good', 'great']).toContain(comfortFor({ terrain: terrain(2), ground: grass }).rating);
  });
  it.each(['water', 'glacier'])('%s is poor', (cover) => {
    const c = comfortFor({ terrain: terrain(2), ground: ground(cover) });
    expect(c.rating).toBe('poor');
    expect(sleepScore(c).value!).toBeLessThanOrEqual(38);
  });
  it('a 35 degree grassy slope is poor, not good', () => {
    expect(comfortFor({ terrain: terrain(35), ground: grass }).rating).toBe('poor');
  });
  it('a 20 degree slope and built-up ground are at best fair', () => {
    expect(['fair', 'poor']).toContain(comfortFor({ terrain: terrain(20), ground: grass }).rating);
    expect(['fair', 'poor']).toContain(comfortFor({ terrain: terrain(2), ground: ground('built') }).rating);
  });
});

describe('a spot at the treeline gets a cautious answer, not "unknown"', () => {
  it('elevation known but treeline unclear: caution with an explanation', () => {
    const a = assess({ zones: [], treeline: 'unknown' });
    expect(a.verdict).toBe('caution');
    expect(a.items.some((i) => i.title === 'Close to the treeline')).toBe(true);
  });
  it('no elevation at all stays unknown', () => {
    expect(assess({ zones: [], treeline: 'unknown', elevationKnown: false }).verdict).toBe('unknown');
  });
});
