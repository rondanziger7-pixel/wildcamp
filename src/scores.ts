import type { Assessment } from './assess';
import type { Comfort } from './comfort/comfort';

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
  if (!c) return { tone: 'none' };
  let value = clamp(50 + 6.25 * c.score);
  if (c.weatherStop) value = Math.min(value, 25);
  return { value, tone: c.rating === 'great' || c.rating === 'good' ? 'good' : c.rating === 'fair' ? 'warn' : 'bad' };
}
