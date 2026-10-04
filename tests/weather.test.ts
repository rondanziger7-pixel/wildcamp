import { describe, expect, it } from 'vitest';
import { hourLabel, linePath, nearestIndex, niceScale, xAt } from '../src/chart';
import { comfortFor } from '../src/comfort/comfort';
import { addDays, describeCode, nightWindows, severity, summariseNight, windowHours, type Hourly, type Night } from '../src/comfort/weather';
import type { TerrainMetrics } from '../src/comfort/terrain';

/** A 5-day hourly forecast with one value per hour, built from functions of the hour index. */
function forecast(from: string, hours: number, f: (i: number, t: string) => Partial<Record<string, number | null>>): Hourly {
  const time: string[] = [];
  let day = from.slice(0, 10);
  let h = Number(from.slice(11, 13));
  for (let i = 0; i < hours; i++) {
    time.push(`${day}T${String(h).padStart(2, '0')}:00`);
    h++;
    if (h === 24) {
      h = 0;
      day = addDays(day, 1);
    }
  }
  const col = (k: string, d: number) => time.map((t, i) => (f(i, t)[k] as number | null | undefined) ?? d);
  return {
    time,
    temperature_2m: col('temp', 5),
    wind_speed_10m: col('wind', 10),
    wind_gusts_10m: col('gust', 15),
    wind_direction_10m: col('dir', 270),
    precipitation: col('rain', 0),
    precipitation_probability: col('prob', 0),
    weather_code: col('code', 1),
    cloud_cover: col('cloud', 20),
    snowfall: col('snow', 0),
    freezing_level_height: col('fl', 3500),
    dew_point_2m: col('dew', -5),
  };
}

describe('night windows', () => {
  it('four nights from now, labelled Tonight, Tomorrow, then weekdays', () => {
    const w = nightWindows('2026-10-04T10:00');
    expect(w.map((x) => x.label)).toEqual(['Tonight', 'Tomorrow', 'Tue', 'Wed']);
    expect(w[0]).toMatchObject({ from: '2026-10-04T18:00', to: '2026-10-05T08:00', day: '2026-10-04' });
    expect(w[1]).toMatchObject({ from: '2026-10-05T18:00', to: '2026-10-06T08:00' });
    expect(w[3]!.to).toBe('2026-10-08T08:00');
  });
  it('late evening starts now; small hours belong to the previous evening', () => {
    expect(nightWindows('2026-10-04T22:30', 2)[0]).toMatchObject({ from: '2026-10-04T22:30', to: '2026-10-05T08:00' });
    const small = nightWindows('2026-10-05T03:00', 2);
    expect(small[0]).toMatchObject({ from: '2026-10-05T03:00', to: '2026-10-05T08:00', label: 'Tonight', day: '2026-10-04' });
    expect(small[1]).toMatchObject({ from: '2026-10-05T18:00', label: 'Tomorrow' });
  });
  it('crosses month and year ends', () => {
    expect(nightWindows('2026-12-31T12:00', 2)[0]!.to).toBe('2027-01-01T08:00');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('night summary with the extra variables', () => {
  const win = { from: '2026-10-04T18:00', to: '2026-10-05T08:00' };
  const calm = forecast('2026-10-04T12:00', 48, () => ({}));
  it('calm clear night', () => {
    const n = summariseNight(calm, win)!;
    expect(n.thunder).toBe(false);
    expect(n.worstCode).toBe(1);
    expect(n.maxPrecipProb).toBe(0);
    expect(n.snowCm).toBe(0);
    expect(n.freezingLevelM).toBe(3500);
    expect(n.minDewSpreadC).toBe(10);
    expect(n.meanCloud).toBe(20);
  });
  it('detects thunder and picks the worst sky code', () => {
    const h = forecast('2026-10-04T12:00', 48, (i) => (i === 14 ? { code: 95 } : i === 15 ? { code: 61 } : {}));
    const n = summariseNight(h, win)!;
    expect(n.thunder).toBe(true);
    expect(n.worstCode).toBe(95);
  });
  it('thunder outside the window is ignored', () => {
    const h = forecast('2026-10-04T12:00', 48, (i) => (i === 2 ? { code: 99 } : {}));
    expect(summariseNight(h, win)!.thunder).toBe(false);
  });
  it('sums snow, finds the lowest freezing level and the smallest dew spread', () => {
    const h = forecast('2026-10-04T12:00', 48, (i) => ({ snow: i >= 8 && i < 10 ? 1.5 : 0, fl: 3000 - i * 10, dew: i === 12 ? 4.5 : -5, temp: 5 }));
    const n = summariseNight(h, win)!;
    expect(n.snowCm).toBeCloseTo(3, 5);
    expect(n.freezingLevelM).toBeLessThan(3000);
    expect(n.minDewSpreadC).toBeCloseTo(0.5, 5);
  });
  it('works with only the core variables', () => {
    const { precipitation_probability, weather_code, cloud_cover, snowfall, freezing_level_height, dew_point_2m, ...core } = calm;
    void [precipitation_probability, weather_code, cloud_cover, snowfall, freezing_level_height, dew_point_2m];
    const n = summariseNight(core, win)!;
    expect(n.maxGustKmh).toBe(15);
    expect(n.thunder).toBe(false);
    expect(n.worstCode).toBeUndefined();
    expect(n.snowCm).toBeUndefined();
    expect(n.minDewSpreadC).toBeUndefined();
  });
  it('windowHours returns one point per hour in the window', () => {
    const hrs = windowHours(calm, win);
    expect(hrs).toHaveLength(14);
    expect(hrs[0]!.time).toBe('2026-10-04T18:00');
    expect(hrs.at(-1)!.time).toBe('2026-10-05T07:00');
    expect(hrs[0]).toMatchObject({ temp: 5, gust: 15, code: 1, prob: 0 });
  });
});

describe('sky codes', () => {
  it('describes WMO codes', () => {
    expect(describeCode(0).label).toBe('Clear');
    expect(describeCode(3).label).toBe('Overcast');
    expect(describeCode(45).label).toBe('Fog');
    expect(describeCode(63).label).toBe('Rain');
    expect(describeCode(65).label).toBe('Heavy rain');
    expect(describeCode(73).label).toBe('Snow');
    expect(describeCode(81).label).toBe('Showers');
    expect(describeCode(95).label).toBe('Thunderstorm');
    expect(describeCode(99).label).toBe('Thunderstorm with hail');
    expect(describeCode(1234).label).toBe('Thunderstorm with hail'); // anything >= 96 is the hail class, never a crash
    expect(describeCode(40).label).toBe('Unknown');
  });
  it('orders severity: clear < fog < drizzle < rain < snow < thunder', () => {
    const order = [0, 45, 53, 63, 73, 95].map(severity);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(severity(99)).toBeGreaterThan(severity(95));
  });
});

describe('weather changes the sleeping place rating', () => {
  const terrain = (over: Partial<TerrainMetrics> = {}): TerrainMetrics => ({ elevation: 2400, slopeDeg: 3, horizon: Array(8).fill(12), meanHorizon: 12, tpi: 0, steepAboveM: undefined, dropNearM: undefined, ...over });
  const quiet = { trailM: Infinity, huts: [], stops: [], settlementM: Infinity, parkingM: Infinity };
  const night = (over: Partial<Night> = {}): Night => ({ from: 'a', to: 'b', minTempC: 6, maxGustKmh: 20, meanWindKmh: 10, windFromDeg: 270, precipMm: 0, maxPrecipProb: 5, thunder: false, ...over });
  const rate = (n?: Night, t = terrain()) => comfortFor({ terrain: t, surroundings: quiet, night: n, water: { kind: 'stream', meters: 80, upstreamPlants: [], failed: [] } });

  it('the same spot rates better on a calm dry night than in a storm', () => {
    const good = rate(night());
    const rain = rate(night({ precipMm: 8, maxPrecipProb: 90 }));
    const storm = rate(night({ thunder: true, maxGustKmh: 60 }));
    expect(good.score).toBeGreaterThan(rain.score);
    expect(rain.score).toBeGreaterThan(storm.score);
    expect(good.weatherScore).toBeGreaterThan(0);
    expect(rain.weatherScore).toBeLessThan(good.weatherScore);
  });
  it('spot rating ignores the weather; the overall rating includes it', () => {
    const a = rate(night());
    const b = rate(night({ precipMm: 12, maxGustKmh: 55, minTempC: -6 }));
    expect(a.spotRating).toBe(b.spotRating);
    expect(a.rating).not.toBe(b.rating);
  });
  it('a thunderstorm or storm-force gusts cap the night at poor however good the spot is', () => {
    expect(rate().rating).toBe('great');
    const t = rate(night({ thunder: true }));
    expect(t.rating).toBe('poor');
    expect(t.weatherStop).toBe(true);
    expect(t.spotRating).toBe('great');
    const g = rate(night({ maxGustKmh: 95 }));
    expect(g.rating).toBe('poor');
    expect(g.weatherStop).toBe(true);
  });
  it('thunder is worse on an exposed top', () => {
    const open = rate(night({ thunder: true }), terrain({ tpi: 30, meanHorizon: 0, horizon: Array(8).fill(0) }));
    const sheltered = rate(night({ thunder: true }));
    const title = (c: ReturnType<typeof rate>) => c.factors.find((f) => f.title === 'Thunderstorm forecast')!.text;
    expect(title(open)).toMatch(/exposed/);
    expect(open.score).toBeLessThan(sheltered.score);
  });
  it('snow, heavy rain, fog and freezing-level notes appear', () => {
    const titles = (n: Partial<Night>) => rate(night(n)).factors.map((f) => f.title);
    expect(titles({ snowCm: 6 })).toContain('Snow forecast');
    expect(titles({ precipMm: 12 })).toContain('Heavy rain forecast');
    expect(titles({ minDewSpreadC: 0.5 })).toContain('Fog or heavy condensation likely');
    expect(titles({ freezingLevelM: 2000, precipMm: 3 })).toContain('Wet snow or ice possible');
    expect(titles({ maxPrecipProb: 70, precipMm: 0.3 })).toContain('Showers possible');
    expect(titles({})).toContain('Dry night forecast');
  });
  it('no forecast: no weather factors, weatherScore is zero and the gap is listed', () => {
    const c = rate(undefined);
    expect(c.weatherScore).toBe(0);
    expect(c.weatherStop).toBe(false);
    expect(c.missing).toContain('overnight forecast');
  });
  it('wind is judged against the terrain on the windward side', () => {
    const open = rate(night({ maxGustKmh: 60 }), terrain({ horizon: [12, 12, 12, 12, 12, 12, 1, 12] }));
    const shelt = rate(night({ maxGustKmh: 60 }), terrain({ horizon: [12, 12, 12, 12, 12, 12, 30, 12] }));
    expect(open.score).toBeLessThan(shelt.score);
  });
});

describe('chart helpers', () => {
  it('niceScale rounds to clean ticks and always spans the data', () => {
    const s = niceScale(-3.2, 7.9, 3);
    expect(s.min).toBeLessThanOrEqual(-3.2);
    expect(s.max).toBeGreaterThanOrEqual(7.9);
    expect(s.ticks.every((t) => Number.isInteger(t * 2))).toBe(true);
    expect(niceScale(0, 0).ticks.length).toBeGreaterThan(1);
    expect(niceScale(Number.NaN, 1)).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(niceScale(0, 1).ticks).toContain(0);
  });
  it('nearestIndex snaps and clamps', () => {
    expect(nearestIndex(0, 14, 34, 332)).toBe(0);
    expect(nearestIndex(1000, 14, 34, 332)).toBe(13);
    expect(nearestIndex(183, 14, 34, 332)).toBe(7);
    expect(nearestIndex(50, 1, 34, 332)).toBe(0);
  });
  it('xAt spreads points evenly', () => {
    expect(xAt(0, 5, 0, 100)).toBe(0);
    expect(xAt(4, 5, 0, 100)).toBe(100);
    expect(xAt(2, 5, 0, 100)).toBe(50);
    expect(xAt(0, 1, 0, 100)).toBe(50);
  });
  it('linePath breaks at gaps', () => {
    expect(linePath([0, 1, 2], [1, null, 3])).toBe('M0.0,1.0M2.0,3.0');
    expect(linePath([0, 1], [1, 2])).toBe('M0.0,1.0L1.0,2.0');
    expect(linePath([], [])).toBe('');
  });
  it('hourLabel', () => expect(hourLabel('2026-10-04T07:00')).toBe('07'));
});
