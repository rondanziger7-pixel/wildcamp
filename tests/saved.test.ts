import { describe, expect, it } from 'vitest';
import { MAX_NAME, MAX_NOTE, MAX_SAVED, SAVED_KEY, ageLabel, compareRows, defaultName, importSpots, isSaved, loadSaved, overallOf, removeSpot, saveSpot, sortSpots, spotId, updateLegality, updateSpot, type SavedSpot, type SpotSnapshot, type Store } from '../src/saved';

const mem = (): Store & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const snap = (over: Partial<SpotSnapshot> = {}): SpotSnapshot => ({ verdict: 'likely_ok', legal: 85, sleep: 70, weather: 60, night: 'Tonight', sleepLabel: 'Good', pros: ['Grassy ground'], cons: [], complete: true, savedAt: 1_000_000, ...over });
const spot = (lat: number, lng: number, over: Partial<SavedSpot> = {}): SavedSpot => ({ id: spotId(lat, lng), lat, lng, name: `S${lat}`, snapshot: snap(), ...over });

describe('saved spots store', () => {
  it('saves, finds and removes a spot', () => {
    const s = mem();
    expect(saveSpot(s, spot(46.5, 7.5)).stored).toBe(true);
    expect(isSaved(s, spotId(46.5, 7.5))).toBe(true);
    expect(loadSaved(s)).toHaveLength(1);
    expect(removeSpot(s, spotId(46.5, 7.5))).toEqual([]);
    expect(isSaved(s, spotId(46.5, 7.5))).toBe(false);
  });
  it('keeps one entry per place, newest first', () => {
    const s = mem();
    saveSpot(s, spot(46.1, 7.1));
    saveSpot(s, spot(46.2, 7.2));
    saveSpot(s, spot(46.1, 7.1, { name: 'again' }));
    // a fresh check of a place already saved updates its scores but keeps the name the person gave it
    expect(loadSaved(s).map((x) => x.name)).toEqual(['S46.1', 'S46.2']);
  });
  it('a full list refuses a new spot instead of silently dropping an old one', () => {
    const s = mem();
    for (let i = 0; i < MAX_SAVED; i++) expect(saveSpot(s, spot(45.8 + i / 1000, 7)).full).toBeUndefined();
    const r = saveSpot(s, spot(47.5, 8));
    expect(r).toMatchObject({ full: true, stored: false });
    expect(loadSaved(s)).toHaveLength(MAX_SAVED);
    expect(isSaved(s, spotId(47.5, 8))).toBe(false);
    expect(isSaved(s, spotId(45.8, 7))).toBe(true); // the oldest is still there
    // a place that is already saved can still be updated when the list is full
    expect(saveSpot(s, spot(45.8, 7, { snapshot: snap({ legal: 10 }) })).stored).toBe(true);
    expect(loadSaved(s).find((x) => x.id === spotId(45.8, 7))!.snapshot.legal).toBe(10);
  });
  it('survives missing, broken or foreign storage', () => {
    expect(loadSaved(undefined)).toEqual([]);
    expect(saveSpot(undefined, spot(46, 7))).toMatchObject({ stored: false });
    const bad = mem();
    bad.data[SAVED_KEY] = '{not json';
    expect(loadSaved(bad)).toEqual([]);
    bad.data[SAVED_KEY] = JSON.stringify([{ id: 'x' }, spot(46, 7)]);
    expect(loadSaved(bad)).toHaveLength(1);
    const full: Store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveSpot(full, spot(46, 7)).stored).toBe(false);
  });
  it('names spots and dates them', () => {
    expect(defaultName('Kandersteg', 1602.4, 46, 7)).toBe('Kandersteg · 1602 m');
    expect(defaultName(undefined, undefined, 46.1234, 7.5678)).toBe('46.123, 7.568');
    expect(ageLabel(1000, 1000 + 3600_000)).toBe('today');
    expect(ageLabel(0, 86400000)).toBe('yesterday');
    expect(ageLabel(0, 5 * 86400000)).toBe('5 days ago');
  });
});

describe('comparison', () => {
  const a = spot(46.1, 7.1, { elevation: 1800, municipality: 'Adelboden', canton: 'Bern', snapshot: snap({ legal: 85, sleep: 70, weather: 40, water: 'Stream · 80 m', pros: ['Grassy ground', 'Flat ground'], cons: [] }) });
  const b = spot(46.2, 7.2, { elevation: 2200, snapshot: snap({ verdict: 'caution', legal: 45, sleep: 80, weather: 40, complete: false, cons: ['Open to wind'] }) });
  const rows = compareRows([a, b]);
  const row = (l: string) => rows.find((r) => r.label === l)!;
  it('has one cell per spot in every row', () => {
    for (const r of rows) expect(r.cells).toHaveLength(2);
  });
  it('marks the best score per row, nothing on a tie', () => {
    expect(row('Legality').best).toBe(0);
    expect(row('Sleep').best).toBe(1);
    expect(row('Weather').best).toBeUndefined();
    // the overall score as the result sheet works it out: half and half, held down by the weaker part (never more than 10 above it)
    expect(row('Overall').cells).toEqual(['78/100', '55/100']);
    expect(row('Overall').best).toBe(0);
  });
  it('shows verdicts, partial scores and missing values honestly', () => {
    expect(row('Legality').cells[1]).toBe('45/100 Be careful');
    expect(row('Sleep').cells[1]).toContain('(partial)');
    expect(row('Water').cells).toEqual(['Stream · 80 m', '–']);
    expect(row('Place').cells).toEqual(['Adelboden, Bern', '–']);
    expect(row('For').cells[0]).toBe('Grassy ground; Flat ground');
    expect(row('Against').cells).toEqual(['–', 'Open to wind']);
    expect(compareRows([a, spot(46.3, 7.3, { snapshot: snap({ legal: undefined, sleep: undefined }) })]).find((r) => r.label === 'Overall')!.cells[1]).toBe('–');
  });
});

describe('names and notes', () => {
  it('renames and annotates a saved spot, cleaning the text', () => {
    const s = mem();
    saveSpot(s, spot(46.5, 7.5));
    const id = spotId(46.5, 7.5);
    expect(updateSpot(s, id, { name: '  Hut\nmeadow  ', note: 'Water at the hut.\nAsk the farmer.' })).toBe(true);
    const got = loadSaved(s)[0]!;
    expect(got.name).toBe('Hut meadow');
    expect(got.note).toBe('Water at the hut.\nAsk the farmer.');
    expect(got.snapshot.legal).toBe(85); // scores untouched
  });
  it('an empty name is ignored, an empty note removes the note, long text is cut', () => {
    const s = mem();
    saveSpot(s, spot(46.5, 7.5, { note: 'old' }));
    const id = spotId(46.5, 7.5);
    updateSpot(s, id, { name: '   ', note: '' });
    expect(loadSaved(s)[0]!.name).toBe('S46.5');
    expect(loadSaved(s)[0]!.note).toBeUndefined();
    updateSpot(s, id, { name: 'x'.repeat(500), note: 'y'.repeat(5000) });
    expect(loadSaved(s)[0]!.name).toHaveLength(MAX_NAME);
    expect(loadSaved(s)[0]!.note).toHaveLength(MAX_NOTE);
  });
  it('reports a spot that is gone or storage that failed', () => {
    const s = mem();
    expect(updateSpot(s, 'nope', { name: 'x' })).toBe(false);
    saveSpot(s, spot(46.5, 7.5));
    const full: Store = { getItem: s.getItem, setItem: () => { throw new Error('quota'); } };
    expect(updateSpot(full, spotId(46.5, 7.5), { name: 'x' })).toBe(false);
  });
  it('a fresh check keeps the person\'s own name and note', () => {
    const s = mem();
    saveSpot(s, spot(46.5, 7.5));
    updateSpot(s, spotId(46.5, 7.5), { name: 'Base camp', note: 'flat, quiet' });
    saveSpot(s, spot(46.5, 7.5, { name: 'Kandersteg · 1600 m', snapshot: snap({ legal: 40 }) }));
    const got = loadSaved(s)[0]!;
    expect([got.name, got.note, got.snapshot.legal]).toEqual(['Base camp', 'flat, quiet', 40]);
  });
});

describe('importing spots', () => {
  it('adds places unchecked, with names, and leaves places already saved alone', () => {
    const s = mem();
    saveSpot(s, spot(46.5, 7.5));
    const r = importSpots(s, [{ lat: 46.5, lng: 7.5, name: 'dup' }, { lat: 46.6, lng: 7.6, name: ' Camp A ', note: 'good', elevation: 1500 }, { lat: 46.7, lng: 7.7 }, { lat: NaN, lng: 7 }], 5);
    expect(r).toMatchObject({ added: 2, existing: 1, refused: 0, stored: true });
    const list = loadSaved(s);
    expect(list).toHaveLength(3);
    const a = list.find((x) => x.id === spotId(46.6, 7.6))!;
    expect([a.name, a.note, a.elevation]).toEqual(['Camp A', 'good', 1500]);
    expect(a.snapshot).toMatchObject({ unrated: true, verdict: 'unknown', savedAt: 5 });
    expect(list.find((x) => x.id === spotId(46.7, 7.7))!.name).toBe('46.700, 7.700');
    expect(list.find((x) => x.id === spotId(46.5, 7.5))!.name).toBe('S46.5');
  });
  it('turns away what does not fit once the list is full', () => {
    const s = mem();
    const many = Array.from({ length: MAX_SAVED + 10 }, (_, i) => ({ lat: 45.8 + i / 1000, lng: 7 }));
    expect(importSpots(s, many)).toMatchObject({ added: MAX_SAVED, refused: 10 });
    expect(loadSaved(s)).toHaveLength(MAX_SAVED);
  });
  it('an unrated spot has no overall score and sorts last by score', () => {
    const s = mem();
    saveSpot(s, spot(46.1, 7.1));
    importSpots(s, [{ lat: 46.9, lng: 8.9 }]);
    const list = loadSaved(s);
    expect(overallOf(list.find((x) => x.snapshot.unrated)!.snapshot)).toBeUndefined();
    expect(sortSpots(list, 'score').map((x) => x.snapshot.unrated ?? false)).toEqual([false, true]);
  });
});

describe('overall score of a saved spot', () => {
  it('a ban is 0, an unchecked or half-known spot has none, an old save is worked out like the sheet does', () => {
    expect(overallOf(snap({ verdict: 'no', legal: 0 }))).toBe(0);
    expect(overallOf(snap({ unchecked: ['zones'] }))).toBeUndefined();
    expect(overallOf(snap({ sleep: undefined }))).toBeUndefined();
    expect(overallOf(snap({ legal: 85, sleep: 70 }))).toBe(78);
    expect(overallOf(snap({ legal: 85, sleep: 20 }))).toBe(30); // the weaker part holds it down
    expect(overallOf(snap({ overall: 61, legal: 85, sleep: 70 }))).toBe(61); // the number the sheet showed wins
  });
});

describe('sorting', () => {
  const a = spot(46.0, 7.0, { name: 'beta', snapshot: snap({ savedAt: 100, overall: 40 }) });
  const b = spot(47.0, 8.0, { name: 'Alpha', snapshot: snap({ savedAt: 300, overall: 90 }) });
  const c = spot(46.1, 7.1, { name: 'gamma 10', snapshot: snap({ savedAt: 200, overall: 70 }) });
  const d = spot(46.2, 7.2, { name: 'gamma 2', snapshot: snap({ savedAt: 50, overall: 70 }) });
  const names = (l: SavedSpot[]) => l.map((x) => x.name);
  it('by newest save, name (numbers in order), score and distance', () => {
    expect(names(sortSpots([a, b, c, d], 'recent'))).toEqual(['Alpha', 'gamma 10', 'beta', 'gamma 2']);
    expect(names(sortSpots([a, b, c, d], 'name'))).toEqual(['Alpha', 'beta', 'gamma 2', 'gamma 10']);
    expect(names(sortSpots([a, b, c, d], 'score'))).toEqual(['Alpha', 'gamma 10', 'gamma 2', 'beta']);
    expect(names(sortSpots([a, b, c, d], 'distance', { lat: 46.0, lng: 7.0 }))).toEqual(['beta', 'gamma 10', 'gamma 2', 'Alpha']);
  });
  it('does not change the list it is given, and distance without a point keeps the order', () => {
    const list = [a, b];
    sortSpots(list, 'name');
    expect(list).toEqual([a, b]);
    expect(names(sortSpots(list, 'distance'))).toEqual(['beta', 'Alpha']);
  });
});

describe('legality written back after a re-check', () => {
  it('replaces the verdict and legal score, keeps the rest, and clears the unrated mark', () => {
    const s = mem();
    saveSpot(s, spot(46.5, 7.5, { snapshot: snap({ sleep: 70, comfort: 60, pros: ['flat'] }) }));
    importSpots(s, [{ lat: 46.9, lng: 8.9 }]);
    expect(updateLegality(s, spotId(46.5, 7.5), { verdict: 'no', legal: 0, overall: 0, municipality: 'Adelboden', canton: 'Bern' }, 999)).toBe(true);
    const a = loadSaved(s).find((x) => x.id === spotId(46.5, 7.5))!;
    expect(a.snapshot).toMatchObject({ verdict: 'no', legal: 0, overall: 0, sleep: 70, comfort: 60, pros: ['flat'], legalAt: 999 });
    expect([a.municipality, a.canton]).toEqual(['Adelboden', 'Bern']);
    updateLegality(s, spotId(46.9, 8.9), { verdict: 'likely_ok', legal: 85 });
    expect(loadSaved(s).find((x) => x.id === spotId(46.9, 8.9))!.snapshot.unrated).toBeUndefined();
    expect(updateLegality(s, 'nope', { verdict: 'no' })).toBe(false);
  });
});

describe('reading a damaged list', () => {
  const mem = (raw: unknown) => ({ getItem: () => JSON.stringify(raw), setItem: () => undefined });
  const spot = (over: Record<string, unknown>) => ({ id: 'a', lat: 46.5, lng: 8.4, name: 'N', snapshot: { verdict: 'no', pros: [], cons: [], complete: true, savedAt: 1 }, savedAt: 1, ...over });
  it('cuts a huge name and note to their limits and drops impossible positions', () => {
    const list = loadSaved(mem([spot({ name: 'N'.repeat(100000), note: 'x'.repeat(100000) }), spot({ id: 'b', lat: 500 }), spot({ id: 'c', lng: -999 })]));
    expect(list).toHaveLength(1);
    expect(list[0]!.name.length).toBeLessThanOrEqual(MAX_NAME);
    expect(list[0]!.note!.length).toBeLessThanOrEqual(MAX_NOTE);
  });
  it('keeps at most the limit and shortens huge lists of points', () => {
    const many = Array.from({ length: MAX_SAVED + 30 }, (_, i) => spot({ id: `s${i}` }));
    expect(loadSaved(mem(many))).toHaveLength(MAX_SAVED);
    const big = loadSaved(mem([spot({ snapshot: { verdict: 'no', pros: Array(50).fill('p'.repeat(1000)), cons: [], complete: true, savedAt: 1 } })]));
    expect(big[0]!.snapshot.pros.length).toBeLessThanOrEqual(12);
    expect(big[0]!.snapshot.pros[0]!.length).toBeLessThanOrEqual(300);
  });
});

describe('import order', () => {
  it('keeps the order of the file, so Day 1 is listed before Day 2', async () => {
    const { importSpots, loadSaved } = await import('../src/saved');
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    importSpots(store, [{ lat: 46.1, lng: 7.1, name: 'Day 1' }, { lat: 46.2, lng: 7.2, name: 'Day 2' }]);
    expect(loadSaved(store).map((s) => s.name)).toEqual(['Day 1', 'Day 2']);
  });
});
