import { describe, expect, it } from 'vitest';
import { explainWrzRule } from '../src/wrzrules';
import type { Lang } from '../src/i18n';
import values from './fixtures/wrz-best-de.json';

/**
 * Every distinct `best_de` of the federal wildlife quiet zones (18 values, 1137 zones) and of the federal hunting-ban districts
 * (1 value), read from the live layers on 2026-10-06, with the data's own French and Italian wording (`fr`, `it`) for the
 * quiet zones. Refresh: the distinct `best_de` values of `ch.bafu.wrz-wildruhezonen_portal`.
 */
const rows = values as { value: string; count: number; fr?: string; it?: string; layer: string }[];
const LANGS: Lang[] = ['en', 'de', 'fr', 'it'];
const OTHERS: ('en' | 'fr' | 'it')[] = ['en', 'fr', 'it'];

/** What each part of a German rule must come out as in the other languages. */
const MEANING: { german: RegExp; en: RegExp; fr: RegExp; it: RegExp; what: string }[] = [
  { german: /Zutrittsverbot|Betretungsverbot/, en: /^Entry prohibited/, fr: /^Interdiction d’accès/, it: /^Divieto di accesso/, what: 'an entry ban' },
  { german: /Leine/, en: /leash/, fr: /laisse/, it: /guinzaglio/, what: 'the leash' },
  { german: /Wegegebot/, en: /Keep to the paths/, fr: /rester sur les chemins/, it: /rimanere sui sentieri/, what: 'the duty to keep to the paths' },
  { german: /Wintersport/, en: /[Ww]inter sports/, fr: /sports d’hiver/, it: /sport invernali/, what: 'winter sports' },
  { german: /^Bitte/, en: /^Please /, fr: /^Merci de /, it: /^Si prega di /, what: 'a request' },
  { german: /durchqueren auf eingezeichnet\w+ (Weg|Route) gestattet/, en: /crossing allowed on the marked (path|route)/, fr: /traversée autorisée sur (le chemin|l’itinéraire) indiqué/, it: /attraversamento consentito sul (sentiero|percorso) segnalato/, what: 'crossing allowed on the marked way' },
  { german: /durchqueren nur auf eingezeichneter Route/, en: /cross only on the marked route/, fr: /traverser uniquement sur l’itinéraire indiqué/, it: /attraversare solo sul percorso segnalato/, what: 'crossing only on the marked route' },
  { german: /Abfahrt durch eingezeichneten Korridor gestattet/, en: /descent through the marked corridor allowed/, fr: /descente autorisée dans le couloir indiqué/, it: /discesa consentita nel corridoio segnalato/, what: 'descent through the marked corridor' },
  { german: /Betreten oder befahren nur/, en: /^Entering or riding allowed only on/, fr: /^Accès et circulation autorisés uniquement sur/, it: /^Accesso e transito consentiti solo su/, what: 'entering or riding only on' },
  { german: /Pisten, Loipen/, en: /pistes, cross-country trails/, fr: /pistes, les pistes de ski de fond/, it: /piste, piste di fondo/, what: 'pistes and cross-country trails' },
  { german: /zu Fuss und Wintersportarten/, en: /on foot and for winter sports/, fr: /à pied ou pour les sports d’hiver/, it: /a piedi o per la pratica di sport invernali/, what: 'on foot and winter sports' },
  { german: /Andere Bestimmung/, en: /^Other provision/, fr: /^Autre disposition/, it: /^Altre disposizioni/, what: 'other provision' },
  { german: /Schneesportarten verboten ausserhalb markierter/, en: /^Snow sports prohibited outside the marked/, fr: /^Sports de neige interdits en dehors des/, it: /^Sport sulla neve vietati/, what: 'a snow-sports ban outside the marked ways' },
];

/** What the German must not be rendered as: a request is not a ban, a rule that allows is not a ban. */
const PROHIBITION = { en: /prohibit|forbidden|banned/i, fr: /interdi/i, it: /divieto|vietat/i };
/** German words that must not survive in another language. */
const GERMAN = /\b(Zutritts?\w*|Wegegebot|Leinenpflicht|Betreten|befahren|eingezeichnet\w*|Bitte|durchqueren|gestattet|Pisten|Loipen|Wintersport\w*|Routen|Bestimmung)\b/;

describe('every wildlife-quiet-zone rule text of the federal data has a rendering in all four languages', () => {
  it('knows the 19 distinct rule texts', () => {
    expect(rows.length).toBe(19);
    expect(rows.filter((r) => r.layer === 'ch.bafu.wrz-wildruhezonen_portal').reduce((n, r) => n + r.count, 0)).toBe(1137);
  });
  for (const r of rows) {
    describe(r.value.slice(0, 70), () => {
      it('German is the original, unchanged', () => expect(explainWrzRule(r.value, 'de')).toBe(r.value));
      for (const lang of OTHERS) {
        it(`${lang}: is a rendering of it`, () => {
          const t = explainWrzRule(r.value, lang);
          expect(t.trim().length).toBeGreaterThan(0);
          expect(t).not.toBe(r.value);
          expect(t, 'German left in the text').not.toMatch(GERMAN);
          expect(t).toMatch(/^\p{Lu}/u);
          expect(t).not.toMatch(/\.$/);
          if (lang !== 'en') expect(t, 'apostrophes are typographic like the rest of the dictionary').not.toMatch(/'/);
        });
        it(`${lang}: says what the German says, no more and no less`, () => {
          const t = explainWrzRule(r.value, lang);
          for (const m of MEANING) {
            if (m.german.test(r.value)) expect(t, m.what).toMatch(m[lang]);
            else expect(t, `${m.what} is not in the German`).not.toMatch(m[lang]);
          }
          // a request ("Bitte ...") and "Andere Bestimmung" are not a ban, and a ban stays a ban
          const bans = /verbot/i.test(r.value) || /Wintersportverbot|Schneesportarten verboten/.test(r.value);
          if (bans) expect(t, 'lost the ban').toMatch(PROHIBITION[lang]);
          else expect(t, 'made a ban of it').not.toMatch(PROHIBITION[lang]);
        });
      }
      it('the three renderings differ from each other', () => {
        const [en, fr, it] = OTHERS.map((l) => explainWrzRule(r.value, l));
        expect(new Set([en, fr, it]).size).toBe(3);
      });
    });
  }
  it('agrees with the data\'s own French and Italian wording on the leash, winter sports and whether it is a ban', () => {
    for (const r of rows) {
      if (!r.fr || !r.it) continue;
      // the federal text mixes ‘ and ’ for the apostrophe
      const fr = r.fr.replace(/‘/g, '’');
      const it = r.it.replace(/‘/g, '’');
      for (const m of MEANING.filter((x) => ['the leash', 'winter sports'].includes(x.what))) {
        if (m.german.test(r.value)) {
          expect(fr, `${r.value}: ${m.what} (fr)`).toMatch(m.fr);
          expect(it, `${r.value}: ${m.what} (it)`).toMatch(m.it);
        } else {
          expect(fr, `${r.value}: ${m.what} (fr)`).not.toMatch(m.fr);
          expect(it, `${r.value}: ${m.what} (it)`).not.toMatch(m.it);
        }
      }
      expect(PROHIBITION.fr.test(fr), `${r.value} (fr)`).toBe(PROHIBITION.fr.test(explainWrzRule(r.value, 'fr')));
      expect(PROHIBITION.it.test(it), `${r.value} (it)`).toBe(PROHIBITION.it.test(explainWrzRule(r.value, 'it')));
    }
  });
});

describe('texts it does not list', () => {
  it('returns an unknown text unchanged, in every language', () => {
    for (const lang of LANGS) {
      expect(explainWrzRule('Zutrittsverbot für Bahnbenützer', lang), lang).toBe('Zutrittsverbot für Bahnbenützer');
      expect(explainWrzRule('', lang), lang).toBe('');
      expect(explainWrzRule('Zutrittsverbot, Hunde dürfen mitgeführt werden', lang), `${lang}: one part unknown`).toBe('Zutrittsverbot, Hunde dürfen mitgeführt werden');
    }
  });
  it('translates the single parts and combinations of them', () => {
    expect(explainWrzRule('Leinenpflicht', 'en')).toBe('Dogs must be kept on a leash');
    expect(explainWrzRule('Zutrittsverbot', 'en')).toBe('Entry prohibited');
    expect(explainWrzRule('Zutrittsverbot, Leinenpflicht', 'en')).toBe('Entry prohibited; dogs must be kept on a leash');
    expect(explainWrzRule('Zutrittsverbot, Leinenpflicht', 'fr')).toBe('Interdiction d’accès ; obligation de tenir les chiens en laisse');
    expect(explainWrzRule('Wegegebot, Leinenpflicht, Wintersportverbot', 'it')).toBe('Obbligo di rimanere sui sentieri; obbligo di tenere i cani al guinzaglio; divieto di praticare sport invernali');
    expect(explainWrzRule('Betretungsverbot', 'it')).toBe('Divieto di accesso');
  });
  it('ignores spacing, a closing full stop and capitals', () => {
    expect(explainWrzRule('  Zutrittsverbot  ', 'en')).toBe('Entry prohibited');
    expect(explainWrzRule('Zutrittsverbot.', 'en')).toBe('Entry prohibited');
    expect(explainWrzRule('zutrittsverbot,   durchqueren auf eingezeichnetem Weg gestattet', 'en')).toBe('Entry prohibited; crossing allowed on the marked path');
  });
  it('does not take a comma inside brackets for a separator', () => {
    expect(explainWrzRule('Zutrittsverbot (zu Fuss, Ski, Snowboard)', 'en')).toBe('Zutrittsverbot (zu Fuss, Ski, Snowboard)');
  });
});
