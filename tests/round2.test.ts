import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAlerts } from '../src/alerts';
import { comfortFor } from '../src/comfort/comfort';
import { dms, emergencyNumbers } from '../src/emergency';
import { identifyBody, parseZoneHits } from '../src/geoadmin';
import { parseDrones, parseFire } from '../src/restrictions';
import { stopKind } from '../src/comfort/surroundings';
import { lower, setLangForTest } from '../src/i18n';

afterEach(() => {
  vi.unstubAllGlobals();
  setLangForTest('en');
});

describe('a lookup that answers without a results list is a failed lookup', () => {
  it('accepts a list, empty or not', async () => {
    expect((await identifyBody(new Response(JSON.stringify({ results: [] })))).results).toEqual([]);
  });
  it.each([['{}'], ['{"error":{"code":500}}'], ['null'], ['[]'], ['<html>proxy</html>'], ['{"results":"no"}']])('refuses %s', async (body) => {
    await expect(identifyBody(new Response(body))).rejects.toThrow();
  });
});

describe('a wildlife quiet zone with an entry ban only when snow lies', () => {
  const zone = (extra: Record<string, string>) => ({ layerBodId: 'ch.bafu.wrz-wildruhezonen_portal', attributes: { label: 'Stöfeli (Nr. 112.0)', best_de: 'Zutrittsverbot', schutzzeit: '01.01. - 31.12.', schutzs_de: 'rechtsverbindlich', kanton: 'SG', ...extra } });
  it('is a caution that says so, not a year-round ban', () => {
    const [h] = parseZoneHits({ results: [zone({ zusatzinformation: 'Zutrittsverbot bei Schneelage, Leinenpflicht' })] }, new Date(2027, 6, 15));
    expect(h!.layer.severity).toBe('caution');
    expect(h!.layer.note).toMatch(/when snow lies/);
    expect(h!.detail).toContain('when snow lies');
    expect(h!.detail).not.toContain('01.01.');
  });
  it('a plain entry ban in force stays a ban', () => {
    const [h] = parseZoneHits({ results: [zone({})] }, new Date(2026, 9, 7));
    expect(h!.layer.severity).toBe('restricted');
  });
});

describe('army shooting is told for the date asked about', () => {
  const shooting = { layerBodId: 'ch.vbs.schiessanzeigen', attributes: { label: 'Hinterrhein', belegungsdatum: ['07.10.2026'], kein_schiessen: [false], zeit_von: ['0715'], zeit_bis: ['1800'] } };
  it('says "today" for today and the date for another day, never "today" for a later night', () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const live = { ...shooting, attributes: { ...shooting.attributes, belegungsdatum: [`${dd}.${mm}.${today.getFullYear()}`] } };
    expect(parseZoneHits({ results: [live] }, today)[0]!.detail).toMatch(/listed for today/);
    const later = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 20);
    const d = parseZoneHits({ results: [shooting] }, later)[0]!;
    expect(d.detail).not.toMatch(/today/);
    expect(d.detail).toMatch(/only covers the next few days/);
    expect(d.layer.severity).toBe('info');
  });
  it('the first-view line names the date for a later night', () => {
    const zone = { layer: { id: 'ch.vbs.schiessanzeigen', label: 'Army', severity: 'caution' as const, note: 'n' } };
    const asm = { verdict: 'caution', reasons: [], items: [], zones: [zone], treeline: 'above' } as never;
    const later = new Date(Date.now() + 6 * 86400000);
    expect(buildAlerts({ assessment: asm, date: later })[0]!.text).toMatch(/Army shooting is scheduled here on /);
    expect(buildAlerts({ assessment: asm, date: new Date() })[0]!.text).toBe('Army shooting is scheduled here today');
  });
});

describe('one area is said once', () => {
  it('collapses the parts of one reserve', () => {
    const part = { layerBodId: 'ch.bafu.bundesinventare-jagdbanngebiete', attributes: { label: 'Kärpf', name: 'Kärpf' } };
    expect(parseZoneHits({ results: [part, part, { ...part, attributes: { label: 'Piz Ela', name: 'Piz Ela' } }] }).map((h) => h.name)).toEqual(['Kärpf', 'Piz Ela']);
  });
});

describe('texts from the federal layers come in the language of the page', () => {
  const danger = { results: [{ attributes: { title_en: 'High danger', title_de: 'Grosse Gefahr', title_fr: 'Fort danger', name_en: 'Canton of Uri', name_de: 'Kanton Uri', name_fr: 'Canton d’Uri', valid_from: '07.10.2026' } }] };
  it('shows the German and French words, and still decides on the English text', () => {
    expect(parseFire(danger, {}, 'de').danger).toMatchObject({ title: 'Grosse Gefahr', region: 'Kanton Uri', level: 4 });
    expect(parseFire(danger, {}, 'fr').danger).toMatchObject({ title: 'Fort danger', region: 'Canton d’Uri', level: 4 });
    expect(parseFire(danger, {}, 'it').danger).toMatchObject({ title: 'High danger', level: 4 }); // no Italian text: English falls back
  });
  it('a drone zone keeps its meaning whatever the language', () => {
    const body = { results: [{ attributes: { zone_name_en: 'Piz Ela', zone_name_de: 'Piz Ela DE', zone_restriction_en: 'The operation of unmanned aircraft is prohibited', zone_restriction_de: 'Der Betrieb von Drohnen ist verboten', zone_restriction_id: 'REQ_AUTHORISATION.X', auth_name_en: ['Canton GR'], auth_name_de: ['Kanton GR'] } }] };
    const [z] = parseDrones(body, 'de');
    expect(z).toMatchObject({ name: 'Piz Ela DE', restriction: 'Der Betrieb von Drohnen ist verboten', authority: 'Kanton GR', all: true });
  });
});

describe('words and numbers', () => {
  it('turns the transport kinds of the layer into words that can be translated', () => {
    expect([stopKind('Sesselbahn'), stopKind('Standseilbahn'), stopKind('Bus'), stopKind('Zug'), stopKind('Etwas Neues')]).toEqual(['chairlift', 'funicular', 'bus', 'train', 'etwas neues']);
  });
  it('keeps the unit of a temperature when a title is put in lower case', () => {
    setLangForTest('fr');
    expect(lower('Low of 8 °C')).toBe('low of 8 °C');
    setLangForTest('de');
    expect(lower('Low of 8 °C')).toBe('Low of 8 °C');
  });
  it('carries seconds that round to 60 into the minute', () => {
    expect(dms(46.999999, 'N', 'S')).toBe("47°00'00.0\"N");
    expect(dms(46.9666666, 'N', 'S')).toBe("46°57'60.0\"N".replace("57'60.0", "58'00.0"));
    expect(dms(-8.5, 'E', 'W')).toBe("8°30'00.0\"W");
    expect(emergencyNumbers().length).toBeGreaterThan(2);
  });
});

describe('what the first view must not stay silent about', () => {
  it('a forecast that could not be loaded', () => {
    const c = comfortFor({ forecastFailed: true });
    expect(c.alerts.some((a) => /Forecast not checked/.test(a.title))).toBe(true);
    expect(comfortFor({}).alerts.some((a) => /Forecast not checked/.test(a.title))).toBe(false);
  });
  it('an avalanche bulletin that could not be loaded in the season of it', () => {
    expect(comfortFor({ avalancheUnrated: true }).alerts.some((a) => /Avalanche danger not checked/.test(a.title))).toBe(true);
    expect(comfortFor({ avalancheFailed: true }).alerts.some((a) => /Avalanche danger not checked/.test(a.title))).toBe(false);
  });
  it('ranks a ban zone close by before terrain lines of the same colour', () => {
    const asm = { verdict: 'caution', reasons: [], items: [], zones: [], nearZones: [{ layer: { id: 'x', label: 'Reserve', severity: 'prohibited', note: 'n' }, distanceM: 100 }], treeline: 'above' } as never;
    const comfort = { alerts: [{ tone: 'warn', title: 'Steep slope above', text: '', weather: false }, { tone: 'warn', title: 'In a rockfall area', text: '', weather: false }, { tone: 'warn', title: 'Open water', text: '', weather: false }] } as never;
    expect(buildAlerts({ comfort, assessment: asm })[0]!.text).toMatch(/ban zone begins/);
  });
});
