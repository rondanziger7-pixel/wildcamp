import { describe, expect, it } from 'vitest';
import { nearBuildingNote, NEAR_BUILDING_M } from '../src/comfort/nearbuilding';

const at = { e: 1, n: 2 };
const r = (...s: [string, 'hut' | 'inn' | 'alp' | 'biwak', number][]) => ({ incomplete: false, shelters: s.map(([name, kind, meters]) => ({ name, kind, meters, at })) });

describe('sleeping near huts, inns and alps', () => {
  it('names the nearest building within range and cites the SAC leaflet', () => {
    const n = nearBuildingNote(r(['Alp Foo', 'alp', 200], ['Kesch-Hütte SAC', 'hut', 120]))!;
    expect(n.title).toBe('Close to a mountain hut');
    expect(n.text).toContain('Kesch-Hütte SAC');
    expect(n.text).toContain('120 m');
    expect(n.sources[0]).toContain('sac-cas.ch');
    expect(n.at.label).toBe('Kesch-Hütte SAC');
  });
  it('inns and alps have their own wording', () => {
    expect(nearBuildingNote(r(['Berggasthaus Bar', 'inn', 90]))!.title).toBe('Close to a mountain inn');
    expect(nearBuildingNote(r(['Alp Foo', 'alp', 90]))!.text).toMatch(/farmer/);
  });
  it('nothing beyond the range, and emergency bivouacs do not count', () => {
    expect(nearBuildingNote(r(['Hütte SAC', 'hut', NEAR_BUILDING_M + 1]))).toBeUndefined();
    expect(nearBuildingNote(r(['Biwak', 'biwak', 20]))).toBeUndefined();
    expect(nearBuildingNote(undefined)).toBeUndefined();
  });
});
