import { describe, expect, it } from 'vitest';
import { PIN_SVG } from '../src/pin';

describe('spot pin', () => {
  it('is an inline SVG with a path, not an image file', () => {
    expect(PIN_SVG.startsWith('<svg')).toBe(true);
    expect(PIN_SVG).not.toMatch(/<img|\.png|url\(/);
    expect((PIN_SVG.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('is well-formed XML', () => {
    expect((PIN_SVG.match(/<svg/g) ?? []).length).toBe(1);
    expect(PIN_SVG.endsWith('</svg>')).toBe(true);
  });
});
