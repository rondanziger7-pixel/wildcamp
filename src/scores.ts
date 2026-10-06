import type { Assessment } from './assess';
import type { Comfort } from './comfort/comfort';
import { tr } from './i18n';

export type ScoreTone = 'bad' | 'warn' | 'ok' | 'good' | 'none';

export interface Score {
  /** 0 to 100, or undefined when there is nothing to score. */
  value?: number;
  tone: ScoreTone;
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/**
 * Legality as a number, a plain summary of the verdict and its warnings, not a probability:
 * not allowed 0; caution 55 minus 10 per warning (at least 25); unknown 40; likely OK 85.
 * It never reaches 100 because cantonal and municipal rules and private land are never fully checked.
 */
export function legalityScore(a: Assessment): Score {
  if (a.outside) return { tone: 'none' };
  // a lookup is missing: no number (a ban found anyway is still a ban)
  if (a.incomplete?.length && a.verdict !== 'no') return { tone: 'none' };
  switch (a.verdict) {
    case 'no':
      return { value: 0, tone: 'bad' };
    case 'caution': {
      const warnings = a.items.filter((i) => i.tone === 'warn').length;
      return { value: clamp(Math.max(25, 55 - 10 * warnings)), tone: 'warn' };
    }
    case 'unknown':
      return { value: 40, tone: 'warn' };
    case 'likely_ok':
      return { value: 85, tone: 'good' };
  }
}

/** Sleep quality: the comfort factor sum mapped to 0..100 (50 at zero, 6.25 per point); a storm caps it at 25. */
export function sleepScore(c: Comfort | undefined): Score {
  if (!c || c.insufficient) return { tone: 'none' };
  let value = clamp(50 + 6.25 * c.score);
  if (c.weatherStop) value = Math.min(value, 25);
  return { value, tone: c.rating === 'great' || c.rating === 'good' ? 'good' : c.rating === 'fair' ? 'warn' : 'bad' };
}

/**
 * The forecast's effect on the night as a number: 50 means neutral, 12.5 points per factor point
 * (clear and calm about 63, a soaking storm 0); a storm caps it at 10.
 */
export function weatherScore(c: Comfort | undefined, forecastKnown: boolean): Score {
  if (!c || !forecastKnown) return { tone: 'none' };
  let value = clamp(50 + 12.5 * c.weatherScore);
  if (c.weatherStop) value = Math.min(value, 10);
  return { value, tone: c.weatherStop || c.weatherScore <= -3 ? 'bad' : c.weatherScore < 0 ? 'warn' : 'good' };
}

/**
 * One number for "is this a good place to sleep": half legality, half the spot's comfort, held down by the weaker of the two
 * (never more than 10 above it), so a legal spot that cannot be slept on is not "okay". The weather is left out, so a place can be
 * judged in advance. A ban makes it 0. Without a comfort score yet it is undefined; with the comfort check unavailable it is the
 * legality alone. A check that could not be made (a missing lookup) gives no number at all: the result is "unchecked".
 */
export function overallScore(a: Assessment, legal: Score, spotComfort: number | undefined, comfortUnavailable = false): Score {
  if (a.outside) return { tone: 'none' };
  if (a.verdict === 'no') return { value: 0, tone: 'bad' };
  if (a.incomplete?.length) return { tone: 'none' };
  if (legal.value === undefined) return { tone: 'none' };
  if (spotComfort === undefined && !comfortUnavailable) return { tone: 'none' };
  const value = clamp(spotComfort === undefined ? legal.value : Math.min(0.5 * legal.value + 0.5 * spotComfort, Math.min(legal.value, spotComfort) + 10));
  const tone: ScoreTone = value >= 70 && a.verdict === 'likely_ok' ? 'good' : value >= 50 ? 'warn' : 'bad';
  return { value, tone };
}

/** The spot's comfort (0..100) from `Comfort.spotScore`: 50 at zero, 6.25 per point, like the sleep score. */
export const spotComfortValue = (spotScore: number) => clamp(50 + 6.25 * spotScore);

export interface LegalSummary {
  /** The legality score, undefined when nothing can be scored (outside Switzerland, or a lookup is missing and no ban was found). */
  value?: number;
  /** As the result sheet words it: a "likely OK" with a warning in it is "caution". */
  verdict: Assessment['verdict'];
  /** The most serious finding in a few words (the same line the result sheet shows under the score). */
  why?: string;
  /** A lookup could not be made, so there is no verdict to rely on. */
  unchecked: boolean;
  outside: boolean;
}

/** The most serious finding in a few words, as the result sheet puts it under the score ("Municipal rule: Kandersteg"); undefined when nothing stands out. */
export function legalWhy(a: Assessment): string | undefined {
  const why = a.items.find((i) => i.tone === 'bad') ?? a.items.find((i) => i.tone === 'warn');
  if (!why) return undefined;
  return a.municipality && why.title === tr('{name} (municipality)', { name: a.municipality }) ? tr('Municipal rule: {name}', { name: a.municipality }) : why.title;
}

/** A legality verdict in one line, for places that list many spots (the trip plan, a refreshed list). */
export function legalSummary(a: Assessment): LegalSummary {
  const L = legalityScore(a);
  return {
    value: L.value,
    verdict: a.verdict === 'likely_ok' && L.tone === 'warn' ? 'caution' : a.verdict,
    why: legalWhy(a),
    unchecked: !!a.incomplete?.length && a.verdict !== 'no',
    outside: !!a.outside,
  };
}

/**
 * The overall score from numbers already at hand: a ban is 0; a missing comfort (or legality) gives no number. This is
 * `overallScore` for places that hold a saved legality and comfort instead of an `Assessment`.
 */
export function overallFrom(verdict: Assessment['verdict'], legal: number | undefined, comfort: number | undefined): number | undefined {
  if (verdict === 'no') return 0;
  if (legal === undefined || comfort === undefined) return undefined;
  return clamp(Math.min(0.5 * legal + 0.5 * comfort, Math.min(legal, comfort) + 10));
}
