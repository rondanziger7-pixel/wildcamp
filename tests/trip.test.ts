import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_AHEAD_DAYS, MAX_NIGHTS, TRIP_KEY, TRIP_KEY_V2, addNight, daysBetween, loadTrip, moveNight, nextFreeDate, nightsFor, removeNight, saveTrip, setNightSpot, tidy, tripNights, type TripNight } from '../src/trip';
import type { SavedSpot, SpotSnapshot, Store } from '../src/saved';

const mem = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const snap: SpotSnapshot = { verdict: 'likely_ok', pros: [], cons: [], complete: true, savedAt: 0 };
const spot = (id: string): SavedSpot => ({ id, lat: 46, lng: 7, name: id, snapshot: snap });
const TODAY = '2026-10-06';
const n = (spot: string, date: string): TripNight => ({ spot, date });

describe('nights', () => {
  it('are kept one per date, in date order, and capped', () => {
    expect(tidy([n('b', '2026-10-08'), n('a', '2026-10-07'), n('c', '2026-10-07')])).toEqual([n('a', '2026-10-07'), n('b', '2026-10-08')]);
    const many = Array.from({ length: MAX_NIGHTS + 5 }, (_, i) => n('a', `2026-11-${String(1 + i).padStart(2, '0')}`));
    expect(tidy(many)).toHaveLength(MAX_NIGHTS);
  });
  it('a trip can be longer than the forecast and use the same spot on several nights', () => {
    expect(MAX_NIGHTS).toBeGreaterThanOrEqual(14);
    let t: TripNight[] = [];
    for (let i = 0; i < 6; i++) t = addNight(t, 'camp', TODAY);
    expect(t.map((x) => x.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(new Set(t.map((x) => x.spot))).toEqual(new Set(['camp']));
  });
  it('a new night follows the last one, or lands on a given free date', () => {
    expect(addNight([], 'a', TODAY)).toEqual([n('a', TODAY)]);
    expect(addNight([n('a', '2026-10-20')], 'b', TODAY)).toEqual([n('a', '2026-10-20'), n('b', '2026-10-21')]);
    expect(addNight([n('a', '2026-10-20')], 'b', TODAY, '2026-10-12')).toEqual([n('b', '2026-10-12'), n('a', '2026-10-20')]);
    // a taken date moves on to the next free one
    expect(addNight([n('a', '2026-10-12'), n('x', '2026-10-13')], 'b', TODAY, '2026-10-12').map((x) => x.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
  it('refuses a night when the trip is full', () => {
    const full = Array.from({ length: MAX_NIGHTS }, (_, i) => n('a', `2026-11-${String(1 + i).padStart(2, '0')}`));
    expect(addNight(full, 'b', TODAY)).toBe(full);
  });
  it('never picks a date in the past or beyond the planning horizon', () => {
    expect(addNight([], 'a', TODAY, '2026-01-01')[0]!.date).toBe(TODAY);
    expect(nextFreeDate([], '2030-01-01', TODAY)).toBeUndefined();
    expect(MAX_AHEAD_DAYS).toBe(365);
  });
  it('are removed by date and given another spot', () => {
    const t = [n('a', '2026-10-07'), n('b', '2026-10-08')];
    expect(removeNight(t, '2026-10-07')).toEqual([n('b', '2026-10-08')]);
    expect(setNightSpot(t, '2026-10-08', 'z')).toEqual([n('a', '2026-10-07'), n('z', '2026-10-08')]);
  });
  it('move to another evening only when it is free and plannable', () => {
    const t = [n('a', '2026-10-07'), n('b', '2026-10-08')];
    expect(moveNight(t, '2026-10-07', '2026-10-12', TODAY)).toEqual([n('b', '2026-10-08'), n('a', '2026-10-12')]);
    expect(moveNight(t, '2026-10-07', '2026-10-08', TODAY)).toBeUndefined(); // taken: not guessed
    expect(moveNight(t, '2026-10-07', '2026-10-01', TODAY)).toBeUndefined(); // past
    expect(moveNight(t, '2026-10-07', '2028-10-01', TODAY)).toBeUndefined(); // too far
    expect(moveNight(t, '2026-10-07', 'not a date', TODAY)).toBeUndefined();
    expect(moveNight(t, '2026-10-07', '2026-10-07', TODAY)).toEqual(t); // no change
  });
  it('are built from spots in order, one each evening', () => {
    expect(nightsFor(['a', 'b', 'a'], TODAY)).toEqual([n('a', '2026-10-06'), n('b', '2026-10-07'), n('a', '2026-10-08')]);
    expect(nightsFor(Array.from({ length: 40 }, () => 'a'), TODAY)).toHaveLength(MAX_NIGHTS);
  });
  it('show only spots that still exist and nights that are not over', () => {
    const spots = [spot('a'), spot('b')];
    const got = tripNights([n('gone', '2026-10-07'), n('a', '2026-10-05'), n('b', '2026-10-09'), n('a', '2026-10-06')], spots, TODAY);
    expect(got.map((x) => [x.night.date, x.spot.id])).toEqual([['2026-10-06', 'a'], ['2026-10-09', 'b']]);
  });
  it('counts days between evenings across months and the clock change', () => {
    expect(daysBetween('2026-10-06', '2026-10-06')).toBe(0);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-06', '2026-12-31')).toBe(86);
  });
});

describe('trip storage', () => {
  it('round-trips and survives broken or missing storage', () => {
    const s = mem();
    saveTrip(s, [n('b', '2026-10-08'), n('a', '2026-10-07')]);
    expect(loadTrip(s, TODAY)).toEqual([n('a', '2026-10-07'), n('b', '2026-10-08')]);
    s.data[TRIP_KEY_V2] = '{oops';
    expect(loadTrip(s, TODAY)).toEqual([]);
    s.data[TRIP_KEY_V2] = JSON.stringify([n('a', '2026-10-07'), { spot: 3, date: '2026-10-08' }, { spot: 'x', date: 'soon' }, null, n('b', '2026-10-09')]);
    expect(loadTrip(s, TODAY)).toEqual([n('a', '2026-10-07'), n('b', '2026-10-09')]);
    s.data[TRIP_KEY_V2] = '{"not":"a list"}';
    expect(loadTrip(s, TODAY)).toEqual([]);
    expect(loadTrip(undefined, TODAY)).toEqual([]);
    expect(() => saveTrip(undefined, [n('a', TODAY)])).not.toThrow();
    const full: Store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveTrip(full, [n('a', TODAY)])).not.toThrow();
  });
  it('a trip made before dates existed becomes consecutive nights from today', () => {
    const s = mem();
    s.data[TRIP_KEY] = JSON.stringify(['a', 3, 'b', 'a']);
    expect(loadTrip(s, TODAY)).toEqual([n('a', '2026-10-06'), n('b', '2026-10-07'), n('a', '2026-10-08')]);
    s.data[TRIP_KEY] = '{oops';
    expect(loadTrip(s, TODAY)).toEqual([]);
    // once a dated trip is stored it wins over the old one
    saveTrip(s, [n('z', '2026-12-24')]);
    expect(loadTrip(s, TODAY)).toEqual([n('z', '2026-12-24')]);
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
