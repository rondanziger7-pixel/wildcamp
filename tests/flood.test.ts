import { describe, expect, it } from 'vitest';
import { comfortFor } from '../src/comfort/comfort';
import { floodFactor, floodWord, parseFloodInfo, worstFlood } from '../src/flood';
import { setLangForTest } from '../src/i18n';

// the answer of the WMS for the Bernese Plateau (read live on 2026-10-07), and a made-up one with a river section at level 3
const live = `GetFeatureInfo results:

Layer 'ch.bafu.hydroweb-warnkarte_national_polygon'
Feature 131953:
ID = '1258'
name = 'Bundesamt für Umwelt BAFU - Hydrologie'
param = '-'
language = 'en'
text = 'Hazard level 1: No or minor flood danger'
description = '<b>Bernese Plateau</b>: Hazard level 1: No or minor flood danger'
w-type = 'Region'
ws-class = 'Region.1'
Fluss = ''
Abschnitt = ''

Layer 'ch.bafu.hydroweb-warnkarte_national_line'
Feature 131953:
ID = '1258'
description = '<b>Bernese Plateau</b>: Hazard level 1: No or minor flood danger'
w-type = 'Region'
ws-class = 'Region.1'
Fluss = ''
Abschnitt = ''
`;
const block = (name: string, kind: string, level: number, extra = '') => `Layer 'x'\nFeature 1:\ndescription = '<b>${name}</b>: Hazard level ${level}'\nw-type = '${kind}'\nws-class = '${kind}.${level}'\n${extra}\n`;

describe('national flood warning', () => {
  it('reads the live answer once, although two layers repeat the region', () => {
    expect(parseFloodInfo(live)).toEqual([{ level: 1, name: 'Bernese Plateau', kind: 'Region' }]);
  });
  it('reads regions, river sections and lakes, and skips level 0 and odd classes', () => {
    const text = block('Upper Engadine', 'Region', 3) + block('Rhine', 'River', 4, "Fluss = 'Rhein'\nAbschnitt = 'Chur'") + block('Lake Thun', 'Lake', 2) + block('Nowhere', 'Region', 0) + "Feature 9:\nws-class = 'Pond.2'\n";
    expect(parseFloodInfo(text).map((w) => `${w.kind}:${w.level}:${w.name}`)).toEqual(['Region:3:Upper Engadine', 'River:4:Rhine', 'Lake:2:Lake Thun']);
    expect(parseFloodInfo('')).toEqual([]);
  });
  it('names a river section from its river and section when the text has no name', () => {
    const t = "Feature 1:\ndescription = 'Hazard level 3'\nw-type = 'River'\nws-class = 'River.3'\nFluss = 'Aare'\nAbschnitt = 'Thun - Bern'\n";
    expect(parseFloodInfo(t)).toEqual([{ level: 3, name: 'Aare, Thun - Bern', kind: 'River' }]);
  });
  it('has the legend words of the layer in all four languages', () => {
    expect([1, 2, 3, 4, 5].map((l) => floodWord(l, 'en'))).toEqual(['no or minor', 'moderate', 'considerable', 'high', 'very high']);
    expect(floodWord(3, 'de')).toBe('erhebliche');
    expect(floodWord(4, 'fr')).toBe('fort');
    expect(floodWord(5, 'it')).toBe('molto forte');
    expect(floodWord(9, 'en')).toBe('very high');
  });
  it('takes the worst warning, and nothing at level 1', () => {
    expect(worstFlood([{ level: 1, name: 'a', kind: 'Region' }])).toBeUndefined();
    expect(worstFlood(undefined)).toBeUndefined();
    expect(worstFlood([{ level: 2, name: 'a', kind: 'Region' }, { level: 4, name: 'b', kind: 'River' }])!.name).toBe('b');
  });
  it('is only a detail at level 2, a line on the first view from level 3, and urgent from level 4', () => {
    expect(floodFactor([{ level: 1, name: 'a', kind: 'Region' }])).toBeUndefined();
    const l2 = floodFactor([{ level: 2, name: 'Upper Engadine', kind: 'Region' }])!;
    expect([l2.tone, l2.alert]).toEqual(['warn', false]);
    const l3 = floodFactor([{ level: 3, name: 'Upper Engadine', kind: 'Region' }])!;
    expect([l3.tone, l3.alert]).toEqual(['warn', true]);
    expect(l3.text).toContain('Flood warning, level 3 (considerable), for the region Upper Engadine.');
    expect(l3.text).toMatch(/Do not camp on a bank/);
    expect(floodFactor([{ level: 4, name: 'x', kind: 'River' }])!.tone).toBe('bad');
    expect(l3.sources.some((u) => u.includes('hydroweb-warnkarte_national'))).toBe(true);
  });
  it('shows in the sleep details and the first view, and a failed lookup is listed as unchecked', () => {
    const c = comfortFor({ flood: [{ level: 3, name: 'Upper Engadine', kind: 'Region' }] });
    expect(c.factors.some((f) => /^Flood warning, level 3/.test(f.title))).toBe(true);
    expect(c.alerts.some((a) => /Flood warning, level 3/.test(a.title))).toBe(true);
    const calm = comfortFor({ flood: [{ level: 1, name: 'x', kind: 'Region' }] });
    expect(calm.factors.some((f) => /Flood warning/.test(f.title))).toBe(false);
    expect(comfortFor({ floodFailed: true }).missing).toContain('flood warning');
    expect(comfortFor({}).missing).not.toContain('flood warning');
  });
  it('is worded in the language of the page', () => {
    setLangForTest('de');
    try {
      const f = floodFactor([{ level: 3, name: 'Engadin', kind: 'Region' }])!;
      expect(f.text).toContain('Hochwasserwarnung, Stufe 3 (erhebliche), für die Region Engadin.');
    } finally {
      setLangForTest('en');
    }
  });
});
