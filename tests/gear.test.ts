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
    expect(gearItems({ ...DEFAULT_GEAR, dog: true }, ctx('Bern', 'BE'))).toEqual([]);
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
    expect(gearItems(group, { canton: canton('AG') })).toEqual([]);
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
