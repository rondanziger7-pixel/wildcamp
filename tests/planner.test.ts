import { describe, expect, it } from 'vitest';
import { flagsFor, planNights } from '../src/planner';
import { nightWindows, type Hourly, type Night } from '../src/comfort/weather';
import type { SavedSpot, SpotSnapshot } from '../src/saved';

const snap = (legal?: number): SpotSnapshot => ({ verdict: 'likely_ok', legal, sleep: 70, pros: [], cons: [], complete: true, savedAt: 0 });
const spot = (id: string, legal?: number): SavedSpot => ({ id, lat: 46.5, lng: 7.7, name: `Spot ${id}`, snapshot: snap(legal) });

/** Hourly forecast from 2026-07-01 00:00 for 5 days with constant values. */
function hourly(over: Partial<Record<keyof Hourly, number>> = {}): Hourly {
  const time = Array.from({ length: 120 }, (_, i) => `2026-07-${String(1 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
  const c = (v: number) => time.map(() => v);
  return { time, temperature_2m: c(over.temperature_2m ?? 10), wind_speed_10m: c(over.wind_speed_10m ?? 5), wind_gusts_10m: c(over.wind_gusts_10m ?? 12), wind_direction_10m: c(270), precipitation: c(over.precipitation ?? 0), weather_code: c(over.weather_code ?? 1), cloud_cover: c(50) };
}
const windows = nightWindows('2026-07-01T10:00', 4); // Tonight, Tomorrow, Fri, Sat

describe('flags', () => {
  const n = (o: Partial<Night>): Night => ({ from: '', to: '', minTempC: 5, maxGustKmh: 10, meanWindKmh: 5, windFromDeg: 0, precipMm: 0, thunder: false, ...o });
  it('names what to watch for', () => {
    expect(flagsFor(n({}))).toEqual([]);
    expect(flagsFor(n({ thunder: true, maxGustKmh: 85, precipMm: 12, snowCm: 3, minTempC: -6 }))).toEqual(['thunderstorm', 'storm gusts', 'heavy rain', 'new snow', 'hard frost']);
    expect(flagsFor(n({ maxGustKmh: 55, precipMm: 6, minTempC: -1 }))).toEqual(['strong wind', 'rain', 'frost']);
  });
});

describe('trip plan', () => {
  it('assigns the spots to nights in order, each with its own forecast and the saved legality', () => {
    const p = planNights([spot('a', 85), spot('b', 50)], windows, [hourly(), hourly({ precipitation: 1 })]);
    expect(p.rows.map((r) => [r.night, r.spot.id, r.legal])).toEqual([['Tonight', 'a', 85], ['Tomorrow', 'b', 50]]);
    expect(p.rows[0]!.forecast).toBeDefined();
    expect(p.rows[0]!.weather).toBeGreaterThan(p.rows[1]!.weather! - 1);
    expect(p.dropped).toEqual([]);
  });
  it('a forecast per spot: a stormy spot scores below a calm one on the same night', () => {
    const p = planNights([spot('calm', 85), spot('storm', 85)], windows.slice(0, 2), [hourly(), hourly({ wind_gusts_10m: 90, wind_speed_10m: 50, precipitation: 2, weather_code: 95 })]);
    expect(p.rows[1]!.stop).toBe(true);
    expect(p.rows[1]!.flags).toEqual(expect.arrayContaining(['thunderstorm', 'storm gusts']));
    expect(p.rows[1]!.weather).toBeLessThanOrEqual(10);
    expect(p.rows[0]!.stop).toBe(false);
    expect(p.weakest).toBe(1);
  });
  it('the weakest night is the lowest of legality and weather', () => {
    const p = planNights([spot('a', 85), spot('b', 20), spot('c', 85)], windows, [hourly(), hourly(), hourly()]);
    expect(p.weakest).toBe(1);
  });
  it('a missing forecast leaves the weather out and is not counted as good or bad', () => {
    const p = planNights([spot('a', 85), spot('b', 85)], windows, [hourly(), undefined]);
    expect(p.rows[1]).toMatchObject({ weather: undefined, forecast: undefined, flags: [], stop: false });
  });
  it('drops spots beyond the forecast range and says which', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((i) => spot(i, 80));
    const p = planNights(six, windows, six.map(() => hourly()));
    expect(p.rows).toHaveLength(windows.length);
    expect(p.dropped.map((s) => s.id)).toEqual(['e', 'f']);
  });
  it('an unknown legality does not make a night the weakest', () => {
    const p = planNights([spot('a', undefined), spot('b', 60)], windows, [hourly(), hourly()]);
    expect(p.weakest).toBe(1);
  });
});
