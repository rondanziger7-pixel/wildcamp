import type { Item } from '../assess';
import { compassName, type Night } from './weather';
import { formatLocalTime, type SunTimes } from './sun';
import type { MoonNight } from './moon';
import type { NoiseInfo } from './noise';
import type { HazardInfo } from './hazards';
import { horizonToward, type TerrainMetrics } from './terrain';
import type { Surroundings } from './surroundings';
import type { WaterInfo } from './water';
import type { ShelterResult } from './shelters';
import type { GroundInfo } from './ground';
import { LEVEL_NAME, bandText, problemText, type AvalancheInfo } from './avalanche';
import { lower, tr } from '../i18n';

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
  /** Every factor, spot and weather together. */
  factors: Item[];
  /** The part of `factors` that comes from the forecast for the chosen night. */
  weatherFactors: Item[];
  /** The part of `factors` that belongs to the spot itself. */
  spotFactors: Item[];
  /** Which checks could not be made, shown so a missing check is not read as a good one. */
  missing: string[];
}

export interface ComfortInput {
  terrain?: TerrainMetrics;
  night?: Night;
  surroundings?: Partial<Surroundings>;
  /** Nearest water, glacier and treatment-plant flags. */
  water?: WaterInfo;
  /** Ground cover (grass, rock, scree …) from the land-cover statistics. */
  ground?: GroundInfo;
  /** The avalanche bulletin's reading for the spot. */
  avalanche?: AvalancheInfo;
  /** The hazard lookup failed altogether. */
  hazardsFailed?: boolean;
  /** The noise lookup failed altogether. */
  noiseFailed?: boolean;
  /** The bulletin could not be fetched (so its absence is not read as "no danger"). */
  avalancheFailed?: boolean;
  /** Huts, bivouac boxes, inns and alps nearby. */
  shelters?: ShelterResult;
  sun?: SunTimes;
  /** Sun times of the evening the night begins (for evening sun at the spot). */
  eveningSun?: SunTimes;
  /** National hazard indications at the spot (flood, rockfall, landslide, debris flow). */
  hazards?: HazardInfo;
  /** Modelled night-time road and rail noise. */
  noise?: NoiseInfo;
  /** The moon over the chosen night. */
  moon?: MoonNight;
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
  return h ? ' ' + tr('The nearest hut, {name}, is about {dist} away in a straight line.', { name: h.name, dist: km(h.meters) }) : '';
}

/**
 * A `missing` entry (its English text is the key the code compares with) in the current language.
 * The entries stay English in `Comfort.missing`; the interface translates them when it shows them.
 */
export function missingText(key: string): string {
  switch (key) {
    case 'terrain (slope, wind shelter, hazards)':
      return tr('terrain (slope, wind shelter, hazards)');
    case 'overnight forecast':
      return tr('overnight forecast');
    case 'crowds (trails, huts, transport)':
      return tr('crowds (trails, huts, transport)');
    case 'water':
      return tr('water');
    case 'treatment plants upstream':
      return tr('treatment plants upstream');
    case 'glacier water check':
      return tr('glacier water check');
    case 'huts nearby':
      return tr('huts nearby');
    case 'avalanche bulletin':
      return tr('avalanche bulletin');
    case 'night noise':
      return tr('night noise');
    case 'natural hazards':
      return tr('natural hazards');
    case 'ground cover (rock or grass)':
      return tr('ground cover (rock or grass)');
    default:
      return tr(key);
  }
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
    const deg = sl.toFixed(0);
    if (sl < 5) f.push({ tone: 'ok', score: 1, title: tr('Flat ground'), text: tr('Slope about {deg}° over 20 m. Small bumps and rocks are not in the elevation data.', { deg }) });
    else if (sl < 10) f.push({ tone: 'info', score: 0, title: tr('Slightly sloping'), text: tr('Slope about {deg}° over 20 m. Look for a flatter patch close by.', { deg }) });
    else if (sl < 15) f.push({ tone: 'warn', score: -1, title: tr('Sloping ground'), text: tr('Slope about {deg}° over 20 m. You will slide in the tent; find a flatter spot.', { deg }) });
    else f.push({ tone: 'bad', score: -2, title: tr('Too steep to pitch'), text: tr('Slope about {deg}° over 20 m.', { deg }) });

    // wind shelter from terrain
    const ridge = t.tpi >= 15 && t.meanHorizon < 3;
    const hollow = t.tpi <= -15;
    const horizon = t.meanHorizon.toFixed(0);
    if (ridge) f.push({ tone: 'bad', score: -2, title: tr('Exposed ridge or top'), text: tr('About {height} m above the ground around it and open in every direction. Fully exposed to wind, and a lightning risk in thunderstorms.', { height: Math.round(t.tpi) }) });
    else if (t.meanHorizon >= 10) f.push({ tone: 'ok', score: 1, title: tr('Sheltered by terrain'), text: tr('The ground rises about {deg}° on average around the spot, which blocks much of the wind. Trees and rock are not counted.', { deg: horizon }) });
    else if (t.meanHorizon >= 4) f.push({ tone: 'info', score: 0, title: tr('Some shelter'), text: tr('The ground rises about {deg}° on average around the spot. Wind from open directions will still reach the tent.', { deg: horizon }) });
    else f.push({ tone: 'warn', score: -1, title: tr('Open to wind'), text: tr('Little terrain around the spot (average horizon {deg}°). Expect wind.', { deg: horizon }) });
    if (inForest) f.push({ tone: 'info', score: 0, title: tr('Trees nearby'), text: tr('The spot is in forest, which adds wind shelter. Check for dead branches above the tent.') });
    if (hollow) f.push({ tone: 'warn', score: -1, title: tr('In a hollow'), text: tr('About {depth} m lower than the ground around it. Cold air and damp collect in hollows on clear nights, so frost and condensation are likely.', { depth: Math.round(-t.tpi) }) });

    // hazards from slope
    if (t.dropNearM !== undefined) f.push({ tone: 'bad', score: -2, title: tr('Steep drop close by'), text: tr('The ground falls away steeply about {dist} away. Dangerous in the dark.', { dist: m(t.dropNearM) }) });
    if (t.steepAboveM !== undefined)
      f.push({ tone: 'warn', score: -1, title: tr('Steep slope above'), text: tr('A slope of 30° or more rises about {dist} away. Possible rockfall, and avalanche runout if there is snow.', { dist: m(t.steepAboveM) }) });
  } else missing.push('terrain (slope, wind shelter, hazards)');

  // the weather for the chosen night
  let weatherStop = false;
  if (night) {
    const exposed = !!t && (t.tpi >= 15 || t.meanHorizon < 4);
    const dirName = compassName(night.windFromDeg);
    const wind = tr('{dir} wind, gusts up to {gust} km/h', { dir: dirName, gust: Math.round(night.maxGustKmh) });
    const wx = (x: Factor) => f.push({ ...x, wx: true });

    if (night.thunder) {
      weatherStop = true;
      wx({ tone: 'bad', score: exposed ? -4 : -3, title: tr('Thunderstorm forecast'), text: (exposed ? tr('Thunderstorms are forecast and the spot is exposed. Lightning makes this unsafe: do not camp on a ridge, top or open slope.') : tr('Thunderstorms are forecast. Avoid camping on exposed ground or under isolated trees, and keep away from the tallest point around.')) + nearestHutNote(input.shelters) });
    }
    if (night.maxGustKmh >= 80) {
      weatherStop = true;
      wx({ tone: 'bad', score: -3, title: tr('Storm-force gusts'), text: `${wind}. ${tr('A tent will not hold at this strength.')}${nearestHutNote(input.shelters)}` });
    } else if (t) {
      const upwind = horizonToward(t.horizon, night.windFromDeg);
      if (night.maxGustKmh >= 50 && upwind < 5) wx({ tone: 'bad', score: -2, title: tr('Strong wind forecast, open to it'), text: tr('{wind} tonight, and the terrain to the {dir} is open (horizon {deg}°).', { wind, dir: dirName, deg: upwind.toFixed(0) }) });
      else if (night.maxGustKmh >= 50 && upwind >= 10) wx({ tone: 'warn', score: 0, title: tr('Strong wind forecast, sheltered from it'), text: tr('{wind}, but the ground to the {dir} rises {deg}°, which should shelter the tent.', { wind, dir: dirName, deg: upwind.toFixed(0) }) });
      else if (night.maxGustKmh >= 50) wx({ tone: 'warn', score: -1, title: tr('Strong wind forecast'), text: tr('{wind}. Only partial shelter to the {dir}.', { wind, dir: dirName }) });
      else if (night.maxGustKmh >= 30 && upwind < 5) wx({ tone: 'warn', score: -1, title: tr('Breezy and open to it'), text: tr('{wind}, and the terrain to the {dir} is open.', { wind, dir: dirName }) });
      else wx({ tone: 'ok', score: night.maxGustKmh < 30 ? 1 : 0, title: night.maxGustKmh < 30 ? tr('Calm night forecast') : tr('Moderate wind'), text: `${wind}.` });
    } else {
      wx({ tone: night.maxGustKmh >= 50 ? 'warn' : 'info', score: night.maxGustKmh >= 50 ? -1 : 0, title: tr('Wind'), text: `${wind}.` });
    }

    // cold, frost, snow
    const cold = night.minTempC;
    wx({
      tone: cold <= -10 ? 'bad' : cold <= -3 ? 'warn' : 'info',
      score: cold <= -10 ? -2 : cold <= -5 ? -1 : cold >= 8 ? 1 : 0,
      title: tr('Low of {t} °C', { t: Math.round(cold) }),
      text: cold <= -10 ? tr('Severe cold: only for a winter or expedition setup.') : cold <= 0 ? tr('Freezing overnight: bring a winter sleeping bag, expect frost on the tent, and keep water bottles inside.') : cold >= 8 ? tr('A mild night.') : tr('Forecast low at the spot’s elevation.'),
    });
    if (night.snowCm !== undefined && night.snowCm >= 1) wx({ tone: 'warn', score: night.snowCm >= 5 ? -2 : -1, title: tr('Snow forecast'), text: tr('About {cm} cm of new snow. It loads the tent, hides the ground and raises avalanche danger on steep slopes.', { cm: night.snowCm.toFixed(0) }) });
    else if (night.freezingLevelM !== undefined && t && night.freezingLevelM < t.elevation && night.precipMm >= 1) wx({ tone: 'warn', score: -1, title: tr('Wet snow or ice possible'), text: tr('The freezing level drops to about {level} m, below the spot ({elev} m), and precipitation is forecast.', { level: Math.round(night.freezingLevelM / 10) * 10, elev: Math.round(t.elevation / 10) * 10 }) });

    // rain
    if (night.precipMm >= 1) {
      const p = night.maxPrecipProb !== undefined ? ' ' + tr('(up to {p} % chance)', { p: Math.round(night.maxPrecipProb) }) : '';
      wx({ tone: 'warn', score: night.precipMm >= 10 ? -3 : night.precipMm >= 5 ? -2 : -1, title: night.precipMm >= 10 ? tr('Heavy rain forecast') : tr('Rain forecast'), text: tr('About {mm} mm overnight{chance}. Avoid hollows, stream beds and slopes that drain across the spot.', { mm: night.precipMm.toFixed(1), chance: p }) });
    } else if (night.maxPrecipProb !== undefined && night.maxPrecipProb >= 50) {
      wx({ tone: 'info', score: 0, title: tr('Showers possible'), text: tr('Up to {p} % chance of rain, but little expected ({mm} mm).', { p: Math.round(night.maxPrecipProb), mm: night.precipMm.toFixed(1) }) });
    } else if (night.precipMm < 0.2) {
      wx({ tone: 'ok', score: 1, title: tr('Dry night forecast'), text: tr('No rain expected.') });
    }

    // fog and condensation
    if (night.minDewSpreadC !== undefined && night.minDewSpreadC <= 1.5 && night.precipMm < 1) wx({ tone: 'info', score: 0, title: tr('Fog or heavy condensation likely'), text: tr('The air will be saturated. Expect a wet tent and sleeping bag; use a ventilated pitch and keep gear dry.') });
    // ground frost: on clear, calm nights the ground and the tent are colder than the forecast air temperature at 2 m,
    // and cold air collects in hollows. Rule-of-thumb numbers, not a measurement.
    const cloud = night.meanCloud;
    if (cloud !== undefined && night.minTempC > 0 && night.minTempC <= 8) {
      const clearTerm = cloud <= 30 ? 3 : cloud <= 60 ? 1.5 : 0;
      const calm = night.meanWindKmh <= 10 ? 1 : night.meanWindKmh <= 20 ? 0.5 : 0;
      const hollow = t ? (t.tpi <= -30 ? 2 : t.tpi <= -15 ? 1 : 0) : 0;
      const groundLow = night.minTempC - clearTerm * calm - hollow;
      if (groundLow <= 0)
        wx({
          tone: 'warn',
          score: -1,
          title: tr('Ground frost likely'),
          text: tr('The forecast low is {low} °C at 2 m, but with {sky}, {air}{hollow} the ground and tent can drop to about {ground} °C: frost on the tent and a stiff, damp morning. Camp on a slight rise or a slope instead of the lowest ground, and use a warmer bag than the forecast suggests.', {
            low: night.minTempC.toFixed(1),
            sky: cloud <= 30 ? tr('a clear sky') : tr('a partly clear sky'),
            air: night.meanWindKmh <= 10 ? tr('calm air') : tr('light wind'),
            hollow: hollow ? ' ' + tr('and cold air pooling in a hollow') : '',
            ground: groundLow.toFixed(0),
          }),
        });
    }
  } else missing.push('overnight forecast');

  // crowds
  if (s && (s.trailM !== undefined || s.stops || s.huts)) {
    const found: string[] = [];
    let busy = 0;
    if (s.trailM !== undefined && s.trailM < 50) {
      busy += s.trailM < 10 ? 2 : 1;
      found.push(s.trailM < 10 ? tr('on a marked hiking trail') : tr('{dist} from a marked hiking trail', { dist: m(s.trailM) }));
    }
    const hut = s.huts?.[0];
    if (hut && hut.meters <= 400) {
      busy++;
      found.push(tr('{name} {dist} away', { name: hut.name, dist: m(hut.meters) }));
    }
    const stop = s.stops?.[0];
    if (stop && stop.meters <= 500) {
      busy++;
      found.push(tr('{kind} stop “{name}” {dist} away', { kind: stop.kind.toLowerCase(), name: stop.name, dist: m(stop.meters) }));
    }
    if (s.parkingM !== undefined && s.parkingM <= 400) {
      busy++;
      found.push(tr('car park {dist} away', { dist: m(s.parkingM) }));
    }
    if (s.settlementM !== undefined && s.settlementM <= 400) {
      busy++;
      found.push(tr('houses or a village {dist} away', { dist: m(s.settlementM) }));
    }
    if (busy) f.push({ tone: busy >= 2 ? 'bad' : 'warn', score: -Math.min(busy, 2), title: tr('Likely busy'), text: tr('{found}. Expect passers-by and noise. This is judged from distances only; there are no visitor counts.', { found: found.join('; ') }) });
    else f.push({ tone: 'ok', score: 1, title: tr('Likely quiet'), text: tr('No marked trail within 50 m and no hut, stop, car park or village within 400 m. Judged from distances only; weekends and holidays are busier.') });
  } else missing.push('crowds (trails, huts, transport)');

  // water: proximity is one of the main criteria, and the type of water matters
  if (input.water) {
    const w = input.water;
    const what = w.kind === 'lake' ? tr('lake') : tr('stream');
    const label = w.name ? `${what} ${w.name}` : what;
    const treat = ' ' + tr('Treat or filter all surface water before drinking: livestock and wildlife can contaminate it.');
    const wAt = w.at ? { ...w.at, label: w.name ? `${what} ${w.name}` : w.kind === 'lake' ? tr('Nearest lake') : tr('Nearest stream') } : undefined;
    if (w.failed.includes('water')) missing.push('water');
    else if (w.kind === 'none') f.push({ tone: 'warn', score: -1, title: tr('No water found nearby'), text: tr('No stream or lake within 800 m in the hydrography map. Carry all the water you need, and check for springs.') });
    else if (w.meters <= 20) f.push({ tone: 'warn', score: 1, at: wAt, title: tr('Water right beside the spot'), text: tr('A {label} is about {dist} away. Handy, but noisy, damp and prone to flooding in heavy rain; camp a bit higher if you can.', { label, dist: m(w.meters) }) + treat });
    else if (w.meters <= 150) f.push({ tone: 'ok', score: 2, at: wAt, title: tr('Water close by'), text: tr('A {label} about {dist} away.', { label, dist: m(w.meters) }) + treat });
    else if (w.meters <= 400) f.push({ tone: 'ok', score: 1, at: wAt, title: tr('Water within 400 m'), text: tr('A {label} about {dist} away.', { label, dist: m(w.meters) }) + treat });
    else f.push({ tone: 'info', score: 0, at: wAt, title: tr('Water 400 to 800 m away'), text: tr('A {label} about {dist} away: a walk to fetch water.', { label, dist: m(w.meters) }) + treat });

    if (w.kind !== 'none') {
      if (w.glacierM !== undefined && w.glacierM <= 1000)
        f.push({ tone: 'warn', score: 0, title: tr('Glacier water'), text: tr('Glacier ice lies within 1 km of this water, so it probably carries meltwater: very cold and milky with rock flour, and its level rises in the afternoon and evening on warm days. Let it settle or filter it, and do not camp beside it.') });
      else if (w.glacierM !== undefined)
        f.push({ tone: 'info', score: 0, title: tr('Possibly glacier water'), text: tr('Glacier ice lies within 3 km of this water, so it may carry meltwater (cold, milky). Judged from distance only: the map does not say where the water comes from.') });
      const plant = w.upstreamPlants[0];
      if (plant)
        f.push({
          tone: 'bad',
          score: -1,
          title: tr('Dirty water: treated sewage upstream'),
          text: tr('The {name} treatment plant discharges into the same watercourse{receiving} about {km} km upstream{share}. Do not use this water for drinking or cooking.', {
            name: plant.name,
            receiving: plant.receiving ? ` (${plant.receiving})` : '',
            km: (plant.meters / 1000).toFixed(1),
            share: plant.sharePct !== undefined ? ', ' + tr('and treated wastewater is about {pct} % of its low flow', { pct: plant.sharePct.toFixed(0) }) : '',
          }),
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
    const check = ' ' + tr('Distances are in a straight line, not walking times. Many huts are staffed only in summer; a winter room or bivouac box may be the only part open, so check before you rely on it.');
    const label = (x: { name: string; kind: string; club?: boolean }) => (x.kind === 'biwak' ? tr('Bivouac shelter {name}', { name: x.name }) : x.club ? tr('{name} (club hut)', { name: x.name }) : x.name);
    if (hut && hut.meters <= 1500) f.push({ tone: 'ok', score: 1, at: { ...hut.at, label: hut.name }, title: hut.kind === 'biwak' ? tr('Bivouac shelter nearby') : tr('Mountain hut nearby'), text: tr('{label} is about {dist} away.', { label: label(hut), dist: km(hut.meters) }) + check });
    else if (hut) f.push({ tone: 'info', score: 0, at: { ...hut.at, label: hut.name }, title: tr('Mountain hut within 5 km'), text: tr('{label} is about {dist} away.', { label: label(hut), dist: km(hut.meters) }) + check });
    else if (!input.shelters.incomplete) f.push({ tone: 'info', score: 0, title: tr('No hut within 5 km'), text: tr('No mountain hut or bivouac shelter is mapped within 5 km. Plan to be self-sufficient: in bad weather or after an injury shelter may be far away.') });
    else missing.push('huts nearby');
    if (inn && (!hut || inn.meters < hut.meters)) f.push({ tone: 'info', score: 0, at: { ...inn.at, label: inn.name }, title: tr('Mountain inn nearby'), text: tr('{name} is about {dist} away. Inns and restaurants are usually open only in season.', { name: inn.name, dist: km(inn.meters) }) });
    if (alp) f.push({ tone: 'info', score: 0, at: { ...alp.at, label: alp.name }, title: tr('Alp nearby'), text: tr('{name} lies about {dist} away. Alp buildings are usually private and locked outside the summer season, so they are not a dependable emergency shelter, but in season someone there can help. Livestock may be around.', { name: alp.name, dist: km(alp.meters) }) });
  } else missing.push('huts nearby');

  // snow on the ground and the avalanche bulletin: conditions of the season, counted with the weather
  if (night?.snowDepthM !== undefined && night.snowDepthM >= 0.05) {
    const cm = Math.round(night.snowDepthM * 100);
    f.push({ wx: true, tone: 'warn', score: cm >= 30 ? -2 : -1, title: tr('Snow on the ground: about {cm} cm', { cm }), text: tr('The forecast model has about {cm} cm of snow at this elevation. Pitching on snow is cold and slow, it hides the ground and its hazards, and pegs do not hold. This is a model value for the spot\'s elevation, not a measurement: slopes and wind-blown ridges differ a lot.', { cm }) });
  }
  const av = input.avalanche;
  if (av?.status === 'ok' && av.level !== undefined) {
    const steep = !!t && (t.steepAboveM !== undefined || t.slopeDeg >= 25);
    const later = night && av.validUntilLocal && night.from > av.validUntilLocal;
    const name = `${tr(LEVEL_NAME[av.level]!)} (${av.level}${av.subdivision === 'plus' ? '+' : av.subdivision === 'minus' ? '-' : ''})`;
    const probs = (av.problems ?? []).map((p) => {
      const band = bandText(p.above, p.below);
      return p.aspects.length ? tr('{type} on {aspects} slopes {band}', { type: problemText(p.type), aspects: p.aspects.map((a) => tr(a)).join(', '), band }) : `${problemText(p.type)} ${band}`;
    });
    const where = av.region ? ' ' + tr('for {region}', { region: av.region }) : '';
    const until = av.validUntilLocal?.replace('T', ' ') ?? '';
    const steepNote = steep ? ' ' + tr('Steep terrain is close to this spot.') : '';
    const detail = `${probs.length ? ' ' + tr('Problems: {list}.', { list: probs.join('; ') }) : ''} ${tr('Valid until {time}. The level is for the most dangerous slopes of the region; flat ground away from steep slopes is much safer, but a slope of 30 degrees or more above or near the tent, and runout zones below one, are not.', { time: until })}`;
    if (later) f.push({ wx: true, tone: 'info', score: 0, title: tr('Avalanche bulletin ends before this night'), text: tr('The current bulletin{where} ends {time}, before this night begins. Read the new bulletin on the day (slf.ch).', { where, time: until }) });
    else if (av.level >= 4) f.push({ wx: true, tone: 'bad', score: steep ? -4 : -2, title: tr('Avalanche danger {name}', { name }), text: tr('High avalanche danger{where}.{steep}{detail} Stay out of avalanche terrain altogether.', { where, steep: steepNote, detail }) });
    else if (av.level === 3) f.push({ wx: true, tone: 'warn', score: steep ? -2 : -1, title: tr('Avalanche danger {name}', { name }), text: tr('Considerable avalanche danger{where}.{steep}{detail}', { where, steep: steepNote, detail }) });
    else f.push({ wx: true, tone: 'info', score: 0, title: tr('Avalanche danger {name}', { name }), text: av.level === 2 ? tr('Moderate avalanche danger{where}.{detail}', { where, detail }) : tr('Low avalanche danger{where}.{detail}', { where, detail }) });
  } else if (av?.status === 'none' && (t?.elevation ?? 0) >= 1800) {
    f.push({ wx: true, tone: 'info', score: 0, title: tr('No avalanche bulletin'), text: tr('The SLF publishes its avalanche bulletin only in the winter season. None is current now, so avalanche danger is not rated; if there is snow on steep slopes, judge it yourself.') });
  } else if (av?.status === 'outside') {
    f.push({ wx: true, tone: 'info', score: 0, title: tr('Not covered by the avalanche bulletin'), text: tr('The SLF bulletin has no warning region at this spot.') });
  }

  if (input.avalancheFailed) missing.push('avalanche bulletin');

  // night noise from roads and railways (modelled, BAFU), and livestock bells near alps in the grazing season
  const nz = input.noise;
  if (nz) {
    for (const [what, db] of [['Road', nz.roadDb], ['Rail', nz.railDb]] as const) {
      if (db === undefined) continue;
      const v = Math.round(db);
      const road = what === 'Road';
      if (v >= 55) f.push({ tone: 'bad', score: -2, title: road ? tr('Road noise at night: {v} dB(A)', { v }) : tr('Rail noise at night: {v} dB(A)', { v }), text: road ? tr('Modelled road noise here is about {v} dB(A) at night, loud enough to keep many people awake outdoors (above the 50 dB(A) night planning value of the noise ordinance for housing). Move away from the road.', { v }) : tr('Modelled rail noise here is about {v} dB(A) at night, loud enough to keep many people awake outdoors (above the 50 dB(A) night planning value of the noise ordinance for housing). Move away from the rail.', { v }) });
      else if (v >= 45) f.push({ tone: 'warn', score: -1, title: road ? tr('Road noise at night: {v} dB(A)', { v }) : tr('Rail noise at night: {v} dB(A)', { v }), text: road ? tr('Modelled road noise here is about {v} dB(A) at night: clearly audible from the tent. Earplugs help, distance and a ridge between you and it help more.', { v }) : tr('Modelled rail noise here is about {v} dB(A) at night: clearly audible from the tent. Earplugs help, distance and a ridge between you and it help more.', { v }) });
      else if (v >= 35) f.push({ tone: 'info', score: 0, title: road ? tr('Faint road noise at night: {v} dB(A)', { v }) : tr('Faint rail noise at night: {v} dB(A)', { v }), text: road ? tr('Modelled road noise is about {v} dB(A) at night, faint background. Modelled from traffic counts, not measured.', { v }) : tr('Modelled rail noise is about {v} dB(A) at night, faint background. Modelled from traffic counts, not measured.', { v }) });
    }
    if (nz.roadDb === undefined && nz.railDb === undefined && !nz.failed.length) f.push({ tone: 'ok', score: 0, title: tr('No modelled traffic noise'), text: tr('The federal noise map (BAFU sonBASE) models no road or railway noise at this spot at night. It covers the road and rail networks, so aircraft, mountain huts, cableways and livestock are not in it.') });
  }
  if (nz?.failed.length || input.noiseFailed) missing.push('night noise');
  const alp = input.shelters?.shelters.find((x) => x.kind === 'alp');
  const month = night ? Number(night.from.slice(5, 7)) : undefined;
  if (alp && alp.meters <= 500 && month !== undefined && month >= 6 && month <= 9) {
    f.push({ tone: 'warn', score: -1, title: tr('Cowbells and livestock likely'), text: tr('{name} is mapped {dist} away. Alps are grazed roughly from June to September, and cattle bells and animals walking past can be heard and met at night. Camp well away from the herd and keep food and dogs under control.', { name: alp.name, dist: km(alp.meters) }) });
  }

  // natural hazards: coarse national indications (FOEN), not the cantonal hazard maps
  const hz = input.hazards;
  if (hz) {
    const has = (k: HazardInfo['inside'][number]) => hz.inside.includes(k);
    const src = ' ' + tr('Source: FOEN national hazard indication; a coarse model, not the cantonal hazard map, and a spot outside it is not guaranteed safe.');
    if (has('flood50')) f.push({ tone: 'bad', score: -2, title: tr('In a frequent flood area'), text: tr('The spot lies in the area flooded by a 50-year flood (Aquaprotect model). A summer thunderstorm or snowmelt can put it under water or bring debris. Camp on higher ground away from the stream.') + src });
    else if (has('flood100')) f.push({ tone: 'warn', score: -1, title: tr('In a flood area'), text: tr('The spot lies in the area flooded by a 100-year flood (Aquaprotect model). Rare, but a night of heavy rain or a thunderstorm upstream makes it worth camping higher.') + src });
    if (has('rockfall')) {
      const steep = !!t && (t.steepAboveM !== undefined || t.slopeDeg >= 25);
      f.push({ tone: steep ? 'warn' : 'info', score: steep ? -1 : 0, title: tr('In a rockfall area'), text: tr('A national indication map marks this spot inside a rockfall process area (release, fall or run-out).{steep} Do not pitch directly below cliffs, steep scree or gullies; look for fresh rock debris on the ground.', { steep: steep ? ' ' + tr('A steep slope rises close to the spot.') : '' }) + src });
    }
    if (has('landslide')) f.push({ tone: 'info', score: 0, title: tr('In a landslide-prone area'), text: tr('A national indication map marks this area as prone to shallow landslides, mainly after long rain or snowmelt on steep slopes. Avoid camping on or under steep wet slopes in bad weather.') + src });
    if (has('debris')) f.push({ tone: 'info', score: 0, title: tr('In a debris-flow area'), text: tr('A national indication map marks this area as reachable by debris flows (mud and rock surging down a gully after heavy rain). Do not camp in or at the mouth of a gully or stream channel when heavy rain is forecast.') + src });
    if (hz.failed.length) missing.push('natural hazards');
  } else if (input.hazardsFailed) missing.push('natural hazards');

  // ground cover: what the tent sits on
  const g = input.ground;
  if (g) {
    const near = g.meters > 50 ? ' ' + tr('The class comes from the survey point about {dist} away, so the ground right at the spot may differ.', { dist: m(g.meters) }) : '';
    const src = ' ' + tr('Land-cover statistics ({year}), read from aerial photos on a 100 m grid: a lawn or boulder field smaller than that is not seen.', { year: g.year }) + near;
    if (g.cover === 'grass') f.push({ tone: 'ok', score: 2, title: tr('Grassy ground'), text: tr('Grass and herb vegetation: soft to sleep on and pegs hold. Mornings are damp with dew, and on alps cows may graze or walk through.') + src });
    else if (g.cover === 'shrub') f.push({ tone: 'info', score: 0, title: tr('Shrubs and brush'), text: tr('{label}: uneven ground with bushes and tussocks. Look for a clear grassy patch.', { label: g.label }) + src });
    else if (g.cover === 'loose') f.push({ tone: 'warn', score: -2, title: tr('Stony ground'), text: tr('{label}: loose stones, scree or gravel. Hard to sleep on, pegs do not hold (weigh them down with rocks) and stones roll when it is steep. Clear a patch and use a good mat.', { label: g.label }) + src });
    else if (g.cover === 'rock') f.push({ tone: 'bad', score: -3, title: tr('Rocky ground'), text: tr('{label}: bare rock. Pegs will not go in and it is hard and cold to sleep on; you need a freestanding tent and a thick mat, or a grassy patch nearby.', { label: g.label }) + src });
    else if (g.cover === 'glacier') f.push({ tone: 'bad', score: -4, title: tr('On snow or ice'), text: tr('{label}: ice and firn. Cold from below, crevasses are possible and the surface moves. Not a place to pitch a tent.', { label: g.label }) + src });
    else if (g.cover === 'wet') f.push({ tone: 'warn', score: -2, title: tr('Wet ground'), text: tr('{label}: wetland, soft and damp, and easily damaged. Camp on drier ground.', { label: g.label }) + src });
    else if (g.cover === 'forest') f.push({ tone: 'info', score: 0, title: tr('Forest ground'), text: tr('{label}: needles and roots, usually soft but with roots and dead branches to check for.', { label: g.label }) + src });
    else if (g.cover === 'built') f.push({ tone: 'info', score: 0, title: tr('Built-up or paved ground'), text: tr('{label}: settled or paved land, not a pitch.', { label: g.label }) + src });
    else if (g.cover === 'water') f.push({ tone: 'warn', score: -2, title: tr('Open water'), text: tr('{label}: the nearest survey point is water.', { label: g.label }) + src });
  } else missing.push('ground cover (rock or grass)');

  // sun
  if (sun?.sunrise && sun.sunOnSpot) {
    const delay = Math.round((sun.sunOnSpot.getTime() - sun.sunrise.getTime()) / 60000);
    const at = formatLocalTime(sun.sunOnSpot);
    const flat = formatLocalTime(sun.sunrise);
    if (delay <= 20) f.push({ tone: 'ok', score: 1, title: tr('Early morning sun'), text: tr('Sun reaches the spot about {at} (sunrise {flat}).', { at, flat }) });
    else f.push({ tone: 'info', score: 0, title: tr('Morning sun at {at}', { at }), text: tr('Sunrise is {flat}, but the terrain hides the sun until about {at}.', { flat, at }) });
  }

  // evening sun: how long the sun stays on the spot before it sets
  const ev = input.eveningSun;
  if (ev?.sunset && ev.sunLeavesSpot) {
    const gap = Math.round((ev.sunset.getTime() - ev.sunLeavesSpot.getTime()) / 60000);
    const until = formatLocalTime(ev.sunLeavesSpot);
    const set = formatLocalTime(ev.sunset);
    if (gap <= 20) f.push({ tone: 'ok', score: 1, title: tr('Evening sun to sunset'), text: tr('Sun stays on the spot until about {until} (sunset {set}), good for drying gear and a warm evening.', { until, set }) });
    else if (gap >= 120) f.push({ tone: 'info', score: 0, title: tr('In shade from {until}', { until }), text: tr('The terrain hides the sun from about {until}, {hours} hours before sunset ({set}). Expect a cold, early evening here.', { until, hours: Math.round((gap / 60) * 10) / 10, set }) });
    else f.push({ tone: 'info', score: 0, title: tr('Evening sun until {until}', { until }), text: tr('Sun reaches the spot until about {until}; sunset is {set}.', { until, set }) });
  }

  // moon: information about the night sky, it does not change the score
  const mo = input.moon;
  if (mo) {
    const pct = Math.round(mo.illumination * 100);
    const dark = mo.upShare === 0 || mo.illumination < 0.15;
    const upText = mo.up ? tr('The moon is above the horizon from about {from} to {to}.', { from: mo.up.from, to: mo.up.to }) : tr('The moon stays below the horizon all night.');
    f.push({
      wx: true,
      tone: 'info',
      score: 0,
      title: mo.bright ? tr('Bright moonlight ({phase}, {pct} %)', { phase: lower(mo.phase), pct }) : dark ? tr('Dark sky ({phase}, {pct} %)', { phase: lower(mo.phase), pct }) : tr('{phase} ({pct} % lit)', { phase: mo.phase, pct }),
      text: `${upText} ${mo.bright ? tr('Easy to see by, and the stars will be washed out; light through the tent can wake light sleepers.') : dark ? tr('A good night for stargazing, but take a headlamp: it will be very dark.') : tr('Some moonlight, so not fully dark.')} ${tr('Moon phase and rise from a standard astronomical model; the terrain horizon is ignored.')}`,
    });
  }

  const score = f.reduce((a, x) => a + x.score, 0);
  const weatherScore = f.filter((x) => x.wx).reduce((a, x) => a + x.score, 0);
  const good = f.filter((x) => x.score > 0).map((x) => lower(x.title));
  const bad = f.filter((x) => x.score < 0).map((x) => lower(x.title));
  const summary = [good.length ? tr('For: {list}', { list: good.slice(0, 3).join(', ') }) : '', bad.length ? tr('Against: {list}', { list: bad.slice(0, 3).join(', ') }) : ''].filter(Boolean).join('. ') || tr('Nothing stands out either way');
  return {
    rating: weatherStop ? 'poor' : rate(score),
    spotRating: rate(score - weatherScore),
    weatherScore,
    weatherStop,
    score,
    summary,
    factors: f.map(({ score: _s, wx: _w, ...item }) => item),
    weatherFactors: f.filter((x) => x.wx).map(({ score: _s, wx: _w, ...item }) => item),
    spotFactors: f.filter((x) => !x.wx).map(({ score: _s, wx: _w, ...item }) => item),
    missing,
  };
}
