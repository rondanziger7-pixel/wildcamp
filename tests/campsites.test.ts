import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { campsiteLabel, campsiteLine, distanceText, nearestCampsites, parseCampsites } from '../src/campsites';
import { CAMPSITES_FILE, LOCAL_DATA_FILES } from '../src/localdata';

const real = parseCampsites(JSON.parse(gunzipSync(readFileSync(`public/${CAMPSITES_FILE}`)).toString('utf8')));

describe('the bundled campsite list', () => {
  it('is cached for offline use with the other data', () => {
    expect(LOCAL_DATA_FILES).toContain(CAMPSITES_FILE);
  });
  it('holds the campsites of Switzerland, all inside the country', () => {
    expect(real.sites.length).toBeGreaterThan(400);
    expect(real.sites.filter((s) => s.kind === 'c').length).toBeGreaterThan(350);
    for (const s of real.sites) {
      expect(s.lat, s.name).toBeGreaterThan(45.7);
      expect(s.lat, s.name).toBeLessThan(47.9);
      expect(s.lon, s.name).toBeGreaterThan(5.9);
      expect(s.lon, s.name).toBeLessThan(10.6);
    }
  });
  it('finds the known campsites where the federal map has them', () => {
    const k = nearestCampsites(real, 46.4974, 7.6848, 2);
    expect(k[0]!.site.name).toBe('Rendez-vous');
    expect(k[0]!.distM).toBeLessThan(300);
    const i = nearestCampsites(real, 46.6863, 7.8632, 4).map((c) => c.site.name);
    expect(i).toEqual(expect.arrayContaining(['Interlaken', 'Jungfraucamp']));
    expect(nearestCampsites(real, 46.5197, 6.6323, 1)[0]!.site.name).toBe('Vidy');
  });
  it('says nothing for a place with no campsite in reach', () => {
    expect(nearestCampsites(real, 46.5, 8.0, 3, 200)).toEqual([]);
    expect(campsiteLine([])).toBeUndefined();
  });
});

describe('nearest campsites', () => {
  const list = parseCampsites({
    asOf: '2026-10-07',
    sites: [
      ['Near caravans', 46.0, 7.0, 's'],
      ['Far camp', 46.0, 7.1, 'c'],
      ['Middle camp', 46.0, 7.05, 'c'],
      ['', 46.2, 7.0, 'c'],
      ['broken', 'x', 7, 'c'],
      ['bad kind', 46, 7, 'z'],
    ],
  });
  it('ignores damaged rows', () => {
    expect(list.sites).toHaveLength(4);
    expect(() => parseCampsites({})).toThrow();
    expect(() => parseCampsites(null)).toThrow();
  });
  it('sorts by distance and shows a caravan-only area only when it is nearer than any campsite', () => {
    const r = nearestCampsites(list, 46.0, 7.001, 5);
    expect(r.map((c) => c.site.name)).toEqual(['Near caravans', 'Middle camp', 'Far camp', '']);
    const r2 = nearestCampsites(list, 46.0, 7.06, 5);
    expect(r2.map((c) => c.site.name)).toEqual(['Middle camp', 'Far camp', '']); // the caravan area is farther than a campsite
  });
  it('respects the count and the reach', () => {
    expect(nearestCampsites(list, 46.0, 7.05, 1)).toHaveLength(1);
    expect(nearestCampsites(list, 46.0, 7.05, 5, 1000).map((c) => c.site.name)).toEqual(['Middle camp']);
  });
  it('writes distances and labels', () => {
    expect(distanceText(0)).toBe('10 m');
    expect(distanceText(842)).toBe('840 m');
    expect(distanceText(1234)).toBe('1.2 km');
    expect(distanceText(15_800)).toBe('16 km');
    expect(campsiteLabel({ name: 'Vidy', lat: 0, lon: 0, kind: 'c' })).toBe('Campsite Vidy');
    expect(campsiteLabel({ name: '', lat: 0, lon: 0, kind: 's' })).toBe('Caravan site');
    const line = campsiteLine(nearestCampsites(list, 46.0, 7.05, 2))!;
    expect(line).toContain('Campsite Middle camp (10 m)');
    expect(line).toMatch(/not whether it is open or takes tents/);
  });
});
