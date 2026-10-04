import { describe, expect, it } from 'vitest';
import fx from './fixtures/restrictions.json';
import { fireLevel, parseDrones, parseFire, restrictionItems, type Restrictions } from '../src/restrictions';

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
