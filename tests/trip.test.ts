import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_NIGHTS, TRIP_KEY, addToTrip, loadTrip, moveInTrip, removeFromTrip, saveTrip, tripSpots } from '../src/trip';
import type { SavedSpot, SpotSnapshot, Store } from '../src/saved';

const mem = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const snap: SpotSnapshot = { verdict: 'likely_ok', pros: [], cons: [], complete: true, savedAt: 0 };
const spot = (id: string): SavedSpot => ({ id, lat: 46, lng: 7, name: id, snapshot: snap });

describe('trip order', () => {
  it('adds at the end, ignores repeats and stops at the number of nights the forecast covers', () => {
    let t: string[] = [];
    for (const id of ['a', 'b', 'a', 'c', 'd', 'e']) t = addToTrip(t, id);
    expect(t).toEqual(['a', 'b', 'c', 'd']);
    expect(t).toHaveLength(MAX_NIGHTS);
  });
  it('removes and moves a night earlier or later, staying inside the list', () => {
    expect(removeFromTrip(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(moveInTrip(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveInTrip(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveInTrip(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveInTrip(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveInTrip(['a'], 5, 1)).toEqual(['a']);
  });
  it('turns ids into saved spots in trip order, dropping spots that were deleted', () => {
    const spots = [spot('a'), spot('b'), spot('c')];
    expect(tripSpots(['c', 'gone', 'a', 'c'], spots).map((s) => s.id)).toEqual(['c', 'a']);
  });
});

describe('trip storage', () => {
  it('round-trips and survives broken or missing storage', () => {
    const s = mem();
    saveTrip(s, ['a', 'b']);
    expect(loadTrip(s)).toEqual(['a', 'b']);
    s.data[TRIP_KEY] = '{oops';
    expect(loadTrip(s)).toEqual([]);
    s.data[TRIP_KEY] = JSON.stringify(['a', 3, null, 'b']);
    expect(loadTrip(s)).toEqual(['a', 'b']);
    expect(loadTrip(undefined)).toEqual([]);
    expect(() => saveTrip(undefined, ['a'])).not.toThrow();
    const full: Store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveTrip(full, ['a'])).not.toThrow();
  });
});

describe('no lazily loaded code', () => {
  it('the app is one bundle: a cached old page must never meet a newer code chunk', () => {
    // The offline service worker serves the cached page while it updates in the background. A dynamic import() would then
    // fetch a chunk from the new build next to an entry file from the old one, and the feature would fail silently.
    const offenders = readdirSync('src')
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /\bimport\s*\(/.test(readFileSync(`src/${f}`, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(offenders).toEqual([]);
  });
});
