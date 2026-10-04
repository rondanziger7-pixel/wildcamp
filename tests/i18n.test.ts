import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DE, FR, IT } from '../src/i18n-dict';
import { detectLang, setLangForTest, tr } from '../src/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('dictionaries', () => {
  it('German, French and Italian have exactly the same keys', () => {
    const k = (d: Record<string, string>) => Object.keys(d).sort();
    expect(k(FR)).toEqual(k(DE));
    expect(k(IT)).toEqual(k(DE));
  });
  it('every translation keeps the placeholders of its English key and is not empty', () => {
    for (const [name, d] of [['de', DE], ['fr', FR], ['it', IT]] as const)
      for (const [en, tx] of Object.entries(d)) {
        expect(tx.trim().length, `${name}: ${en}`).toBeGreaterThan(0);
        expect(placeholders(tx), `${name}: ${en}`).toEqual(placeholders(en));
      }
  });
  it('every text passed to tr() as a plain literal, and every data-i18n text of the page, is translated', () => {
    const files = readdirSync('src').filter((f) => f.endsWith('.ts') && !f.startsWith('i18n'));
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(`src/${f}`, 'utf8');
      for (const m of src.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1]!.replace(/\\'/g, "'");
        if (!(key in DE)) missing.push(`${f}: ${key}`);
      }
    }
    const html = readFileSync('index.html', 'utf8');
    for (const m of html.matchAll(/<([a-z0-9]+)[^>]*\sdata-i18n(?=[\s>])[^>]*>([\s\S]*?)<\/\1>/g)) {
      const key = m[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (key && !(key in DE)) missing.push(`index.html: ${key}`);
    }
    expect(missing).toEqual([]);
  });
  it('covers the dynamic keys: months, avalanche levels and table headers', () => {
    for (const k of ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'low', 'moderate', 'considerable', 'high', 'very high', 'Hour', 'Rain mm', 'Rain %', 'Wind km/h', 'From']) expect(DE[k], k).toBeDefined();
  });
});

describe('tr', () => {
  afterEach(() => setLangForTest('en'));
  it('returns the English text for English and for a missing translation', () => {
    expect(tr('Not allowed')).toBe('Not allowed');
    setLangForTest('de');
    expect(tr('A text nobody translated')).toBe('A text nobody translated');
  });
  it('translates and fills placeholders', () => {
    setLangForTest('de');
    expect(tr('Not allowed')).toBe('Nicht erlaubt');
    expect(tr('{n} days ago', { n: 3 })).toBe('vor 3 Tagen');
    setLangForTest('fr');
    expect(tr('Stopped: {n} tiles saved.', { n: 12 })).toBe('Arrêté : 12 tuiles enregistrées.');
    setLangForTest('it');
    expect(tr('Saved spots ({n})', { n: 2 })).toBe('Posti salvati (2)');
  });
  it('leaves an unknown placeholder visible rather than printing undefined', () => {
    expect(tr('{n} days ago', {})).toBe('{n} days ago');
  });
});

describe('language choice', () => {
  it('uses the stored language, else the browser language if supported, else English', () => {
    expect(detectLang('fr', 'de-CH')).toBe('fr');
    expect(detectLang(null, 'de-CH')).toBe('de');
    expect(detectLang(undefined, 'it-IT')).toBe('it');
    expect(detectLang(null, 'fr')).toBe('fr');
    expect(detectLang(null, 'es-ES')).toBe('en');
    expect(detectLang('xx', 'es')).toBe('en');
    expect(detectLang(null, undefined)).toBe('en');
  });
});
