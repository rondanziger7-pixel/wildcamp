import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');

describe('page structure for assistive technology', () => {
  it('names every region and panel, so each is a landmark a screen reader can jump to', () => {
    expect(html).toMatch(/<div id="map" role="region"/);
    expect(html).toMatch(/<section id="legend" role="dialog" aria-labelledby="legend-title"/);
    expect(html).toMatch(/<h2 id="legend-title"/);
    expect(html).toMatch(/<section id="settings"[^>]*aria-labelledby="settings-title"/);
    expect(html).toMatch(/<aside id="sheet"[^>]*aria-label=/);
  });
  it('does not make the whole sheet a live region (every change while a check runs would be read out)', () => {
    expect(html).not.toMatch(/<aside id="sheet"[^>]*aria-live/);
    expect(html).toMatch(/<div id="announce" class="sr-only" role="status" aria-live="polite">/);
  });
  it('gives the map a label that says how to use it with a keyboard, and acts on Enter and Escape', () => {
    expect(main).toMatch(/Arrow keys move the map/);
    expect(main).toMatch(/ev\.key !== 'Enter'/);
    expect(main).toMatch(/ev\.key !== 'Escape'/);
    expect(html).toMatch(/id="crosshair"/);
    expect(css).toMatch(/#map:focus-visible ~ #crosshair \{ display: block; \}/);
  });
  it('respects a request for less motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(main).toMatch(/prefers-reduced-motion: reduce/);
  });
  it('has the screen-reader-only class that the tone words use', () => {
    expect(css).toMatch(/\.sr-only \{/);
  });
});
