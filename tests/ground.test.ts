import { describe, expect, it } from 'vitest';
import fx from './fixtures/ground.json';
import { classifyCover, parseGround } from '../src/comfort/ground';
import { comfortFor } from '../src/comfort/comfort';

describe('ground cover', () => {
  it('classifies the land-cover categories', () => {
    expect(classifyCover('Grass and herb vegetation')).toBe('grass');
    expect(classifyCover('Brush meadows')).toBe('shrub');
    expect(classifyCover('Shrubs')).toBe('shrub');
    expect(classifyCover('Solid rock')).toBe('rock');
    expect(classifyCover('Granular soil')).toBe('loose');
    expect(classifyCover('Glacier, perpetual snow')).toBe('glacier');
    expect(classifyCover('Consolidated surfaces')).toBe('built');
    expect(classifyCover('Buildings')).toBe('built');
    expect(classifyCover('Something new')).toBe('other');
  });
  it('uses the latest survey record of a point (real responses, trimmed to four years)', () => {
    expect(parseGround(fx.grass, 30)).toMatchObject({ cover: 'grass', year: 2023 });
    expect(parseGround(fx.rock, 30)).toMatchObject({ cover: 'rock', label: 'Solid rock' });
    expect(parseGround(fx.loose, 30)?.cover).toBe('loose');
    expect(parseGround(fx.glacier, 30)?.cover).toBe('glacier');
    // 2023 says brush meadows where the older surveys said grass
    expect(parseGround(fx.brush, 30)).toMatchObject({ cover: 'shrub', year: 2023 });
    // built over since 1990
    expect(parseGround(fx.building, 30)?.cover).toBe('built');
    expect(parseGround({ results: [] }, 0)).toBeUndefined();
  });
  it('grass scores better than rock, which scores better than ice', () => {
    const score = (k: keyof typeof fx) => comfortFor({ ground: parseGround(fx[k], 20) }).score;
    expect(score('grass')).toBeGreaterThan(score('rock'));
    expect(score('rock')).toBeGreaterThan(score('glacier'));
    expect(score('loose')).toBe(score('rock'));
    const grass = comfortFor({ ground: parseGround(fx.grass, 20) });
    expect(grass.factors.map((x) => x.title)).toContain('Grassy ground');
    expect(grass.missing).not.toContain('ground cover (rock or grass)');
  });
  it('names a missing ground check and mentions a distant survey point', () => {
    expect(comfortFor({}).missing).toContain('ground cover (rock or grass)');
    const far = comfortFor({ ground: parseGround(fx.grass, 70) });
    expect(far.factors.find((x) => x.title === 'Grassy ground')?.text).toMatch(/about 70 m away/);
  });
});
