import { describe, expect, it } from 'vitest';
import { beyondForecast, firstEvening, flagsFor, planTrip, type PlanInput } from '../src/planner';
import type { Hourly, Night } from '../src/comfort/weather';
import { unratedSnapshot, type SavedSpot, type SpotSnapshot } from '../src/saved';
import type { LegalSummary } from '../src/scores';

const snap = (legal?: number, over: Partial<SpotSnapshot> = {}): SpotSnapshot => ({ verdict: 'likely_ok', legal, sleep: 70, pros: [], cons: [], complete: true, savedAt: 0, ...over });
const spot = (id: string, legal?: number, over: Partial<SpotSnapshot> = {}): SavedSpot => ({ id, lat: 46.5, lng: 7.7, name: `Spot ${id}`, snapshot: snap(legal, over) });
const fresh = (verdict: LegalSummary['verdict'], value: number | undefined, over: Partial<LegalSummary> = {}): LegalSummary => ({ verdict, value, unchecked: false, outside: false, ...over });

/** Hourly forecast from 2026-07-01 00:00 for 5 days with constant values. */
function hourly(over: Partial<Record<keyof Hourly, number>> = {}): Hourly {
  const time = Array.from({ length: 120 }, (_, i) => `2026-07-${String(1 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
  const c = (v: number) => time.map(() => v);
  return { time, temperature_2m: c(over.temperature_2m ?? 10), wind_speed_10m: c(over.wind_speed_10m ?? 5), wind_gusts_10m: c(over.wind_gusts_10m ?? 12), wind_direction_10m: c(270), precipitation: c(over.precipitation ?? 0), precipitation_probability: c(0), cloud_cover: c(20), weather_code: c(over.weather_code ?? 1), relative_humidity_2m: c(60), dew_point_2m: c(5), snowfall: c(0), snow_depth: c(0) } as unknown as Hourly;
}
const NOW = '2026-07-01T10:00';
const night = (spot: SavedSpot, date: string): PlanInput => ({ spot, date });

describe('flags', () => {
  const n = (o: Partial<Night>): Night => ({ from: '', to: '', minTempC: 5, maxGustKmh: 10, meanWindKmh: 5, windFromDeg: 0, precipMm: 0, thunder: false, ...o });
  it('names what to watch for', () => {
    expect(flagsFor(n({}))).toEqual([]);
    expect(flagsFor(n({ thunder: true, maxGustKmh: 85, precipMm: 12, snowCm: 3, minTempC: -6 }))).toEqual(['thunderstorm', 'storm gusts', 'heavy rain', 'new snow', 'hard frost']);
    expect(flagsFor(n({ maxGustKmh: 55, precipMm: 6, minTempC: -1 }))).toEqual(['strong wind', 'rain', 'frost']);
  });
});

describe('the evening a plan starts on', () => {
  it('is today in the daytime and in the evening, yesterday before 08:00 (that night is still going)', () => {
    expect(firstEvening('2026-07-01T10:00')).toBe('2026-07-01');
    expect(firstEvening('2026-07-01T20:00')).toBe('2026-07-01');
    expect(firstEvening('2026-07-02T03:00')).toBe('2026-07-01');
  });
  it('knows when a night is beyond the 16-day forecast', () => {
    expect(beyondForecast('2026-07-15', NOW)).toBe(false); // the 15th night: the forecast still reaches the morning after
    expect(beyondForecast('2026-07-16', NOW)).toBe(true);
    expect(beyondForecast('2027-01-01', NOW)).toBe(true);
  });
});

describe('trip plan', () => {
  it('puts the spots on their dates, each with its own forecast, and shows the saved legality when it was not judged again', () => {
    const p = planTrip([night(spot('a', 85), '2026-07-01'), night(spot('b', 50), '2026-07-02')], [hourly(), hourly({ precipitation: 1 })], [undefined, undefined], NOW);
    expect(p.rows.map((r) => [r.date, r.night, r.spot.id, r.legal, r.legalFresh])).toEqual([['2026-07-01', 'Tonight', 'a', 85, false], ['2026-07-02', 'Tomorrow', 'b', 50, false]]);
    expect(p.rows[0]!.forecastState).toBe('ok');
    expect(p.rows[0]!.weather).toBeGreaterThan(p.rows[1]!.weather! - 1);
  });
  it('judges the same base camp on several nights, each night with its own weather', () => {
    const h = hourly();
    h.precipitation = h.time.map((t) => (t.startsWith('2026-07-02T2') || t.startsWith('2026-07-02T19') ? 4 : 0));
    const camp = spot('camp', 85);
    const p = planTrip([night(camp, '2026-07-01'), night(camp, '2026-07-02'), night(camp, '2026-07-03')], [h, h, h], [undefined, undefined, undefined], NOW);
    expect(p.rows.map((r) => r.spot.id)).toEqual(['camp', 'camp', 'camp']);
    expect(p.rows[1]!.forecast!.precipMm).toBeGreaterThan(p.rows[0]!.forecast!.precipMm);
    expect(p.rows[1]!.forecast!.precipMm).toBeGreaterThan(p.rows[2]!.forecast!.precipMm);
  });
  it('a stormy spot scores below a calm one on the same night, and is named the weakest', () => {
    const p = planTrip([night(spot('calm', 85), '2026-07-01'), night(spot('storm', 85), '2026-07-02')], [hourly(), hourly({ wind_gusts_10m: 90, wind_speed_10m: 50, precipitation: 2, weather_code: 95 })], [undefined, undefined], NOW);
    expect(p.rows[1]!.stop).toBe(true);
    expect(p.rows[1]!.flags).toEqual(expect.arrayContaining(['thunderstorm', 'storm gusts']));
    expect(p.rows[1]!.weather).toBeLessThanOrEqual(10);
    expect(p.rows[0]!.stop).toBe(false);
    expect(p.weakest).toBe(1);
  });
  it('the weakest night is the lowest of legality and weather, and only named when it is weak and differs', () => {
    const three = [night(spot('a', 85), '2026-07-01'), night(spot('b', 20), '2026-07-02'), night(spot('c', 85), '2026-07-03')];
    expect(planTrip(three, [hourly(), hourly(), hourly()], [undefined, undefined, undefined], NOW).weakest).toBe(1);
    // all fine: nothing is "the weakest"
    const fine = [night(spot('a', 85), '2026-07-01'), night(spot('b', 85), '2026-07-02')];
    expect(planTrip(fine, [hourly(), hourly()], [undefined, undefined], NOW).weakest).toBeUndefined();
    // one night alone is never "the weakest"
    expect(planTrip([night(spot('a', 10), '2026-07-01')], [hourly()], [undefined], NOW).weakest).toBeUndefined();
  });
  it('a missing forecast leaves the weather out and is not counted as good or bad', () => {
    const p = planTrip([night(spot('a', 85), '2026-07-01'), night(spot('b', 85), '2026-07-02')], [hourly(), undefined], [undefined, undefined], NOW);
    expect(p.rows[1]).toMatchObject({ weather: undefined, forecast: undefined, flags: [], stop: false, forecastState: 'failed' });
  });
  it('a night beyond the forecast says so, even when a forecast is at hand', () => {
    const p = planTrip([night(spot('a', 85), '2026-07-20')], [hourly()], [undefined], NOW);
    expect(p.rows[0]).toMatchObject({ forecast: undefined, weather: undefined, forecastState: 'beyond' });
  });
  it('an unknown legality does not make a night the weakest', () => {
    const p = planTrip([night(spot('a', undefined), '2026-07-01'), night(spot('b', 60), '2026-07-02')], [hourly(), hourly()], [undefined, undefined], NOW);
    expect(p.weakest).toBe(1);
  });
});

describe('legality judged for the night\'s date', () => {
  it('replaces the saved score and says when it got worse since the spot was saved', () => {
    const s = spot('a', 85);
    const p = planTrip([night(s, '2026-07-01')], [hourly()], [fresh('no', 0, { why: 'Wildlife quiet zone' })], NOW);
    expect(p.rows[0]).toMatchObject({ legal: 0, verdict: 'no', legalFresh: true, changed: 'worse', why: 'Wildlife quiet zone', unchecked: false });
  });
  it('says when it got better, and nothing when the verdict is the same', () => {
    const s = spot('a', 30, { verdict: 'no' });
    expect(planTrip([night(s, '2026-07-01')], [hourly()], [fresh('likely_ok', 85)], NOW).rows[0]!.changed).toBe('better');
    expect(planTrip([night(spot('b', 85), '2026-07-01')], [hourly()], [fresh('likely_ok', 85)], NOW).rows[0]!.changed).toBeUndefined();
  });
  it('a banned night is the weakest even with fine weather', () => {
    const p = planTrip([night(spot('a', 85), '2026-07-01'), night(spot('b', 85), '2026-07-02')], [hourly(), hourly()], [undefined, fresh('no', 0)], NOW);
    expect(p.weakest).toBe(1);
  });
  it('an unknown or unchecked verdict is not compared, and an unrated spot has nothing to compare with', () => {
    expect(planTrip([night(spot('a', 85), '2026-07-01')], [hourly()], [fresh('unknown', 40)], NOW).rows[0]!.changed).toBeUndefined();
    expect(planTrip([night(spot('a', 85), '2026-07-01')], [hourly()], [fresh('caution', undefined, { unchecked: true })], NOW).rows[0]).toMatchObject({ changed: undefined, unchecked: true });
    const imported: SavedSpot = { id: 'i', lat: 46.5, lng: 7.7, name: 'Imported', snapshot: unratedSnapshot(0) };
    expect(planTrip([night(imported, '2026-07-01')], [hourly()], [fresh('no', 0)], NOW).rows[0]!.changed).toBeUndefined();
    expect(planTrip([night(imported, '2026-07-01')], [hourly()], [undefined], NOW).rows[0]).toMatchObject({ unchecked: true, legalFresh: false });
  });
});
