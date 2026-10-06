import { describe, expect, it } from 'vitest';
import { lv95ToWgs84, wgs84ToLv95 } from '../src/coords';
import { SHORT_LINK_MESSAGE, decodePlusCode, isLocationError, parseLocation, type LocationKind, type ParsedLocation } from '../src/coordsearch';

type Case = [input: string, lat: number, lon: number, kind: LocationKind, zoom?: number];

/** Position within 1e-4 degrees (about 10 m), the kind, and the zoom (none unless given). */
function expectLocation(input: string, lat: number, lon: number, kind: LocationKind, zoom?: number): void {
  const r = parseLocation(input);
  expect(r, `"${input}" should be recognised`).toBeDefined();
  expect(isLocationError(r), `"${input}" should not be an error`).toBe(false);
  const loc = r as ParsedLocation;
  expect(loc.kind).toBe(kind);
  expect(Math.abs(loc.lat - lat)).toBeLessThan(1e-4);
  expect(Math.abs(loc.lon - lon)).toBeLessThan(1e-4);
  if (zoom === undefined) expect(loc.zoom).toBeUndefined();
  else expect(loc.zoom).toBe(zoom);
}

const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
const LAT = dms(46, 51, 8.3); // 46.852306
const LON = dms(9, 31, 48.7); // 9.530194
const origin = lv95ToWgs84(2600000, 1200000); // the old Bern observatory: 46.95108 N, 7.43864 E

describe('decimal degrees', () => {
  const cases: Case[] = [
    ['46.8523, 9.5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523 9.5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523,9.5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523;9.5302', 46.8523, 9.5302, 'decimal'],
    ['46,8523;9,5302', 46.8523, 9.5302, 'decimal'], // decimal comma, semicolon between
    ['46,8523; 9,5302', 46.8523, 9.5302, 'decimal'],
    ['46,8523 9,5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523 / 9.5302', 46.8523, 9.5302, 'decimal'],
    ['  46.8523 ,  9.5302  ', 46.8523, 9.5302, 'decimal'],
    ['46.8523\t9.5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523,\n9.5302', 46.8523, 9.5302, 'decimal'],
    ['46.8523  9.5302', 46.8523, 9.5302, 'decimal'], // no-break space
    ['+46.8523, +9.5302', 46.8523, 9.5302, 'decimal'],
    ['(46.8523, 9.5302)', 46.8523, 9.5302, 'decimal'],
    ['[46.8523, 9.5302]', 46.8523, 9.5302, 'decimal'],
    ['"46.8523, 9.5302"', 46.8523, 9.5302, 'decimal'],
    ['46.8523, 9.5302.', 46.8523, 9.5302, 'decimal'],
    ['Coordinates: 46.8523, 9.5302', 46.8523, 9.5302, 'decimal'],
    ['GPS: 46.8523 9.5302', 46.8523, 9.5302, 'decimal'],
    ['lat/lon: 46.8523, 9.5302', 46.8523, 9.5302, 'decimal'],
    ['`46.8523, 9.5302`', 46.8523, 9.5302, 'decimal'], // a pasted code span
    ["'46.8523, 9.5302'", 46.8523, 9.5302, 'decimal'],
    ['“46.8523, 9.5302”', 46.8523, 9.5302, 'decimal'],
    ['46.8523,9.5302,', 46.8523, 9.5302, 'decimal'],
    ['46.8523, 9.5302 (Chur)', 46.8523, 9.5302, 'decimal'],
    ['Breite 46.8523 Länge 9.5302', 46.8523, 9.5302, 'decimal'],
    ['46,85230 N, 9,53020 E', 46.8523, 9.5302, 'decimal'],
    ['46.9480, 7.4474', 46.948, 7.4474, 'decimal'], // Bern
    ['47.3769, 8.5417', 47.3769, 8.5417, 'decimal'], // Zürich
    ['46.0, 8.9', 46.0, 8.9, 'decimal'],
    ['45.9, 10.5', 45.9, 10.5, 'decimal'],
    ['45.92, 6.87', 45.92, 6.87, 'decimal'], // Chamonix: beyond the border but inside the neighbourhood
    ['48.1374, 11.5755', 48.1374, 11.5755, 'decimal'], // Munich
  ];
  it.each(cases)('%s', (input, lat, lon, kind, zoom) => expectLocation(input, lat, lon, kind, zoom));

  describe('lon, lat only when the first is clearly a Swiss longitude and the second a Swiss latitude', () => {
    const swapped: Case[] = [
      ['9.5302, 46.8523', 46.8523, 9.5302, 'decimal'],
      ['9.5302 46.8523', 46.8523, 9.5302, 'decimal'],
      ['7.4474, 46.9480', 46.948, 7.4474, 'decimal'],
      ['10.2, 46.5', 46.5, 10.2, 'decimal'],
      ['5.95; 46.2', 46.2, 5.95, 'decimal'],
      ['9,5302;46,8523', 46.8523, 9.5302, 'decimal'],
    ];
    it.each(swapped)('%s', (input, lat, lon, kind) => expectLocation(input, lat, lon, kind));
    it('keeps lat, lon whenever the first number could be a latitude', () => {
      expectLocation('46.5, 8.2', 46.5, 8.2, 'decimal');
      expectLocation('47.9, 10.6', 47.9, 10.6, 'decimal');
    });
  });

  describe('with degree signs and hemispheres, anywhere on Earth', () => {
    const cases2: Case[] = [
      ['46.8523°, 9.5302°', 46.8523, 9.5302, 'decimal'],
      ['46.8523° 9.5302°', 46.8523, 9.5302, 'decimal'],
      ['−33.8688° 151.2093°', -33.8688, 151.2093, 'decimal'], // unicode minus
      ['46.8523°N 9.5302°E', 46.8523, 9.5302, 'decimal'],
      ['N46.8523 E9.5302', 46.8523, 9.5302, 'decimal'],
      ['N 46.8523°, E 9.5302°', 46.8523, 9.5302, 'decimal'],
      ['46.8523 N, 9.5302 E', 46.8523, 9.5302, 'decimal'],
      ['46.8523N 9.5302E', 46.8523, 9.5302, 'decimal'],
      ['46.8523N9.5302E', 46.8523, 9.5302, 'decimal'],
      ['E9.5302 N46.8523', 46.8523, 9.5302, 'decimal'], // the letters say which is which
      ['9.5302°E 46.8523°N', 46.8523, 9.5302, 'decimal'],
      ['46.8523°S 9.5302°W', -46.8523, -9.5302, 'decimal'],
      ['S46.8523 W9.5302', -46.8523, -9.5302, 'decimal'],
      ['33.8688°S 151.2093°E', -33.8688, 151.2093, 'decimal'], // Sydney
      ['48.8566°N 2.3522°E', 48.8566, 2.3522, 'decimal'], // Paris, outside Switzerland but explicit
      ['46.8523°N, 9.5302°O', 46.8523, 9.5302, 'decimal'], // German Ost
      ['46.8523n 9.5302e', 46.8523, 9.5302, 'decimal'],
      ['46N 9E', 46, 9, 'decimal'],
      ['0.5N 0.25E', 0.5, 0.25, 'decimal'],
      ['Lat: 46.8523, Lon: 9.5302', 46.8523, 9.5302, 'decimal'],
      ['lat=46.8523 lng=9.5302', 46.8523, 9.5302, 'decimal'],
      ['Longitude 9.5302 Latitude 46.8523', 46.8523, 9.5302, 'decimal'],
      ['latitude: -33.8688, longitude: 151.2093', -33.8688, 151.2093, 'decimal'],
    ];
    it.each(cases2)('%s', (input, lat, lon, kind) => expectLocation(input, lat, lon, kind));
  });
});

describe('degrees, minutes, seconds', () => {
  const cases: Case[] = [
    [`46°51'08.3"N 9°31'48.7"E`, LAT, LON, 'dms'],
    ['46 51 08 N 9 31 48 E', dms(46, 51, 8), dms(9, 31, 48), 'dms'],
    [`46°51.138'N 9°31.811'E`, 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'], // degrees + decimal minutes
    [`46°51'08.3"S 9°31'48.7"W`, -LAT, -LON, 'dms'],
    ['46°51′08.3″N 9°31′48.7″E', LAT, LON, 'dms'], // prime and double prime
    [`46º51'08.3"N 9º31'48.7"E`, LAT, LON, 'dms'], // masculine ordinal instead of the degree sign
    ['46°51’08.3”N 9°31’48.7”E', LAT, LON, 'dms'], // typographic quotes
    [`46°51'08.3''N 9°31'48.7''E`, LAT, LON, 'dms'], // two apostrophes for the seconds
    [`N 46° 51' 08.3" E 9° 31' 48.7"`, LAT, LON, 'dms'],
    [`46°51'08.3" 9°31'48.7"`, LAT, LON, 'dms'], // marks but no letters: lat, lon
    [`46°51'08.3"N, 9°31'48.7"E`, LAT, LON, 'dms'],
    [`46°51'08"N 9°31'49"E`, dms(46, 51, 8), dms(9, 31, 49), 'dms'],
    [`46°51'08,3"N 9°31'48,7"E`, LAT, LON, 'dms'], // decimal comma in the seconds
    [`46°51'N 9°31'E`, 46 + 51 / 60, 9 + 31 / 60, 'dms'],
    [`46°51'08.3"N9°31'48.7"E`, LAT, LON, 'dms'],
    [`E 9°31'48.7" N 46°51'08.3"`, LAT, LON, 'dms'], // longitude first, by the letters
    ['S 46 51 08, W 9 31 48', -dms(46, 51, 8), -dms(9, 31, 48), 'dms'],
    [`48°51'24"N 2°21'08"E`, dms(48, 51, 24), dms(2, 21, 8), 'dms'], // Paris
    [`33°52'08"S 151°12'34"E`, -dms(33, 52, 8), dms(151, 12, 34), 'dms'], // Sydney
    [`46° 51.138' N, 9° 31.811' E`, 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'],
    ['46 51.138 N 9 31.811 E', 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'],
    [`46°51'08.3"N 9°31'48.7"E.`, LAT, LON, 'dms'],
    [`Position: 46°51'08.3"N 9°31'48.7"E`, LAT, LON, 'dms'],
    [`Koordinaten: 46°51'08.3"N 9°31'48.7"E`, LAT, LON, 'dms'],
    [`46°51'08.3"N 9°31'48.7"E (Chur)`, LAT, LON, 'dms'],
    [`"46°51'08.3"N 9°31'48.7"E"`, LAT, LON, 'dms'], // wrapped in quotes, with quotes inside
    [`N 46° 51.138' E 009° 31.811'`, 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'], // Garmin style
    ['N46°51.138 E009°31.811', 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'],
    ['N 46 51.138 E 9 31.811', 46 + 51.138 / 60, 9 + 31.811 / 60, 'dms'],
  ];
  it.each(cases)('%s', (input, lat, lon, kind) => expectLocation(input, lat, lon, kind));

  it('gives the numbers a person would check by hand', () => {
    expect(LAT).toBeCloseTo(46.852306, 6);
    expect(LON).toBeCloseTo(9.530194, 6);
    const r = parseLocation(`46°51'08.3"N 9°31'48.7"E`) as ParsedLocation;
    expect(r.lat).toBeCloseTo(46.852306, 5);
    expect(r.lon).toBeCloseTo(9.530194, 5);
  });

  it.each([
    [`46°75'08"N 9°31'48"E`], // minutes beyond 59
    [`46°51'75"N 9°31'48"E`], // seconds beyond 59
    [`46°51'08"N 9°31'48"N`], // two latitudes
    [`46°51'08"E 9°31'48"W`], // two longitudes
    [`46°51'08"N 9°31'48"`], // one letter only
    [`46°51'08.3"N 9°31'48.7"E 12`], // trailing number
  ])('does not accept the broken %s', (input) => {
    expect(parseLocation(input)).toBeUndefined();
  });
});

describe('out of range', () => {
  it.each([
    [`91°00'00"N 9°00'00"E`],
    [`46°00'00"N 181°00'00"E`],
    ['95.5°N 9.5°E'],
    ['46.5°N 190.5°E'],
    ['-95.5° 9.5°'],
    ['lat 95 lon 9'],
    ['geo:95,9'],
    ['https://www.google.com/maps/@95.5,9.5,15z'],
    ['https://maps.google.com/?q=46.85,190'],
    ['FFFFFFFF+FF'], // plus code beyond the north pole
    ['CWWWWWWW+WW'], // and beyond the antimeridian
  ])('says out-of-range for %s', (input) => {
    const r = parseLocation(input);
    expect(isLocationError(r)).toBe(true);
    expect(r).toMatchObject({ error: 'out-of-range' });
    expect((r as { message: string }).message).toMatch(/latitude|longitude/i);
  });

  it('does not make a coordinate of a bare pair outside the neighbourhood, whatever the numbers', () => {
    expect(parseLocation('95.5, 9.5')).toBeUndefined();
    expect(parseLocation('46.5, 190.5')).toBeUndefined();
    expect(parseLocation('48.8566, 2.3522')).toBeUndefined(); // Paris
    expect(parseLocation('-33.8688, 151.2093')).toBeUndefined();
  });
});

describe('Swiss coordinates', () => {
  const bern: Case[] = [
    ['2600000 1200000', origin.lat, origin.lon, 'lv95'],
    ["2'600'000 / 1'200'000", origin.lat, origin.lon, 'lv95'],
    ['E 2600000 N 1200000', origin.lat, origin.lon, 'lv95'],
    ['x=2600000 y=1200000', origin.lat, origin.lon, 'lv95'],
    ['2600000, 1200000', origin.lat, origin.lon, 'lv95'],
    ['2600000,1200000', origin.lat, origin.lon, 'lv95'],
    ['2 600 000 1 200 000', origin.lat, origin.lon, 'lv95'],
    ['2’600’000 / 1’200’000', origin.lat, origin.lon, 'lv95'], // typographic apostrophes
    ['2600000/1200000', origin.lat, origin.lon, 'lv95'],
    ['2600000;1200000', origin.lat, origin.lon, 'lv95'],
    ['2.600.000 1.200.000', origin.lat, origin.lon, 'lv95'],
    ['2,600,000 / 1,200,000', origin.lat, origin.lon, 'lv95'],
    ['N 1200000 E 2600000', origin.lat, origin.lon, 'lv95'], // north first, by the letters and by the size
    ['1200000 2600000', origin.lat, origin.lon, 'lv95'], // north first, by the size alone
    ['y=2600000 x=1200000', origin.lat, origin.lon, 'lv95'], // the Swiss way round (y is east)
    ['E=2600000, N=1200000', origin.lat, origin.lon, 'lv95'],
    ['E 2 600 000 m N 1 200 000 m', origin.lat, origin.lon, 'lv95'],
    ["CH1903+ / LV95: 2'600'000, 1'200'000", origin.lat, origin.lon, 'lv95'],
    ['LV95 2600000 1200000', origin.lat, origin.lon, 'lv95'],
    ['2600000.5 1200000.5', origin.lat, origin.lon, 'lv95'],
    ['2 600 000 1 200 000', origin.lat, origin.lon, 'lv95'],
    ['600000 200000', origin.lat, origin.lon, 'lv03'], // the same point in the old system
    ["600'000 / 200'000", origin.lat, origin.lon, 'lv03'],
    ['200000 600000', origin.lat, origin.lon, 'lv03'],
    ['Y 600000 X 200000', origin.lat, origin.lon, 'lv03'],
    ['LV03: 600 000 / 200 000', origin.lat, origin.lon, 'lv03'],
    ['600.000 200.000', origin.lat, origin.lon, 'lv03'],
    ["2'600'000.00 / 1'200'000.00", origin.lat, origin.lon, 'lv95'], // as swisstopo shows them
    ['2600000.00, 1200000.00', origin.lat, origin.lon, 'lv95'],
    ['2 600 000.00 / 1 200 000.00', origin.lat, origin.lon, 'lv95'],
    ['CH1903+ 2600000 1200000', origin.lat, origin.lon, 'lv95'],
    ['x: 2600000 y: 1200000', origin.lat, origin.lon, 'lv95'],
    ['LV95: E 2600000 / N 1200000', origin.lat, origin.lon, 'lv95'],
    ['2600000 1200000 (Bern)', origin.lat, origin.lon, 'lv95'],
  ];
  it.each(bern)('%s', (input, lat, lon, kind) => expectLocation(input, lat, lon, kind));

  it('the old Bern observatory is where it should be', () => {
    expect(origin.lat).toBeCloseTo(46.95108, 4);
    expect(origin.lon).toBeCloseTo(7.43864, 4);
  });

  it('LV03 adds 2 000 000 and 1 000 000', () => {
    const a = parseLocation('683000 248000') as ParsedLocation;
    const b = lv95ToWgs84(2683000, 1248000);
    expect(a.kind).toBe('lv03');
    expect(a.lat).toBeCloseTo(b.lat, 9);
    expect(a.lon).toBeCloseTo(b.lon, 9);
    const c = parseLocation('700000 99000') as ParsedLocation; // a 5-digit northing
    expect(c.kind).toBe('lv03');
    expect(c.lat).toBeCloseTo(lv95ToWgs84(2700000, 1099000).lat, 9);
  });

  it('finds places across the country from their grid numbers (inverse of the forward formulas)', () => {
    const places: [string, number, number][] = [
      ['Zürich HB', 47.3779, 8.5403],
      ['Bern', 46.9489, 7.4391],
      ['Geneva', 46.2102, 6.1423],
      ['Lugano', 46.0037, 8.9511],
      ['Chur', 46.8533, 9.5297],
      ['St. Moritz', 46.4908, 9.8355],
      ['Basel', 47.5476, 7.5896],
      ['Zermatt', 46.0207, 7.7491],
      ['Sion', 46.2293, 7.3590],
      ['Schaffhausen', 47.6973, 8.6349],
      ['Müstair', 46.6306, 10.4542],
      ['Chiasso', 45.8317, 9.0305],
    ];
    for (const [name, lat, lon] of places) {
      const { e, n } = wgs84ToLv95(lat, lon);
      const [E, N] = [Math.round(e), Math.round(n)];
      const spaced = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
      for (const text of [`${E} ${N}`, `${spaced(E)} / ${spaced(N)}`, `E ${E} N ${N}`, `${N} ${E}`]) expectLocation(text, lat, lon, 'lv95');
      expectLocation(`${E - 2000000} ${N - 1000000}`, lat, lon, 'lv03');
      expect(name).toBeTruthy();
    }
  });

  it.each([
    ['2600000 200000'], // an LV95 east with an LV03 north
    ['600000 1200000'],
    ['2900000 1200000'], // east beyond Switzerland
    ['2600000 1400000'], // north beyond Switzerland
    ['2600000 2600000'], // two easts
    ['1200000 1200000'], // two norths
    ['600000 600000'],
    ['2600000'], // one number
    ['26000000 12000000'], // too many digits
    ['260000 120000'], // too small for east
    ['2600000 1200000 5'], // a third number
    ['E 2600000 E 2601000'],
  ])('is not a coordinate: %s', (input) => {
    expect(parseLocation(input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Plus codes
// ---------------------------------------------------------------------------------------------

const ALPHABET = '23456789CFGHJMPQRVWX';

/** An independent encoder written from the specification, to check the decoder against. */
function encodePlusCode(lat: number, lon: number, digits = 10): string {
  let la = Math.floor(Math.round((lat + 90) * 25_000_000 * 1e6) / 1e6); // 8000 * 5^5 steps per degree
  let lo = Math.floor(Math.round((lon + 180) * 8_192_000 * 1e6) / 1e6); // 8000 * 4^5 steps per degree
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = ALPHABET[(la % 5) * 4 + (lo % 4)]! + code; // grid digits: 5 rows by 4 columns
    la = Math.floor(la / 5);
    lo = Math.floor(lo / 4);
  }
  for (let i = 0; i < 5; i++) {
    code = ALPHABET[la % 20]! + ALPHABET[lo % 20]! + code; // pairs: latitude digit, longitude digit
    la = Math.floor(la / 20);
    lo = Math.floor(lo / 20);
  }
  const d = code.slice(0, digits);
  return `${d.slice(0, 8)}+${d.slice(8)}`;
}

describe('plus codes', () => {
  const full: Case[] = [
    ['8FVC9G8F+6W', 47.3655625, 8.5248125, 'pluscode'], // Google Zürich
    ['8fvc9g8f+6w', 47.3655625, 8.5248125, 'pluscode'],
    ['  8FVC9G8F+6W  ', 47.3655625, 8.5248125, 'pluscode'],
    ['8FVC9G8F+6W3', 47.3655125, 8.524796875, 'pluscode'], // 11 digits: a cell of 3 m by 3.5 m
    ['8FVC9G8F+', 47.36625, 8.52375, 'pluscode'], // 8 digits: 275 m
    ['8FVC9G8F+6W Zürich, Switzerland', 47.3655625, 8.5248125, 'pluscode'],
    ['Plus code: 8FVC9G8F+6W', 47.3655625, 8.5248125, 'pluscode'],
    ['Zürich 8FVC9G8F+6W', 47.3655625, 8.5248125, 'pluscode'],
    ['849VCWC8+R9', 37.4220625, -122.0840625, 'pluscode'], // the Googleplex
    ['8FVC0000+', 47.5, 8.5, 'pluscode'], // padded: a whole degree
    ['8FVC9G00+', 47.375, 8.525, 'pluscode'],
    ['22222222+22', -89.9999375, -179.9999375, 'pluscode'],
  ];
  it.each(full)('%s', (input, lat, lon, kind) => expectLocation(input, lat, lon, kind));

  it('decodes the cell, not just the middle', () => {
    const a = decodePlusCode('8FVC9G8F+6W');
    expect(a).not.toBe('out-of-range');
    const area = a as Exclude<typeof a, 'out-of-range' | undefined>;
    expect(area.south).toBeCloseTo(47.3655, 9);
    expect(area.north).toBeCloseTo(47.365625, 9);
    expect(area.west).toBeCloseTo(8.52475, 9);
    expect(area.east).toBeCloseTo(8.524875, 9);
    expect(area.lat).toBeCloseTo((area.south + area.north) / 2, 12);
    expect(area.lon).toBeCloseTo((area.west + area.east) / 2, 12);
    expect(decodePlusCode('9G8F+6W')).toBeUndefined(); // short codes are not decodable here
    expect(decodePlusCode('FFFFFFFF+FF')).toBe('out-of-range');
  });

  it('round-trips with an independent encoder, for 10 to 15 digits, across Switzerland', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 300; i++) {
      const lat = 45.8 + rand() * 2.0;
      const lon = 5.9 + rand() * 4.7;
      for (const digits of [10, 11, 12, 13, 14, 15]) {
        const code = encodePlusCode(lat, lon, digits);
        expect(code).toMatch(/^[2-9CFGHJMPQRVWX]{8}\+[2-9CFGHJMPQRVWX]{2,7}$/);
        const area = decodePlusCode(code) as Exclude<ReturnType<typeof decodePlusCode>, 'out-of-range' | undefined>;
        expect(area.south).toBeLessThanOrEqual(lat + 1e-9);
        expect(area.north).toBeGreaterThanOrEqual(lat - 1e-9);
        expect(area.west).toBeLessThanOrEqual(lon + 1e-9);
        expect(area.east).toBeGreaterThanOrEqual(lon - 1e-9);
        const r = parseLocation(code) as ParsedLocation;
        expect(r.kind).toBe('pluscode');
        expect(Math.abs(r.lat - lat)).toBeLessThanOrEqual((area.north - area.south) / 2 + 1e-9);
        expect(Math.abs(r.lon - lon)).toBeLessThanOrEqual((area.east - area.west) / 2 + 1e-9);
      }
    }
  });

  it('a 10-digit code is within the 1e-4 of the point it was made from', () => {
    for (const [lat, lon] of [[46.8523, 9.5302], [47.3779, 8.5403], [46.2102, 6.1423], [46.0037, 8.9511]] as const) expectLocation(encodePlusCode(lat, lon), lat, lon, 'pluscode');
  });

  it.each([['9G8F+6W Bern'], ['9G8F+6W'], ['VC9G8F+6W Zürich'], ['8F+6W'], ['9g8f+6w bern'], ['Plus code: 9G8F+6W Chur']])('short code %s needs its town: short-link', (input) => {
    const r = parseLocation(input);
    expect(r).toMatchObject({ error: 'short-link' });
    expect((r as { message: string }).message).toMatch(/short plus code/i);
    expect((r as { message: string }).message).toMatch(/full code/i);
  });

  it.each([
    ['8FVC9G8F+6'], // one digit after the +
    ['8FVC9G8F6W'], // no +
    ['ZZZZZZZZ+ZZ'], // letters outside the alphabet
    ['8FVC9G8F++6W'],
    ['8FVC9G8F+6W+'],
    ['8FVC9G0F+6W'], // a zero inside
    ['8FVC9G8F+6WX1'], // 1 is not in the alphabet
    ['8FVC9G8F+6W3PQRSTUV'], // far too long
    ['Hello+World'],
    ['C++'],
    ['+6W'],
    ['8FVC000+6W'], // padding must come in pairs
    ['8FVC0000+6W'], // nothing may follow padding
    ['G8F+6W'], // a short code drops digits in pairs: 2, 4 or 6 before the +
  ])('does not take %s for a plus code', (input) => {
    expect(parseLocation(input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------------------------

const GOOGLE_PLACE =
  'https://www.google.com/maps/place/Z%C3%BCrich+HB/@47.3779,8.5403,17z/data=!3m1!4b1!4m6!3m5!1s0x47900b9a7e5e0f9b:0x0!8m2!3d47.3779!4d8.5403!16zL20vMDNicGM2?entry=ttu';

describe('map links', () => {
  const links: Case[] = [
    // Google Maps
    ['https://www.google.com/maps/@46.85,9.53,15z', 46.85, 9.53, 'maplink', 15],
    ['https://www.google.com/maps/@46.85,9.53,15.5z', 46.85, 9.53, 'maplink', 15.5],
    ['https://www.google.com/maps/@46.850123,9.530456,15z?entry=ttu', 46.850123, 9.530456, 'maplink', 15],
    ['https://www.google.com/maps/@46.85,9.53,3a,75y,90t/data=!3m6!1e1', 46.85, 9.53, 'maplink'], // street view: no zoom
    ['https://www.google.com/maps/@46.85,9.53,1500m/data=!3m1!1e3', 46.85, 9.53, 'maplink'], // metres, not a zoom
    [GOOGLE_PLACE, 47.3779, 8.5403, 'maplink', 17],
    ['https://www.google.com/maps/place/Camp/@46.9,9.5,14z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d46.8523!4d9.5302', 46.8523, 9.5302, 'maplink', 14], // the pin, not the view
    ['https://www.google.com/maps/place/Alp+Gr%C3%BCm/@46.3,10.0,12z', 46.3, 10.0, 'maplink', 12],
    ['https://www.google.com/maps/place/Chur/@46.8523,9.5302,13z/data=!4m6!3m5!1s0x478ddc0c4c8c8c8d:0x1!8m2!3d46.8499!4d9.5329!16zL20vMDJqNWc', 46.8499, 9.5329, 'maplink', 13],
    ['https://www.google.com/maps/dir/46.9,7.4/46.85,9.53/@46.88,8.5,9z/data=!4m2!4m1!3e2', 46.85, 9.53, 'maplink', 9],
    ['https://www.google.com/maps/dir/46.9,7.4/46.85,9.53/46.5,8.2', 46.5, 8.2, 'maplink'], // several stops: the last is the destination
    ['https://www.google.com/maps/dir/Current+Location/46.8523,9.5302', 46.8523, 9.5302, 'maplink'],
    ['https://maps.google.com/maps?q=46.8523,9.5302&hl=de&gl=ch', 46.8523, 9.5302, 'maplink'],
    ['https://www.google.com/maps/@46.8523,9.5302,15z/data=!3m1!1e3', 46.8523, 9.5302, 'maplink', 15],
    ['https://www.openstreetmap.org/#map=18/46.85230/9.53020&layers=P', 46.8523, 9.5302, 'maplink', 18],
    ['https://example.com/?lat=46.85&lon=9.53&name=H%C3%BCtte', 46.85, 9.53, 'maplink'],
    ['https://example.com/?ll=46.85,9.53#top', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps?q=46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://maps.google.com/?q=46.85,9.53&z=12', 46.85, 9.53, 'maplink', 12],
    ['https://www.google.com/maps?ll=46.85,9.53&z=10', 46.85, 9.53, 'maplink', 10],
    ['https://maps.google.com/maps?ll=46.85,9.53&q=46.85,9.53&hl=en&t=m&z=14', 46.85, 9.53, 'maplink', 14],
    ['https://www.google.com/maps/search/?api=1&query=46.85%2C9.53', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/dir/?api=1&destination=46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/dir/?api=1&origin=46.9,7.4&destination=46.85,9.53&travelmode=walking', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/dir/Bern/46.85,9.53/@46.9,8.5,9z', 46.85, 9.53, 'maplink', 9], // the destination, not the view
    ['https://www.google.com/maps/dir//46.85,9.53/', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/search/46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/search/46.85,+9.53/@46.85,9.53,17z', 46.85, 9.53, 'maplink', 17],
    ['https://www.google.com/maps/place/46.85,9.53', 46.85, 9.53, 'maplink'],
    [`https://www.google.com/maps/place/46°51'08.3"N+9°31'48.7"E`, LAT, LON, 'maplink'],
    ['https://www.google.com/maps/place/46%C2%B051\'08.3%22N+9%C2%B031\'48.7%22E', LAT, LON, 'maplink'],
    [`https://www.google.com/maps/place/46°51'08.3"N+9°31'48.7"E/@46.852306,9.530194,17z/data=!3m1!4b1!4m4!3m3!8m2!3d46.852306!4d9.530194`, LAT, LON, 'maplink', 17],
    ['https://maps.google.com/maps?q=46.85,9.53(Camp)', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps?q=loc:46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps?q=46.85+9.53', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps?q=46.85,9.53&output=embed', 46.85, 9.53, 'maplink'],
    ['https://www.google.com/maps/place/8FVC9G8F%2B6W+Z%C3%BCrich', 47.3655625, 8.5248125, 'maplink'],
    ['https://www.google.com/maps?q=8FVC9G8F%2B6W', 47.3655625, 8.5248125, 'maplink'],
    ['www.google.com/maps/@46.85,9.53,15z', 46.85, 9.53, 'maplink', 15], // without the scheme
    ['google.com/maps?q=46.85,9.53', 46.85, 9.53, 'maplink'],
    ['HTTPS://WWW.GOOGLE.COM/MAPS/@46.85,9.53,15Z', 46.85, 9.53, 'maplink', 15],
    // Apple Maps
    ['https://maps.apple.com/?ll=46.85,9.53&z=12', 46.85, 9.53, 'maplink', 12],
    ['https://maps.apple.com/?q=46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://maps.apple.com/?sll=46.85,9.53&sspn=0.1,0.1', 46.85, 9.53, 'maplink'],
    ['https://maps.apple.com/?address=Bern&ll=46.85,9.53', 46.85, 9.53, 'maplink'],
    ['https://maps.apple.com/place?coordinate=46.85,9.53&name=Spot', 46.85, 9.53, 'maplink'],
    ['https://maps.apple.com/?daddr=46.85,9.53&dirflg=w', 46.85, 9.53, 'maplink'],
    // OpenStreetMap
    ['https://www.openstreetmap.org/#map=15/46.85/9.53', 46.85, 9.53, 'maplink', 15],
    ['https://www.openstreetmap.org/#map=15/46.85/9.53&layers=C', 46.85, 9.53, 'maplink', 15],
    ['https://www.openstreetmap.org/?mlat=46.85&mlon=9.53', 46.85, 9.53, 'maplink'],
    ['https://www.openstreetmap.org/?mlat=46.85&mlon=9.53#map=16/46.8/9.5', 46.85, 9.53, 'maplink', 16], // the marker, at the map's zoom
    ['https://www.openstreetmap.org/?lat=46.85&lon=9.53&zoom=15', 46.85, 9.53, 'maplink', 15],
    ['https://openstreetmap.org/#15/46.85/9.53', 46.85, 9.53, 'maplink', 15],
    ['https://www.openstreetmap.org/#map=12/46.85/9.53/', 46.85, 9.53, 'maplink', 12],
    // geo: URIs
    ['geo:46.85,9.53', 46.85, 9.53, 'geo'],
    ['geo:46.85,9.53?z=15', 46.85, 9.53, 'geo', 15],
    ['geo:46.85,9.53,1200;u=35', 46.85, 9.53, 'geo'],
    ['geo:46.85,9.53;crs=wgs84;u=10?z=12', 46.85, 9.53, 'geo', 12],
    ['geo:0,0?q=46.85,9.53(Label)', 46.85, 9.53, 'geo'],
    ['geo:0,0?q=46.85,9.53&z=11', 46.85, 9.53, 'geo', 11],
    ['GEO:46.85,9.53', 46.85, 9.53, 'geo'],
    ['geo:46.85,9.53?q=Camp', 46.85, 9.53, 'geo'],
    ['geo:48.8566,2.3522', 48.8566, 2.3522, 'geo'], // Paris: returned, the app will say it is outside Switzerland
    ['geo:-33.8688,151.2093?z=10', -33.8688, 151.2093, 'geo', 10],
    // swisstopo and Swiss maps: the zoom is their own scale and is left out
    ['https://map.geo.admin.ch/?lang=de&topic=ech&bgLayer=ch.swisstopo.pixelkarte-farbe&E=2600000&N=1200000&zoom=8', origin.lat, origin.lon, 'maplink'],
    ['https://map.geo.admin.ch/?E=2600000&N=1200000', origin.lat, origin.lon, 'maplink'],
    ['https://map.geo.admin.ch/?E=600000&N=200000&zoom=8', origin.lat, origin.lon, 'maplink'], // LV03 numbers
    ['https://map.geo.admin.ch/#/?lat=46.85&lon=9.53', 46.85, 9.53, 'maplink'],
    ['https://map.geo.admin.ch/#/?lat=46.85&lon=9.53&zoom=8', 46.85, 9.53, 'maplink'],
    ['https://map.geo.admin.ch/?center=2600000,1200000&z=8', origin.lat, origin.lon, 'maplink'],
    ['https://map.geo.admin.ch/#/map?lang=en&center=2660000,1190000&z=6&bgLayer=ch.swisstopo.pixelkarte-farbe', lv95ToWgs84(2660000, 1190000).lat, lv95ToWgs84(2660000, 1190000).lon, 'maplink'],
    ['https://map.geo.admin.ch/?lang=en&center=2660000%2C1190000&zoom=6', lv95ToWgs84(2660000, 1190000).lat, lv95ToWgs84(2660000, 1190000).lon, 'maplink'],
    ['https://map.schweizmobil.ch/?lang=de&E=2600000&N=1200000&zoom=12', origin.lat, origin.lon, 'maplink'],
    ['map.geo.admin.ch/?E=2600000&N=1200000', origin.lat, origin.lon, 'maplink'],
    ['https://map.geo.admin.ch/?lang=de&topic=ech&bgLayer=ch.swisstopo.pixelkarte-farbe&layers=ch.bfs.gebaeude_wohnungs_register&E=2683000&N=1248000&zoom=9&crosshair=marker', lv95ToWgs84(2683000, 1248000).lat, lv95ToWgs84(2683000, 1248000).lon, 'maplink'],
    // our own links
    ['https://example.org/wildcamp/#46.85000,9.53000,14', 46.85, 9.53, 'maplink', 14],
    ['#46.85000,9.53000,14', 46.85, 9.53, 'maplink', 14],
    ['#46.85,9.53', 46.85, 9.53, 'maplink'],
    ['http://localhost:5173/#46.50000,7.76000,15', 46.5, 7.76, 'maplink', 15],
    ['file:///home/me/wildcamp/index.html#46.5,7.76,15', 46.5, 7.76, 'maplink', 15],
    ['https://user.github.io/wildcamp/?x=1#-33.86880,151.20930,12', -33.8688, 151.2093, 'maplink', 12],
    // other services
    ['https://www.komoot.com/plan/@46.8523,9.5302,13z', 46.8523, 9.5302, 'maplink', 13],
    ['https://www.outdooractive.com/en/map/?lat=46.85&lon=9.53&zoom=12', 46.85, 9.53, 'maplink', 12],
    ['https://www.wikiloc.com/wikiloc/map.do?lat=46.85&lng=9.53', 46.85, 9.53, 'maplink'],
    ['https://example.com/spot?latitude=46.85&longitude=9.53', 46.85, 9.53, 'maplink'],
    ['https://example.com/spot?lat=46.85&long=9.53&z=11', 46.85, 9.53, 'maplink', 11],
    ['https://www.bing.com/maps?cp=46.85~9.53&lvl=15', 46.85, 9.53, 'maplink', 15],
    ['https://waze.com/ul?ll=46.85,9.53&navigate=yes&zoom=17', 46.85, 9.53, 'maplink', 17],
    ['https://waze.com/ul?to=ll.46.85%2C9.53', 46.85, 9.53, 'maplink'],
    // links in text and wrapped
    ['Camp here: https://maps.google.com/?q=46.85,9.53 see you', 46.85, 9.53, 'maplink'],
    ['<https://www.google.com/maps/@46.85,9.53,15z>', 46.85, 9.53, 'maplink', 15],
    ['(https://www.google.com/maps/@46.85,9.53,15z).', 46.85, 9.53, 'maplink', 15],
    ['Wildcamp CH https://example.org/#46.85000,9.53000,14', 46.85, 9.53, 'maplink', 14],
    ['  https://www.google.com/maps/@46.85,9.53,15z  ', 46.85, 9.53, 'maplink', 15],
  ];
  it.each(links)('%s', (input, lat, lon, kind, zoom) => expectLocation(input, lat, lon, kind, zoom));

  it('reads the Zürich place link as in the brief: pin, view and zoom agree', () => {
    expect(parseLocation(GOOGLE_PLACE)).toEqual({ lat: 47.3779, lon: 8.5403, zoom: 17, kind: 'maplink' });
  });

  it('never returns swisstopo’s zoom, which is its own scale', () => {
    for (const url of [
      'https://map.geo.admin.ch/?E=2600000&N=1200000&zoom=8',
      'https://map.geo.admin.ch/#/map?center=2600000,1200000&z=8',
      'https://map.geo.admin.ch/#/?lat=46.85&lon=9.53&zoom=10',
      'https://map.schweizmobil.ch/?E=2600000&N=1200000&zoom=12',
    ]) expect((parseLocation(url) as ParsedLocation).zoom).toBeUndefined();
  });

  describe('short links cannot be opened here', () => {
    it.each([
      ['https://maps.app.goo.gl/AbCdEf123'],
      ['https://goo.gl/maps/AbCdEf123'],
      ['maps.app.goo.gl/AbCdEf123'],
      ['http://maps.app.goo.gl/AbCdEf123?g_st=ic'],
      ['https://share.google/AbCdEf'],
      ['https://osm.org/go/0EEQjE=='],
      ['https://www.openstreetmap.org/go/0EEQjE=='],
      ['https://s.geo.admin.ch/abc123'],
      ['https://maps.apple/p/AbCdEf'],
      ['https://bit.ly/3xYz'],
      ['https://tinyurl.com/abc'],
      ['https://kmt.to/abc'],
      ['See https://maps.app.goo.gl/AbCdEf123 for the spot'],
      ['<https://maps.app.goo.gl/AbCdEf123>'],
    ])('%s', (input) => {
      expect(parseLocation(input)).toEqual({ error: 'short-link', message: 'Short links cannot be opened here. Open the link, then copy the coordinates or the full address from the browser.' });
    });
    it('uses the exported message', () => {
      expect(SHORT_LINK_MESSAGE).toBe('Short links cannot be opened here. Open the link, then copy the coordinates or the full address from the browser.');
    });
  });

  it.each([
    ['https://www.google.com/maps/place/Z%C3%BCrich/'],
    ['https://www.google.com/maps/place/Bern/data=!4m2!3m1!1s0x0'],
    ['https://www.openstreetmap.org/node/12345'],
    ['https://www.openstreetmap.org/'],
    ['https://example.com/'],
    ['https://www.komoot.com/tour/123456'],
    ['https://maps.google.com/?cid=123456789'],
    ['https://www.google.com/search?q=Bern'],
    ['https://www.google.com/maps?q=Bern+Bahnhof'],
    ['https://maps.apple.com/?address=Bern'],
    ['https://map.geo.admin.ch/'],
    ['geo:0,0?q=Bern'],
    ['geo:abc'],
    ['https://example.com/?lat=north&lon=east'],
    ['https://example.com/?lat=46.85'],
    ['https://example.com/#section-2'],
    ['maps.google.com'],
    ['St.Moritz'],
    ['Bern.ch'],
  ])('a link without a place gives nothing: %s', (input) => {
    expect(parseLocation(input)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// What is not a coordinate
// ---------------------------------------------------------------------------------------------

describe('text that must not be taken for a coordinate', () => {
  const never = [
    'Zürich',
    'Bern Bahnhof',
    'Bahnhofstrasse 46, 8001 Zürich',
    'Rue 46 9000',
    '8001 Zürich',
    '8001',
    'Piz Bernina 4049',
    'Matterhorn 4478',
    'Kandersteg 1602 m',
    '4478 m',
    'Route 66',
    '1.2.3',
    '12.05.2026',
    '10:30 11:45',
    '46',
    '46.8523',
    '46, 9',
    '46 9',
    '46,9',
    '46 51 08 9 31 48',
    '46.8523 9',
    '9 46.8523',
    'N 46',
    'E 9.5302',
    '46.8523 N',
    '+41 79 123 45 67',
    '048 0 123',
    'Bern 46.8523 9.5302',
    'Position: Bern',
    'lat 46.85',
    'Zürich HB, Bahnhofplatz 15',
    'Chur 7000',
    'CHF 1200000 2600000',
    '',
    '   ',
    '\n',
    '8FVC9G8F',
    '9G8F 6W',
    '46.8523, 9.5302, 14',
    '46.8523 9.5302 14.2',
    '..',
    ',',
    '46.8523N 9.5302',
    'NE 46 SW 9',
    'SOS 112',
    'No. 5 West 12',
  ];
  it('has 20 or more cases', () => expect(never.length).toBeGreaterThanOrEqual(20));
  it.each(never)('%j gives undefined', (input) => {
    expect(parseLocation(input)).toBeUndefined();
  });

  it('copes with non-strings and huge input', () => {
    expect(parseLocation(undefined as unknown as string)).toBeUndefined();
    expect(parseLocation(null as unknown as string)).toBeUndefined();
    expect(parseLocation(46.8523 as unknown as string)).toBeUndefined();
    expect(parseLocation('1'.repeat(100000))).toBeUndefined();
    expect(parseLocation('46.8523, 9.5302 ' + 'x'.repeat(5000))).toBeUndefined();
    expect(parseLocation('2600000 '.repeat(5000))).toBeUndefined();
  });

  it('never throws and never returns an impossible position, whatever it is fed', () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pieces = ['0', '1', '4', '6', '8', '9', '46', '9.5', '8523', '.', ',', ';', ' ', '°', "'", '"', 'N', 'S', 'E', 'W', 'O', '+', '-', '/', '#', '2600000', '1200000', '%', '&', '=', '(', ')', 'geo:', 'http://', 'z', '@', '!', '3d', '4d'];
    for (let i = 0; i < 20000; i++) {
      let s = '';
      for (let k = 0, n = 1 + Math.floor(rand() * 14); k < n; k++) s += pieces[Math.floor(rand() * pieces.length)];
      const r = parseLocation(s);
      if (r && !isLocationError(r)) {
        expect(Number.isFinite(r.lat) && Number.isFinite(r.lon), s).toBe(true);
        expect(Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180, s).toBe(true);
      }
    }
  });

  it('is fast on pathological strings', () => {
    const t0 = Date.now();
    for (const s of ['1 '.repeat(1500), "2'".repeat(1500), '° '.repeat(1500), 'N '.repeat(1500), '46.8523,'.repeat(400), '#' + '/'.repeat(2000), 'http://' + 'a.'.repeat(1500)]) parseLocation(s);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('isLocationError', () => {
  it('tells errors from places and from nothing', () => {
    expect(isLocationError(parseLocation('https://maps.app.goo.gl/x'))).toBe(true);
    expect(isLocationError(parseLocation('46.8523, 9.5302'))).toBe(false);
    expect(isLocationError(parseLocation('Bern'))).toBe(false);
    expect(isLocationError(undefined)).toBe(false);
  });
});
