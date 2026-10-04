import { describe, expect, it } from 'vitest';
import { centreCovered, HAZARD_LAYERS, type HazardInfo } from '../src/comfort/hazards';
import { comfortFor } from '../src/comfort/comfort';

const img = (alpha: number, size = 9) => {
  const a = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) a[i * 4 + 3] = alpha;
  return a;
};

describe('centre pixel', () => {
  it('coloured pixels count, transparent and faint ones do not', () => {
    expect(centreCovered(img(255))).toBe(true);
    expect(centreCovered(img(0))).toBe(false);
    expect(centreCovered(img(20))).toBe(false); // faint shading, not a mapped area
    expect(centreCovered(img(40))).toBe(true);
  });
  it('reads the middle of the image, not a corner', () => {
    const a = img(0);
    a[3] = 255; // top-left corner only
    expect(centreCovered(a)).toBe(false);
    const mid = (4 * 9 + 4) * 4 + 3;
    a[mid] = 255;
    expect(centreCovered(a)).toBe(true);
  });
  it('uses the official layers', () => {
    expect(Object.values(HAZARD_LAYERS)).toEqual(['ch.bafu.aquaprotect_050', 'ch.bafu.aquaprotect_100', 'ch.bafu.silvaprotect-sturz', 'ch.bafu.silvaprotect-hangmuren', 'ch.bafu.silvaprotect-murgang']);
  });
});

describe('hazard factors', () => {
  const run = (inside: HazardInfo['inside'], failed: HazardInfo['failed'] = [], steep = false) =>
    comfortFor({ hazards: { inside, failed }, terrain: { elevation: 1500, slopeDeg: steep ? 30 : 3, horizon: Array(8).fill(5), meanHorizon: 5, tpi: 0, steepAboveM: steep ? 60 : undefined, dropNearM: undefined } });
  const base = run([]).score;
  it('nothing mapped adds nothing', () => {
    expect(run([]).factors.filter((f) => /flood|rockfall|landslide|debris/i.test(f.title))).toEqual([]);
  });
  it('a frequent flood area is red and costs 2; a 100-year area costs 1; the frequent one wins when both apply', () => {
    expect(run(['flood50', 'flood100']).factors.find((f) => /flood/i.test(f.title))).toMatchObject({ tone: 'bad', title: 'In a frequent flood area' });
    expect(run(['flood50', 'flood100']).score).toBe(base - 2);
    expect(run(['flood100']).score).toBe(base - 1);
    expect(run(['flood100']).factors.find((f) => /flood/i.test(f.title))).toMatchObject({ tone: 'warn' });
  });
  it('rockfall counts only with a steep slope near; otherwise information', () => {
    expect(run(['rockfall'], [], false).score).toBe(base);
    expect(run(['rockfall'], [], true).score).toBe(run([], [], true).score - 1);
    expect(run(['rockfall'], [], false).factors.find((f) => f.title === 'In a rockfall area')).toMatchObject({ tone: 'info' });
  });
  it('landslide and debris flow are information only', () => {
    const c = run(['landslide', 'debris']);
    expect(c.score).toBe(base);
    expect(c.factors.map((f) => f.title)).toEqual(expect.arrayContaining(['In a landslide-prone area', 'In a debris-flow area']));
  });
  it('every hazard text says it is a coarse model, and failures are listed as missing', () => {
    for (const f of run(['flood50', 'rockfall', 'landslide', 'debris'], [], true).factors.filter((x) => /flood|rockfall|landslide|debris/i.test(x.title))) expect(f.text).toMatch(/not the cantonal hazard map/);
    expect(run([], ['flood100']).missing).toContain('natural hazards');
    expect(comfortFor({ hazardsFailed: true }).missing).toContain('natural hazards');
    expect(comfortFor({}).missing).not.toContain('natural hazards');
  });
});
