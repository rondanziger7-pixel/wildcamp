import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { fetchCanton, fetchElevation, fetchZoneHits } from '../src/geoadmin';

// Hits the real geo.admin.ch API. Run with: LIVE=1 npm test
const live = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LIVE;

describe.skipIf(!live)('live geo.admin.ch', () => {
  it('Il Fuorn is inside the Swiss National Park', async () => {
    const zones = await fetchZoneHits(46.6665, 10.243);
    expect(zones.map((z) => z.layer.label)).toContain('Swiss National Park');
    expect(assess({ zones, treeline: 'above' }).verdict).toBe('no');
  });
  it('all zone layers are queryable together', async () => {
    await expect(fetchZoneHits(46.8, 8.2)).resolves.toBeInstanceOf(Array);
  });
  it('finds the canton', async () => {
    expect((await fetchCanton(46.02, 7.75))?.code).toBe('VS'); // Zermatt
    expect((await fetchCanton(46.8, 9.84))?.code).toBe('GR'); // Davos
    expect(await fetchCanton(48.8566, 2.3522)).toBeUndefined(); // Paris
  });
  it('returns elevation', async () => {
    const h = await fetchElevation(45.9833, 7.7845);
    expect(h).toBeGreaterThan(3000);
  });
});
