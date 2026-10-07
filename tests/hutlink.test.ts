import { describe, expect, it } from 'vitest';
import { parseHutLinks } from '../src/comfort/hutlink';

const feature = (name: string, c: [number, number], urls: Record<string, string | null>) => ({ geometry: { type: 'Point', coordinates: c }, properties: { name, ...urls } });
const kesch = feature('Kesch-Hütte SAC', [2786509.6, 1168885.1], {
  url_sac_de: 'https://www.sac-cas.ch/de/huetten-und-touren/sac-tourenportal/2147000140',
  url_sac_fr: 'https://www.sac-cas.ch/fr/cabanes-et-courses/portail-des-courses-du-cas/2147000140',
  url_sac_it: 'https://www.sac-cas.ch/it/capanne-e-escursioni/portale-escursionistico-del-cas/2147000140',
  url_sac_en: 'https://www.sac-cas.ch/en/huts-and-tours/sac-route-portal/2147000140',
});

describe('SAC portal link of a hut', () => {
  it('takes the link in the language of the page', () => {
    const r = parseHutLinks({ results: [kesch] }, 2786512.3, 1168891.5, 'fr');
    expect(r).toHaveLength(1);
    expect(r[0]!.url).toContain('/fr/cabanes-et-courses/');
    expect(r[0]!.meters).toBeLessThan(10);
    expect(parseHutLinks({ results: [kesch] }, 2786512.3, 1168891.5, 'it')[0]!.url).toContain('/it/');
  });
  it('lists the nearest first and skips points without a link', () => {
    const noLink = feature('Hôtel de la Croix de Fer', [2786510, 1168886], { url_sac_de: null, url_sac_en: null });
    const farther = feature('Chamanna Coaz CAS', [2786900, 1168900], { url_sac_en: 'https://www.sac-cas.ch/en/huts-and-tours/sac-route-portal/1' });
    const r = parseHutLinks({ results: [farther, noLink, kesch] }, 2786509, 1168885, 'en');
    expect(r.map((x) => x.name)).toEqual(['Kesch-Hütte SAC', 'Chamanna Coaz CAS']);
  });
  it('uses another language when the asked one is missing, and never a link away from the SAC portal', () => {
    const f = feature('X Hütte SAC', [1, 1], { url_sac_de: 'https://www.sac-cas.ch/de/x', url_sac_it: null });
    expect(parseHutLinks({ results: [f] }, 1, 1, 'it')[0]!.url).toBe('https://www.sac-cas.ch/de/x');
    const evil = feature('Y Hütte', [1, 1], { url_sac_en: 'https://evil.example/phish', url_sac_de: 'javascript:alert(1)' });
    expect(parseHutLinks({ results: [evil] }, 1, 1, 'en')).toEqual([]);
  });
  it('copes with an empty or odd response', () => {
    expect(parseHutLinks({}, 0, 0, 'en')).toEqual([]);
    expect(parseHutLinks({ results: [{ geometry: { type: 'Polygon', coordinates: [] }, properties: { name: 'a', url_sac_en: 'https://www.sac-cas.ch/x' } }] }, 0, 0, 'en')).toEqual([]);
  });
});
