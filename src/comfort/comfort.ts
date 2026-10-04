import type { Item } from '../assess';
import { compassName, type Night } from './weather';
import { formatLocalTime, type SunTimes } from './sun';
import { horizonToward, type TerrainMetrics } from './terrain';
import type { Surroundings } from './surroundings';

export type ComfortRating = 'great' | 'good' | 'fair' | 'poor';

export interface Comfort {
  rating: ComfortRating;
  /** Sum of the factor scores; the thresholds for the rating are in `rate`. */
  score: number;
  /** One line naming the strongest points for and against. */
  summary: string;
  factors: Item[];
  /** Which checks could not be made, shown so a missing check is not read as a good one. */
  missing: string[];
}

export interface ComfortInput {
  terrain?: TerrainMetrics;
  night?: Night;
  surroundings?: Partial<Surroundings>;
  sun?: SunTimes;
  /** True when the forest map says the spot is in forest. */
  inForest?: boolean;
}

interface Factor extends Item {
  score: number;
}

const m = (x: number) => `${Math.round(x / 10) * 10} m`;

/** Rating thresholds are my own judgement, not measured against campers' experience. */
export function rate(score: number): ComfortRating {
  return score >= 3 ? 'great' : score >= 1 ? 'good' : score >= -1 ? 'fair' : 'poor';
}

export function comfortFor(input: ComfortInput): Comfort {
  const { terrain: t, night, surroundings: s, sun, inForest } = input;
  const f: Factor[] = [];
  const missing: string[] = [];

  if (t) {
    // flat ground
    const sl = t.slopeDeg;
    if (sl < 5) f.push({ tone: 'ok', score: 1, title: 'Flat ground', text: `Slope about ${sl.toFixed(0)}° over 20 m. Small bumps and rocks are not in the elevation data.` });
    else if (sl < 10) f.push({ tone: 'info', score: 0, title: 'Slightly sloping', text: `Slope about ${sl.toFixed(0)}° over 20 m. Look for a flatter patch close by.` });
    else if (sl < 15) f.push({ tone: 'warn', score: -1, title: 'Sloping ground', text: `Slope about ${sl.toFixed(0)}° over 20 m. You will slide in the tent; find a flatter spot.` });
    else f.push({ tone: 'bad', score: -2, title: 'Too steep to pitch', text: `Slope about ${sl.toFixed(0)}° over 20 m.` });

    // wind shelter from terrain
    const ridge = t.tpi >= 15 && t.meanHorizon < 3;
    const hollow = t.tpi <= -15;
    if (ridge) f.push({ tone: 'bad', score: -2, title: 'Exposed ridge or top', text: `About ${Math.round(t.tpi)} m above the ground around it and open in every direction. Fully exposed to wind, and a lightning risk in thunderstorms.` });
    else if (t.meanHorizon >= 10) f.push({ tone: 'ok', score: 1, title: 'Sheltered by terrain', text: `The ground rises about ${t.meanHorizon.toFixed(0)}° on average around the spot, which blocks much of the wind. Trees and rock are not counted.` });
    else if (t.meanHorizon >= 4) f.push({ tone: 'info', score: 0, title: 'Some shelter', text: `The ground rises about ${t.meanHorizon.toFixed(0)}° on average around the spot. Wind from open directions will still reach the tent.` });
    else f.push({ tone: 'warn', score: -1, title: 'Open to wind', text: `Little terrain around the spot (average horizon ${t.meanHorizon.toFixed(0)}°). Expect wind.` });
    if (inForest) f.push({ tone: 'info', score: 0, title: 'Trees nearby', text: 'The spot is in forest, which adds wind shelter. Check for dead branches above the tent.' });
    if (hollow) f.push({ tone: 'warn', score: -1, title: 'In a hollow', text: 'About ' + Math.round(-t.tpi) + ' m lower than the ground around it. Cold air and damp collect in hollows on clear nights, so frost and condensation are likely.' });

    // hazards from slope
    if (t.dropNearM !== undefined) f.push({ tone: 'bad', score: -2, title: 'Steep drop close by', text: `The ground falls away steeply about ${m(t.dropNearM)} away. Dangerous in the dark.` });
    if (t.steepAboveM !== undefined)
      f.push({ tone: 'warn', score: -1, title: 'Steep slope above', text: `A slope of 30° or more rises about ${m(t.steepAboveM)} away. Possible rockfall, and avalanche runout if there is snow.` });
  } else missing.push('terrain (slope, wind shelter, hazards)');

  // forecast wind relative to the terrain
  if (night) {
    const wind = `${compassName(night.windFromDeg)} wind, gusts up to ${Math.round(night.maxGustKmh)} km/h`;
    if (t) {
      const upwind = horizonToward(t.horizon, night.windFromDeg);
      if (night.maxGustKmh >= 50 && upwind < 5) f.push({ tone: 'bad', score: -2, title: 'Strong wind forecast, open to it', text: `${wind} tonight, and the terrain to the ${compassName(night.windFromDeg)} is open (horizon ${upwind.toFixed(0)}°).` });
      else if (night.maxGustKmh >= 50 && upwind >= 10) f.push({ tone: 'warn', score: 0, title: 'Strong wind forecast, sheltered from it', text: `${wind} tonight, but the ground to the ${compassName(night.windFromDeg)} rises ${upwind.toFixed(0)}°, which should shelter the tent.` });
      else if (night.maxGustKmh >= 50) f.push({ tone: 'warn', score: -1, title: 'Strong wind forecast', text: `${wind} tonight. Only partial shelter to the ${compassName(night.windFromDeg)}.` });
      else f.push({ tone: 'ok', score: 0, title: 'Calm night forecast', text: `${wind} tonight.` });
    } else f.push({ tone: night.maxGustKmh >= 50 ? 'warn' : 'info', score: night.maxGustKmh >= 50 ? -1 : 0, title: 'Wind tonight', text: `${wind}.` });
    f.push({
      tone: night.minTempC <= -5 ? 'warn' : 'info',
      score: night.minTempC <= -8 ? -1 : 0,
      title: `Low of ${Math.round(night.minTempC)} °C`,
      text: night.minTempC <= 0 ? 'Freezing overnight: bring a winter sleeping bag and expect frost on the tent.' : 'Forecast low at the spot’s elevation.',
    });
    if (night.precipMm >= 1) f.push({ tone: 'warn', score: night.precipMm >= 5 ? -2 : -1, title: 'Rain forecast', text: `About ${night.precipMm.toFixed(1)} mm overnight. Avoid hollows and stream beds.` });
  } else missing.push('overnight forecast');

  // crowds
  if (s && (s.trailM !== undefined || s.stops || s.huts)) {
    const found: string[] = [];
    let busy = 0;
    if (s.trailM !== undefined && s.trailM < 50) {
      busy += s.trailM < 10 ? 2 : 1;
      found.push(s.trailM < 10 ? 'on a marked hiking trail' : `${m(s.trailM)} from a marked hiking trail`);
    }
    const hut = s.huts?.[0];
    if (hut && hut.meters <= 400) {
      busy++;
      found.push(`${hut.name} ${m(hut.meters)} away`);
    }
    const stop = s.stops?.[0];
    if (stop && stop.meters <= 500) {
      busy++;
      found.push(`${stop.kind.toLowerCase()} stop “${stop.name}” ${m(stop.meters)} away`);
    }
    if (s.parkingM !== undefined && s.parkingM <= 400) {
      busy++;
      found.push(`car park ${m(s.parkingM)} away`);
    }
    if (s.settlementM !== undefined && s.settlementM <= 400) {
      busy++;
      found.push(`houses or a village ${m(s.settlementM)} away`);
    }
    if (busy) f.push({ tone: busy >= 2 ? 'bad' : 'warn', score: -Math.min(busy, 2), title: 'Likely busy', text: `${found.join('; ')}. Expect passers-by and noise. This is judged from distances only; there are no visitor counts.` });
    else f.push({ tone: 'ok', score: 1, title: 'Likely quiet', text: 'No marked trail within 50 m and no hut, stop, car park or village within 400 m. Judged from distances only; weekends and holidays are busier.' });
  } else missing.push('crowds (trails, huts, transport)');

  // water
  if (s?.waterM !== undefined) {
    if (s.waterM <= 150) f.push({ tone: 'ok', score: 1, title: 'Water close by', text: `Stream or lake about ${m(s.waterM)} away. Treat water before drinking.${s.waterM <= 20 ? ' Right beside water is noisy and floods in heavy rain.' : ''}`, ...(s.waterM <= 20 ? { tone: 'warn' as const, score: 0 } : {}) });
    else if (s.waterM <= 400) f.push({ tone: 'info', score: 0, title: 'Water within 400 m', text: `Nearest stream or lake about ${m(s.waterM)} away. Treat water before drinking.` });
    else f.push({ tone: 'info', score: 0, title: 'No water found nearby', text: 'No stream or lake in the map within 400 m. Carry your water.' });
  }

  // sun
  if (sun?.sunrise && sun.sunOnSpot) {
    const delay = Math.round((sun.sunOnSpot.getTime() - sun.sunrise.getTime()) / 60000);
    const at = formatLocalTime(sun.sunOnSpot);
    const flat = formatLocalTime(sun.sunrise);
    if (delay <= 20) f.push({ tone: 'ok', score: 1, title: 'Early morning sun', text: `Sun reaches the spot about ${at} (sunrise ${flat}).` });
    else f.push({ tone: 'info', score: 0, title: `Morning sun at ${at}`, text: `Sunrise is ${flat}, but the terrain hides the sun until about ${at}.` });
  }

  const score = f.reduce((a, x) => a + x.score, 0);
  const good = f.filter((x) => x.score > 0).map((x) => x.title.toLowerCase());
  const bad = f.filter((x) => x.score < 0).map((x) => x.title.toLowerCase());
  const summary = [good.length ? `For: ${good.slice(0, 3).join(', ')}` : '', bad.length ? `Against: ${bad.slice(0, 3).join(', ')}` : ''].filter(Boolean).join('. ') || 'Nothing stands out either way';
  return { rating: rate(score), score, summary, factors: f.map(({ score: _s, ...item }) => item), missing };
}
