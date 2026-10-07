import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DE, FR, IT } from '../src/i18n-dict';
import { GEAR_KEY, KEPT_KEYS, SENT, keptSummary, wipeKept, wipePlans } from '../src/privacy';
import { SAVED_KEY } from '../src/saved';
import { TRIP_KEY_V2 } from '../src/trip';
import { ROUTE_KEY } from '../src/routeplan';

class Mem {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const spot = (n: number) => ({ id: `46.${n}0000,7.50000`, lat: 46 + n / 100, lng: 7.5, name: `Spot ${n}`, snapshot: { verdict: 'likely_ok', pros: [], cons: [], complete: true, savedAt: 1 }, savedAt: 1 });

describe('what the app keeps', () => {
  it('counts spots, nights and the route', () => {
    const s = new Mem();
    s.setItem(SAVED_KEY, JSON.stringify([spot(1), spot(2)]));
    s.setItem(TRIP_KEY_V2, JSON.stringify([{ spot: spot(1).id, date: '2026-10-10' }]));
    s.setItem(ROUTE_KEY, JSON.stringify({ name: 'Haute Route', pts: [[46, 7], [46.1, 7.1]], stageKm: 15, date: '' }));
    const k = keptSummary(s, '2026-10-07');
    expect(k.spots).toBe(2);
    expect(k.nights).toBe(1);
    expect(k.route).toBe('Haute Route');
    expect(k.bytes).toBeGreaterThan(100);
  });
  it('copes with an empty or damaged store', () => {
    expect(keptSummary(undefined, '2026-10-07')).toMatchObject({ spots: 0, nights: 0, route: undefined, areas: 0, bytes: 0 });
    const s = new Mem();
    s.setItem(ROUTE_KEY, '{oops');
    s.setItem(SAVED_KEY, 'nope');
    expect(keptSummary(s, '2026-10-07')).toMatchObject({ spots: 0, route: undefined });
  });
  it('deletes only this app\'s keys, all of them', () => {
    const s = new Mem();
    for (const k of KEPT_KEYS) s.setItem(k, '1');
    s.setItem('wildcamp.future.v9', '1');
    s.setItem('other.site.key', 'keep');
    expect(wipeKept(s)).toBe(KEPT_KEYS.length + 1);
    expect(s.length).toBe(1);
    expect(s.getItem('other.site.key')).toBe('keep');
    expect(wipeKept(undefined)).toBe(0);
  });
  it('deleting the plans keeps the language and the gear', () => {
    const s = new Mem();
    for (const k of KEPT_KEYS) s.setItem(k, '1');
    wipePlans(s);
    expect(s.getItem(SAVED_KEY)).toBeNull();
    expect(s.getItem(ROUTE_KEY)).toBeNull();
    expect(s.getItem(TRIP_KEY_V2)).toBeNull();
    expect(s.getItem(GEAR_KEY)).toBe('1');
    expect(s.getItem('wildcamp.lang.v1')).toBe('1');
  });
  it('lists every key the source writes, so the "delete everything" button really deletes everything', () => {
    const files = [...readdirSync('src').filter((f) => f.endsWith('.ts')).map((f) => `src/${f}`), ...readdirSync('src/comfort').map((f) => `src/comfort/${f}`)];
    const written = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/'(wildcamp\.[a-z0-9.]+)'/g)) written.add(m[1]!);
    for (const k of written) expect(KEPT_KEYS as readonly string[], `${k} is written but not listed in privacy.ts`).toContain(k);
  });
});

describe('what the app sends', () => {
  it('names every host the source talks to', () => {
    const hosts = new Set<string>();
    const files = [...readdirSync('src').filter((f) => f.endsWith('.ts') && !f.startsWith('i18n')).map((f) => `src/${f}`), ...readdirSync('src/comfort').map((f) => `src/comfort/${f}`)];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // requests: fetch( and the URL constants next to them
      for (const m of src.matchAll(/https:\/\/((?:api3|wms|wmts)\.geo\.admin\.ch|api\.open-meteo\.com|aws\.slf\.ch)/g)) hosts.add(m[1]!);
    }
    const listed = SENT.flatMap((s) => s.host.split(',').map((h) => h.trim()));
    for (const h of hosts) expect(listed, `${h} is requested but not listed`).toContain(h);
  });
  it('has the panel text in every language', () => {
    for (const s of SENT) for (const d of [DE, FR, IT]) expect(d[s.what], s.what).toBeTruthy();
  });
});
