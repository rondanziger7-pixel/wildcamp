import { describe, expect, it } from 'vitest';
import { scoreLine, shareText, spotsToGpx } from '../src/gpx';
import type { SavedSpot, SpotSnapshot } from '../src/saved';

const snap = (over: Partial<SpotSnapshot> = {}): SpotSnapshot => ({ verdict: 'likely_ok', legal: 85, sleep: 70, weather: 60, night: 'Tonight', sleepLabel: 'Good', water: 'Stream · 80 m', hut: 'Cabane X · 1.2 km', pros: ['Grassy ground'], cons: ['Open to wind'], complete: true, savedAt: Date.UTC(2026, 9, 4, 12, 0, 0), ...over });
const spot = (over: Partial<SavedSpot> = {}): SavedSpot => ({ id: 'a', lat: 46.5, lng: 7.76, name: 'Kandersteg · 1602 m', elevation: 1602.4, snapshot: snap(), ...over });

describe('GPX export', () => {
  const gpx = spotsToGpx([spot(), spot({ name: 'Tom & Jerry <"hut">', lat: 46.123456789, lng: 8.1, elevation: undefined })]);
  it('is GPX 1.1 with one waypoint per spot', () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">');
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(2);
    expect((gpx.match(/<\/wpt>/g) ?? []).length).toBe(2);
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true);
  });
  it('writes position, rounded elevation and the save time', () => {
    expect(gpx).toContain('<wpt lat="46.500000" lon="7.760000">');
    expect(gpx).toContain('<ele>1602</ele>');
    expect(gpx).toContain('<time>2026-10-04T12:00:00.000Z</time>');
    expect(gpx).toContain('lat="46.123457"');
  });
  it('omits elevation when unknown and escapes XML in names', () => {
    const second = gpx.split('<wpt ')[2]!;
    expect(second).not.toContain('<ele>');
    expect(gpx).toContain('<name>Tom &amp; Jerry &lt;&quot;hut&quot;&gt;</name>');
    expect(gpx).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/); // no raw ampersand anywhere
    expect(gpx).not.toMatch(/<name>[^<]*["][^<]*<\/name>/);
  });
  it('describes the scores, verdict, water, hut and the disclaimer', () => {
    expect(gpx).toContain('Legality 85/100, Sleep 70/100, Weather 60/100 (tonight). Legality verdict: likely OK.');
    expect(gpx).toContain('Water: Stream · 80 m.');
    expect(gpx).toContain('For: Grassy ground. Against: Open to wind.');
    expect(gpx).toContain('Guidance only, not legal advice');
  });
  it('an empty list is still a valid file', () => {
    expect(spotsToGpx([])).toContain('</gpx>');
  });
});

describe('score line and share text', () => {
  it('marks a partial sleep score and missing values', () => {
    expect(scoreLine(snap({ complete: false }))).toContain('Sleep 70/100 (partial)');
    expect(scoreLine(snap({ legal: undefined, weather: undefined }))).toBe('Legality –/100, Sleep 70/100');
  });
  it('puts the link last and keeps the disclaimer', () => {
    const t = shareText('Kandersteg · 1602 m', snap(), 'https://x.test/#46.5,7.76,15');
    expect(t.split('\n')[1]).toBe('https://x.test/#46.5,7.76,15');
    expect(t).toContain('Kandersteg · 1602 m: Legality 85/100');
    expect(t).toContain('Guidance only, not legal advice');
  });
});
