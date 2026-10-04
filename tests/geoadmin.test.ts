import { describe, expect, it } from 'vitest';
import { inSeason, parseZoneHits } from '../src/geoadmin';
import { assess } from '../src/assess';

// Attribute shapes copied from live geo.admin.ch identify responses.
const SNP = {
  layerBodId: 'ch.bafu.schutzgebiete-paerke_nationaler_bedeutung',
  attributes: { name: 'Schweizerischer Nationalpark', kategorie: 'SNP', label: 'Schweizerischer Nationalpark' },
};
const REGIONAL_PARK = {
  layerBodId: 'ch.bafu.schutzgebiete-paerke_nationaler_bedeutung',
  attributes: { name: 'Biosfera Val Müstair', kategorie: 'RN', label: 'Biosfera Val Müstair' },
};
const WRZ = {
  layerBodId: 'ch.bafu.wrz-wildruhezonen_portal',
  attributes: {
    label: 'Plan Mezdi (Nr. 169.0)',
    best_de: 'Zutrittsverbot (zu Fuss und Wintersportarten)',
    schutzzeit: '21.12. - 30.04.',
    kanton: 'GR',
  },
};

const PRONATURA = {
  layerBodId: 'ch.pronatura.naturschutzgebiete',
  attributes: { nummer: 15011, name: 'Combe Grède', label: 'Combe Grède' },
};
const BIRDS = {
  layerBodId: 'ch.bafu.bundesinventare-vogelreservate',
  attributes: { name: "Chevroux jusqu'à Portalban (FR, VD)", objnummer: 5, teilgebiet: 'IV' }, // no label
};

describe('parseZoneHits', () => {
  it('reads Pro Natura reserves and falls back to name for bird reserves', () => {
    const hits = parseZoneHits({ results: [PRONATURA, BIRDS] });
    expect(hits.map((h) => h.name)).toEqual(['Combe Grède', "Chevroux jusqu'à Portalban (FR, VD)"]);
    expect(assess({ zones: hits, treeline: 'above' }).verdict).toBe('caution');
  });
  it('flags the Swiss National Park as prohibited', () => {
    const hits = parseZoneHits({ results: [SNP] });
    expect(hits).toHaveLength(1);
    expect(assess({ zones: hits, treeline: 'above' }).verdict).toBe('no');
  });
  it('ignores other parks', () => {
    expect(parseZoneHits({ results: [REGIONAL_PARK] })).toHaveLength(0);
  });
  it('keeps season and canton for quiet zones', () => {
    const [hit] = parseZoneHits({ results: [WRZ] });
    expect(hit?.name).toBe('Plan Mezdi (Nr. 169.0)');
    expect(hit?.detail).toContain('21.12. - 30.04.');
    expect(hit?.detail).toContain('[GR]');
  });
  it('ignores unknown layers and empty responses', () => {
    expect(parseZoneHits({ results: [{ layerBodId: 'x.y.z' }] })).toEqual([]);
    expect(parseZoneHits({})).toEqual([]);
  });

  describe('wildlife quiet zones follow their own data', () => {
    const wrz = (extra: Record<string, unknown>) => ({
      layerBodId: 'ch.bafu.wrz-wildruhezonen_portal',
      attributes: { label: 'Z', schutzs_de: 'rechtsverbindlich', best_de: 'Zutrittsverbot', schutzzeit: '01.12. - 20.04.', kanton: 'BE', ...extra },
    });
    const winter = new Date(2027, 0, 15);
    const summer = new Date(2026, 6, 15);
    const sev = (r: ReturnType<typeof wrz>, d: Date) => parseZoneHits({ results: [r] }, d)[0]!.layer.severity;
    it('entry ban in season is restricted and gives "no"', () => {
      expect(sev(wrz({}), winter)).toBe('restricted');
      expect(assess({ zones: parseZoneHits({ results: [wrz({})] }, winter), treeline: 'above' }).verdict).toBe('no');
    });
    it('out of season it is only caution and says so', () => {
      const [h] = parseZoneHits({ results: [wrz({})] }, summer);
      expect(h!.layer.severity).toBe('caution');
      expect(h!.layer.note).toMatch(/not running today/);
    });
    it('year-round entry bans stay restricted in summer', () => {
      expect(sev(wrz({ schutzzeit: undefined }), summer)).toBe('restricted');
    });
    it('recommended zones, other rules and winter-sport rules are caution', () => {
      expect(sev(wrz({ schutzs_de: 'empfohlen' }), winter)).toBe('caution');
      expect(sev(wrz({ best_de: 'Andere Bestimmung' }), winter)).toBe('caution');
      expect(sev(wrz({ best_de: 'Wintersportverbot abseits eingezeichneter Routen' }), winter)).toBe('caution');
    });
    it('path-only rules count as entry rules', () => {
      expect(sev(wrz({ best_de: 'Wegegebot, Leinenpflicht' }), winter)).toBe('restricted');
    });
    it('season matching handles year wrap and junk', () => {
      expect(inSeason('21.12. - 30.04.', new Date(2027, 1, 1))).toBe(true);
      expect(inSeason('21.12. - 30.04.', new Date(2026, 9, 4))).toBe(false);
      expect(inSeason('15.06. - 15.09.', new Date(2026, 6, 1))).toBe(true);
      expect(inSeason('ganzjährig', new Date(2026, 9, 4))).toBe(true);
      expect(inSeason(undefined, new Date())).toBe(true);
    });
  });

  describe('other federal layers', () => {
    it('floodplains, bogs and dry meadows no longer force "no" (their ordinances have no camping ban)', () => {
      for (const id of [
        'ch.bafu.bundesinventare-auen',
        'ch.bafu.bundesinventare-auen_anhang2',
        'ch.bafu.bundesinventare-hochmoore',
        'ch.bafu.bundesinventare-flachmoore',
        'ch.bafu.bundesinventare-trockenwiesen_trockenweiden',
        'ch.bafu.bundesinventare-amphibien_wanderobjekte',
      ]) {
        const hits = parseZoneHits({ results: [{ layerBodId: id, attributes: { label: 'X', auen_type_de: 'Gletschervorfeld' } }] });
        expect(hits[0]!.layer.severity, id).toBe('caution');
        expect(assess({ zones: hits, treeline: 'above' }).verdict, id).toBe('caution');
      }
    });
    it('shows glacier forefield type', () => {
      const [h] = parseZoneHits({ results: [{ layerBodId: 'ch.bafu.bundesinventare-auen', attributes: { label: 'Rhone', auen_type_de: 'Gletschervorfeld' } }] });
      expect(h!.detail).toContain('Gletschervorfeld');
    });
    const shooting = (dates: string[], off: boolean[]) => ({
      layerBodId: 'ch.vbs.schiessanzeigen',
      attributes: { label: 'Dammastock', belegungsdatum: dates, kein_schiessen: off, zeit_von: dates.map(() => '0730'), zeit_bis: dates.map(() => '1145'), url_en: 'https://www.armee.ch/shootingrangebulletin/1' },
    });
    it('army shooting zones are info, and caution on a firing day', () => {
      const day = new Date(2026, 9, 6);
      const [quiet] = parseZoneHits({ results: [shooting(['06.10.2026'], [true])] }, day);
      expect(quiet!.layer.severity).toBe('info');
      expect(quiet!.detail).toMatch(/No shooting/);
      const [live] = parseZoneHits({ results: [shooting(['06.10.2026'], [false])] }, day);
      expect(live!.layer.severity).toBe('caution');
      expect(live!.detail).toMatch(/07:30 to 11:45/);
      expect(live!.detail).toContain('armee.ch');
      expect(parseZoneHits({ results: [shooting([], [])] }, day)[0]!.detail).toMatch(/No firing is listed/);
    });
  });
});
