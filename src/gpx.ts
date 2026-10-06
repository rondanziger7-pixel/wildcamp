import type { SavedSpot, SpotSnapshot } from './saved';
import { nightText } from './comfort/weather';
import { lower, tr } from './i18n';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** One line of scores for a spot, used in the GPX description and the share text. */
export function scoreLine(s: SpotSnapshot): string {
  const parts = [`${tr('Legality')} ${s.legal ?? '–'}/100`, `${tr('Sleep')} ${s.sleep ?? '–'}/100${s.sleep !== undefined && !s.complete ? ' ' + tr('(partial)') : ''}`];
  if (s.weather !== undefined) parts.push(`${tr('Weather')} ${s.weather}/100${s.night ? ` (${lower(nightText(s.night))})` : ''}`);
  return parts.join(', ');
}

/** The verdict as a phrase inside a sentence, in the current language. */
function verdictWord(v: SpotSnapshot['verdict']): string {
  switch (v) {
    case 'no':
      return tr('not allowed');
    case 'caution':
      return tr('be careful');
    case 'likely_ok':
      return tr('likely OK');
    default:
      return tr('unknown');
  }
}

/** GPX 1.1 with one waypoint per saved spot: name, elevation, saved time and the scores as they were. */
export function spotsToGpx(spots: SavedSpot[]): string {
  const wpts = spots.map((sp) => {
    const s = sp.snapshot;
    const desc = [
      tr('{scores}. Legality verdict: {verdict}.', { scores: scoreLine(s), verdict: verdictWord(s.verdict) }),
      s.water && tr('Water: {water}.', { water: s.water }),
      s.hut && tr('Hut: {hut}.', { hut: s.hut }),
      s.pros.length ? tr('For: {list}.', { list: s.pros.join('; ') }) : '',
      s.cons.length ? tr('Against: {list}.', { list: s.cons.join('; ') }) : '',
      tr('Guidance only, not legal advice; scores are as of the save date.'),
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
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wildcamp CH" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(tr('Wildcamp CH saved spots'))}</name></metadata>\n${wpts.join('\n')}\n</gpx>\n`;
}

/** Plain text to share a spot: place, scores and the link. */
export function shareText(name: string, s: Omit<SpotSnapshot, 'savedAt'>, link: string): string {
  return `${tr('{name}: {scores}. Legality verdict: {verdict}. Guidance only, not legal advice.', { name, scores: scoreLine({ ...s, savedAt: 0 }), verdict: verdictWord(s.verdict) })}\n${link}`;
}

export function downloadText(filename: string, text: string, type = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
