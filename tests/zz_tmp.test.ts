import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { wgs84ToLv95 } from '../src/coords';
import { decodeForestMask, forestAt, nearestForestM } from '../src/forestmask';
import { decodeTreelineSurface, treelineAt } from '../src/treelinesurface';
import { classifyTreeline } from '../src/treeline';
const buf = (f: string) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
it('x', async () => {
  const m = await decodeForestMask(buf('public/forest-mask.bin.gz'));
  const s = await decodeTreelineSurface(buf('public/treeline-surface.bin.gz'));
  for (const [la, lo, z] of [[46.3958, 8.7489, 2170], [46.3948, 8.7468, 2095], [46.3948, 8.7468, 2050]] as const) {
    const { e, n } = wgs84ToLv95(la, lo);
    console.log(la, lo, 'forest', forestAt(m, e, n), 'near', nearestForestM(m, e, n, 3000), 'cells', 'local', treelineAt(s, e, n), classifyTreeline(m, s, e, n, z));
  }
});
