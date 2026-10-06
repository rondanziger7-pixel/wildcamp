import { DE, FR, IT } from './i18n-dict';
import { DE_RULES, FR_RULES, IT_RULES } from './i18n-rules';

export type Lang = 'en' | 'de' | 'fr' | 'it';
export const LANGS: [Lang, string][] = [['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano']];
export const LANG_KEY = 'wildcamp.lang.v1';

const DICT: Record<Lang, Record<string, string>> = { en: {}, de: { ...DE, ...DE_RULES }, fr: { ...FR, ...FR_RULES }, it: { ...IT, ...IT_RULES } };

/** The stored language, else the browser's if it is one of ours, else English. */
export function detectLang(stored: string | null | undefined, browser: string | undefined): Lang {
  if (stored && LANGS.some(([l]) => l === stored)) return stored as Lang;
  const b = browser?.slice(0, 2).toLowerCase();
  return LANGS.some(([l]) => l === b) ? (b as Lang) : 'en';
}

function initial(): Lang {
  try {
    return detectLang(globalThis.localStorage?.getItem(LANG_KEY), globalThis.navigator?.language);
  } catch {
    return 'en';
  }
}

let current: Lang = initial();
export const getLang = () => current;

/** Switching the language reloads the page: everything is drawn in the language it started in. */
export function setLang(l: Lang, reload = true): void {
  current = l;
  try {
    globalThis.localStorage?.setItem(LANG_KEY, l);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
  if (reload && typeof location !== 'undefined') location.reload();
}

/** For tests: switch without storing or reloading. */
export const setLangForTest = (l: Lang) => void (current = l);

/** The text in the current language (named tr so it never collides with local variables); the English text itself is the key, and a missing translation falls back to it. */
export function tr(en: string, params?: Record<string, string | number>): string {
  const s = DICT[current][en] ?? en;
  return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s;
}

/** The locale for dates and weekday names in the current language. */
export const dateLocale = () => ({ en: 'en-GB', de: 'de-CH', fr: 'fr-CH', it: 'it-CH' })[current];

/** Lower-case a phrase for use inside a sentence; German nouns keep their capital letter. */
export const lower = (s: string) => (current === 'de' ? s : s.toLowerCase());

/** Translate the static page: elements with data-i18n use their own English text as the key; data-i18n-attr names attributes. */
export function applyStatic(root: ParentNode = document): void {
  document.documentElement.lang = current;
  for (const e of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const key = (e.dataset.i18nKey ??= (e.textContent ?? '').trim().replace(/\s+/g, ' '));
    e.textContent = tr(key);
  }
  for (const e of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n-attr]'))) {
    for (const attr of e.dataset.i18nAttr!.split(',')) {
      // the English text is kept in a data attribute (names with a hyphen cannot be dataset keys)
      const store = `data-i18n-en-${attr}`;
      const key = e.getAttribute(store) ?? e.getAttribute(attr) ?? '';
      e.setAttribute(store, key);
      e.setAttribute(attr, tr(key));
    }
  }
}
