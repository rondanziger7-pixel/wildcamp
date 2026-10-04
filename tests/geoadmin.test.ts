import { describe, expect, it } from 'vitest';
import { parseZoneHits } from '../src/geoadmin';
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
});
