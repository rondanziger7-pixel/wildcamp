import { describe, expect, it } from 'vitest';
import { assess, type ZoneHit } from '../src/assess';
import { buildAlerts } from '../src/alerts';
import { comfortFor } from '../src/comfort/comfort';
import type { TerrainMetrics } from '../src/comfort/terrain';
import { soonWindow, summariseNight, type Hourly } from '../src/comfort/weather';
import { nearBanZones } from '../src/spotcheck';
import { LocalData } from '../src/localstore';
import { parseReserveSet, reserveZonesNear } from '../src/reserves';

const terrain = (slopeDeg: number, extra: Partial<TerrainMetrics> = {}) => ({ slopeDeg, meanHorizon: 12, tpi: 0, horizon: Array(8).fill(12), elevation: 2000, ...extra }) as unknown as TerrainMetrics;
const night = (extra = {}) => ({ from: '2026-10-06T18:00', to: '2026-10-07T08:00', minTempC: 5, maxGustKmh: 20, meanWindKmh: 10, windFromDeg: 0, precipMm: 0, thunder: false, ...extra });

describe('dangers for the first view (the overall score ignores the weather, so these must not be left out)', () => {
  it('steep ground, a storm and avalanche danger are alerts; a calm flat grassy spot has none', () => {
    const calm = comfortFor({ terrain: terrain(2), night: night(), ground: { cover: 'grass', label: 'grass', meters: 10, year: 2023 } });
    expect(calm.alerts).toEqual([]);
    const bad = comfortFor({ terrain: terrain(30), night: night({ thunder: true, maxGustKmh: 90 }) });
    const titles = bad.alerts.map((a) => a.title);
    expect(titles).toContain('Too steep to pitch');
    expect(titles).toContain('Thunderstorm forecast');
    expect(titles).toContain('Storm-force gusts');
    expect(bad.alerts.every((a) => a.tone === 'bad' || a.tone === 'warn')).toBe(true);
    expect(bad.alerts.find((a) => a.title === 'Thunderstorm forecast')!.weather).toBe(true);
    expect(bad.alerts.find((a) => a.title === 'Too steep to pitch')!.weather).toBe(false);
  });
  it('avalanche level 3 and above, deep cold and a flood area are alerts, level 2 is not', () => {
    const av = (level: number) => ({ status: 'ok' as const, level, subdivision: undefined, problems: [], region: 'Bündner Alpen', validUntilLocal: '2027-01-02T17:00' }) as never;
    expect(comfortFor({ terrain: terrain(5), avalanche: av(4) }).alerts.some((a) => a.title.startsWith('Avalanche danger'))).toBe(true);
    expect(comfortFor({ terrain: terrain(5), avalanche: av(3) }).alerts.some((a) => a.title.startsWith('Avalanche danger'))).toBe(true);
    expect(comfortFor({ terrain: terrain(5), avalanche: av(2) }).alerts).toEqual([]);
    expect(comfortFor({ terrain: terrain(5), night: night({ minTempC: -12 }) }).alerts.map((a) => a.title)).toContain('Low of -12 °C');
    expect(comfortFor({ terrain: terrain(5), hazards: { inside: ['flood50'], failed: [] } }).alerts.map((a) => a.title)).toContain('In a frequent flood area');
  });
  it('worst first, no duplicates, with the fire ban, army shooting and a close ban zone', () => {
    const shooting: ZoneHit = { layer: { id: 'ch.vbs.schiessanzeigen', label: 'Army', severity: 'caution', note: 'n' } };
    const a = assess({ zones: [shooting], treeline: 'above' });
    const list = buildAlerts({
      comfort: comfortFor({ terrain: terrain(30), night: night({ thunder: true }) }),
      assessment: { ...a, nearZones: [{ layer: { id: 'x', label: 'Swiss National Park', severity: 'prohibited', note: 'n' }, distanceM: 63 }] },
      fire: { measure: { title: 'Fire ban', ban: true } },
    });
    const texts = list.map((x) => x.text);
    expect(texts).toContain('Fire ban in force here');
    expect(texts).toContain('Army shooting is scheduled here today');
    expect(texts).toContain('A ban zone begins about 60 m away');
    expect(list.findIndex((x) => x.tone === 'warn')).toBeGreaterThan(list.map((x) => x.tone).lastIndexOf('bad'));
    expect(new Set(texts).size).toBe(texts.length);
  });
  it('high fire danger without a ban is still a line', () => {
    expect(buildAlerts({ fire: { danger: { title: 'High danger', level: 4 } } }).map((x) => x.text)).toContain('High forest fire danger: no open fires');
    expect(buildAlerts({ fire: { danger: { title: 'Moderate danger', level: 2 } } })).toEqual([]);
  });
});

describe('the hours before the evening window (a storm at 16:00 matters at 15:30)', () => {
  it('runs from now to 18:00 in the daytime and does not exist at night', () => {
    expect(soonWindow('2026-10-06T15:30')).toEqual({ from: '2026-10-06T15:30', to: '2026-10-06T18:00' });
    expect(soonWindow('2026-10-06T08:00')).toBeDefined();
    expect(soonWindow('2026-10-06T07:59')).toBeUndefined();
    expect(soonWindow('2026-10-06T18:00')).toBeUndefined();
    expect(soonWindow('2026-10-06T23:10')).toBeUndefined();
  });
  it('a thunderstorm forecast for 16:00 to 18:00 is found, and becomes an alert', () => {
    const times = Array.from({ length: 24 }, (_, i) => `2026-10-06T${String(i).padStart(2, '0')}:00`);
    const h = {
      time: times,
      temperature_2m: times.map(() => 12),
      wind_speed_10m: times.map(() => 10),
      wind_gusts_10m: times.map(() => 25),
      wind_direction_10m: times.map(() => 200),
      precipitation: times.map(() => 0),
      weather_code: times.map((t) => (t >= '2026-10-06T16' && t < '2026-10-06T18' ? 96 : 1)),
    } as unknown as Hourly;
    const soon = summariseNight(h, soonWindow('2026-10-06T15:30')!);
    expect(soon?.thunder).toBe(true);
    expect(buildAlerts({ soon }).map((a) => a.text)).toContain('Thunderstorm forecast before this evening');
    expect(summariseNight(h, { from: '2026-10-06T18:00', to: '2026-10-07T08:00' })?.thunder).toBe(false);
  });
});

describe('a ban zone that begins close by', () => {
  const layer = { id: 'ch.bafu.schutzgebiete-paerke_nationaler_bedeutung', label: 'Swiss National Park', severity: 'prohibited' as const, note: 'n' };
  it('softens "likely OK" to "caution" and says how far, so a GPS fix that is off by 60 m is not trusted', () => {
    const a = assess({ zones: [], treeline: 'above', nearZones: [{ layer, distanceM: 63 }] });
    expect(a.verdict).toBe('caution');
    const item = a.items.find((i) => i.title.includes('begins close by'))!;
    expect(item.text).toContain('60 m');
    expect(a.nearZones).toHaveLength(1);
  });
  it('does not lift a ban or hide a federal zone whose distance is unknown', () => {
    const a = assess({ zones: [], treeline: 'above', nearZones: [{ layer, withinM: 150 }] });
    expect(a.items.find((i) => i.title.includes('begins close by'))!.text).toContain('within about 150 m');
    const banned = assess({ zones: [{ layer }], treeline: 'above', nearZones: [{ layer: { ...layer, id: 'y' }, withinM: 150 }] });
    expect(banned.verdict).toBe('no');
  });
  it('measures the distance to a bundled reserve exactly', () => {
    const set = parseReserveSet({ canton: 'XX', generated: 't', reserves: [{ id: 1, name: 'Square', level: 'restricted', decree: 'd', scan: 'ban', rings: [[0, 0, 100, 0, 100, 100, 0, 100]] }, { id: 2, name: 'Soft', level: 'caution', decree: 'd', scan: 'ban', rings: [[200, 0, 300, 0, 300, 100, 200, 100]] }] });
    const near = reserveZonesNear(set, 150, 50, 100);
    expect(near).toHaveLength(1); // the soft one is only a caution and is not a ban
    expect(near[0]!.name).toBe('Square');
    expect(near[0]!.distanceM).toBeCloseTo(50, 5);
    expect(reserveZonesNear(set, 100.5, 50, 100)[0]!.distanceM).toBeCloseTo(0.5, 5);
    expect(reserveZonesNear(set, 150, 50, 10)).toEqual([]);
    expect(reserveZonesNear(set, 50, 50, 100)).toEqual([]); // inside: a hit, not a near miss
  });
  it('a zone that is already a hit is not also reported as near', () => {
    const inp = { lat: 46.5, lng: 8, nearRadiusM: 150, jura: [], failed: [], cantonKnown: true, nearZones: { results: [{ layerBodId: 'ch.bafu.bundesinventare-jagdbanngebiete', attributes: { label: 'Kärpf', typ_de: 'Gebiet mit integralen Schutzbestimmungen' } }] } };
    const hit: ZoneHit = { layer: { id: 'ch.bafu.bundesinventare-jagdbanngebiete', label: 'Federal wildlife reserve (Jagdbanngebiet)', severity: 'restricted', note: 'n' }, name: 'Kärpf' };
    const data = new LocalData('/');
    expect(nearBanZones(inp, data, [hit], new Date(), 2700000, 1200000)).toEqual([]);
    expect(nearBanZones(inp, data, [], new Date(), 2700000, 1200000)).toHaveLength(1);
  });
});
