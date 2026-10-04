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
import { decodeTreelineSurface, treelineAt, type TreelineSurface } from '../src/treelinesurface';
import vertices from './fixtures/forest-vertices.json';
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
    expect(classifyTreeline(mask, undefined, at(50, 50).e, at(50, 50).n, 2500).status).toBe('forest');
  });
  it('near forest stays unknown, even high up', () => {
    const p = at(53, 50);
    expect(classifyTreeline(mask, undefined, p.e, p.n, 2500).status).toBe('unknown');
  });
  it('lowland is below the treeline even right next to forest', () => {
    const p = at(53, 50);
    expect(classifyTreeline(mask, undefined, p.e, p.n, 540).status).toBe('below');
  });
  it('clear of forest: elevation decides', () => {
    expect(classifyTreeline(mask, undefined, far.e, far.n, 2200).status).toBe('above');
    expect(classifyTreeline(mask, undefined, far.e, far.n, 1800).status).toBe('above');
    expect(classifyTreeline(mask, undefined, far.e, far.n, 1650).status).toBe('unknown');
    expect(classifyTreeline(mask, undefined, far.e, far.n, 900).status).toBe('below');
    expect(classifyTreeline(mask, undefined, far.e, far.n, undefined).status).toBe('unknown');
  });
  it('falls back to the elevation estimate without a mask', () => {
    expect(classifyTreeline(undefined, undefined, 0, 0, 2600).status).toBe('above');
    expect(classifyTreeline(undefined, undefined, 0, 0, 1900).status).toBe('unknown');
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
    return classifyTreeline(mask, undefined, e, n, undefined);
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

/** Synthetic surface: 10x10 cells of 1 km, NW corner at (1000, 5000); one value everywhere except where overridden. */
function makeSurface(fill: number, overrides: Record<string, number> = {}): TreelineSurface {
  const heights = new Int16Array(100).fill(fill);
  for (const [k, v] of Object.entries(overrides)) {
    const [c, r] = k.split(',').map(Number) as [number, number];
    heights[r * 10 + c] = v;
  }
  return { width: 10, height: 10, cell: 1000, x0: 1000, y0: 5000, heights };
}

describe('local treeline (synthetic)', () => {
  const mask = makeMask({ '50,50': 1 });
  const p = at(5, 5);
  const surface = makeSurface(2000, { '9,9': 0 });
  // centre of surface cell (c, r)
  const sc = (c: number, r: number) => ({ e: 1000 + c * 1000 + 500, n: 5000 - r * 1000 - 500 });
  it('reads the cell value, north up and east right, and 0 means no estimate', () => {
    const s = makeSurface(2000, { '3,0': 1700, '9,9': 0 });
    expect(treelineAt(s, sc(3, 0).e, sc(3, 0).n)).toBe(1700);
    expect(treelineAt(s, sc(3, 1).e, sc(3, 1).n)).toBe(2000); // one row south
    expect(treelineAt(s, sc(4, 0).e, sc(4, 0).n)).toBe(2000); // one column east
    expect(treelineAt(s, sc(2, 0).e, sc(2, 0).n)).toBe(2000); // one column west
    expect(treelineAt(s, sc(9, 9).e, sc(9, 9).n)).toBeUndefined(); // 0 = no estimate
    expect(treelineAt(s, 0, 0)).toBeUndefined(); // outside the grid
  });
  it('decides by the local limit with a margin either side', () => {
    expect(classifyTreeline(mask, surface, p.e, p.n, 2150).status).toBe('above');
    expect(classifyTreeline(mask, surface, p.e, p.n, 2100).status).toBe('above');
    expect(classifyTreeline(mask, surface, p.e, p.n, 2050).status).toBe('unknown');
    expect(classifyTreeline(mask, surface, p.e, p.n, 1950).status).toBe('unknown');
    expect(classifyTreeline(mask, surface, p.e, p.n, 1850).status).toBe('below');
  });
  it('a high local limit means a mid-altitude clearing is below, not above', () => {
    // Without the surface 1900 m with no forest nearby would read 'above'.
    expect(classifyTreeline(mask, undefined, p.e, p.n, 1900).status).toBe('above');
    expect(classifyTreeline(mask, makeSurface(2300), p.e, p.n, 1900).status).toBe('below');
  });
  it('a low local limit means a spot near forest can still be above', () => {
    const near = at(53, 50); // forest 75 m away
    expect(classifyTreeline(mask, undefined, near.e, near.n, 1900).status).toBe('unknown');
    expect(classifyTreeline(mask, makeSurface(1500), near.e, near.n, 1900).status).toBe('above');
  });
  it('forest still wins, and missing estimate falls back to the elevation bands', () => {
    expect(classifyTreeline(mask, surface, at(50, 50).e, at(50, 50).n, 3000).status).toBe('forest');
    const noEstimate = makeSurface(0);
    expect(classifyTreeline(mask, noEstimate, p.e, p.n, 2200).status).toBe('above');
  });
});

describe('real treeline surface (public/treeline-surface.bin.gz)', () => {
  let surface: TreelineSurface;
  beforeAll(async () => {
    const b = readFileSync('public/treeline-surface.bin.gz');
    surface = await decodeTreelineSurface(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  });

  it('almost no forest vertex sits above the local limit (alignment + conservative bias)', () => {
    const above = vertices.filter(([e, n, z]) => {
      const t = treelineAt(surface, e!, n!);
      return t === undefined || z! > t;
    }).length;
    expect(above / vertices.length).toBeLessThan(0.03);
  });

  const t = (lat: number, lon: number) => {
    const { e, n } = wgs84ToLv95(lat, lon);
    return treelineAt(surface, e, n);
  };
  it('has plausible treelines in known regions', () => {
    expect(t(46.02, 7.75)).toBeGreaterThan(2200); // Zermatt
    expect(t(46.02, 7.75)).toBeLessThan(2500);
    expect(t(46.5, 9.84)).toBeGreaterThan(2150); // Engadin
    expect(t(47.13, 7.05)).toBeLessThan(1700); // Jura
    expect(t(47.25, 9.34)).toBeGreaterThan(1600); // Säntis
    expect(t(47.25, 9.34)).toBeLessThan(1950);
    expect(t(46.95, 7.44)).toBeLessThan(1100); // Bern lowlands
  });
  it('is higher in the central Alps than in the northern Prealps and the Jura', () => {
    expect(t(46.02, 7.75)!).toBeGreaterThan(t(47.25, 9.34)!);
    expect(t(47.25, 9.34)!).toBeGreaterThan(t(47.13, 7.05)!);
  });
});
