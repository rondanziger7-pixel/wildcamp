import { describe, expect, it } from 'vitest';
import { DE, FR, IT } from '../src/i18n-dict';
import { RANGE_MESSAGE, SHORT_CODE_MESSAGE, SHORT_LINK_MESSAGE, parseLocation } from '../src/coordsearch';

describe('the search box takes coordinates and map links', () => {
  it('the messages for things that are recognised but cannot be opened are translated (they are shown through tr())', () => {
    for (const m of [SHORT_LINK_MESSAGE, SHORT_CODE_MESSAGE, RANGE_MESSAGE]) for (const [name, dict] of [['DE', DE], ['FR', FR], ['IT', IT]] as const) expect(dict[m], `${name}: ${m}`).toBeTruthy();
  });
  it('the example from the 100-situation simulation: "46.85, 9.53" is the point, not a street called "46"', () => {
    const r = parseLocation('46.85, 9.53');
    expect(r).toMatchObject({ lat: 46.85, lon: 9.53, kind: 'decimal' });
  });
  it('a pasted map link gives its zoom', () => {
    expect(parseLocation('https://www.google.com/maps/@46.8523,9.5302,15z')).toMatchObject({ lat: 46.8523, lon: 9.5302, zoom: 15 });
  });
  it('a place name is left to the place search', () => {
    expect(parseLocation('Piz Bernina')).toBeUndefined();
    expect(parseLocation('Bahnhofstrasse 46, 8001 Zürich')).toBeUndefined();
  });
});
