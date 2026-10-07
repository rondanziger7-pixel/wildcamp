import { describe, expect, it } from 'vitest';
import { COVERAGE_LAYERS, classifyCoverage, type CoverageInfo } from '../src/comfort/coverage';
import { comfortFor } from '../src/comfort/comfort';

/** A 3 x 3 image whose centre pixel is the given colour. */
const img = (r: number, g: number, b: number, a: number) => {
  const px = new Uint8ClampedArray(3 * 3 * 4);
  px.set([r, g, b, a], (1 * 3 + 1) * 4);
  return px;
};

describe('reading the coverage pixel', () => {
  it('green is all three providers, orange fewer than three, transparent none', () => {
    expect(classifyCoverage(img(0, 150, 0, 255))).toBe('all');
    expect(classifyCoverage(img(255, 186, 0, 255))).toBe('some');
    expect(classifyCoverage(img(0, 0, 0, 0))).toBe('none');
  });
  it('a faint pixel is no cell, a colour that is not the legend\'s green is the cautious "some"', () => {
    expect(classifyCoverage(img(0, 150, 0, 10))).toBe('none');
    expect(classifyCoverage(img(120, 120, 120, 255))).toBe('some');
  });
  it('reads the middle pixel and not a corner', () => {
    const px = new Uint8ClampedArray(3 * 3 * 4);
    px.set([0, 150, 0, 255], 0); // top-left corner only
    expect(classifyCoverage(px)).toBe('none');
  });
  it('uses the 4G and 5G layers of the federal broadband atlas', () => {
    expect(COVERAGE_LAYERS).toEqual({ g4: 'ch.bakom.mobilnetz-4g', g5: 'ch.bakom.mobilnetz-5g' });
  });
});

describe('the coverage item in the spot details', () => {
  const run = (coverage?: CoverageInfo, coverageFailed = false) => comfortFor({ hazards: { inside: [], failed: [], coverage, coverageFailed } });
  const item = (c: ReturnType<typeof run>) => c.spotFactors.find((f) => /mobile signal/i.test(f.title));
  it('none predicted: a warning that is also a first-view alert, and it says to plan as if no call is possible', () => {
    const c = run({ g4: 'none', g5: 'none' });
    expect(item(c)).toMatchObject({ tone: 'warn', title: 'No mobile signal predicted' });
    expect(item(c)!.text).toMatch(/plan as if you could not call for help/);
    expect(item(c)!.text).toMatch(/can be wrong either way/);
    expect(c.alerts.map((a) => a.title)).toContain('No mobile signal predicted');
  });
  it('some providers: information, naming the best technology', () => {
    const c = run({ g4: 'some', g5: 'none' });
    expect(item(c)).toMatchObject({ tone: 'info', title: 'Mobile signal possible' });
    expect(item(c)!.text).toMatch(/4G outdoors here from some, not all/);
    expect(c.alerts.map((a) => a.title)).not.toContain('Mobile signal possible');
  });
  it('all three: green, with the caveat that it is a prediction', () => {
    const c = run({ g4: 'all', g5: 'all' });
    expect(item(c)).toMatchObject({ tone: 'ok', title: 'Mobile signal predicted' });
    expect(item(c)!.text).toMatch(/4G \/ 5G.*all three providers/);
    expect(item(c)!.text).toMatch(/not a measurement/);
  });
  it('4G alone or 5G alone is named as such', () => {
    expect(item(run({ g4: 'none', g5: 'all' }))!.text).toMatch(/predict 5G outdoors/);
    expect(item(run({ g4: 'all', g5: 'some' }))!.text).toMatch(/predict 4G outdoors/);
  });
  it('has no effect on the score', () => {
    const base = run().score;
    for (const cov of [{ g4: 'none', g5: 'none' }, { g4: 'some', g5: 'some' }, { g4: 'all', g5: 'all' }] as CoverageInfo[]) expect(run(cov).score).toBe(base);
  });
  it('a failed lookup is a missing check, never "no signal"', () => {
    const c = run(undefined, true);
    expect(item(c)).toBeUndefined();
    expect(c.missing).toContain('mobile coverage');
  });
  it('is not mentioned when it was not asked for', () => {
    expect(item(run())).toBeUndefined();
  });
});
