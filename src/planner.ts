import { comfortFor } from './comfort/comfort';
import { FORECAST_DAYS, nightWindowFor, nightWindows, summariseNight, type Hourly, type Night } from './comfort/weather';
import type { SavedSpot } from './saved';
import { legalSummary, weatherScore, type LegalSummary } from './scores';
import { daysBetween } from './trip';
import { tr } from './i18n';

export interface PlanInput {
  spot: SavedSpot;
  /** The evening the night begins on, "YYYY-MM-DD". */
  date: string;
}

export type ForecastState = 'ok' | 'beyond' | 'failed';

export interface PlanRow {
  date: string;
  /** "Tonight", "Tomorrow", then weekday names. */
  night: string;
  /** "Sat 10". */
  short: string;
  spot: SavedSpot;
  /** Legality for that night's date when it could be judged anew, otherwise the saved score (see `legalFresh`). */
  legal?: number;
  verdict: LegalSummary['verdict'];
  /** The most serious legal finding in a few words, if any. */
  why?: string;
  /** True when the legality was judged again for this night, false when it is the score saved with the spot. */
  legalFresh: boolean;
  /** A lookup failed, so there is no verdict to rely on for this night. */
  unchecked: boolean;
  /** The legality for this night differs from what was saved with the spot. */
  changed?: 'worse' | 'better';
  /** Weather score for that night at that spot's elevation: the forecast alone, terrain shelter is not known here. */
  weather?: number;
  /** The forecast summary, if it could be had. */
  forecast?: Night;
  forecastState: ForecastState;
  /** Plain-language flags: thunderstorm, storm gusts, heavy rain, freezing, snow. */
  flags: string[];
  /** True when the weather alone rules this night out. */
  stop: boolean;
}

export interface TripPlan {
  rows: PlanRow[];
  /** Index of the weakest night (lowest of legal and weather), if there is one. */
  weakest?: number;
}

export function flagsFor(n: Night): string[] {
  const f: string[] = [];
  if (n.thunder) f.push(tr('thunderstorm'));
  if (n.maxGustKmh >= 80) f.push(tr('storm gusts'));
  else if (n.maxGustKmh >= 50) f.push(tr('strong wind'));
  if (n.precipMm >= 10) f.push(tr('heavy rain'));
  else if (n.precipMm >= 5) f.push(tr('rain'));
  if (n.snowCm !== undefined && n.snowCm >= 1) f.push(tr('new snow'));
  if (n.minTempC <= -5) f.push(tr('hard frost'));
  else if (n.minTempC <= 0) f.push(tr('frost'));
  return f;
}

/** The first evening that is still ahead (or under way): the "today" of the planner. */
export const firstEvening = (now: string) => nightWindows(now, 1)[0]!.day;

/** True when the night lies beyond what the forecast covers (16 days, today included). */
export const beyondForecast = (date: string, now: string) => daysBetween(firstEvening(now), date) >= FORECAST_DAYS - 1;

const RANK: Partial<Record<LegalSummary['verdict'], number>> = { no: 0, caution: 1, likely_ok: 2 };

/**
 * The trip night by night. `hourly[i]` is the forecast of `nights[i]`'s spot (undefined when it was not asked for or could not be
 * loaded) and `legal[i]` its legality judged for that night's date (undefined when that could not be done: the saved score is
 * used, and marked as such). Nights beyond the forecast say so instead of showing a weather score.
 */
export function planTrip(nights: PlanInput[], hourly: (Hourly | undefined)[], legal: (LegalSummary | undefined)[], now: string): TripPlan {
  const rows = nights.map(({ spot, date }, i): PlanRow => {
    const w = nightWindowFor(date, now);
    const beyond = beyondForecast(date, now);
    const forecast = hourly[i] && !beyond ? summariseNight(hourly[i]!, w) : undefined;
    const c = forecast ? comfortFor({ night: forecast }) : undefined;
    const ws = forecast ? weatherScore(c, true) : undefined;
    const fresh = legal[i];
    const saved = spot.snapshot;
    const verdict = fresh ? fresh.verdict : saved.verdict;
    const savedRank = RANK[saved.verdict];
    const freshRank = fresh && !fresh.unchecked ? RANK[fresh.verdict] : undefined;
    const changed = !saved.unrated && savedRank !== undefined && freshRank !== undefined && savedRank !== freshRank ? (freshRank < savedRank ? 'worse' : 'better') : undefined;
    return {
      date,
      night: w.label,
      short: w.short,
      spot,
      legal: fresh ? fresh.value : saved.legal,
      verdict,
      why: fresh?.why,
      legalFresh: !!fresh,
      unchecked: fresh ? fresh.unchecked : !!saved.unrated || !!saved.unchecked?.length,
      changed,
      weather: ws?.value,
      forecast,
      forecastState: beyond ? 'beyond' : forecast ? 'ok' : 'failed',
      flags: forecast ? flagsFor(forecast) : [],
      stop: !!c?.weatherStop,
    };
  });
  // the weakest night is named only when it is actually weak (below 70) and weaker than the rest
  const values = rows.map((r) => Math.min(r.verdict === 'no' ? 0 : r.legal ?? 100, r.stop ? 0 : r.weather ?? 100));
  const low = Math.min(...values);
  const weakest = rows.length > 1 && low < 70 && low < Math.max(...values) ? values.indexOf(low) : undefined;
  return { rows, weakest };
}

/** The summary of a legality check, for `planTrip`. */
export { legalSummary };
