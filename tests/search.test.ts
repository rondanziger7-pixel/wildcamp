import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlaces } from '../src/search';

describe('parsePlaces', () => {
  const places = parsePlaces(JSON.parse(readFileSync(new URL('./fixtures/search-zermatt.json', import.meta.url), 'utf8')));
  it('strips markup and keeps coordinates', () => {
    expect(places[0]).toMatchObject({ label: 'Zermatt (VS)' });
    expect(places[0]!.lat).toBeCloseTo(45.99, 1);
    expect(places.every((p) => !/[<>]/.test(p.label))).toBe(true);
  });
  it('drops duplicates and malformed rows', () => {
    expect(new Set(places.map((p) => p.label)).size).toBe(places.length);
    expect(parsePlaces({ results: [{ attrs: { label: 'x' } }, {}] })).toEqual([]);
    expect(parsePlaces(null)).toEqual([]);
  });
});
