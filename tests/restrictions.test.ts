import { describe, expect, it } from 'vitest';
import fx from './fixtures/restrictions.json';
import { fireKind, fireLevel, parseDrones, parseFire, restrictionItems, type Restrictions } from '../src/restrictions';

describe('fire (real BAFU responses)', () => {
  it('reads danger and measure for a region', () => {
    const f = parseFire(fx.fire_danger_kandersteg, fx.fire_measure_kandersteg);
    expect(f.danger).toMatchObject({ title: 'Moderate danger', level: 2, region: 'Kandersteg (BE)' });
    expect(f.measure?.ban).toBe(false);
    expect(f.measure?.canton).toBe('BE');
  });
  it('reads the danger scale from the published titles', () => {
    expect(['Low danger', 'Moderate danger', 'Considerable danger', 'High danger', 'Very high danger'].map(fireLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(fireLevel('something else')).toBeUndefined();
  });
  it('recognises a ban, including a conditional one, but not "no measures"', () => {
    const m = (title: string, description: string) => ({ results: [{ attributes: { title_en: title, description_en: description, valid_from: '01.08.2026', canton: 'VS' } }] });
    expect(parseFire({}, m('Conditional ban on fires in the forest and in the proximity of the forest / in the open', 'Fires only allowed in permanent campfire sites, due caution to be exercised in all cases')).measure?.ban).toBe(true);
    expect(parseFire({}, m('Ban on fires in the forest', 'No fires')).measure?.ban).toBe(true);
    expect(parseFire({}, m('No measures in force', 'Fire possible, due caution to be exercised in all cases')).measure?.ban).toBe(false);
    expect(parseFire({}, m('Warning that care should be taken when lighting fires in the forest', 'avoid')).measure?.ban).toBe(false);
  });
  it('turns a ban into a red item with the canton and date, a calm notice into information', () => {
    const ban = restrictionItems({ failed: [], fire: { measure: { title: 'Conditional ban on fires', description: 'Fires only allowed in permanent campfire sites', ban: true, validFrom: '01.08.2026', canton: 'VS' } } });
    expect(ban[0]).toMatchObject({ tone: 'bad' });
    expect(ban[0]!.text).toMatch(/permanent campfire sites.*VS.*01\.08\.2026/);
    const calm = restrictionItems({ failed: [], fire: parseFire(fx.fire_danger_kandersteg, fx.fire_measure_kandersteg) });
    expect(calm[0]).toMatchObject({ tone: 'info' });
    expect(calm[0]!.text).toMatch(/Moderate danger/);
    const high = restrictionItems({ failed: [], fire: { danger: { title: 'Considerable danger', level: 3, region: 'Visp (VS)', validFrom: '01.07.2026' } } });
    expect(high[0]).toMatchObject({ tone: 'warn' });
  });
});

describe('the five measure types of the federal map, each worded for what it means', () => {
  const measure = (title_en: string, description_en: string, canton = 'GR') => ({ results: [{ attributes: { title_en, description_en, valid_from: '26.06.2026', canton } }] });
  const TYPES = {
    none: ['No measures in force', 'Fire possible, due caution to be exercised in all cases'],
    warning: ['Warning that care should be taken when lighting fires in the forest and in the proximity of the forest/in the open', 'The lighting of fires should be avoided in the forest and in the proximity of the forest'],
    conditional: ['Conditional ban on fires in the forest and in the proximity of the forest / in the open', 'Fires only allowed in permanent campfire sites, due caution to be exercised in all cases'],
    forest: ['Absolute ban on fires in the forest and in the proximity of the forest', 'Fires allowed elsewhere in the open, due caution to be exercised in all cases'],
    open: ['Absolute ban on fires in the open', 'No fires allowed in the open'],
  } as const;
  const item = (kind: keyof typeof TYPES, danger = fx.fire_danger_kandersteg) => restrictionItems({ failed: [], fire: parseFire(danger, measure(TYPES[kind][0], TYPES[kind][1])) })[0]!;
  it('tells the type from the title the map publishes', () => {
    for (const k of Object.keys(TYPES) as (keyof typeof TYPES)[]) expect(fireKind(TYPES[k][0]), k).toBe(k);
    expect(fireKind('Something new')).toBeUndefined();
    expect(fireKind(undefined)).toBeUndefined();
  });
  it('an absolute ban in the open: red, gas and electric grills named only where a canton allows them, camping stoves never assumed', () => {
    const i = item('open');
    expect(i).toMatchObject({ tone: 'bad', title: 'Fire ban: no fires in the open' });
    expect(i.text).toMatch(/Graubünden/);
    expect(i.text).toMatch(/Camping stoves are not named.*do not use one/);
    expect(i.text).not.toMatch(/lower risk/);
  });
  it('a ban in and near forest: red, with the distances the cantons name, elsewhere possible, Bern bans stoves in the zone', () => {
    const i = item('forest');
    expect(i).toMatchObject({ tone: 'bad', title: 'Fire ban in and near forest' });
    expect(i.text).toMatch(/50 m in Bern, 100 m in Valais/);
    expect(i.text).toMatch(/Elsewhere in the open, fires are possible/);
    expect(i.text).toMatch(/camping stoves are banned inside the ban zone/);
  });
  it('a conditional ban is amber: fire places only, the stove question left to the canton and not assumed', () => {
    const i = item('conditional');
    expect(i).toMatchObject({ tone: 'warn', title: 'Conditional fire ban' });
    expect(i.text).toMatch(/permanently installed fire places/);
    expect(i.text).toMatch(/do not assume it is/);
  });
  it('a warning is an appeal, not a ban, and says so', () => {
    const i = item('warning');
    expect(i.tone).toBe('info');
    expect(i.text).toMatch(/appeal, not a ban/);
    expect(i.text).not.toMatch(/Do not light/);
  });
  it('no measure: fires possible with caution, forest rules all year, communes can ban', () => {
    const i = item('none');
    expect(i.tone).toBe('info');
    expect(i.text).toMatch(/No cantonal fire measure is listed/);
    expect(i.text).toMatch(/Vaud.*10 m/);
  });
  it('every fire message says who sets the rules and links the cantonal offices; the old unsupported sentences are gone', () => {
    for (const k of Object.keys(TYPES) as (keyof typeof TYPES)[]) {
      const i = item(k);
      expect(i.text, k).toMatch(/set by the canton, and in some cantons by the commune/);
      expect(i.sources, k).toContain('https://www.waldbrandgefahr.ch/de/kantonale-fachstellen');
      expect(i.text, k).not.toMatch(/stove on bare ground|cantons often ban|in force since/);
    }
  });
  it('a high danger level with no ban says that a level alone is not a ban', () => {
    const i = restrictionItems({ failed: [], fire: { danger: { title: 'High danger', level: 4, region: 'Visp (VS)', validFrom: '01.07.2026' } } })[0]!;
    expect(i.tone).toBe('warn');
    expect(i.text).toMatch(/a level alone is not a ban/);
    expect(i.text).not.toMatch(/cantons often ban/);
  });
  it('a warning type at a high danger level is amber and repeats that the level is not a ban', () => {
    const f = parseFire({ results: [{ attributes: { title_en: 'High danger', valid_from: '10.09.2026', name_en: 'Chur (GR)' } }] }, measure(TYPES.warning[0], TYPES.warning[1]));
    const i = restrictionItems({ failed: [], fire: f })[0]!;
    expect(i.tone).toBe('warn');
    expect(i.text).toMatch(/danger level alone is not a ban/);
  });
  it('a ban type this version does not know is still a ban, in the map\'s own words', () => {
    const f = parseFire({}, measure('Total ban on fires everywhere', 'No fire of any kind'));
    const i = restrictionItems({ failed: [], fire: f })[0]!;
    expect(f.measure?.kind).toBeUndefined();
    expect(i).toMatchObject({ tone: 'bad' });
    expect(i.text).toMatch(/No fire of any kind/);
    expect(i.text).toMatch(/do not assume it is/);
  });
});

describe('drones (real BAZL responses)', () => {
  it('reads an airport zone: over 250 g only, with authority', () => {
    const z = parseDrones(fx.drone_bern);
    expect(z.length).toBe(2);
    expect(z.every((x) => !x.all)).toBe(true);
    expect(z[0]!.restriction).toMatch(/250 g/);
    expect(z[0]!.authority).toBe('Skyguide');
  });
  it('the national park forbids every drone', () => {
    const z = parseDrones(fx.drone_nationalpark);
    expect(z[0]).toMatchObject({ name: 'Swiss National Park', all: true });
    const items = restrictionItems({ failed: [], drones: z });
    expect(items[0]).toMatchObject({ tone: 'bad', title: 'Drones: Swiss National Park' });
  });
  it('lists the zone that forbids most first', () => {
    const mixed = parseDrones({ results: [...fx.drone_bern.results, ...fx.drone_nationalpark.results] });
    expect(mixed[0]!.all).toBe(true);
  });
  it('says no restriction is listed, with the general rules, when nothing applies', () => {
    expect(parseDrones(fx.drone_none)).toEqual([]);
    const it = restrictionItems({ failed: [], drones: [] })[0]!;
    expect(it).toMatchObject({ tone: 'info', title: 'Drones: no geographic restriction listed' });
    expect(it.text).toMatch(/120 m/);
  });
});

describe('failures are never read as "nothing applies"', () => {
  it('names a failed fire or drone lookup', () => {
    const r: Restrictions = { failed: ['fire', 'drones'] };
    expect(restrictionItems(r).map((i) => i.title)).toEqual(['Fire rules could not be checked', 'Drone zones could not be checked']);
  });
  it('a half-failed fire lookup keeps what it got and flags the rest', () => {
    const r: Restrictions = { failed: ['fire'], fire: parseFire(fx.fire_danger_kandersteg, {}) };
    expect(restrictionItems(r).map((i) => i.title)).toEqual(['Fire: Moderate danger', 'Fire rules could not be checked']);
  });
});
