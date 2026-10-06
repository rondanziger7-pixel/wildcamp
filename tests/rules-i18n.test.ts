import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { CANTONS } from '../src/cantons';
import { MUNICIPAL_RULES, UNVERIFIED_NOTES } from '../src/municipalities';
import { DE, FR, IT } from '../src/i18n-dict';
import { DE_RULES, FR_RULES, IT_RULES } from '../src/i18n-rules';
import { setLangForTest, tr, type Lang } from '../src/i18n';

type Target = 'de' | 'fr' | 'it';
const RULES: Record<Target, Record<string, string>> = { de: DE_RULES, fr: FR_RULES, it: IT_RULES };
const BASE: Record<Target, Record<string, string>> = { de: DE, fr: FR, it: IT };
const TARGETS: Target[] = ['de', 'fr', 'it'];

/** Every rule text the page shows from data: the summaries and notes in src/, and the texts the data files carry. */
function ruleTexts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const c of CANTONS) if (c.rule) out.push({ where: `canton ${c.code}`, text: c.rule.summary });
  for (const m of MUNICIPAL_RULES) out.push({ where: `municipality ${m.bfs} ${m.name}`, text: m.rule.summary });
  for (const n of UNVERIFIED_NOTES) out.push({ where: `unverified note ${n.bfs} ${n.name}`, text: n.text });
  return out;
}

/** Zone wording carried by the data files in public/ (label, notes and exceptions are passed to tr() when shown). */
function dataFileTexts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: unknown) => {
    if (typeof text === 'string' && text.trim() !== '') out.push({ where, text });
  };
  for (const f of readdirSync('public').filter((n) => /^(reserves|bans)-.*\.json\.gz$/.test(n))) {
    const set = JSON.parse(gunzipSync(readFileSync(`public/${f}`)).toString('utf8')) as {
      label?: string;
      notes?: { restricted?: string; caution?: string };
      reserves?: { name?: string; exception?: string }[];
    };
    add(`${f} label`, set.label);
    add(`${f} note (restricted)`, set.notes?.restricted);
    add(`${f} note (caution)`, set.notes?.caution);
    for (const r of set.reserves ?? []) add(`${f} exception`, r.exception);
    // the court-ban areas are named in English ("..., lakeshore"); the reserve names of the other files are place names
    if (f.startsWith('bans-')) for (const r of set.reserves ?? []) add(`${f} area name`, r.name);
  }
  return out;
}

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

/** Text between quotation marks of any style: "..." “...” ‘...’ «...» „...“. */
const quotes = (s: string): string[] =>
  [...s.matchAll(/«([^»]+)»|„([^“”"]+)[“”"]|“([^”]+)”|‘([^’]+)’|"([^"]+)"/g)].map((m) => norm(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? ''));

/** Digit sequences with thousands separators folded away (10,000 = 10 000 = 10'000), so dates and amounts can be compared in any language. */
const numbers = (s: string): string[] => (s.replace(/(\d)[,'’\u00a0\u202f ](?=\d{3}(?!\d))/g, '$1').match(/\d+/g) ?? []).sort();

const urls = (s: string): string[] => (s.match(/https?:\/\/[^\s)»"]+/g) ?? []).sort();
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const letters = (s: string): string[] => [...s.matchAll(/\b(?:let|Bst|lit|lett)\.\s*([a-z])\b/gi)].map((m) => m[1]!.toLowerCase()).sort();

/** The marker each language uses for "paragraph" in "Art. 2 para. 1". */
const PARA: Record<'en' | Target, RegExp> = { en: /\bparas?\./g, de: /\bAbs\./g, fr: /\bal\./g, it: /\bcpv\./g };

/**
 * Quotations in the English text that are the English rendering of a term of the law, not a quotation of the law:
 * they are translated ("Camping" is the regulation's defined term "Campieren"; the Ticino law says "in montagna").
 * Every other quotation is original-language text and must reappear verbatim.
 */
const ENGLISH_RENDERINGS = new Set(['Camping', 'camping', 'in the mountains']);

/** Texts that may equal their English original: proper names and texts that are mostly quotation. */
const SAME_AS_ENGLISH = new Set<string>([]);
const mostlyQuotation = (s: string) => quotes(s).join('').length >= 0.6 * s.length;

/** English words that no German, French or Italian text should still contain. */
const LEFTOVER = /\b(the|and|with|outside|breach|breaches|fined|landowner|municipality|municipal|public ground|private land|sleeping|grant|allowed|banned|prohibited|only|not|may|must|can|applies|regulation|ordinance)\b/i;

/** A word for "banned/prohibited" in the English, and in each language. A ban must stay a ban, and a text that only says "not allowed" or "needs a permit" must not become one. */
const BAN = {
  en: /\b(ban|banned|bans|prohibit\w*|forbid\w*|forbidden)\b/i,
  de: /verbot|verboten|verbiet/i,
  fr: /interdi/i,
  it: /divieto|divieti|vietat|vieta/i,
};

describe('every rule text has a German, French and Italian translation', () => {
  const texts = [...ruleTexts(), ...dataFileTexts()];
  it('finds the rule texts', () => {
    expect(texts.filter((t) => t.where.startsWith('canton')).length).toBeGreaterThanOrEqual(6);
    expect(texts.filter((t) => t.where.startsWith('municipality')).length).toBeGreaterThanOrEqual(40);
    expect(texts.some((t) => t.where.startsWith('unverified note'))).toBe(true);
    expect(texts.some((t) => t.where.includes('bans-court'))).toBe(true);
  });
  for (const lang of TARGETS) {
    it(`${lang.toUpperCase()}: nothing is left in English`, () => {
      // the summaries and notes in src/ belong in src/i18n-rules.ts; a text a data file carries may also be translated in the interface dictionary
      const inSource = new Set(ruleTexts().map((t) => t.text));
      const missing = texts.filter((t) => !(t.text in RULES[lang]) && !(!inSource.has(t.text) && t.text in BASE[lang])).map((t) => `${t.where}: ${t.text}`);
      expect(missing, `no ${lang.toUpperCase()} translation for these rule texts; add each, keyed by its exact English text, to ${lang.toUpperCase()}_RULES in src/i18n-rules.ts:\n${missing.join('\n')}`).toEqual([]);
    });
  }
  it('the three dictionaries have the same keys', () => {
    const keys = (d: Record<string, string>) => Object.keys(d).sort();
    expect(keys(FR_RULES)).toEqual(keys(DE_RULES));
    expect(keys(IT_RULES)).toEqual(keys(DE_RULES));
  });
  it('no key is left over from a rule text that has since changed or gone', () => {
    const current = new Set(texts.map((t) => t.text));
    const orphans = Object.keys(DE_RULES).filter((k) => !current.has(k));
    expect(orphans, `translations whose English text no longer exists (update the key):\n${orphans.join('\n')}`).toEqual([]);
  });
});

describe('the translations say the same as the English', () => {
  for (const lang of TARGETS) {
    const entries = Object.entries(RULES[lang]);
    const label = (en: string) => `${lang}: ${en.slice(0, 70)}…`;

    it(`${lang.toUpperCase()}: not empty, with the placeholders of the English`, () => {
      for (const [en, tx] of entries) {
        expect(tx.trim().length, label(en)).toBeGreaterThan(0);
        expect(placeholders(tx), label(en)).toEqual(placeholders(en));
      }
    });

    it(`${lang.toUpperCase()}: keeps the URLs, the article, paragraph and letter references and every number and date`, () => {
      for (const [en, tx] of entries) {
        expect(urls(tx), `${label(en)} URLs`).toEqual(urls(en));
        expect(count(tx, /\bArt\./gi), `${label(en)} number of "Art."`).toBe(count(en, /\bArt\./gi));
        expect(count(tx, /§/g), `${label(en)} number of "§"`).toBe(count(en, /§/g));
        expect(count(tx, PARA[lang]), `${label(en)} number of paragraph references`).toBe(count(en, PARA.en));
        expect(letters(tx), `${label(en)} letter references`).toEqual(letters(en));
        expect(numbers(tx), `${label(en)} digits, dates and amounts`).toEqual(numbers(en));
      }
    });

    it(`${lang.toUpperCase()}: quotations of the law are kept word for word, English renderings of a term are quoted in the translation`, () => {
      for (const [en, tx] of entries) {
        const inEnglish = quotes(en);
        const inTranslation = quotes(tx);
        for (const q of inEnglish) {
          if (ENGLISH_RENDERINGS.has(q)) continue;
          expect(inTranslation, `${label(en)} must quote «${q}» word for word`).toContain(q);
        }
        expect(inTranslation.length, `${label(en)} lost a quotation`).toBeGreaterThanOrEqual(inEnglish.length);
      }
    });

    it(`${lang.toUpperCase()}: every ban stays a ban, and nothing else becomes one`, () => {
      const times = (re: RegExp, s: string) => (s.match(new RegExp(re.source, 'gi')) ?? []).length;
      for (const [en, tx] of entries) {
        expect(times(BAN[lang], tx), `${label(en)} lost a ban`).toBeGreaterThanOrEqual(times(BAN.en, en));
        expect(BAN[lang].test(tx), `${label(en)} turned into a ban`).toBe(BAN.en.test(en));
      }
    });

    it(`${lang.toUpperCase()}: is a translation, not the English text, and has no English words left`, () => {
      for (const [en, tx] of entries) {
        if (!SAME_AS_ENGLISH.has(en) && !mostlyQuotation(en)) expect(tx, `${label(en)} equals the English`).not.toBe(en);
        const left = tx.replace(/«[^»]*»/g, '').match(LEFTOVER);
        expect(left, `${label(en)} still contains the English word "${left?.[0]}"`).toBeNull();
      }
    });
  }

  it('German uses Swiss spelling: ss, never ß', () => {
    for (const [en, tx] of Object.entries(DE_RULES)) expect(tx, en.slice(0, 70)).not.toMatch(/ß/);
  });
  it('the quoted words of the law are the same in all three languages', () => {
    for (const en of Object.keys(DE_RULES)) {
      const original = quotes(en).filter((q) => !ENGLISH_RENDERINGS.has(q));
      for (const lang of TARGETS) for (const q of original) expect(quotes(RULES[lang][en]!), `${lang}: ${en.slice(0, 50)}…`).toContain(q);
    }
  });
});

describe('tr() uses them', () => {
  afterEach(() => setLangForTest('en'));
  const first = ruleTexts()[0]!.text;
  it('returns the translation in German, French and Italian, and the English text in English', () => {
    expect(tr(first)).toBe(first);
    for (const lang of TARGETS) {
      setLangForTest(lang as Lang);
      expect(tr(first), lang).toBe(RULES[lang][first]);
      expect(tr(first), lang).not.toBe(first);
    }
  });
  it('translates every rule text and every data-file text in every language', () => {
    for (const lang of TARGETS) {
      setLangForTest(lang as Lang);
      for (const t of [...ruleTexts(), ...dataFileTexts()]) expect(tr(t.text), `${lang}: ${t.where}`).not.toBe(t.text);
    }
  });
  it('does not shadow a different translation in the interface dictionary', () => {
    for (const lang of TARGETS)
      for (const [en, tx] of Object.entries(RULES[lang])) if (en in BASE[lang]) expect(BASE[lang][en], `${lang}: ${en.slice(0, 70)}…`).toBe(tx);
  });
});
