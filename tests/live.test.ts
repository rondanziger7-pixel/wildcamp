import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { fetchCanton, fetchElevation, fetchMunicipality, fetchZoneHits } from '../src/geoadmin';

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
  it('flags a Pro Natura reserve and a federal bird reserve', async () => {
    const pn = await fetchZoneHits(47.14051, 7.02602); // Combe Grède
    expect(pn.map((z) => z.layer.id)).toContain('ch.pronatura.naturschutzgebiete');
    const birds = await fetchZoneHits(46.90998, 6.92462); // Chevroux–Portalban
    expect(birds.map((z) => z.layer.id)).toContain('ch.bafu.bundesinventare-vogelreservate');
    expect(assess({ zones: birds, treeline: 'above' }).verdict).not.toBe('likely_ok');
  });
  it('shows the army shooting zone and BLN at the Rhone glacier forefield', async () => {
    const zones = await fetchZoneHits(46.5995, 8.3995);
    expect(zones.map((z) => z.layer.id)).toEqual(expect.arrayContaining(['ch.vbs.schiessanzeigen', 'ch.bafu.bundesinventare-bln']));
  });
  it('finds the canton', async () => {
    expect((await fetchCanton(46.02, 7.75))?.code).toBe('VS'); // Zermatt
    expect((await fetchCanton(46.8, 9.84))?.code).toBe('GR'); // Davos
    expect(await fetchCanton(48.8566, 2.3522)).toBeUndefined(); // Paris
    expect(await fetchCanton(46.0, 8.55)).toBeUndefined(); // Val Grande national park, Italy, inside the bounding box
  });
  it('finds the municipality', async () => {
    expect(await fetchMunicipality(46.02, 7.75)).toMatchObject({ name: 'Zermatt', canton: 'VS' });
    expect(await fetchMunicipality(46.95, 7.44)).toMatchObject({ name: 'Bern', canton: 'BE' });
  });
  it('returns elevation', async () => {
    const h = await fetchElevation(45.9833, 7.7845);
    expect(h).toBeGreaterThan(3000);
  });
});
