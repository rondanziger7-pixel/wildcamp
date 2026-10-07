import { describe, expect, it } from 'vitest';
import { CANTONS } from '../src/cantons';
import { DEFAULT_GEAR, GEAR_KEY, cleanGear, gearItems, gearLine, isDefaultGear, loadGear, saveGear, tentlessStance } from '../src/gear';
import { MUNICIPAL_RULES } from '../src/municipalities';

const muni = (name: string) => MUNICIPAL_RULES.find((m) => m.name === name)!;
const canton = (code: string) => CANTONS.find((c) => c.code === code)!;
const ctx = (name?: string, code?: string) => ({ canton: code ? canton(code) : undefined, municipality: name, municipalRule: name ? muni(name).rule : undefined });

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('the set-up kept in the browser', () => {
  it('starts as a tent for one person with no dog', () => {
    expect(loadGear(new Mem())).toEqual(DEFAULT_GEAR);
    expect(isDefaultGear(DEFAULT_GEAR)).toBe(true);
    expect(gearLine(DEFAULT_GEAR)).toBe('Tent · 1 person');
  });
  it('cleans what it reads', () => {
    expect(cleanGear({ shelter: 'spaceship', people: 'many', dog: 'yes' })).toEqual(DEFAULT_GEAR);
    expect(cleanGear({ shelter: 'bivy', people: 0, dog: true })).toEqual({ shelter: 'bivy', people: 1, dog: true });
    expect(cleanGear({ shelter: 'vehicle', people: 999.6 }).people).toBe(30);
    expect(cleanGear(null)).toEqual(DEFAULT_GEAR);
    expect(cleanGear('x')).toEqual(DEFAULT_GEAR);
  });
  it('saves a change and forgets the default', () => {
    const s = new Mem();
    expect(saveGear(s, { shelter: 'tarp', people: 2, dog: true })).toBe(true);
    expect(loadGear(s)).toEqual({ shelter: 'tarp', people: 2, dog: true });
    expect(gearLine(loadGear(s))).toBe('Tarp or hammock · 2 people · with a dog');
    saveGear(s, DEFAULT_GEAR);
    expect(s.getItem(GEAR_KEY)).toBeNull();
  });
  it('survives damaged or blocked storage', () => {
    const s = new Mem();
    s.setItem(GEAR_KEY, '{oops');
    expect(loadGear(s)).toEqual(DEFAULT_GEAR);
    const blocked = { setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    expect(saveGear(blocked, { shelter: 'bivy', people: 1, dog: false })).toBe(false);
    expect(saveGear(undefined, { shelter: 'bivy', people: 1, dog: false })).toBe(false);
  });
});

describe('how a rule text treats sleeping without a tent', () => {
  it('is pinned for every recorded municipality, so a rewritten summary cannot change it silently', () => {
    const by = (s: string) => MUNICIPAL_RULES.filter((m) => tentlessStance(m.rule.summary) === s).map((m) => m.name).sort();
    expect(by('covered')).toEqual(['Brienz']);
    expect(by('left-out')).toEqual(['Biel-Bienne', 'Kandersteg', 'Thun']);
    expect(by('silent').length).toBe(MUNICIPAL_RULES.length - 4);
  });
});

describe('notes for another set-up', () => {
  it('has none for a tent', () => {
    expect(gearItems(DEFAULT_GEAR, ctx('Bern', 'BE'))).toEqual([]);
  });
  it('a bivy bag: the municipal rule can count it as camping, leave it out, or say nothing', () => {
    const bivy = { ...DEFAULT_GEAR, shelter: 'bivy' as const };
    const covered = gearItems(bivy, ctx('Brienz', 'BE'));
    expect(covered).toHaveLength(1);
    expect(covered[0]!.tone).toBe('warn');
    expect(covered[0]!.text).toContain('expressly counts sleeping outdoors without a tent as camping');
    const left = gearItems(bivy, ctx('Kandersteg', 'BE'))[0]!;
    expect(left.tone).toBe('info');
    expect(left.text).toMatch(/does not by itself make this spot legal/);
    const silent = gearItems(bivy, ctx('Bern', 'BE'))[0]!;
    expect(silent.title).toBe('No tent: the municipal rule does not say');
    expect(silent.text).toMatch(/does not say a bivy bag is allowed/);
  });
  it('a bivy bag where only the canton has a text: it points at a text that names bivouacking, else says nothing is named', () => {
    const bivy = { ...DEFAULT_GEAR, shelter: 'bivy' as const };
    const named = gearItems(bivy, ctx(undefined, 'AI'))[0]!;
    expect(named.title).toBe('The cantonal text names bivouacking');
    const none = gearItems(bivy, { canton: canton('AG') })[0]!;
    expect(none.title).toBe('A bivy bag is not named in the rules read here');
    expect(none.text).toMatch(/Do not assume it is exempt/);
  });
  it('a tarp is named like a tent where a text says so', () => {
    const tarp = { ...DEFAULT_GEAR, shelter: 'tarp' as const };
    expect(gearItems(tarp, ctx('Thun', 'BE'))[0]!.title).toBe('Tarps are named like tents here');
    expect(gearItems(tarp, ctx('Bern', 'BE'))[0]!.title).toBe('A tarp or hammock is not named in the rules read here');
  });
  it('a vehicle: the texts that name vehicles are pointed to, otherwise the app says it has no source', () => {
    const car = { ...DEFAULT_GEAR, shelter: 'vehicle' as const };
    expect(gearItems(car, ctx('Bern', 'BE'))[0]!.title).toBe('The rule texts name vehicles');
    const none = gearItems(car, { canton: canton('AG') })[0]!;
    expect(none.title).toBe('The rules read here are about tents');
    expect(none.text).toMatch(/no source on sleeping in a vehicle/);
    expect(none.tone).toBe('warn');
  });
  it('a group: only where a text mentions groups', () => {
    const group = { ...DEFAULT_GEAR, people: 6 };
    expect(gearItems(group, { canton: canton('NW') }).map((i) => i.title)).toEqual(['The rule texts mention groups']);
    // where no text mentions groups, the app says what it did find: no group-size law
    const none = gearItems(group, { canton: canton('AG') });
    expect(none.map((i) => i.title)).toEqual(['No group-size limit found']);
    expect(none[0]!.text).toMatch(/No law read sets a group size/);
    expect(none[0]!.sources!.length).toBeGreaterThan(0);
    expect(gearItems({ ...DEFAULT_GEAR, people: 2 }, { canton: canton('NW') })).toEqual([]);
  });
  it('never changes a verdict and never says a spot is legal', () => {
    for (const shelter of ['tent', 'tarp', 'bivy', 'vehicle'] as const) {
      for (const m of MUNICIPAL_RULES.slice(0, 10)) {
        for (const i of gearItems({ shelter, people: 8, dog: true }, ctx(m.name))) {
          expect(i.tone).not.toBe('ok');
          // a positive claim of legality; "does not say ... is allowed" and "not by itself legal" are the opposite
          expect(i.text.replace(/does not (say|by itself make)[^.]*\./gi, '')).not.toMatch(/\b(is|are) (legal|allowed|permitted)\b|you (may|can) (camp|sleep)/i);
        }
      }
    }
  });
});

describe('a dog', () => {
  const dog = { ...DEFAULT_GEAR, dog: true };
  const at = (code: string, date: string, extra = {}) => gearItems(dog, { canton: { code, name: code }, date: new Date(`${date}T20:00:00`), ...extra });
  it('has a lead in forest from 1 April to 31 July in the cantons whose texts say so', () => {
    for (const code of ['AG', 'LU', 'SO', 'TG', 'BL']) {
      const it = at(code, '2026-06-15').find((i) => i.title === 'Dogs on a lead in forest')!;
      expect(it, code).toBeTruthy();
      expect(it.tone).toBe('warn');
      expect(it.text).toContain('1 April');
      expect(it.sources!.length).toBeGreaterThan(0);
    }
  });
  it('knows the edges of the period', () => {
    expect(at('SO', '2026-03-31').some((i) => i.title === 'Dogs on a lead in forest: not in this period')).toBe(true);
    expect(at('SO', '2026-04-01').some((i) => i.title === 'Dogs on a lead in forest')).toBe(true);
    expect(at('SO', '2026-07-31').some((i) => i.title === 'Dogs on a lead in forest')).toBe(true);
    expect(at('SO', '2026-08-01').some((i) => i.title === 'Dogs on a lead in forest: not in this period')).toBe(true);
    // Fribourg ends on 15 July
    expect(at('FR', '2026-07-15').some((i) => i.title === 'Dogs on a lead in forest')).toBe(true);
    expect(at('FR', '2026-07-16').some((i) => i.title === 'Dogs on a lead in forest: not in this period')).toBe(true);
  });
  it('names the 50 m edge where the text does (AG, LU) and not elsewhere', () => {
    expect(at('AG', '2026-05-01').find((i) => i.title === 'Dogs on a lead in forest')!.text).toContain('50 m');
    expect(at('SO', '2026-05-01').find((i) => i.title === 'Dogs on a lead in forest')!.text).not.toContain('50 m');
  });
  it('marks Uri as announced, not as a law it could cite', () => {
    const it = at('UR', '2026-05-01')[0]!;
    expect(it.title).toBe('Dogs on a lead in forest (announced)');
    expect(it.text).toMatch(/article of the ordinance was not found/);
  });
  it('says none was found where the texts read have no general period, and never that dogs may run free', () => {
    for (const code of ['BE', 'SG', 'GR', 'VS', 'NW', 'ZG']) {
      const it = at(code, '2026-05-01').find((i) => i.title === 'No general forest leash period found')!;
      expect(it, code).toBeTruthy();
      expect(it.text).toMatch(/not a sign that dogs may run free/);
    }
    expect(at('ZH', '2026-05-01').some((i) => i.title === 'The leash rules of this canton were not checked')).toBe(true);
  });
  it('always adds the federal note: no general leash duty, and the fine for letting a dog hunt', () => {
    const it = at('BE', '2026-05-01').find((i) => i.title === 'Federal law: no general leash duty')!;
    expect(it.text).toMatch(/CHF 20,000/);
  });
  it('bans dogs in the National Park, even on a lead', () => {
    const it = at('GR', '2026-08-01', { inNationalPark: true })[0]!;
    expect(it.tone).toBe('bad');
    expect(it.text).toMatch(/not even on a lead/);
  });
  it('says when the forest map puts the spot in forest', () => {
    expect(at('LU', '2026-05-01', { inForest: true }).find((i) => i.title === 'Dogs on a lead in forest')!.text).toContain('in forest');
  });
});
