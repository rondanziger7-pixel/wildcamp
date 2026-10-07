import { describe, expect, it } from 'vitest';
import { campingBanSentence, inSeason, parseZoneHits } from '../src/geoadmin';
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
      expect(h!.layer.note).toMatch(/not running on 15.7.2026/);
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
    it('a ski-season zone is not "Not allowed" in July (Murgtal showed 0/100 all summer)', () => {
      const skiZone = wrz({ best_de: 'Zutrittsverbot', schutzzeit: '15.12. bis Ende Skisaison', kanton: 'SG' });
      const july = new Date(2026, 6, 15);
      expect(sev(skiZone, july)).toBe('caution');
      expect(assess({ zones: parseZoneHits({ results: [skiZone] }, july), treeline: 'above' }).verdict).not.toBe('no');
      expect(sev(skiZone, new Date(2027, 1, 10))).toBe('restricted'); // in the middle of the ski season it still is
      expect(sev(skiZone, new Date(2027, 4, 1))).toBe('caution'); // season end is unknown: not a ban we can claim
      expect(parseZoneHits({ results: [skiZone] }, new Date(2027, 4, 1))[0]!.layer.note).toMatch(/cannot be placed exactly/);
    });
    it('"En cas de neige" and lift-operation texts are caution, not a year-round ban', () => {
      expect(sev(wrz({ schutzzeit: 'En cas de neige' }), summer)).toBe('caution');
      expect(sev(wrz({ schutzzeit: 'Betriebszeiten der Bahn' }), summer)).toBe('caution');
      expect(sev(wrz({ schutzzeit: 'keine definierte Periode' }), summer)).toBe('restricted');
    });
    it('a statutory zone whose own text forbids camping is restricted for that reason, in the zone\'s own words', () => {
      const bern = wrz({ best_de: 'Wintersportverbot abseits eingezeichneter Routen', schutzzeit: 'ganzjährig/Wintersport: während Betriebszeiten der Bahn', zusatzinformation: 'Wintersport und Winterwandern sind ausserhalb der bezeichneten Routen verboten. Freies/wildes Campieren und Biwakieren sind verboten. Der Betrieb von zivilen, unbemannten Luftfahrzeugen (z.B. Drohnen, Modellflugzeuge) ist verboten.' });
      const [h] = parseZoneHits({ results: [bern] }, summer);
      expect(h!.layer.severity).toBe('restricted');
      expect(h!.detail).toContain('Freies/wildes Campieren und Biwakieren sind verboten.');
      expect(h!.detail).not.toContain('Drohnen');
    });
    it('a camping ban with its own dates follows them', () => {
      const justi = wrz({ best_de: 'Andere Bestimmung', zusatzinformation: 'Das Gebiet darf vom 1. September bis 30. November nur auf den bezeichneten Wegen betreten werden. Hunde sind an der Leine zu führen. Das freie Campieren ist vom 1. September bis zum 30. November verboten.' });
      expect(sev(justi, new Date(2026, 9, 15))).toBe('restricted');
      expect(sev(justi, new Date(2026, 6, 15))).toBe('caution');
    });
    it('a recommended zone that asks for no camping stays caution', () => {
      expect(sev(wrz({ schutzs_de: 'empfohlen', zusatzinformation: 'Freies/wildes Campieren und Biwakieren sind verboten.' }), winter)).toBe('caution');
    });
    it('does not mistake other bans for a camping ban', () => {
      expect(campingBanSentence('Der Betrieb von zivilen, unbemannten Luftfahrzeugen (z.B. Drohnen, Modellflugzeuge) ist verboten.')).toBeUndefined();
      expect(campingBanSentence('Wintersport ist verboten. Hunde an die Leine.')).toBeUndefined();
      expect(campingBanSentence(undefined)).toBeUndefined();
    });
    it('season matching handles year wrap and junk', () => {
      expect(inSeason('21.12. - 30.04.', new Date(2027, 1, 1))).toBe(true);
      expect(inSeason('21.12. - 30.04.', new Date(2026, 9, 4))).toBe(false);
      expect(inSeason('15.06. - 15.09.', new Date(2026, 6, 1))).toBe(true);
      expect(inSeason('ganzjährig', new Date(2026, 9, 4))).toBe(true);
      expect(inSeason(undefined, new Date())).toBe(true);
    });
  });

  describe('federal hunting reserves', () => {
    const vej = (typ: string) => ({ layerBodId: 'ch.bafu.bundesinventare-jagdbanngebiete', attributes: { label: 'Piz Ela', typ_de: typ } });
    it('integral and partial areas are the reserve: camping is banned (VEJ Art. 5 para. 1 let. e)', () => {
      for (const t of ['Gebiet mit integralen Schutzbestimmungen', 'Gebiet mit partiellen Schutzbestimmungen']) {
        const [h] = parseZoneHits({ results: [vej(t)] });
        expect(h!.layer.severity, t).toBe('restricted');
        expect(assess({ zones: [h!], treeline: 'above' }).verdict).toBe('no');
      }
    });
    it('a Wildschadenperimeter lies outside the reserve (VEJ Art. 2 para. 2 let. d): no ban, only a note', () => {
      const [h] = parseZoneHits({ results: [vej('Wildschadenperimeter')] });
      expect(h!.layer.severity).toBe('info');
      expect(h!.layer.label).toMatch(/perimeter/i);
      expect(assess({ zones: [h!], treeline: 'above' }).verdict).not.toBe('no');
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
