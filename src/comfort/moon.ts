import { getMoonIllumination, getMoonPosition } from 'suncalc';
import { zurichNow } from './weather';

/** Zurich wall-clock "YYYY-MM-DDTHH:MM" to an instant (handles summer and winter time). */
export function zurichToDate(local: string): Date {
  const guess = new Date(`${local}:00Z`);
  const shown = Date.parse(`${zurichNow(guess)}:00Z`);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

export interface MoonNight {
  /** Illuminated fraction of the disc at the middle of the night, 0 to 1. */
  illumination: number;
  phase: string;
  /** Share of the night (hourly checks) in which the moon is above a flat horizon, 0 to 1. */
  upShare: number;
  /** First and last time the moon is above the horizon during the night, local "HH:MM". */
  up?: { from: string; to: string };
  /** The moon is up and bright for a good part of the night, so the sky is not dark. */
  bright: boolean;
}

export function phaseName(phase: number): string {
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(phase * 8) % 8]!;
}

const hhmm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

/** Moon over a night window (local Zurich times), sampled every 30 minutes with suncalc's moon model (about 0.3 degrees). */
export function moonNight(lat: number, lon: number, window: { from: string; to: string }): MoonNight {
  const start = zurichToDate(window.from).getTime();
  const end = zurichToDate(window.to).getTime();
  const steps = Math.max(1, Math.round((end - start) / 1800000));
  let up = 0;
  let first: Date | undefined;
  let last: Date | undefined;
  for (let i = 0; i <= steps; i++) {
    const t = new Date(start + ((end - start) * i) / steps);
    if (getMoonPosition(t, lat, lon).altitude > 0) {
      up++;
      first ??= t;
      last = t;
    }
  }
  const mid = new Date((start + end) / 2);
  const ill = getMoonIllumination(mid);
  const upShare = up / (steps + 1);
  return {
    illumination: ill.fraction,
    phase: phaseName(ill.phase),
    upShare,
    up: first && last ? { from: hhmm(first), to: hhmm(last) } : undefined,
    bright: ill.fraction >= 0.6 && upShare >= 0.4,
  };
}
