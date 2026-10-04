import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { wgs84ToLv95 } from '../src/coords';
import {
  decodeForestMask,
  forestAt,
  nearestForestM,
  parseForestMask,
  type ForestMask,
} from '../src/forestmask';
import { classifyTreeline } from '../src/treeline';
import fixture from './fixtures/forest-points.json';

/** Small synthetic mask: 100x100 cells of 25 m, NW corner at (1000, 5000); `cells` maps "col,row" -> class. */
function makeMask(cells: Record<string, number>): ForestMask {
  const width = 100;
  const height = 100;
  const data = new Uint8Array((width * height) / 4);
  for (const [key, cls] of Object.entries(cells)) {
    const [c, r] = key.split(',').map(Number) as [number, number];
    const i = r * width + c;
    data[i >> 2] = (data[i >> 2] ?? 0) | (cls << ((i & 3) * 2));
  }
  return { width, height, cell: 25, x0: 1000, y0: 5000, data };
}
// centre of cell (c, r)
const at = (c: number, r: number) => ({ e: 1000 + c * 25 + 12, n: 5000 - r * 25 - 12 });

describe('forest mask lookups (synthetic)', () => {
  const mask = makeMask({ '10,10': 1, '20,10': 2, '30,10': 3 });
  it('reads each class from the right cell', () => {
    expect(forestAt(mask, at(10, 10).e, at(10, 10).n)).toBe(1);
    expect(forestAt(mask, at(20, 10).e, at(20, 10).n)).toBe(2);
    expect(forestAt(mask, at(30, 10).e, at(30, 10).n)).toBe(3);
    expect(forestAt(mask, at(11, 10).e, at(11, 10).n)).toBe(0);
  });
  it('treats north as up and east as right', () => {
    expect(forestAt(mask, at(10, 9).e, at(10, 9).n)).toBe(0);
    expect(forestAt(mask, at(10, 11).e, at(10, 11).n)).toBe(0);
    expect(forestAt(mask, at(9, 10).e, at(9, 10).n)).toBe(0);
  });
  it('is 0 outside the grid', () => {
    expect(forestAt(mask, 0, 0)).toBe(0);
    expect(forestAt(mask, 9e6, 9e6)).toBe(0);
  });
  it('measures distance to the nearest forest cell', () => {
    const p = at(14, 10); // 4 cells east of (10,10)
    expect(nearestForestM(mask, p.e, p.n, 500)).toBe(100);
    expect(nearestForestM(mask, p.e, p.n, 50)).toBeUndefined();
  });
  it('rejects garbage', () => {
    expect(() => parseForestMask(new Uint8Array(40))).toThrow();
  });
});

describe('classifyTreeline (synthetic)', () => {
  const mask = makeMask({ '50,50': 1 });
  const far = at(5, 5);
  it('forest cell is forest regardless of elevation', () => {
    expect(classifyTreeline(mask, at(50, 50).e, at(50, 50).n, 2500).status).toBe('forest');
  });
  it('near forest stays unknown, even high up', () => {
    const p = at(53, 50);
    expect(classifyTreeline(mask, p.e, p.n, 2500).status).toBe('unknown');
  });
  it('lowland is below the treeline even right next to forest', () => {
    const p = at(53, 50);
    expect(classifyTreeline(mask, p.e, p.n, 540).status).toBe('below');
  });
  it('clear of forest: elevation decides', () => {
    expect(classifyTreeline(mask, far.e, far.n, 2200).status).toBe('above');
    expect(classifyTreeline(mask, far.e, far.n, 1800).status).toBe('above');
    expect(classifyTreeline(mask, far.e, far.n, 1650).status).toBe('unknown');
    expect(classifyTreeline(mask, far.e, far.n, 900).status).toBe('below');
    expect(classifyTreeline(mask, far.e, far.n, undefined).status).toBe('unknown');
  });
  it('falls back to the elevation estimate without a mask', () => {
    expect(classifyTreeline(undefined, 0, 0, 2600).status).toBe('above');
    expect(classifyTreeline(undefined, 0, 0, 1900).status).toBe('unknown');
  });
});

describe('real forest mask (public/forest-mask.bin.gz)', () => {
  let mask: ForestMask;
  beforeAll(async () => {
    const b = readFileSync('public/forest-mask.bin.gz');
    mask = await decodeForestMask(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });

  it('covers a plausible share of Switzerland (~30% forest)', () => {
    let forest = 0;
    for (let i = 0; i < mask.width * mask.height; i += 7) {
      if ((((mask.data[i >> 2] ?? 0) >> ((i & 3) * 2)) & 3) !== 0) forest++;
    }
    const km2 = (forest * 7 * 625) / 1e6;
    expect(km2).toBeGreaterThan(11000);
    expect(km2).toBeLessThan(14000);
  });

  it('agrees with the source polygons: points inside large forests are forest', () => {
    const hits = fixture.inside.filter(([e, n]) => forestAt(mask, e!, n!) !== 0).length;
    expect(hits / fixture.inside.length).toBeGreaterThan(0.97);
  });

  it('agrees with the source polygons: points 60 m+ from forest are mostly not forest', () => {
    const misses = fixture.outside.filter(([e, n]) => forestAt(mask, e!, n!) === 0).length;
    expect(misses / fixture.outside.length).toBeGreaterThan(0.93);
  });

  const at84 = (lat: number, lon: number) => {
    const { e, n } = wgs84ToLv95(lat, lon);
    return classifyTreeline(mask, e, n, undefined);
  };
  it('Bremgartenwald (Bern) is forest', () => {
    expect(at84(46.974, 7.413).status).toBe('forest');
  });
  it('Aletschwald is forest', () => {
    expect(at84(46.39, 8.018).status).toBe('forest');
  });
  it('high alpine spots have no forest within 500 m', () => {
    for (const [lat, lon] of [
      [45.9833, 7.7845], // Gornergrat
      [46.5475, 7.985], // Jungfraujoch
      [46.745, 9.95], // Flüelapass
    ] as const) {
      const { e, n } = wgs84ToLv95(lat, lon);
      expect(forestAt(mask, e, n)).toBe(0);
      expect(nearestForestM(mask, e, n, 500)).toBeUndefined();
    }
  });
});
