import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUNT_2026, dogAlert, dogSeason, fetchDogAreas, huntingNote, parseDogAreas, wildlifeItems, type DogArea } from '../src/wildlife';
import { buildAlerts } from '../src/alerts';
import { setLangForTest } from '../src/i18n';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('when the dogs are on a pasture, from the provider\'s text', () => {
  const GENERAL = 'In der Regel von Anfang Juni bis Ende September.';
  it('inside the range is in, a fortnight either side is unsure, further out is out', () => {
    expect(dogSeason(GENERAL, d(2027, 7, 15))).toBe('in');
    expect(dogSeason(GENERAL, d(2027, 6, 1))).toBe('in');
    expect(dogSeason(GENERAL, d(2027, 9, 30))).toBe('in');
    expect(dogSeason(GENERAL, d(2027, 5, 25))).toBe('unsure');
    expect(dogSeason(GENERAL, d(2027, 10, 8))).toBe('unsure');
    expect(dogSeason(GENERAL, d(2027, 5, 1))).toBe('out');
    expect(dogSeason(GENERAL, d(2027, 10, 20))).toBe('out');
    expect(dogSeason(GENERAL, d(2027, 2, 10))).toBe('out');
  });
  it('mid and end of a month are read as the 15th and the last day', () => {
    const t = 'In der Regel von Ende Mai bis Mitte Oktober.';
    expect(dogSeason(t, d(2027, 5, 31))).toBe('in');
    expect(dogSeason(t, d(2027, 10, 15))).toBe('in');
    expect(dogSeason(t, d(2027, 10, 16))).toBe('unsure');
    expect(dogSeason('In der Regel zwischen Mitte Mai und Ende September.', d(2027, 5, 10))).toBe('unsure');
  });
  it('all year round is always in', () => {
    for (const t of ['Herdenschutzhunde sind das ganze Jahr über auf dem Betrieb präsent.', 'Ganzjährig vorhanden.']) expect(dogSeason(t, d(2027, 1, 20))).toBe('in');
  });
  it('a range that wraps the new year works', () => {
    const t = 'In der Regel von Mitte November bis Mitte März.';
    expect(dogSeason(t, d(2027, 1, 10))).toBe('in');
    expect(dogSeason(t, d(2027, 7, 10))).toBe('out');
  });
  it('explicit dates are exact', () => {
    const t = '05.10.2026-17.10.2026 (aber nicht sonntags)';
    expect(dogSeason(t, d(2026, 10, 10))).toBe('in');
    expect(dogSeason(t, d(2026, 11, 1))).toBe('out');
    expect(dogSeason(t, d(2026, 10, 4))).toBe('out');
  });
  it('a text that cannot be read is unsure, never out', () => {
    expect(dogSeason(undefined, d(2027, 1, 1))).toBe('unsure');
    expect(dogSeason('', d(2027, 1, 1))).toBe('unsure');
    expect(dogSeason('Je nach Herde unterschiedlich.', d(2027, 1, 1))).toBe('unsure');
    expect(dogSeason('In der Regel von Anfang Mai bis Ende Mai für die Bereiche rund um das Dorf. Von Ende Mai bis Ende September für die Alp Russena.', d(2027, 1, 1))).toBe('unsure');
  });
});

describe('the pastures with dogs near a spot', () => {
  const square = (e0: number, n0: number, e1: number, n1: number) => ({ type: 'MultiPolygon', coordinates: [[[[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]]] });
  const feat = (name: string, typ: string, geometry: unknown, extra: Record<string, unknown> = {}) => ({
    geometry,
    properties: { name, typzone_en: typ, typzone_de: typ.includes('without') ? 'Weide (ohne Herdenschutzhunde)' : 'Weide (Präsenz Herdenschutzhunde)', hundepraesenz_en: 'Generally, from early June to the end of September.', hundepraesenz_de: 'In der Regel von Anfang Juni bis Ende September.', hundepraesenz_fr: 'En règle générale, de début juin à fin septembre.', hinweis_en: '', refverhalten_en: 'https://www.protectiondestroupeaux.ch/en/x', ...extra },
  });
  const E = 2_700_000;
  const N = 1_150_000;
  const WITH = 'Pasture (Presence of livestock guardian dogs)';
  const body = {
    results: [
      feat('Inside', WITH, square(E - 100, N - 100, E + 100, N + 100)),
      feat('Near', WITH, square(E + 300, N - 50, E + 400, N + 50)),
      feat('Too far', WITH, square(E + 900, N - 50, E + 1000, N + 50)),
      feat('No dogs', 'Pasture (without livestock guardian dogs)', square(E - 50, N - 50, E + 50, N + 50)),
    ],
  };
  it('lists the ones with dogs within 500 m, nearest first, and leaves out far ones and pastures without dogs', () => {
    const got = parseDogAreas(body as never, E, N, 'en');
    expect(got.map((x) => x.name)).toEqual(['Inside', 'Near']);
    expect(got[0]!.meters).toBe(0);
    expect(got[1]!.meters).toBeCloseTo(300, 0);
  });
  it('carries the season, the hint and the provider\'s page, in the language of the page', () => {
    const got = parseDogAreas({ results: [feat('Alp', WITH, square(E - 100, N - 100, E + 100, N + 100), { hinweis_en: 'Do not cross the herd.', hinweis_fr: 'Ne traversez pas le troupeau.', refverhalten_fr: 'https://x/fr' })] } as never, E, N, 'fr');
    expect(got[0]).toMatchObject({ season: 'En règle générale, de début juin à fin septembre.', seasonDe: 'In der Regel von Anfang Juni bis Ende September.', hint: 'Ne traversez pas le troupeau.', behaviourUrl: 'https://x/fr' });
    const en = parseDogAreas({ results: [feat('Alp', WITH, square(E - 100, N - 100, E + 100, N + 100))] } as never, E, N, 'it'); // no Italian text: English
    expect(en[0]!.season).toBe('Generally, from early June to the end of September.');
  });
  it('never carries the contact data of the alp operator', () => {
    const got = parseDogAreas({ results: [feat('Alp', WITH, square(E - 100, N - 100, E + 100, N + 100), { kontname: 'A Person', konttel: '+41 79 000 00 00', kontemail: 'a@b.ch' })] } as never, E, N, 'en');
    expect(JSON.stringify(got)).not.toMatch(/Person|\+41|@/);
  });
  it('gives nothing for an empty answer or a feature without an outline', () => {
    expect(parseDogAreas({ results: [] }, E, N)).toEqual([]);
    expect(parseDogAreas({}, E, N)).toEqual([]);
    expect(parseDogAreas({ results: [{ properties: { name: 'x', typzone_en: WITH } }] } as never, E, N)).toEqual([]);
  });
});

describe('asking for the dog pastures', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('searches the live layer within 500 m with outlines, and reports a failure', async () => {
    let url = '';
    vi.stubGlobal('fetch', vi.fn(async (u: string) => ((url = String(u)), new Response(JSON.stringify({ results: [] }), { status: 200 }))));
    expect(await fetchDogAreas(46.678, 9.854)).toEqual([]);
    expect(url).toContain('ch.bafu.alpweiden-mit_herdenschutzhunden');
    expect(url).toContain('returnGeometry=true');
    expect(url).toContain('geometryFormat=geojson');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
    await expect(fetchDogAreas(46.678, 9.854)).rejects.toThrow('dogs 503');
  });
});

describe('hunting', () => {
  it('in a canton with published dates, while a period is on: a warning with the periods, the days and the date they were read', () => {
    const n = huntingNote('BE', d(2026, 9, 15))!;
    expect(n.active).toBe(true);
    expect(n.item.tone).toBe('warn');
    expect(n.item.text).toMatch(/1 Sep – 20 Sep: red deer/);
    expect(n.item.text).toMatch(/10 Oct – 15 Nov: follow-up hunt/);
    expect(n.item.text).toMatch(/No hunting on Sundays/);
    expect(n.item.text).toMatch(/Dates as published on 06\/10\/2026/);
    expect(n.item.sources?.[0]).toMatch(/weu\.be\.ch/);
  });
  it('between periods it says none is on, and that other hunts may be', () => {
    const n = huntingNote('BE', d(2026, 12, 20))!;
    expect(n.active).toBe(false);
    expect(n.item.tone).toBe('info');
    expect(n.item.text).toMatch(/None of them is on at this date; other hunts/);
  });
  it('days of the period only are marked, a single day is shown as one date', () => {
    const t = huntingNote('SZ', d(2026, 11, 12))!.item.text;
    expect(t).toMatch(/7 Nov: red deer \(some days\)/);
    expect(t).toMatch(/12 Nov – 14 Nov: red deer \(some days\)/);
  });
  it('without dates for the canton or the year, only the general statement', () => {
    for (const [canton, date] of [['ZH', d(2026, 9, 15)], [undefined, d(2026, 9, 15)], ['BE', d(2027, 9, 15)]] as const) {
      const n = huntingNote(canton, date)!;
      expect(n.active).toBe(false);
      expect(n.item.title).toBe('Hunting season');
      expect(n.item.text).toMatch(/cantons publish the dates every year/);
      expect(n.item.text).not.toMatch(/Sep –/);
    }
  });
  it('says nothing from January to July', () => {
    for (const m of [1, 2, 3, 4, 5, 6, 7]) expect(huntingNote('BE', d(2026, m, 15))).toBeUndefined();
  });
  it('every listed period is a real date range inside the year and every canton names its source', () => {
    for (const [canton, c] of Object.entries(HUNT_2026)) {
      expect(c.source, canton).toMatch(/^https:\/\//);
      for (const p of c.periods) {
        expect(p.from, `${canton} ${p.from}`).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
        expect(p.to <= '12-31' && p.from <= p.to, `${canton} ${p.from}-${p.to}`).toBe(true);
        expect(p.kinds.length).toBeGreaterThan(0);
      }
    }
  });
  it('is translated: periods and the days rule follow the language', () => {
    try {
      setLangForTest('de');
      const t = huntingNote('FR', d(2026, 9, 25))!.item.text;
      expect(t).toMatch(/Gämse/);
      expect(t).toMatch(/Sonntags wird nicht gejagt/);
    } finally {
      setLangForTest('en');
    }
  });
});

describe('the tab', () => {
  const area = (over: Partial<DogArea> = {}): DogArea => ({ name: 'Alp Ravais-ch Tuors', present: true, meters: 0, season: 'Generally, from late May to mid-October.', seasonDe: 'In der Regel von Ende Mai bis Mitte Oktober.', ...over });
  const items = (over: Partial<Parameters<typeof wildlifeItems>[0]> = {}) => wildlifeItems({ date: d(2026, 7, 20), canton: 'GR', ...over });
  it('dogs on the pasture in season: a warning with the provider\'s season, the hint and the behaviour advice, and the honest gap about camping', () => {
    const i = items({ dogs: [area({ hint: 'Do not cross the herd.' })] })[0]!;
    expect(i).toMatchObject({ tone: 'warn', title: 'Herd-protection dogs on this pasture: Alp Ravais-ch Tuors' });
    expect(i.text).toMatch(/late May to mid-October/);
    expect(i.text).toMatch(/Do not cross the herd/);
    expect(i.text).toMatch(/Do not shout at the dogs/);
    expect(i.text).toMatch(/No official advice for camping near them was found/);
    expect(i.sources).toEqual(expect.arrayContaining(['https://herdenschutzschweiz.ch/de/herdenschutzhunde/tourismus-und-herdenschutzhunde/verhaltensempfehlungen/']));
  });
  it('out of season it is information, and says the reports can be out of date', () => {
    const i = items({ dogs: [area()], date: d(2027, 2, 10) })[0]!;
    expect(i.tone).toBe('info');
    expect(i.text).toMatch(/outside it, but the reports can be out of date/);
  });
  it('a pasture 300 m away is information: the dogs can be at its edge and cross sheep fences', () => {
    const i = items({ dogs: [area({ meters: 300 })] })[0]!;
    expect(i).toMatchObject({ tone: 'info', title: 'A pasture with herd-protection dogs lies about 300 m away' });
    expect(i.text).toMatch(/edge of their pasture and sometimes cross sheep fences/);
  });
  it('none reported is said as "not reported", not as "no dogs"; a failed lookup is said as a failure', () => {
    const none = items({ dogs: [] }).find((i) => i.title === 'No herd-protection dog pasture reported here')!;
    expect(none.text).toMatch(/does not mean there are none/);
    expect(items({ dogsFailed: true }).map((i) => i.title)).toContain('Herd-protection dog areas could not be checked');
    expect(items({}).some((i) => /dog/i.test(i.title) && /No herd|could not/.test(i.title))).toBe(false); // not asked yet: nothing said
  });
  it('always has the advice for wolves and bears and for cattle, from official sources', () => {
    const all = items({});
    const w = all.find((i) => i.title === 'Wolves and bears')!;
    expect(w.text).toMatch(/at least 50 m/);
    expect(w.text).toMatch(/do not approach, feed or chase it/);
    expect(w.text).not.toMatch(/never attack|harmless|have never/i);
    expect(w.sources).toEqual(expect.arrayContaining(['https://www.bafu.admin.ch/de/braunbaer']));
    expect(all.find((i) => i.title === 'Cattle on pastures')!.sources?.[0]).toMatch(/bfu\.ch/);
  });
  it('has the hunting note in the months of the hunt only', () => {
    expect(items({ date: d(2026, 9, 15) }).some((i) => /Hunting season/.test(i.title))).toBe(true);
    expect(items({ date: d(2026, 3, 15) }).some((i) => /Hunting season/.test(i.title))).toBe(false);
  });
  it('shows at most two pastures', () => {
    const dogs = [area({ name: 'A' }), area({ name: 'B', meters: 100 }), area({ name: 'C', meters: 200 })];
    expect(items({ dogs }).filter((i) => /herd-protection dogs/i.test(i.title) && /: [ABC]$|about/.test(i.title)).length).toBeLessThanOrEqual(2);
  });
});

describe('the first-view alert', () => {
  const area = (meters: number, seasonDe?: string): DogArea => ({ name: 'Alp', present: true, meters, seasonDe });
  it('only for a pasture the spot is inside, and not out of season', () => {
    expect(dogAlert([area(0, 'In der Regel von Anfang Juni bis Ende September.')], d(2026, 7, 20))).toBe(true);
    expect(dogAlert([area(0)], d(2026, 7, 20))).toBe(true); // a text that cannot be read: still told
    expect(dogAlert([area(0, 'In der Regel von Anfang Juni bis Ende September.')], d(2027, 2, 10))).toBe(false);
    expect(dogAlert([area(300, 'ganze Jahr')], d(2026, 7, 20))).toBe(false); // near is for the tab, not the first view
    expect(dogAlert([], d(2026, 7, 20))).toBe(false);
    expect(dogAlert(undefined, d(2026, 7, 20))).toBe(false);
  });
  it('is one of the alerts, amber, pointing at the legal part where the tab is', () => {
    const a = buildAlerts({ dogs: [area(0, 'ganze Jahr')], date: d(2026, 7, 20) });
    expect(a).toContainEqual({ tone: 'warn', text: 'Herd-protection dogs on this pasture', panel: 'legal' });
    expect(buildAlerts({ dogs: [area(300, 'ganze Jahr')], date: d(2026, 7, 20) })).toEqual([]);
  });
});

describe('the hunting day notes are translated', () => {
  it('every canton\'s `days` text exists in German, French and Italian', async () => {
    const { HUNT_2026 } = await import('../src/wildlife');
    const { DE, FR, IT } = await import('../src/i18n-dict');
    for (const [code, h] of Object.entries(HUNT_2026)) {
      if (!h.days) continue;
      for (const d of [DE, FR, IT]) expect(d[h.days], `${code}: ${h.days}`).toBeTruthy();
    }
  });
});

describe('hunting on the first view', () => {
  it('shows a line while the canton hunt is on, and none outside it', async () => {
    const { buildAlerts } = await import('../src/alerts');
    const a = { canton: { code: 'GR', name: 'Graubünden' }, items: [], zones: [], nearZones: [] } as never;
    expect(buildAlerts({ assessment: a, date: new Date(2026, 10, 4, 12) }).map((x) => x.text)).toContain('Hunting season on in this canton');
    expect(buildAlerts({ assessment: a, date: new Date(2026, 6, 4, 12) }).map((x) => x.text)).not.toContain('Hunting season on in this canton');
  });
});
