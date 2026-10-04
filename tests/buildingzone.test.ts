import { describe, expect, it } from 'vitest';
import fx from './fixtures/buildingzone.json';
import { parseBuildingZone } from '../src/buildingzone';
import { assess } from '../src/assess';

describe('building zones (real ARE responses at Zermatt station)', () => {
  it('inside a zone: reads the category', () => {
    const z = parseBuildingZone(fx.inside as never, undefined);
    expect(z.inside).toMatchObject({ code: '14', name: 'Zentrumszonen' });
  });
  it('250 m outside: not inside, but a zone is within 150 m', () => {
    expect(parseBuildingZone(fx.near_at as never, fx.near_within as never)).toEqual({ near: true });
  });
  it('800 m outside: neither', () => {
    expect(parseBuildingZone(fx.far_at as never, fx.far_within as never)).toEqual({ near: false });
  });
  it('tolerates empty or missing bodies', () => {
    expect(parseBuildingZone({}, {})).toEqual({ near: false });
    expect(parseBuildingZone(undefined, undefined)).toEqual({ near: false });
  });
});

describe('legality in and near settlements', () => {
  const base = { zones: [], treeline: 'above' as const, canton: { code: 'VS', name: 'Valais' } as never, municipality: 'Nowhere' };
  const verdict = (bz: Parameters<typeof assess>[0]['buildingZone']) => assess({ ...base, buildingZone: bz });
  it('inside a building zone caps the verdict at "Be careful" with the legal reasons', () => {
    const a = verdict({ inside: { code: '11', name: 'Wohnzonen' }, near: true });
    expect(a.verdict).toBe('caution');
    const item = a.items.find((i) => i.title === 'In a village or city (building zone)')!;
    expect(item.tone).toBe('warn');
    expect(item.text).toMatch(/Art\. 699 ZGB/);
    expect(item.text).toMatch(/Art\. 641 ZGB/);
    expect(item.text).toMatch(/Art\. 186 StGB/);
    expect(item.text).toMatch(/Wohnzonen/);
    expect(item.sources!.some((s) => s.includes('233_245_233'))).toBe(true);
  });
  it('never turns a spot into "Not allowed" by itself: that needs a rule read at the source', () => {
    expect(verdict({ inside: { code: '14', name: 'Zentrumszonen' }, near: true }).verdict).not.toBe('no');
  });
  it('does not soften a protected-zone ban', () => {
    const park = { layer: { id: 'x', label: 'Swiss National Park', severity: 'prohibited' as const, note: 'n', source: 'https://example.org' }, name: 'Park' };
    expect(assess({ ...base, zones: [park as never], buildingZone: { inside: { code: '11', name: 'Wohnzonen' }, near: true } }).verdict).toBe('no');
  });
  it('close to a settlement is information only', () => {
    const a = verdict({ near: true });
    expect(a.items.find((i) => i.title === 'Close to a village or city')).toMatchObject({ tone: 'info' });
    expect(a.verdict).toBe('likely_ok');
  });
  it('away from settlements adds nothing', () => {
    const a = verdict({ near: false });
    expect(a.items.some((i) => /village or city|Building zones/.test(i.title))).toBe(false);
    expect(a.verdict).toBe('likely_ok');
  });
  it('a failed lookup is said, not read as outside', () => {
    const a = verdict({ near: false, failed: true });
    expect(a.items.find((i) => i.title === 'Building zones could not be checked')).toMatchObject({ tone: 'info' });
  });
});
