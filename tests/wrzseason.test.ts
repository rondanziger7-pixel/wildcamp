import { describe, expect, it } from 'vitest';
import { easter, parseSeasonText, seasonState } from '../src/wrzseason';
import values from './fixtures/wrz-schutzzeit.json';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('Easter', () => {
  it.each([[2024, 3, 31], [2025, 4, 20], [2026, 4, 5], [2027, 3, 28], [2038, 4, 25]])('%i is %i-%i', (y, m, day) => expect(easter(y)).toEqual({ m, d: day }));
});

describe('plain date ranges are exact', () => {
  it('wraps the new year', () => {
    expect(seasonState('21.12. - 30.04.', d(2027, 2, 1)).state).toBe('in');
    expect(seasonState('21.12. - 30.04.', d(2026, 10, 4)).state).toBe('out');
    expect(seasonState('21.12. - 30.04.', d(2026, 12, 20)).state).toBe('out');
    expect(seasonState('21.12. - 30.04.', d(2026, 12, 21)).state).toBe('in');
  });
  it('year-round and summer ranges', () => {
    expect(seasonState('01.01. - 31.12.', d(2026, 7, 15)).state).toBe('in');
    expect(seasonState('15.06. - 15.09.', d(2026, 7, 1)).state).toBe('in');
    expect(seasonState('15.06. - 15.09.', d(2026, 10, 1)).state).toBe('out');
  });
  it('the first part of "16.12. - 15.05. resp. bis zur Öffnung der Strasse" is read, with doubt at the open end', () => {
    expect(seasonState('16.12. - 15.05. resp. bis zur Öffnung der Strasse zur Alp Sardona', d(2027, 2, 1)).state).toBe('in');
    expect(seasonState('16.12. - 15.05. resp. bis zur Öffnung der Strasse zur Alp Sardona', d(2027, 5, 25)).state).toBe('unsure');
    expect(seasonState('16.12. - 15.05. resp. bis zur Öffnung der Strasse zur Alp Sardona', d(2026, 8, 1)).state).toBe('out');
  });
});

describe('ski-season texts no longer ban camping all year (Murgtal in July showed "Not allowed")', () => {
  for (const text of ['15.12. bis Ende Skisaison', '16.12. bis Ende Skisaison', '16.12. bis Ende Skisaison, Rundweg Holzlagerplatz Tschennerwald-Geissegg-Lavadiel bis 13.12. und ab 15.03. erlaubt']) {
    it(text.slice(0, 30), () => {
      expect(seasonState(text, d(2026, 7, 15)).state).toBe('out');
      expect(seasonState(text, d(2026, 10, 6)).state).toBe('out');
      expect(seasonState(text, d(2027, 2, 1)).state).toBe('in');
      expect(seasonState(text, d(2027, 4, 28)).state).toBe('unsure');
      expect(seasonState(text, d(2026, 12, 10)).state).toBe('out');
      expect(seasonState(text, d(2026, 12, 20)).state).toBe('in');
    });
  }
  it('"Skisaison" alone: December to April, unsure at the edges', () => {
    expect(seasonState('Skisaison', d(2026, 7, 15)).state).toBe('out');
    expect(seasonState('Skisaison', d(2027, 1, 20)).state).toBe('in');
    expect(seasonState('Skisaison', d(2026, 11, 30)).state).toBe('unsure');
    expect(seasonState('Skisaison', d(2027, 5, 1)).state).toBe('unsure');
  });
});

describe('other free texts', () => {
  it('"En cas de neige": unsure from autumn to early summer, out in high summer', () => {
    expect(seasonState('En cas de neige', d(2027, 1, 15)).state).toBe('unsure');
    expect(seasonState('En cas de neige', d(2026, 8, 1)).state).toBe('out');
    expect(seasonState('En cas de neige', d(2027, 1, 15)).note).toBe('snow');
  });
  it('"Betriebszeiten der Bahn" and the combined wintersport text: always unsure (it depends on the lift)', () => {
    expect(seasonState('Betriebszeiten der Bahn', d(2026, 7, 1))).toEqual({ state: 'unsure', note: 'lifts' });
    expect(seasonState('ganzjährig/Wintersport: während Betriebszeiten der Bahn', d(2027, 1, 1)).state).toBe('unsure');
  });
  it('German long dates', () => {
    expect(seasonState('Betretungsverbot vom 1. Januar bis 31. März', d(2027, 2, 1)).state).toBe('in');
    expect(seasonState('Betretungsverbot vom 1. Januar bis 31. März', d(2026, 10, 1)).state).toBe('out');
    expect(seasonState('Betretungsverbot vom 15. Dezember bis 15. April', d(2026, 12, 31)).state).toBe('in');
    expect(seasonState('Betretungsverbot vom 15. Dezember bis 15. April', d(2026, 5, 1)).state).toBe('out');
  });
  it('Italian two periods', () => {
    const t = '24 dicembre - 31 marzo / 15 aprile - 15 agosto';
    expect(seasonState(t, d(2027, 1, 10)).state).toBe('in');
    expect(seasonState(t, d(2027, 4, 1)).state).toBe('out');
    expect(seasonState(t, d(2026, 7, 1)).state).toBe('in');
    expect(seasonState(t, d(2026, 10, 1)).state).toBe('out');
  });
  it('French month ranges, with a week of doubt at the ends', () => {
    expect(seasonState('De début mai à fin juillet', d(2026, 6, 15)).state).toBe('in');
    expect(seasonState('De début mai à fin juillet', d(2026, 5, 3)).state).toBe('unsure');
    expect(seasonState('De début mai à fin juillet', d(2026, 10, 1)).state).toBe('out');
    expect(seasonState('De février à mi-juillet', d(2026, 4, 1)).state).toBe('in');
    expect(seasonState('De février à mi-juillet', d(2026, 9, 1)).state).toBe('out');
  });
  it('Easter-based texts use the Easter of that year', () => {
    expect(seasonState('01.12. bis Ostern', d(2027, 3, 1)).state).toBe('in');
    expect(seasonState('01.12. bis Ostern', d(2027, 4, 20)).state).toBe('out'); // Easter 2027 is 28 March
    expect(seasonState("De Pâques (depuis l'arrêt des installations de remontées mécaniques) à fin mai", d(2026, 5, 10)).state).toBe('in');
    expect(seasonState("De Pâques (depuis l'arrêt des installations de remontées mécaniques) à fin mai", d(2026, 8, 10)).state).toBe('out');
  });
  it('no defined period, a dash, nothing, or "ganzjährig" count as in force', () => {
    for (const t of ['keine definierte Periode', '-', undefined, '', 'ganzjährig']) expect(seasonState(t, d(2026, 7, 1)).state, String(t)).toBe('in');
  });
});

describe('every season string in the federal data is understood (80 distinct values, read 2026-10-06)', () => {
  it('none is left to the "in force" default except the ones that really have no period', () => {
    const rows = (values as { value: string; count: number }[]).filter((v) => !/^\d{2}\.\d{2}\. - \d{2}\.\d{2}\.$/.test(v.value));
    const undefinedOnes = rows.filter((v) => parseSeasonText(v.value).kind === 'undefined').map((v) => v.value);
    expect(undefinedOnes.sort()).toEqual(['-', 'keine definierte Periode']);
  });
  it('and for every value, some day of the year is out of force or unsure unless it is year-round or undefined', () => {
    for (const v of values as { value: string }[]) {
      if (v.value === '01.01. - 31.12.' || v.value === '-' || v.value === 'keine definierte Periode' || parseSeasonText(v.value).kind === 'lifts') continue;
      const states = new Set<string>();
      for (let m = 1; m <= 12; m++) states.add(seasonState(v.value, d(2027, m, 15)).state);
      expect(states.size, v.value).toBeGreaterThan(1);
    }
  });
});
