import type { SavedSpot, SpotSnapshot } from './saved';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** One line of scores for a spot, used in the GPX description and the share text. */
export function scoreLine(s: SpotSnapshot): string {
  const parts = [`Legality ${s.legal ?? '–'}/100`, `Sleep ${s.sleep ?? '–'}/100${s.sleep !== undefined && !s.complete ? ' (partial)' : ''}`];
  if (s.weather !== undefined) parts.push(`Weather ${s.weather}/100${s.night ? ` (${s.night.toLowerCase()})` : ''}`);
  return parts.join(', ');
}

const VERDICT = { no: 'not allowed', caution: 'be careful', likely_ok: 'likely OK', unknown: 'unknown' } as const;

/** GPX 1.1 with one waypoint per saved spot: name, elevation, saved time and the scores as they were. */
export function spotsToGpx(spots: SavedSpot[]): string {
  const wpts = spots.map((sp) => {
    const s = sp.snapshot;
    const desc = [
      `${scoreLine(s)}. Legality verdict: ${VERDICT[s.verdict]}.`,
      s.water && `Water: ${s.water}.`,
      s.hut && `Hut: ${s.hut}.`,
      s.pros.length ? `For: ${s.pros.join('; ')}.` : '',
      s.cons.length ? `Against: ${s.cons.join('; ')}.` : '',
      'Guidance only, not legal advice; scores are as of the save date.',
    ]
      .filter(Boolean)
      .join(' ');
    return [
      `  <wpt lat="${sp.lat.toFixed(6)}" lon="${sp.lng.toFixed(6)}">`,
      sp.elevation !== undefined ? `    <ele>${Math.round(sp.elevation)}</ele>` : '',
      `    <time>${new Date(s.savedAt).toISOString()}</time>`,
      `    <name>${esc(sp.name)}</name>`,
      `    <desc>${esc(desc)}</desc>`,
      '    <sym>Campground</sym>',
      '  </wpt>',
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>Wildcamp CH saved spots</name></metadata>\n${wpts.join('\n')}\n</gpx>\n`;
}

/** Plain text to share a spot: place, scores and the link. */
export function shareText(name: string, s: Omit<SpotSnapshot, 'savedAt'>, link: string): string {
  return `${name}: ${scoreLine({ ...s, savedAt: 0 })}. Legality verdict: ${VERDICT[s.verdict]}. Guidance only, not legal advice.\n${link}`;
}

export function downloadText(filename: string, text: string, type = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
