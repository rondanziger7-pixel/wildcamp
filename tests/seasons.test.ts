import { describe, expect, it } from 'vitest';
import { inSeasonOn, monthStates, nextChange, parseSeason, seasonLabel } from '../src/seasons';
import { changeText } from '../src/seasonview';
import { inSeason, parseZoneHits } from '../src/geoadmin';

describe('season parsing', () => {
  it('reads "dd.mm.-dd.mm." with or without trailing dots and spaces', () => {
    expect(parseSeason('15.12.-30.04.')).toEqual({ from: { m: 12, d: 15 }, to: { m: 4, d: 30 } });
    expect(parseSeason('1.11. – 15.5')).toEqual({ from: { m: 11, d: 1 }, to: { m: 5, d: 15 } });
    expect(parseSeason('ganzjährig')).toBeUndefined();
    expect(parseSeason(undefined)).toBeUndefined();
    expect(parseSeason('31.13.-01.01.')).toBeUndefined();
  });
  it('agrees with the existing day-by-day season check', () => {
    for (const text of ['15.12.-30.04.', '01.05.-31.10.', '1.11.-15.5.']) {
      const s = parseSeason(text)!;
      for (let m = 1; m <= 12; m++) for (const d of [1, 10, 15, 28]) expect(inSeasonOn(s, m, d), `${text} ${d}.${m}.`).toBe(inSeason(text, new Date(2026, m - 1, d)));
    }
  });
  it('words the range', () => {
    expect(seasonLabel(parseSeason('15.12.-30.04.')!)).toBe('15 Dec to 30 Apr');
  });
});

describe('month states', () => {
  it('wraps the new year: Dec 15 to Apr 30', () => {
    expect(monthStates(parseSeason('15.12.-30.04.')!)).toEqual(['on', 'on', 'on', 'on', 'off', 'off', 'off', 'off', 'off', 'off', 'off', 'part']);
  });
  it('a summer season within a year', () => {
    expect(monthStates(parseSeason('01.05.-31.10.')!)).toEqual(['off', 'off', 'off', 'off', 'on', 'on', 'on', 'on', 'on', 'on', 'off', 'off']);
  });
  it('marks partial months at both ends', () => {
    const st = monthStates(parseSeason('10.06.-20.08.')!);
    expect(st[4]).toBe('off');
    expect(st[5]).toBe('part');
    expect(st[6]).toBe('on');
    expect(st[7]).toBe('part');
    expect(st[8]).toBe('off');
  });
});

describe('next change', () => {
  const s = parseSeason('15.12.-30.04.')!;
  it('counts days to the start when out of season', () => {
    const c = nextChange(s, new Date(2026, 9, 4))!; // 4 Oct 2026
    expect(c.kind).toBe('starts');
    expect(c.date.toISOString().slice(0, 10)).toBe('2026-12-15');
    expect(c.days).toBe(72);
  });
  it('counts days to the end when in season, first free day is 1 May', () => {
    const c = nextChange(s, new Date(2026, 3, 20))!;
    expect(c.kind).toBe('ends');
    expect(c.date.toISOString().slice(0, 10)).toBe('2026-05-01');
    expect(c.days).toBe(11);
  });
  it('words it for people', () => {
    expect(changeText('15.12.-30.04.', new Date(2026, 9, 4))).toBe('Not in force today; starts 15 Dec (in 72 days).');
    expect(changeText('15.12.-30.04.', new Date(2026, 3, 30))).toBe('In force today; lifted from 1 May (tomorrow).');
    expect(changeText('whole year', new Date())).toBeUndefined();
  });
});

describe('zone hits carry their season', () => {
  it('keeps schutzzeit of a statutory entry-ban zone', () => {
    const hits = parseZoneHits({ results: [{ layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { best_de: 'Zutrittsverbot', schutzzeit: '15.12.-30.04.', schutzs_de: 'rechtsverbindlich', label: 'Testzone' } }] }, new Date(2026, 0, 10));
    expect(hits[0]!.season).toBe('15.12.-30.04.');
    const off = parseZoneHits({ results: [{ layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { best_de: 'Zutrittsverbot', schutzzeit: '15.12.-30.04.', schutzs_de: 'rechtsverbindlich' } }] }, new Date(2026, 6, 10));
    expect(off[0]!.season).toBe('15.12.-30.04.');
    expect(off[0]!.layer.severity).toBe('caution');
  });
});
