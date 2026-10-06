import { comfortFor } from './comfort/comfort';
import { summariseNight, type Hourly, type Night, type NightWindow } from './comfort/weather';
import type { SavedSpot } from './saved';
import { weatherScore } from './scores';
import { tr } from './i18n';

export interface PlanRow {
  /** "Tonight", "Tomorrow", then weekday names. */
  night: string;
  spot: SavedSpot;
  /** Saved legality score, not re-checked. */
  legal?: number;
  /** Weather score for that night at that spot's elevation: the forecast alone, terrain shelter is not known here. */
  weather?: number;
  /** The forecast summary, or undefined if the forecast could not be loaded for this spot. */
  forecast?: Night;
  /** Plain-language flags: thunderstorm, storm gusts, heavy rain, freezing, snow. */
  flags: string[];
  /** True when the weather alone rules this night out. */
  stop: boolean;
}

export interface TripPlan {
  rows: PlanRow[];
  /** Spots left out because the forecast covers fewer nights than were picked. */
  dropped: SavedSpot[];
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

/**
 * One spot per night in the order given, each judged with its own forecast. `hourly[i]` is the forecast of `spots[i]`
 * (undefined when it could not be loaded). Nights beyond the forecast range are dropped and returned.
 */
export function planNights(spots: SavedSpot[], windows: NightWindow[], hourly: (Hourly | undefined)[]): TripPlan {
  const used = spots.slice(0, windows.length);
  const rows = used.map((spot, i): PlanRow => {
    const w = windows[i]!;
    const forecast = hourly[i] ? summariseNight(hourly[i]!, w) : undefined;
    const c = forecast ? comfortFor({ night: forecast }) : undefined;
    const ws = forecast ? weatherScore(c, true) : undefined;
    return {
      night: w.label,
      spot,
      legal: spot.snapshot.legal,
      weather: ws?.value,
      forecast,
      flags: forecast ? flagsFor(forecast) : [],
      stop: !!c?.weatherStop,
    };
  });
  let weakest: number | undefined;
  let low = Infinity;
  rows.forEach((r, i) => {
    const v = Math.min(r.legal ?? 100, r.stop ? 0 : r.weather ?? 100);
    if (v < low) {
      low = v;
      weakest = i;
    }
  });
  return { rows, dropped: spots.slice(windows.length), weakest };
}
