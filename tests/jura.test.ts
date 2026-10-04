import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { wgs84ToLv95 } from '../src/coords';
import { fetchJuraReserves, juraReserveHits, parseJuraGml } from '../src/jura';
import points from './fixtures/ju-points.json';

// Real responses from the canton's WMS (GetFeatureInfo), saved 2026-10-04.
const reserveGml = readFileSync('tests/fixtures/ju-gfi-reserve.gml', 'utf-8');
const zoneGml = readFileSync('tests/fixtures/ju-gfi-zone.gml', 'utf-8');

describe('Jura GML parsing', () => {
  it('reads name, kind and polygon rings from a reserve', () => {
    const [f] = parseJuraGml(reserveGml);
    expect(f?.name).toBe("Réserve naturelle de l'Etang des Royes");
    expect(f?.kind).toBe('Réserve naturelle - En vigueur');
    expect(f?.rings.length).toBeGreaterThanOrEqual(1);
    expect(f!.rings[0]!.length).toBeGreaterThan(20);
    expect(f!.rings[0]![0]).toBeGreaterThan(2_500_000); // LV95 easting
  });
  it('reads landscape zones as zones, not reserves', () => {
    const feats = parseJuraGml(zoneGml);
    expect(feats.length).toBeGreaterThan(0);
    expect(feats.every((f) => f.kind.startsWith('Zone'))).toBe(true);
  });
  it('an empty response gives no features', () => {
    expect(parseJuraGml('<msGMLOutput></msGMLOutput>')).toEqual([]);
  });
});

describe('Jura reserve hits', () => {
  it('flags a point inside a reserve and drives the verdict to no', () => {
    const { e, n } = wgs84ToLv95(points.reserve.lat, points.reserve.lon);
    const hits = juraReserveHits(parseJuraGml(reserveGml), e, n);
    expect(hits).toHaveLength(1);
    expect(assess({ zones: hits, treeline: 'above' }).verdict).toBe('no');
  });
  it('ignores landscape zones and points outside the polygon', () => {
    const z = wgs84ToLv95(points.zone.lat, points.zone.lon);
    expect(juraReserveHits(parseJuraGml(zoneGml), z.e, z.n)).toEqual([]);
    const far = wgs84ToLv95(points.reserve.lat + 0.05, points.reserve.lon + 0.05);
    expect(juraReserveHits(parseJuraGml(reserveGml), far.e, far.n)).toEqual([]);
  });
});

// Hits the cantonal service; run with LIVE=1 (and keep the number of calls small).
const live = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LIVE;
describe.skipIf(!live)('live Jura WMS', () => {
  it('finds the reserve at the fixture point and none at the landscape-zone point', async () => {
    const hit = await fetchJuraReserves(points.reserve.lat, points.reserve.lon);
    expect(hit.map((h) => h.layer.id)).toContain('ju-reserve');
    const zone = await fetchJuraReserves(points.zone.lat, points.zone.lon);
    expect(zone).toEqual([]);
  }, 60_000);
});
