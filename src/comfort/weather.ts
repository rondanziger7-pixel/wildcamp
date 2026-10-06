import { dateLocale, tr } from '../i18n';

/** Forecast from Open-Meteo (https://open-meteo.com, CC BY 4.0), hourly values at the spot's elevation. */
export interface Hourly {
  time: string[];
  temperature_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  precipitation: (number | null)[];
  // Optional: requested in a second step and dropped if the service refuses them.
  precipitation_probability?: (number | null)[];
  weather_code?: (number | null)[];
  cloud_cover?: (number | null)[];
  snowfall?: (number | null)[];
  freezing_level_height?: (number | null)[];
  dew_point_2m?: (number | null)[];
  /** Modelled snow depth at the spot's elevation, metres. */
  snow_depth?: (number | null)[];
}

const CORE = ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation'];
const EXTRA = ['precipitation_probability', 'weather_code', 'cloud_cover', 'snowfall', 'freezing_level_height', 'dew_point_2m', 'snow_depth'];
export const FORECAST_DAYS = 5;

function forecastUrl(lat: number, lon: number, hourly: string[], elevation?: number) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: hourly.join(','),
    wind_speed_unit: 'kmh',
    timezone: 'Europe/Zurich',
    forecast_days: String(FORECAST_DAYS),
  });
  if (elevation !== undefined) q.set('elevation', String(Math.round(elevation)));
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

async function request(url: string, signal?: AbortSignal): Promise<Hourly> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`forecast ${res.status}`), { status: res.status });
  const body = (await res.json()) as { hourly?: Hourly };
  if (!body.hourly?.time) throw new Error('bad forecast');
  return body.hourly;
}

/** Core variables plus the extras; if the service rejects the extras (400) the core set alone is used. */
export async function fetchForecast(lat: number, lon: number, elevation?: number, signal?: AbortSignal): Promise<Hourly> {
  try {
    return await request(forecastUrl(lat, lon, [...CORE, ...EXTRA], elevation), signal);
  } catch (err) {
    if ((err as { status?: number }).status !== 400) throw err;
    return request(forecastUrl(lat, lon, CORE, elevation), signal);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local Zurich wall-clock time as "YYYY-MM-DDTHH:MM" for any instant. */
export function zurichNow(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const EVENING_HOUR = 18; // pitching time
export const MORNING_HOUR = 8; // packing up

export interface NightWindow {
  /** Local "YYYY-MM-DDTHH:MM". */
  from: string;
  to: string;
  /** "Tonight", "Tomorrow" (English keys, translated where shown), then weekday names in the current language. */
  label: string;
  /** The calendar day the evening falls on. */
  day: string;
}

const weekday = (d: Date) => new Intl.DateTimeFormat(dateLocale(), { weekday: 'short', timeZone: 'UTC' }).format(d);

/** The nights to plan for, from the evening (18:00) to the next morning (08:00). Before 08:00 the first is the night in progress. */
export function nightWindows(now: string, count = FORECAST_DAYS - 1): NightWindow[] {
  const today = now.slice(0, 10);
  const hour = Number(now.slice(11, 13));
  const startDay = hour < MORNING_HOUR ? addDays(today, -1) : today; // the evening the first night began
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(startDay, i);
    const inProgress = i === 0 && (hour < MORNING_HOUR || hour >= EVENING_HOUR);
    return {
      from: inProgress ? now : `${day}T${pad(EVENING_HOUR)}:00`,
      to: `${addDays(day, 1)}T${pad(MORNING_HOUR)}:00`,
      label: i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : weekday(new Date(`${day}T12:00:00Z`)),
      day,
    };
  });
}

/**
 * A night label in the current language: "Tonight" / "Tomorrow" (a window's label), "tonight" / "tomorrow night" and "Sat night"
 * (the lower-case forms the result sheet uses in sentences). Anything else, such as a weekday, is returned as it is.
 */
export function nightText(label: string): string {
  switch (label) {
    case 'Tonight':
      return tr('Tonight');
    case 'Tomorrow':
      return tr('Tomorrow');
    case 'tonight':
      return tr('tonight');
    case 'tomorrow night':
      return tr('tomorrow night');
    default: {
      const m = label.match(/^(.+) night$/);
      return m ? tr('{day} night', { day: m[1]! }) : label;
    }
  }
}

/** First window of `nightWindows`. */
export const nightWindow = (now: string) => nightWindows(now, 1)[0]!;

export const inWindow = (t: string, w: { from: string; to: string }) => t.slice(0, 13) >= w.from.slice(0, 13) && t.slice(0, 13) < w.to.slice(0, 13);

export interface Night {
  from: string;
  to: string;
  minTempC: number;
  maxGustKmh: number;
  meanWindKmh: number;
  /** Direction the wind comes from, degrees clockwise from north, weighted by wind speed. */
  windFromDeg: number;
  precipMm: number;
  /** Highest hourly rain probability, percent, if the forecast has it. */
  maxPrecipProb?: number;
  snowCm?: number;
  /** True if any hour carries a thunderstorm code (95 to 99). */
  thunder: boolean;
  /** The most severe sky condition code in the window. */
  worstCode?: number;
  meanCloud?: number;
  /** Lowest freezing-level height in the window, metres. */
  freezingLevelM?: number;
  /** Smallest gap between temperature and dew point, degrees (small means fog or heavy condensation). */
  minDewSpreadC?: number;
  /** Greatest modelled snow depth in the window, metres (a model value, not a measurement). */
  snowDepthM?: number;
}

function hoursIn(h: Hourly, window: { from: string; to: string }): number[] {
  return h.time.map((_, i) => i).filter((i) => inWindow(h.time[i]!, window));
}

const nums = (a: (number | null)[] | undefined, idx: number[]) => (a ? idx.map((i) => a[i]).filter((v): v is number => typeof v === 'number') : []);

export function summariseNight(h: Hourly, window: { from: string; to: string }): Night | undefined {
  const idx = hoursIn(h, window);
  const temps = nums(h.temperature_2m, idx);
  const gusts = nums(h.wind_gusts_10m, idx);
  const speeds = nums(h.wind_speed_10m, idx);
  if (!temps.length || !gusts.length || !speeds.length) return undefined;
  let sx = 0;
  let sy = 0;
  for (const i of idx) {
    const s = h.wind_speed_10m[i];
    const d = h.wind_direction_10m[i];
    if (typeof s !== 'number' || typeof d !== 'number') continue;
    sx += s * Math.sin((d * Math.PI) / 180);
    sy += s * Math.cos((d * Math.PI) / 180);
  }
  const windFromDeg = ((((Math.atan2(sx, sy) * 180) / Math.PI) % 360) + 360) % 360;
  const codes = nums(h.weather_code, idx);
  const probs = nums(h.precipitation_probability, idx);
  const snow = nums(h.snowfall, idx);
  const cloud = nums(h.cloud_cover, idx);
  const fl = nums(h.freezing_level_height, idx);
  const spread = idx
    .map((i) => {
      const t = h.temperature_2m[i];
      const d = h.dew_point_2m?.[i];
      return typeof t === 'number' && typeof d === 'number' ? t - d : undefined;
    })
    .filter((v): v is number => v !== undefined);
  return {
    from: window.from,
    to: window.to,
    minTempC: Math.min(...temps),
    maxGustKmh: Math.max(...gusts),
    meanWindKmh: speeds.reduce((a, b) => a + b, 0) / speeds.length,
    windFromDeg,
    precipMm: nums(h.precipitation, idx).reduce((a, b) => a + b, 0),
    maxPrecipProb: probs.length ? Math.max(...probs) : undefined,
    snowDepthM: h.snow_depth ? Math.max(0, ...nums(h.snow_depth, idx)) : undefined,
    snowCm: h.snowfall ? snow.reduce((a, b) => a + b, 0) : undefined,
    thunder: codes.some((c) => c >= 95),
    worstCode: codes.length ? codes.reduce((a, b) => (severity(b) > severity(a) ? b : a)) : undefined,
    meanCloud: cloud.length ? cloud.reduce((a, b) => a + b, 0) / cloud.length : undefined,
    freezingLevelM: fl.length ? Math.min(...fl) : undefined,
    minDewSpreadC: spread.length ? Math.min(...spread) : undefined,
  };
}

export interface Sky {
  emoji: string;
  label: string;
}

/** WMO weather interpretation codes as used by Open-Meteo. */
export function describeCode(code: number): Sky {
  if (code === 0) return { emoji: '☀️', label: tr('Clear') };
  if (code === 1) return { emoji: '🌤️', label: tr('Mostly clear') };
  if (code === 2) return { emoji: '⛅', label: tr('Partly cloudy') };
  if (code === 3) return { emoji: '☁️', label: tr('Overcast') };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: tr('Fog') };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: tr('Drizzle') };
  if (code === 66 || code === 67) return { emoji: '🌧️', label: tr('Freezing rain') };
  if (code >= 61 && code <= 65) return { emoji: '🌧️', label: code === 65 ? tr('Heavy rain') : tr('Rain') };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: tr('Snow') };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: tr('Showers') };
  if (code === 85 || code === 86) return { emoji: '🌨️', label: tr('Snow showers') };
  if (code === 95) return { emoji: '⛈️', label: tr('Thunderstorm') };
  if (code >= 96) return { emoji: '⛈️', label: tr('Thunderstorm with hail') };
  return { emoji: '❔', label: tr('Unknown') };
}

/** Rough order of how unpleasant a sky is for camping, for picking the worst hour. */
export function severity(code: number): number {
  if (code >= 95) return 100 + code;
  if (code === 66 || code === 67) return 80;
  if (code >= 71 && code <= 77) return 70 + (code - 70);
  if (code === 85 || code === 86) return 75;
  if (code >= 80 && code <= 82) return 60 + (code - 80);
  if (code >= 61 && code <= 65) return 50 + (code - 60);
  if (code >= 51 && code <= 57) return 30 + (code - 50);
  if (code === 45 || code === 48) return 20;
  return code;
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Compass point of a bearing; the letters are English (N, NE, E ...) and shown in the current language (German NO, O, SO). */
export const compassName = (deg: number) => tr(COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!);

export interface HourPoint {
  time: string;
  temp: number | null;
  wind: number | null;
  gust: number | null;
  dir: number | null;
  rain: number | null;
  prob: number | null;
  code: number | null;
  cloud: number | null;
}

/** The hours of one window, ready for charts and the table. */
export function windowHours(h: Hourly, window: { from: string; to: string }): HourPoint[] {
  return hoursIn(h, window).map((i) => ({
    time: h.time[i]!,
    temp: h.temperature_2m[i] ?? null,
    wind: h.wind_speed_10m[i] ?? null,
    gust: h.wind_gusts_10m[i] ?? null,
    dir: h.wind_direction_10m[i] ?? null,
    rain: h.precipitation[i] ?? null,
    prob: h.precipitation_probability?.[i] ?? null,
    code: h.weather_code?.[i] ?? null,
    cloud: h.cloud_cover?.[i] ?? null,
  }));
}
