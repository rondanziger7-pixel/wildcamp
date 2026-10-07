import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlaces } from '../src/search';

describe('parsePlaces', () => {
  const places = parsePlaces(JSON.parse(readFileSync(new URL('./fixtures/search-zermatt.json', import.meta.url), 'utf8')));
  it('strips markup and keeps coordinates', () => {
    const muni = places.find((p) => p.label === 'Zermatt (VS)')!;
    expect(muni.lat).toBeCloseTo(45.99, 1);
    // the village comes before the municipality's centroid
    expect(places[0]!.origin).toBe('gazetteer');
    expect(places.indexOf(muni)).toBe(1);
    expect(places.every((p) => !/[<>]/.test(p.label))).toBe(true);
  });
  it('drops duplicates and malformed rows', () => {
    expect(new Set(places.map((p) => p.label)).size).toBe(places.length);
    expect(parsePlaces({ results: [{ attrs: { label: 'x' } }, {}] })).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
  });
});

describe('villageFirst', () => {
  it('puts the populated place before the municipality centroid', async () => {
    const { villageFirst } = await import('../src/search');
    const muni = { label: 'Saas-Fee (VS)', lat: 46.0854, lon: 7.8983, origin: 'gg25' };
    const ort = { label: 'Ort Saas-Fee (VS) - Saas-Fee', lat: 46.1098, lon: 7.9285, origin: 'gazetteer' };
    expect(villageFirst([muni, ort]).map((p) => p.origin)).toEqual(['gazetteer', 'gg25']);
    expect(villageFirst([ort, muni])[0]).toBe(ort);
    expect(villageFirst([muni])).toEqual([muni]);
  });
});
