import { describe, expect, it } from 'vitest';
import { emergencyNumbers, formatLv95, positionMessage, positionText, smsLink, whatToSay } from '../src/emergency';
import { wgs84ToLv95 } from '../src/coords';

describe('emergency page content', () => {
  it('lists only numbers a primary source names: 112, 144, 1414, 117 (not 1415, which no authority names)', () => {
    const numbers = emergencyNumbers().map((n) => n.number);
    expect(numbers).toEqual(['112', '144', '1414', '117']);
    expect(numbers).not.toContain('1415');
  });
  it('says Valais is different: 144 also for mountain rescue, and 1414 is not the number there', () => {
    const t = emergencyNumbers().map((n) => n.when).join(' ');
    expect(t).toMatch(/Valais/);
    expect(t).toMatch(/144/);
  });
  it('never calls the paid short numbers free, and does not promise 112 works without a SIM', () => {
    const t = emergencyNumbers().map((n) => `${n.label} ${n.when}`).join(' ').toLowerCase();
    expect(t).not.toMatch(/\bfree\b/);
    expect(t).not.toMatch(/without a sim|no sim/);
  });
  it('has the five things Rega asks callers to be ready for', () => {
    expect(whatToSay()).toHaveLength(5);
    expect(whatToSay()[0]).toMatch(/coordinates/i);
  });
});

describe('the position to read out', () => {
  it('formats the Swiss grid with apostrophes', () => {
    expect(formatLv95(2775732.8, 1166226.9)).toBe("2'775'733 / 1'166'227");
    expect(formatLv95(2600000, 1200000)).toBe("2'600'000 / 1'200'000");
  });
  it('gives decimal degrees, degrees-minutes-seconds and LV95 of the same point', () => {
    const t = positionText({ lat: 46.6452, lng: 9.8752, elevation: 2616.4, accuracyM: 11.6 });
    expect(t.decimal).toBe('46.64520, 9.87520');
    expect(t.dms).toBe(`46°38'42.7"N 9°52'30.7"E`);
    const { e, n } = wgs84ToLv95(46.6452, 9.8752);
    expect(t.lv95).toBe(`${formatLv95(e, n)} (LV95)`);
    expect(t.elevation).toBe('2616 m');
    expect(t.accuracy).toBe('±12 m');
  });
  it('handles the southern and western hemispheres in the DMS form', () => {
    expect(positionText({ lat: -33.5, lng: -70.25 }).dms).toBe(`33°30'00.0"S 70°15'00.0"W`);
  });
  it('is one message that names the position, in every format, for reading out or texting', () => {
    const m = positionMessage({ lat: 46.6452, lng: 9.8752, accuracyM: 8 });
    expect(m).toContain('46.64520, 9.87520');
    expect(m).toContain('(LV95)');
    expect(m).toContain('±8 m');
    const link = smsLink(m);
    expect(link.startsWith('sms:?&body=')).toBe(true);
    expect(decodeURIComponent(link.slice('sms:?&body='.length))).toBe(m);
  });
});
