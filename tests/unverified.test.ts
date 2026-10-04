import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { MUNICIPAL_RULES, UNVERIFIED_NOTES, findMunicipalRule, findUnverifiedNote } from '../src/municipalities';
import { ISSUES_URL, reportUrl } from '../src/report';

const base = { zones: [], treeline: 'above' as const, canton: { code: 'VS', name: 'Valais' } as never, municipality: 'Zermatt' };

describe('unverified municipal notes', () => {
  const note = findUnverifiedNote(6300)!;
  it('Zermatt is recorded as a press report, not as a verified rule', () => {
    expect(findMunicipalRule(6300)).toBeUndefined();
    expect(note.name).toBe('Zermatt');
    expect(note.text).toMatch(/not verified/);
    expect(note.sources.every((s) => s.url.startsWith('https://'))).toBe(true);
  });
  it('no unverified note duplicates a verified rule', () => {
    for (const n of UNVERIFIED_NOTES) expect(MUNICIPAL_RULES.some((m) => m.bfs === n.bfs), n.name).toBe(false);
  });
  it('caps the verdict at caution with a warning, never "Not allowed"', () => {
    const a = assess({ ...base, municipalNote: note });
    expect(a.verdict).toBe('caution');
    const item = a.items.find((i) => i.title.includes('not verified'))!;
    expect(item.tone).toBe('warn');
    expect(item.sources).toEqual(note.sources.map((s) => s.url));
  });
  it('does not soften a ban from a protected zone or add a note elsewhere', () => {
    expect(assess({ ...base, municipalNote: undefined }).verdict).not.toBe('no');
    expect(assess({ ...base, municipality: 'Bern', municipalNote: undefined }).items.some((i) => i.title.includes('not verified'))).toBe(false);
  });
});

describe('rule report link', () => {
  it('prefills a GitHub issue with place, spot link and the source request', () => {
    const u = new URL(reportUrl({ lat: 46.02, lng: 7.74, municipality: 'Zermatt', canton: 'Valais', verdict: 'caution', link: 'https://x.test/#46.02,7.74,14' }));
    expect(u.origin + u.pathname).toBe(ISSUES_URL);
    expect(u.searchParams.get('title')).toBe('Rule report: Zermatt, Valais');
    const body = u.searchParams.get('body')!;
    expect(body).toContain('https://x.test/#46.02,7.74,14');
    expect(body).toContain('The app said:** caution');
    expect(body).toMatch(/Official source/);
  });
  it('falls back to coordinates when the place is unknown', () => {
    expect(new URL(reportUrl({ lat: 46.12346, lng: 7.5, verdict: 'unknown', link: 'x' })).searchParams.get('title')).toBe('Rule report: 46.1235, 7.5000');
  });
});
