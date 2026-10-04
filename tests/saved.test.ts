import { describe, expect, it } from 'vitest';
import { MAX_SAVED, SAVED_KEY, ageLabel, compareRows, defaultName, isSaved, loadSaved, removeSpot, saveSpot, spotId, type SavedSpot, type SpotSnapshot, type Store } from '../src/saved';

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
  it('keeps one entry per place, newest first, and caps the list', () => {
    const s = mem();
    saveSpot(s, spot(46.1, 7.1));
    saveSpot(s, spot(46.2, 7.2));
    saveSpot(s, spot(46.1, 7.1, { name: 'again' }));
    expect(loadSaved(s).map((x) => x.name)).toEqual(['again', 'S46.2']);
    for (let i = 0; i < MAX_SAVED + 5; i++) saveSpot(s, spot(46 + i / 1000, 7));
    expect(loadSaved(s)).toHaveLength(MAX_SAVED);
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
    expect(row('Both (half and half)').cells).toEqual(['78/100', '63/100']);
    expect(row('Both (half and half)').best).toBe(0);
  });
  it('shows verdicts, partial scores and missing values honestly', () => {
    expect(row('Legality').cells[1]).toBe('45/100 Be careful');
    expect(row('Sleep').cells[1]).toContain('(partial)');
    expect(row('Water').cells).toEqual(['Stream · 80 m', '–']);
    expect(row('Place').cells).toEqual(['Adelboden, Bern', '–']);
    expect(row('For').cells[0]).toBe('Grassy ground; Flat ground');
    expect(row('Against').cells).toEqual(['–', 'Open to wind']);
    expect(compareRows([a, spot(46.3, 7.3, { snapshot: snap({ legal: undefined, sleep: undefined }) })]).find((r) => r.label === 'Both (half and half)')!.cells[1]).toBe('–');
  });
});
