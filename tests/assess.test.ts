import { describe, expect, it } from 'vitest';
import { assess, estimateTreeline } from '../src/assess';
import { ZONE_LAYERS } from '../src/zones';
import { isInSwitzerland, wgs84ToLv95 } from '../src/coords';

const layer = (sev: string) => ZONE_LAYERS.find((l) => l.severity === sev)!;

describe('assess', () => {
  it('blocks national park', () => {
    expect(assess({ zones: [{ layer: layer('prohibited') }], treeline: 'above' }).verdict).toBe('no');
  });
  it('caution zones cap the verdict at caution even above the treeline', () => {
    const a = assess({ zones: [{ layer: layer('caution') }], treeline: 'above' });
    expect(a.verdict).toBe('caution');
    expect(a.reasons.join(' ')).toMatch(/Check before going|check the reserve/i);
  });
  it('caution zones do not override a ban, and show the treeline note', () => {
    expect(assess({ zones: [{ layer: layer('caution') }, { layer: layer('restricted') }], treeline: 'above' }).verdict).toBe('no');
    const a = assess({ zones: [{ layer: layer('caution') }], treeline: 'above', treelineNote: 'NOTE-X' });
    expect(a.reasons).toContain('NOTE-X');
  });
  it('blocks restricted zones even above treeline', () => {
    expect(assess({ zones: [{ layer: layer('restricted') }], treeline: 'above' }).verdict).toBe('no');
  });
  it('info zones do not block', () => {
    expect(assess({ zones: [{ layer: layer('info') }], treeline: 'above' }).verdict).toBe('likely_ok');
  });
  it('above treeline and clear is likely ok, never "legal"', () => {
    const a = assess({ zones: [], treeline: 'above' });
    expect(a.verdict).toBe('likely_ok');
    expect(a.reasons.join(' ')).toMatch(/Cantonal/);
  });
  it('forest is caution', () => {
    expect(assess({ zones: [], treeline: 'forest' }).verdict).toBe('caution');
  });
  it('failed zone lookup is unknown, not ok', () => {
    expect(assess({ zones: [], treeline: 'above', zoneLookupFailed: true }).verdict).toBe('unknown');
  });
  it('failed lookup still reports a known hit', () => {
    const a = assess({ zones: [{ layer: layer('prohibited') }], treeline: 'above', zoneLookupFailed: true });
    expect(a.verdict).toBe('no');
  });
});

describe('estimateTreeline', () => {
  it('decides only clear cases', () => {
    expect(estimateTreeline(2600)).toBe('above');
    expect(estimateTreeline(900)).toBe('below');
    expect(estimateTreeline(1900)).toBe('unknown');
    expect(estimateTreeline(undefined)).toBe('unknown');
  });
});

describe('coords', () => {
  it('maps the old Bern observatory to the LV95 origin', () => {
    const { e, n } = wgs84ToLv95(46.95108, 7.43864);
    expect(Math.abs(e - 2600000)).toBeLessThan(2);
    expect(Math.abs(n - 1200000)).toBeLessThan(2);
  });
  it('bounds', () => {
    expect(isInSwitzerland(46.55, 8.0)).toBe(true);
    expect(isInSwitzerland(48.85, 2.35)).toBe(false);
  });
});
