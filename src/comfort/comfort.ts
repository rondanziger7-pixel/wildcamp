import type { Item } from '../assess';
import { compassName, type Night } from './weather';
import { formatLocalTime, type SunTimes } from './sun';
import { horizonToward, type TerrainMetrics } from './terrain';
import type { Surroundings } from './surroundings';
import type { WaterInfo } from './water';
import type { ShelterResult } from './shelters';

export type ComfortRating = 'great' | 'good' | 'fair' | 'poor';

export interface Comfort {
  /** Overall rating for the chosen night: the spot plus the weather. */
  rating: ComfortRating;
  /** Rating of the spot alone, ignoring the weather. */
  spotRating: ComfortRating;
  /** Net effect of the weather on the score (negative = the weather hurts). */
  weatherScore: number;
  /** True when the weather alone rules the night out (thunderstorm or storm-force gusts), whatever the spot is like. */
  weatherStop: boolean;
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
  /** Nearest water, glacier and treatment-plant flags. */
  water?: WaterInfo;
  /** Huts, bivouac boxes, inns and alps nearby. */
  shelters?: ShelterResult;
  sun?: SunTimes;
  /** True when the forest map says the spot is in forest. */
  inForest?: boolean;
}

interface Factor extends Item {
  score: number;
  /** Comes from the forecast, so it changes with the chosen night. */
  wx?: boolean;
}

const m = (x: number) => `${Math.round(x / 10) * 10} m`;
const km = (x: number) => (x < 950 ? `${Math.round(x / 50) * 50} m` : `${(x / 1000).toFixed(1)} km`);

/** The nearest hut or bivouac box, as a short sentence for storm warnings. */
function nearestHutNote(sh: ShelterResult | undefined): string {
  const h = sh?.shelters.find((x) => x.kind === 'hut' || x.kind === 'biwak');
  return h ? ` The nearest hut, ${h.name}, is about ${km(h.meters)} away in a straight line.` : '';
}

/** Rating thresholds are my own judgement, not measured against campers' experience. */
export function rate(score: number): ComfortRating {
  return score >= 4 ? 'great' : score >= 2 ? 'good' : score >= -1 ? 'fair' : 'poor';
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

  // the weather for the chosen night
  let weatherStop = false;
  if (night) {
    const exposed = !!t && (t.tpi >= 15 || t.meanHorizon < 4);
    const dirName = compassName(night.windFromDeg);
    const wind = `${dirName} wind, gusts up to ${Math.round(night.maxGustKmh)} km/h`;
    const wx = (x: Factor) => f.push({ ...x, wx: true });

    if (night.thunder) {
      weatherStop = true;
      wx({ tone: 'bad', score: exposed ? -4 : -3, title: 'Thunderstorm forecast', text: (exposed ? 'Thunderstorms are forecast and the spot is exposed. Lightning makes this unsafe: do not camp on a ridge, top or open slope.' : 'Thunderstorms are forecast. Avoid camping on exposed ground or under isolated trees, and keep away from the tallest point around.') + nearestHutNote(input.shelters) });
    }
    if (night.maxGustKmh >= 80) {
      weatherStop = true;
      wx({ tone: 'bad', score: -3, title: 'Storm-force gusts', text: `${wind}. A tent will not hold at this strength.${nearestHutNote(input.shelters)}` });
    } else if (t) {
      const upwind = horizonToward(t.horizon, night.windFromDeg);
      if (night.maxGustKmh >= 50 && upwind < 5) wx({ tone: 'bad', score: -2, title: 'Strong wind forecast, open to it', text: `${wind} tonight, and the terrain to the ${dirName} is open (horizon ${upwind.toFixed(0)}°).` });
      else if (night.maxGustKmh >= 50 && upwind >= 10) wx({ tone: 'warn', score: 0, title: 'Strong wind forecast, sheltered from it', text: `${wind}, but the ground to the ${dirName} rises ${upwind.toFixed(0)}°, which should shelter the tent.` });
      else if (night.maxGustKmh >= 50) wx({ tone: 'warn', score: -1, title: 'Strong wind forecast', text: `${wind}. Only partial shelter to the ${dirName}.` });
      else if (night.maxGustKmh >= 30 && upwind < 5) wx({ tone: 'warn', score: -1, title: 'Breezy and open to it', text: `${wind}, and the terrain to the ${dirName} is open.` });
      else wx({ tone: 'ok', score: night.maxGustKmh < 30 ? 1 : 0, title: night.maxGustKmh < 30 ? 'Calm night forecast' : 'Moderate wind', text: `${wind}.` });
    } else {
      wx({ tone: night.maxGustKmh >= 50 ? 'warn' : 'info', score: night.maxGustKmh >= 50 ? -1 : 0, title: 'Wind', text: `${wind}.` });
    }

    // cold, frost, snow
    const cold = night.minTempC;
    wx({
      tone: cold <= -10 ? 'bad' : cold <= -3 ? 'warn' : 'info',
      score: cold <= -10 ? -2 : cold <= -5 ? -1 : cold >= 8 ? 1 : 0,
      title: `Low of ${Math.round(cold)} °C`,
      text: cold <= -10 ? 'Severe cold: only for a winter or expedition setup.' : cold <= 0 ? 'Freezing overnight: bring a winter sleeping bag, expect frost on the tent, and keep water bottles inside.' : cold >= 8 ? 'A mild night.' : 'Forecast low at the spot’s elevation.',
    });
    if (night.snowCm !== undefined && night.snowCm >= 1) wx({ tone: 'warn', score: night.snowCm >= 5 ? -2 : -1, title: 'Snow forecast', text: `About ${night.snowCm.toFixed(0)} cm of new snow. It loads the tent, hides the ground and raises avalanche danger on steep slopes.` });
    else if (night.freezingLevelM !== undefined && t && night.freezingLevelM < t.elevation && night.precipMm >= 1) wx({ tone: 'warn', score: -1, title: 'Wet snow or ice possible', text: `The freezing level drops to about ${Math.round(night.freezingLevelM / 10) * 10} m, below the spot (${Math.round(t.elevation / 10) * 10} m), and precipitation is forecast.` });

    // rain
    if (night.precipMm >= 1) {
      const p = night.maxPrecipProb !== undefined ? ` (up to ${Math.round(night.maxPrecipProb)} % chance)` : '';
      wx({ tone: 'warn', score: night.precipMm >= 10 ? -3 : night.precipMm >= 5 ? -2 : -1, title: night.precipMm >= 10 ? 'Heavy rain forecast' : 'Rain forecast', text: `About ${night.precipMm.toFixed(1)} mm overnight${p}. Avoid hollows, stream beds and slopes that drain across the spot.` });
    } else if (night.maxPrecipProb !== undefined && night.maxPrecipProb >= 50) {
      wx({ tone: 'info', score: 0, title: 'Showers possible', text: `Up to ${Math.round(night.maxPrecipProb)} % chance of rain, but little expected (${night.precipMm.toFixed(1)} mm).` });
    } else if (night.precipMm < 0.2) {
      wx({ tone: 'ok', score: 1, title: 'Dry night forecast', text: 'No rain expected.' });
    }

    // fog and condensation
    if (night.minDewSpreadC !== undefined && night.minDewSpreadC <= 1.5 && night.precipMm < 1) wx({ tone: 'info', score: 0, title: 'Fog or heavy condensation likely', text: 'The air will be saturated. Expect a wet tent and sleeping bag; use a ventilated pitch and keep gear dry.' });
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

  // water: proximity is one of the main criteria, and the type of water matters
  if (input.water) {
    const w = input.water;
    const what = w.kind === 'lake' ? 'lake' : 'stream';
    const label = w.name ? `${what} ${w.name}` : what;
    const treat = ' Treat or filter all surface water before drinking: livestock and wildlife can contaminate it.';
    const wAt = w.at ? { ...w.at, label: w.name ? `${what} ${w.name}` : `Nearest ${what}` } : undefined;
    if (w.failed.includes('water')) missing.push('water');
    else if (w.kind === 'none') f.push({ tone: 'warn', score: -1, title: 'No water found nearby', text: `No stream or lake within 800 m in the hydrography map. Carry all the water you need, and check for springs.` });
    else if (w.meters <= 20) f.push({ tone: 'warn', score: 1, at: wAt, title: 'Water right beside the spot', text: `A ${label} is about ${m(w.meters)} away. Handy, but noisy, damp and prone to flooding in heavy rain; camp a bit higher if you can.${treat}` });
    else if (w.meters <= 150) f.push({ tone: 'ok', score: 2, at: wAt, title: 'Water close by', text: `A ${label} about ${m(w.meters)} away.${treat}` });
    else if (w.meters <= 400) f.push({ tone: 'ok', score: 1, at: wAt, title: 'Water within 400 m', text: `A ${label} about ${m(w.meters)} away.${treat}` });
    else f.push({ tone: 'info', score: 0, at: wAt, title: 'Water 400 to 800 m away', text: `A ${label} about ${m(w.meters)} away: a walk to fetch water.${treat}` });

    if (w.kind !== 'none') {
      if (w.glacierM !== undefined && w.glacierM <= 1000)
        f.push({ tone: 'warn', score: 0, title: 'Glacier water', text: `Glacier ice lies within 1 km of this water, so it probably carries meltwater: very cold and milky with rock flour, and its level rises in the afternoon and evening on warm days. Let it settle or filter it, and do not camp beside it.` });
      else if (w.glacierM !== undefined)
        f.push({ tone: 'info', score: 0, title: 'Possibly glacier water', text: 'Glacier ice lies within 3 km of this water, so it may carry meltwater (cold, milky). Judged from distance only: the map does not say where the water comes from.' });
      const plant = w.upstreamPlants[0];
      if (plant)
        f.push({
          tone: 'bad',
          score: -1,
          title: 'Dirty water: treated sewage upstream',
          text: `The ${plant.name} treatment plant discharges into the same watercourse${plant.receiving ? ` (${plant.receiving})` : ''} about ${(plant.meters / 1000).toFixed(1)} km upstream${plant.sharePct !== undefined ? `, and treated wastewater is about ${plant.sharePct.toFixed(0)} % of its low flow` : ''}. Do not use this water for drinking or cooking.`,
        });
      if (w.failed.includes('plants')) missing.push('treatment plants upstream');
      if (w.failed.includes('glacier')) missing.push('glacier water check');
    }
  } else missing.push('water');

  // shelter: where to go if the weather turns or someone is hurt
  if (input.shelters) {
    const sh = input.shelters.shelters;
    const hut = sh.find((x) => x.kind === 'hut' || x.kind === 'biwak');
    const inn = sh.find((x) => x.kind === 'inn');
    const alp = sh.find((x) => x.kind === 'alp' && x.meters <= 3000);
    const check = ' Distances are in a straight line, not walking times. Many huts are staffed only in summer; a winter room or bivouac box may be the only part open, so check before you rely on it.';
    const label = (x: { name: string; kind: string; club?: boolean }) => (x.kind === 'biwak' ? `Bivouac shelter ${x.name}` : x.club ? `${x.name} (club hut)` : x.name);
    if (hut && hut.meters <= 1500) f.push({ tone: 'ok', score: 1, at: { ...hut.at, label: hut.name }, title: hut.kind === 'biwak' ? 'Bivouac shelter nearby' : 'Mountain hut nearby', text: `${label(hut)} is about ${km(hut.meters)} away.${check}` });
    else if (hut) f.push({ tone: 'info', score: 0, at: { ...hut.at, label: hut.name }, title: 'Mountain hut within 5 km', text: `${label(hut)} is about ${km(hut.meters)} away.${check}` });
    else if (!input.shelters.incomplete) f.push({ tone: 'info', score: 0, title: 'No hut within 5 km', text: 'No mountain hut or bivouac shelter is mapped within 5 km. Plan to be self-sufficient: in bad weather or after an injury shelter may be far away.' });
    else missing.push('huts nearby');
    if (inn && (!hut || inn.meters < hut.meters)) f.push({ tone: 'info', score: 0, at: { ...inn.at, label: inn.name }, title: 'Mountain inn nearby', text: `${inn.name} is about ${km(inn.meters)} away. Inns and restaurants are usually open only in season.` });
    if (alp) f.push({ tone: 'info', score: 0, at: { ...alp.at, label: alp.name }, title: 'Alp nearby', text: `${alp.name} lies about ${km(alp.meters)} away. Alp buildings are usually private and locked outside the summer season, so they are not a dependable emergency shelter, but in season someone there can help. Livestock may be around.` });
  } else missing.push('huts nearby');

  // sun
  if (sun?.sunrise && sun.sunOnSpot) {
    const delay = Math.round((sun.sunOnSpot.getTime() - sun.sunrise.getTime()) / 60000);
    const at = formatLocalTime(sun.sunOnSpot);
    const flat = formatLocalTime(sun.sunrise);
    if (delay <= 20) f.push({ tone: 'ok', score: 1, title: 'Early morning sun', text: `Sun reaches the spot about ${at} (sunrise ${flat}).` });
    else f.push({ tone: 'info', score: 0, title: `Morning sun at ${at}`, text: `Sunrise is ${flat}, but the terrain hides the sun until about ${at}.` });
  }

  const score = f.reduce((a, x) => a + x.score, 0);
  const weatherScore = f.filter((x) => x.wx).reduce((a, x) => a + x.score, 0);
  const good = f.filter((x) => x.score > 0).map((x) => x.title.toLowerCase());
  const bad = f.filter((x) => x.score < 0).map((x) => x.title.toLowerCase());
  const summary = [good.length ? `For: ${good.slice(0, 3).join(', ')}` : '', bad.length ? `Against: ${bad.slice(0, 3).join(', ')}` : ''].filter(Boolean).join('. ') || 'Nothing stands out either way';
  return {
    rating: weatherStop ? 'poor' : rate(score),
    spotRating: rate(score - weatherScore),
    weatherScore,
    weatherStop,
    score,
    summary,
    factors: f.map(({ score: _s, wx: _w, ...item }) => item),
    missing,
  };
}
