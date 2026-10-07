import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessInputs, assessNight, checkLegality, fetchLegalityInputs, type LegalityInputs } from '../src/spotcheck';
import { LocalData } from '../src/localstore';
import { legalityScore, overallScore } from '../src/scores';
import { RESERVE_FILES } from '../src/localdata';

// Krattigen (BFS 566) has no recorded municipal rule, so the verdicts below come from the zones, the treeline and the lookups alone
const LAT = 46.4986;
const LNG = 7.7285;

type Reply = unknown | 'fail';
function mockNetwork(over: Partial<Record<'height' | 'zones' | 'canton' | 'municipality' | 'bauzonen', Reply>> = {}) {
  const reply: Record<string, Reply> = {
    height: { height: '1780' },
    zones: { results: [] },
    canton: { results: [{ layerBodId: 'k', attributes: { ak: 'BE' } }] },
    municipality: { results: [{ layerBodId: 'g', attributes: { gemname: 'Krattigen', gde_nr: 566, kanton: 'BE', is_current_jahr: true } }] },
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
const failing = async () => {
  const d = new LocalData('/', { forest: async () => undefined as never, treeline: async () => undefined as never, reserve: async () => Promise.reject(new Error('offline')) });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await d.load();
  return d;
};

describe('LocalData', () => {
  it('is complete when every file loaded', async () => {
    const d = await loaded();
    expect(d.complete).toBe(true);
    expect(d.failed.size).toBe(0);
  });
  it('remembers the files that failed, and tries only those again', async () => {
    const d = await failing();
    expect(d.complete).toBe(false);
    expect([...d.failed].sort()).toEqual([...RESERVE_FILES].sort());
    expect(d.loading).toBe(false);
  });
});

describe('a failed or missing lookup is never read as "nothing found"', () => {
  it('everything works: the verdict has no missing checks', async () => {
    mockNetwork();
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.incomplete).toBeUndefined();
    expect(r.elevation).toBe(1780);
  });
  it('the municipality lookup fails: the municipal ban is unknown, so the result is "unchecked", not "okay"', async () => {
    mockNetwork({ municipality: 'fail' });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.inputs.failed).toContain('municipality');
    expect(r.assessment.incomplete).toContain('municipality');
    expect(r.assessment.verdict).not.toBe('likely_ok');
    expect(legalityScore(r.assessment)).toEqual({ tone: 'none' });
    expect(overallScore(r.assessment, legalityScore(r.assessment), 70)).toEqual({ tone: 'none' });
    expect(r.assessment.items.some((i) => i.title === 'Not fully checked')).toBe(true);
  });
  it('the zone lookup fails: unknown, with the old "zones could not be loaded" note kept', async () => {
    mockNetwork({ zones: 'fail' });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.verdict).toBe('unknown');
    expect(r.assessment.incomplete).toContain('zones');
  });
  it('the canton lookup fails: that is not "outside Switzerland"', async () => {
    mockNetwork({ canton: 'fail' });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.outside).toBeUndefined();
    expect(r.assessment.incomplete).toContain('canton');
  });
  it('the canton lookup finds nothing: the spot is outside Switzerland', async () => {
    mockNetwork({ canton: { results: [] } });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.outside).toBe(true);
  });
  it('the elevation lookup fails: the treeline cannot be judged, and that is reported', async () => {
    mockNetwork({ height: 'fail' });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.incomplete).toContain('elevation');
    expect(r.assessment.verdict).toBe('unknown');
  });
  it('bundled data that failed to load makes the check incomplete', async () => {
    mockNetwork();
    const r = await checkLegality(LAT, LNG, await failing());
    expect(r.assessment.incomplete).toContain('local rule data');
    expect(r.assessment.verdict).not.toBe('likely_ok');
  });
  it('bundled data that arrives late is applied by judging the same inputs again, without new requests', async () => {
    mockNetwork();
    const pending: (() => void)[] = [];
    const empty = { canton: 'XX', generated: 'test', reserves: [] };
    const slow = new LocalData('/', { forest: async () => undefined as never, treeline: async () => undefined as never, reserve: () => new Promise((res) => pending.push(() => res(empty))) });
    const first = await checkLegality(LAT, LNG, slow, { waitMs: 20 });
    expect(first.assessment.incomplete).toContain('local rule data');
    expect(slow.loading).toBe(true);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const done = slow.load(); // the same attempt
    pending.forEach((release) => release());
    await done;
    expect(slow.complete).toBe(true);
    const again = assessInputs(first.inputs, slow);
    expect(again.incomplete).toBeUndefined();
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });
  it('a ban that was found stays a ban even if another lookup failed', async () => {
    mockNetwork({
      municipality: 'fail',
      zones: { results: [{ layerBodId: 'ch.bafu.bundesinventare-jagdbanngebiete', attributes: { label: 'Kärpf', typ_de: 'Gebiet mit integralen Schutzbestimmungen' } }] },
    });
    const r = await checkLegality(LAT, LNG, await loaded());
    expect(r.assessment.verdict).toBe('no');
    expect(legalityScore(r.assessment).value).toBe(0);
    expect(overallScore(r.assessment, legalityScore(r.assessment), 90).value).toBe(0);
  });
  it('the zone seasons are judged for the date asked about, from the same inputs', async () => {
    mockNetwork({ zones: { results: [{ layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { label: 'Murgtal', schutzs_de: 'rechtsverbindlich', best_de: 'Zutrittsverbot', schutzzeit: '15.12. bis Ende Skisaison', kanton: 'SG' } }] } });
    const inputs = await fetchLegalityInputs(LAT, LNG);
    const data = await loaded();
    expect(assessInputs(inputs, data, new Date(2027, 1, 10)).verdict).toBe('no');
    expect(assessInputs(inputs, data, new Date(2026, 6, 15)).verdict).not.toBe('no');
  });
});

describe('a night runs past midnight', () => {
  // Gamserrugg (SG): the entry ban of the quiet zone runs 15.11. - 30.04.
  const zone = { layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { label: 'Gamserrugg (Nr. 100.0)', best_de: 'Zutrittsverbot', schutzzeit: '15.11. - 30.04.', schutzs_de: 'rechtsverbindlich', kanton: 'SG' } };
  const inputs = (): LegalityInputs => ({ lat: 47.1567, lng: 9.3316, elevation: 1800, zones: { results: [zone] }, nearRadiusM: 150, canton: { code: 'SG', name: 'St. Gallen' }, cantonKnown: true, jura: [], buildingZone: { near: false }, failed: [] });
  it('judges the evening of 14 November as out of season, and the night as in season, because the ban starts at midnight', async () => {
    const d = await loaded();
    const evening = new Date(2026, 10, 14, 20);
    expect(assessInputs(inputs(), d, evening).verdict).toBe('caution');
    const night = assessNight(inputs(), d, evening);
    expect(night.verdict).toBe('no');
    expect(night.items[0]!.title).toBe('A restriction starts during this night');
  });
  it('leaves an ordinary night alone', async () => {
    const d = await loaded();
    const a = assessNight(inputs(), d, new Date(2026, 5, 10, 20));
    expect(a.items.some((i) => i.title === 'A restriction starts during this night')).toBe(false);
    const inSeason = assessNight(inputs(), d, new Date(2026, 11, 10, 20));
    expect(inSeason.verdict).toBe('no');
    expect(inSeason.items.some((i) => i.title === 'A restriction starts during this night')).toBe(false);
  });
});
