import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputsCache, legalForNight, recheckSpots } from '../src/recheck';
import { LocalData } from '../src/localstore';
import { fetchLegalityInputs, type LegalityInputs } from '../src/spotcheck';
import { unratedSnapshot, type SavedSpot, type SpotSnapshot } from '../src/saved';

// Adelboden: a point with a Bern canton answer; the wildlife zone below is in force 15 Dec to 15 Apr only
const LAT = 46.4986;
const LNG = 7.5611;
const ZONE = { layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { name: 'Winterzone', schutzzeit: '15.12. - 15.04.', best_de: 'Zutrittsverbot', schutzs_de: 'rechtsverbindlich' } };

type Reply = unknown | 'fail';
function mockNetwork(over: Partial<Record<'height' | 'zones' | 'canton' | 'municipality' | 'bauzonen', Reply>> = {}) {
  const reply: Record<string, Reply> = {
    height: { height: '1350' },
    zones: { results: [ZONE] },
    canton: { results: [{ layerBodId: 'k', attributes: { ak: 'BE' } }] },
    municipality: { results: [{ layerBodId: 'g', attributes: { gemname: 'Adelboden', gde_nr: 566, kanton: 'BE', is_current_jahr: true } }] },
    bauzonen: { results: [] },
    ...over,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      const key = u.includes('/height') ? 'height' : u.includes('kanton-flaeche') ? 'canton' : u.includes('gemeinde-flaeche') ? 'municipality' : u.includes('ch.are.bauzonen') ? 'bauzonen' : 'zones';
      const r = reply[key];
      if (r === 'fail') return new Response('x', { status: 503 });
      // the "near zones" search also goes to the identify service: it finds the same zone, which the point is already inside
      return new Response(JSON.stringify(r), { status: 200 });
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

const loaded = async () => {
  const d = new LocalData('/', { forest: async () => undefined as never, treeline: async () => undefined as never, reserve: async () => ({ canton: 'XX', generated: 'test', reserves: [] }) });
  await d.load();
  return d;
};
const snap = (over: Partial<SpotSnapshot> = {}): SpotSnapshot => ({ verdict: 'likely_ok', legal: 85, sleep: 70, comfort: 60, overall: 70, pros: [], cons: [], complete: true, savedAt: 0, ...over });
const spot = (id: string, over: Partial<SpotSnapshot> = {}, extra: Partial<SavedSpot> = {}): SavedSpot => ({ id, lat: LAT, lng: LNG, name: id, elevation: 1350, snapshot: snap(over), ...extra });
const inputs = (over: Partial<LegalityInputs> = {}): LegalityInputs => ({ lat: LAT, lng: LNG, elevation: 1350, nearRadiusM: 150, cantonKnown: true, jura: [], failed: [], ...over });

describe('InputsCache', () => {
  it('asks once per spot however many nights use it', async () => {
    let calls = 0;
    const c = new InputsCache(async () => (calls++, inputs()));
    const s = { id: 'a', lat: 46.5, lng: 7.7 };
    await Promise.all([c.get(s), c.get(s), c.get(s)]);
    await c.get(s);
    expect(calls).toBe(1);
    await c.get({ id: 'b', lat: 46.6, lng: 7.7 });
    expect(calls).toBe(2);
  });
  it('asks again after a lookup failed, but not after a good answer', async () => {
    let calls = 0;
    const c = new InputsCache(async () => (calls++, inputs({ failed: calls === 1 ? ['zones'] : [] })));
    const s = { id: 'a', lat: 46.5, lng: 7.7 };
    await c.get(s);
    await new Promise((r) => setTimeout(r, 0));
    await c.get(s);
    await new Promise((r) => setTimeout(r, 0));
    await c.get(s);
    expect(calls).toBe(2);
  });
  it('passes the known elevation on and forgets everything on clear()', async () => {
    const seen: (number | undefined)[] = [];
    const c = new InputsCache(async (_la, _lo, el) => (seen.push(el), inputs()));
    await c.get({ id: 'a', lat: 46.5, lng: 7.7, elevation: 1234 });
    c.clear();
    await c.get({ id: 'a', lat: 46.5, lng: 7.7, elevation: 1234 });
    expect(seen).toEqual([1234, 1234]);
  });
});

describe('legality for a night: one set of lookups, any date', () => {
  it('a winter-only wildlife zone is a ban in January and no ban in July, from the same lookups', async () => {
    mockNetwork();
    const data = await loaded();
    const inp = await fetchLegalityInputs(LAT, LNG, 1350);
    expect(inp.failed).toEqual([]);
    const winter = legalForNight(inp, data, '2027-01-20', '2026-10-06T10:00');
    const summer = legalForNight(inp, data, '2027-07-20', '2026-10-06T10:00');
    expect(winter).toMatchObject({ verdict: 'no', value: 0, unchecked: false, outside: false });
    expect(summer.verdict).not.toBe('no');
    expect(summer.value).toBeGreaterThan(0);
    // the same night judged twice gives the same answer: nothing about "now" leaks in for a future evening
    expect(legalForNight(inp, data, '2027-01-20', '2026-12-01T10:00').verdict).toBe('no');
  });
  it('says what it found in a few words', async () => {
    mockNetwork();
    const inp = await fetchLegalityInputs(LAT, LNG, 1350);
    expect(legalForNight(inp, await loaded(), '2027-01-20', '2026-10-06T10:00').why).toBeTruthy();
  });
  it('a failed lookup makes the night unchecked, never fine', async () => {
    mockNetwork({ zones: 'fail' });
    const inp = await fetchLegalityInputs(LAT, LNG, 1350);
    expect(legalForNight(inp, await loaded(), '2027-07-20', '2026-10-06T10:00')).toMatchObject({ unchecked: true });
  });
});

describe('re-checking saved spots', () => {
  it('reports a spot that became banned, writes the new numbers into a patch, and keeps the order of the list', async () => {
    mockNetwork();
    const data = await loaded();
    const spots = [spot('a'), spot('b', { verdict: 'no', legal: 0, overall: 0 })];
    // January: the zone is in force; the first spot was fine when saved, the second was banned already
    const out = await recheckSpots(spots, data, { date: new Date(2027, 0, 20, 12) });
    expect(out.map((o) => o.spot.id)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ failed: false, changed: true, before: 'likely_ok', after: 'no' });
    expect(out[0]!.patch).toMatchObject({ verdict: 'no', legal: 0, overall: 0, municipality: 'Adelboden' });
    expect(out[1]).toMatchObject({ failed: false, changed: false, before: 'no', after: 'no' });
  });
  it('in July the same spot is not banned, and the overall score is worked out again from the saved comfort', async () => {
    mockNetwork();
    const out = await recheckSpots([spot('a', { verdict: 'no', legal: 0, overall: 0, comfort: 60 })], await loaded(), { date: new Date(2027, 6, 20, 12) });
    expect(out[0]).toMatchObject({ failed: false, changed: true, before: 'no' });
    expect(out[0]!.after).not.toBe('no');
    const p = out[0]!.patch!;
    expect(p.legal).toBeGreaterThan(0);
    // half legality, half comfort, never more than 10 above the weaker part
    expect(p.overall).toBe(Math.round(Math.min(0.5 * p.legal! + 30, Math.min(p.legal!, 60) + 10)));
  });
  it('without a saved comfort there is no overall score to give, only the legality', async () => {
    mockNetwork({ zones: { results: [] } });
    const out = await recheckSpots([spot('a', { comfort: undefined, overall: undefined })], await loaded(), { date: new Date(2027, 6, 20, 12) });
    expect(out[0]!.patch!.overall).toBeUndefined();
    expect(out[0]!.patch!.legal).toBeGreaterThan(0);
  });
  it('works a few spots at a time and reports progress', async () => {
    const data = await loaded();
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    const out = await recheckSpots(Array.from({ length: 7 }, (_, i) => spot(`s${i}`)), data, {
      concurrency: 3,
      fetch: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return inputs({ canton: { code: 'BE', name: 'Bern' } as never });
      },
      onProgress: (d, t) => {
        expect(t).toBe(7);
        seen.push(d);
      },
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out).toHaveLength(7);
  });
  it('a lookup that fails is reported as failed and the spot is left as it was', async () => {
    mockNetwork({ municipality: 'fail' });
    const out = await recheckSpots([spot('a')], await loaded());
    expect(out[0]).toMatchObject({ failed: true, changed: false });
    expect(out[0]!.patch).toBeUndefined();
  });
  it('a request that throws does not stop the others', async () => {
    const out = await recheckSpots([spot('a', {}, { lat: 46.1 }), spot('b')], await loaded(), {
      fetch: async (lat) => {
        if (lat === 46.1) throw new Error('offline');
        return inputs({ canton: { code: 'BE', name: 'Bern' } as never });
      },
    });
    expect(out.map((o) => o.failed)).toEqual([true, false]);
  });
  it('an unrated spot that gets a verdict is not reported as a change', async () => {
    mockNetwork({ zones: { results: [] } });
    const imported: SavedSpot = { id: 'i', lat: LAT, lng: LNG, name: 'i', snapshot: unratedSnapshot(0) };
    const out = await recheckSpots([imported], await loaded(), { date: new Date(2027, 6, 20, 12) });
    expect(out[0]).toMatchObject({ failed: false, changed: false });
    expect(out[0]!.patch!.verdict).toBeTruthy();
  });
  it('is quick with nothing to do', async () => {
    expect(await recheckSpots([], await loaded())).toEqual([]);
  });
});
