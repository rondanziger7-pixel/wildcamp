/** Overnight forecast from Open-Meteo (https://open-meteo.com, CC BY 4.0), hourly values at the spot's elevation. */
export interface Hourly {
  time: string[];
  temperature_2m: (number | null)[];
  wind_speed_10m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  precipitation: (number | null)[];
}

export interface Night {
  /** Local time window the summary covers, "YYYY-MM-DDTHH:MM". */
  from: string;
  to: string;
  minTempC: number;
  maxGustKmh: number;
  meanWindKmh: number;
  /** Direction the wind comes from, degrees clockwise from north, weighted by wind speed. */
  windFromDeg: number;
  precipMm: number;
}

export async function fetchForecast(lat: number, lon: number, elevation?: number, signal?: AbortSignal): Promise<Hourly> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation',
    wind_speed_unit: 'kmh',
    timezone: 'Europe/Zurich',
    forecast_days: '2',
  });
  if (elevation !== undefined) q.set('elevation', String(Math.round(elevation)));
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal });
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  const body = (await res.json()) as { hourly?: Hourly };
  if (!body.hourly?.time) throw new Error('bad forecast');
  return body.hourly;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local Zurich wall-clock time as "YYYY-MM-DDTHH:MM" for any instant. */
export function zurichNow(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The night to plan for: from 20:00 tonight (or now, if later) to 07:00; before 07:00 it is the night in progress. */
export function nightWindow(now: string): { from: string; to: string } {
  const day = now.slice(0, 10);
  const hour = Number(now.slice(11, 13));
  if (hour < 7) return { from: now, to: `${day}T07:00` };
  const start = hour >= 20 ? now : `${day}T20:00`;
  return { from: start, to: `${addDays(day, 1)}T07:00` };
}

export function summariseNight(h: Hourly, window: { from: string; to: string }): Night | undefined {
  const idx = h.time.map((t, i) => i).filter((i) => h.time[i]!.slice(0, 13) >= window.from.slice(0, 13) && h.time[i]!.slice(0, 13) < window.to.slice(0, 13));
  const vals = (a: (number | null)[]) => idx.map((i) => a[i]).filter((v): v is number => typeof v === 'number');
  const temps = vals(h.temperature_2m);
  const gusts = vals(h.wind_gusts_10m);
  const speeds = vals(h.wind_speed_10m);
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
  const windFromDeg = (((Math.atan2(sx, sy) * 180) / Math.PI) % 360 + 360) % 360;
  return {
    from: window.from,
    to: window.to,
    minTempC: Math.min(...temps),
    maxGustKmh: Math.max(...gusts),
    meanWindKmh: speeds.reduce((a, b) => a + b, 0) / speeds.length,
    windFromDeg,
    precipMm: vals(h.precipitation).reduce((a, b) => a + b, 0),
  };
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
