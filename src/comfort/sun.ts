import { horizonToward } from './terrain';

const RAD = Math.PI / 180;

/** Solar azimuth (degrees clockwise from north) and elevation (degrees, no refraction) for a UTC instant and place. Low-precision formulas, about 0.05 degrees. */
export function solarPosition(date: Date, lat: number, lon: number): { azimuth: number; elevation: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD);
  const eps = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(eps * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD;
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(L * RAD)) / RAD;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = (gmst * 15 + lon) % 360;
  const H = (((lst - ra) % 360) + 540) % 360 - 180;
  const sinEl = Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(H * RAD);
  const el = Math.asin(sinEl) / RAD;
  const azimuth = (((Math.atan2(Math.sin(H * RAD), Math.cos(H * RAD) * Math.sin(lat * RAD) - Math.tan(dec * RAD) * Math.cos(lat * RAD)) / RAD + 180) % 360) + 360) % 360;
  return { azimuth, elevation: el };
}

const REFRACTION = -0.833; // standard sunrise/sunset altitude

export interface SunTimes {
  /** Sunrise and sunset with a flat horizon. */
  sunrise?: Date;
  sunset?: Date;
  /** First and last sun at the spot once the terrain horizon is applied. */
  sunOnSpot?: Date;
  sunLeavesSpot?: Date;
}

/** Sun times around the day containing `day`, scanned every 2 minutes from 12 h before to 12 h after local solar noon. `horizon` is the 8-bearing horizon angle list, or undefined for a flat horizon. */
export function sunTimes(day: Date, lat: number, lon: number, horizon?: number[]): SunTimes {
  // approximate solar noon in UTC for that calendar day at this longitude
  const noon = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12) - (lon / 15) * 3600000;
  const out: SunTimes = {};
  let prevFlat = false;
  let prevTerrain = false;
  for (let t = noon - 12 * 3600000; t <= noon + 12 * 3600000; t += 120000) {
    const date = new Date(t);
    const { azimuth, elevation } = solarPosition(date, lat, lon);
    const flat = elevation > REFRACTION;
    const terr = flat && (!horizon || elevation > Math.max(horizonToward(horizon, azimuth), REFRACTION));
    if (flat && !prevFlat && !out.sunrise) out.sunrise = date;
    if (!flat && prevFlat) out.sunset = date;
    if (terr && !prevTerrain && !out.sunOnSpot) out.sunOnSpot = date;
    if (!terr && prevTerrain) out.sunLeavesSpot = date;
    prevFlat = flat;
    prevTerrain = terr;
  }
  return out;
}

export const formatLocalTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
