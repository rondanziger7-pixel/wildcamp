import { assess, type Assessment, type ZoneHit } from './assess';
import { wgs84ToLv95 } from './coords';
import { fetchCanton, fetchElevation, fetchMunicipality, fetchZoneBody, parseZoneHits, type Municipality, type ZoneBody } from './geoadmin';
import type { Canton } from './cantons';
import { fetchBuildingZone, type BuildingZoneInfo } from './buildingzone';
import { fetchJuraReserves } from './jura';
import { reserveZoneHits } from './reserves';
import { classifyTreeline } from './treeline';
import { findMunicipalRule, findUnverifiedNote } from './municipalities';
import type { LocalData } from './localstore';
import { analyseTerrain, fetchProfiles, FAR, NEAR, type Profiles } from './comfort/terrain';
import { fetchSurroundings, type Surroundings } from './comfort/surroundings';
import { fetchWater, type WaterInfo } from './comfort/water';
import { fetchShelters, type ShelterResult } from './comfort/shelters';
import { fetchGround, type GroundInfo } from './comfort/ground';
import { bulletinAt, fetchBulletin, type AvalancheInfo } from './comfort/avalanche';
import { fetchNoise, type NoiseInfo } from './comfort/noise';
import { fetchHazards, type HazardInfo } from './comfort/hazards';
import { fetchForecast, type Hourly } from './comfort/weather';
import { fetchRestrictions, type Restrictions } from './restrictions';

/** Rejects after `ms`, so one stalled request cannot hold up a whole check. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** The lookups a legality verdict depends on. A failed one is reported as "not checked", never as "nothing found". */
export type CheckName = 'zones' | 'canton' | 'municipality' | 'elevation' | 'building zones' | 'Jura reserves' | 'local rule data';

/** Everything fetched for the legality of a spot. It does not depend on the date, so the verdict for another night is derived from it without new requests. */
export interface LegalityInputs {
  lat: number;
  lng: number;
  elevation?: number;
  /** The zone layers' identify response (seasons and firing days are evaluated per date). */
  zones?: ZoneBody;
  /** Set when the lookup worked: undefined means the point lies outside every canton. */
  canton?: Canton;
  cantonKnown: boolean;
  municipality?: Municipality;
  jura: ZoneHit[];
  buildingZone?: BuildingZoneInfo;
  /** Lookups that failed or ran out of time. */
  failed: CheckName[];
}

const LOOKUP_MS = 7000;
/** A spot check as a whole: parts still missing at this deadline (counted from the tap) are dropped and listed as not checked. */
export const CHECK_BUDGET_MS = 10000;
/** Longest a check waits for the bundled data before it goes ahead (and calls itself incomplete). */
export const DATA_WAIT_MS = 6000;

const inJura = (lat: number, lng: number) => lat > 47.1 && lat < 47.55 && lng > 6.85 && lng < 7.6;

/** Run every legality lookup at once. `knownElevation` skips the elevation request (the finder already has it). */
export async function fetchLegalityInputs(lat: number, lng: number, knownElevation?: number): Promise<LegalityInputs> {
  const [elev, zones, canton, muni, jura, bzone] = await Promise.allSettled([
    knownElevation !== undefined ? Promise.resolve(knownElevation) : withTimeout(fetchElevation(lat, lng), LOOKUP_MS),
    withTimeout(fetchZoneBody(lat, lng), LOOKUP_MS),
    withTimeout(fetchCanton(lat, lng), LOOKUP_MS),
    withTimeout(fetchMunicipality(lat, lng), LOOKUP_MS),
    inJura(lat, lng) ? withTimeout(fetchJuraReserves(lat, lng), LOOKUP_MS) : Promise.resolve([] as ZoneHit[]),
    withTimeout(fetchBuildingZone(lat, lng), LOOKUP_MS),
  ]);
  const failed: CheckName[] = [];
  if (elev.status === 'rejected' || elev.value === undefined) failed.push('elevation');
  if (zones.status === 'rejected') failed.push('zones');
  if (canton.status === 'rejected') failed.push('canton');
  if (muni.status === 'rejected') failed.push('municipality');
  if (jura.status === 'rejected') failed.push('Jura reserves');
  if (bzone.status === 'rejected') failed.push('building zones');
  return {
    lat,
    lng,
    elevation: elev.status === 'fulfilled' ? elev.value : undefined,
    zones: zones.status === 'fulfilled' ? zones.value : undefined,
    canton: canton.status === 'fulfilled' ? canton.value : undefined,
    cantonKnown: canton.status === 'fulfilled',
    municipality: muni.status === 'fulfilled' ? muni.value : undefined,
    jura: jura.status === 'fulfilled' ? jura.value : [],
    buildingZone: bzone.status === 'fulfilled' ? bzone.value : undefined,
    failed,
  };
}

/** The verdict for a spot on a given date, from the fetched inputs and the bundled data. Pure: no requests. */
export function assessInputs(inp: LegalityInputs, data: LocalData, date: Date = new Date()): Assessment {
  const { e, n } = wgs84ToLv95(inp.lat, inp.lng);
  const { status: treeline, note: treelineNote } = classifyTreeline(data.forestMask, data.treelineSurface, e, n, inp.elevation);
  const incomplete: CheckName[] = [...inp.failed];
  if (!data.complete) incomplete.push('local rule data');
  const muni = inp.municipality;
  return assess({
    zones: [...(inp.zones ? parseZoneHits(inp.zones, date) : []), ...data.reserveSets.flatMap((set) => reserveZoneHits(set, e, n)), ...inp.jura],
    zoneLookupFailed: inp.failed.includes('zones'),
    treeline,
    treelineNote,
    elevationKnown: inp.elevation !== undefined,
    canton: inp.canton,
    municipality: muni?.name,
    municipalRule: findMunicipalRule(muni?.bfs)?.rule,
    municipalNote: findUnverifiedNote(muni?.bfs),
    buildingZone: inp.buildingZone ?? { near: false, failed: true },
    outsideSwitzerland: inp.cantonKnown && inp.canton === undefined,
    incomplete,
  });
}

export interface SpotCheck {
  inputs: LegalityInputs;
  assessment: Assessment;
  elevation?: number;
}

/**
 * The legality check of a spot: lookups, then the bundled data (waited for up to `DATA_WAIT_MS`), then the verdict.
 * Data that is still loading is reported as an incomplete check; the caller can re-assess when `data.load()` resolves.
 */
export async function checkLegality(lat: number, lng: number, data: LocalData, opts: { knownElevation?: number; date?: Date; waitMs?: number } = {}): Promise<SpotCheck> {
  const ready = Promise.race([data.load(), new Promise<void>((r) => setTimeout(r, opts.waitMs ?? DATA_WAIT_MS))]); // runs alongside the lookups
  const inputs = await fetchLegalityInputs(lat, lng, opts.knownElevation);
  await ready;
  return { inputs, assessment: assessInputs(inputs, data, opts.date), elevation: inputs.elevation };
}

// ---------------------------------------------------------------------------------------------------------------------
// The sleep and weather part of a check: terrain, surroundings, water, huts, ground, hazards, forecast ...

export type PartKey = 'near' | 'far' | 'around' | 'water' | 'shelter' | 'ground' | 'avalanche' | 'rules' | 'noise' | 'hazards' | 'forecast';

export interface Details {
  near?: Profiles;
  far?: Profiles;
  around?: Partial<Surroundings>;
  water?: WaterInfo;
  shelters?: ShelterResult;
  ground?: GroundInfo;
  avalanche?: AvalancheInfo;
  noise?: NoiseInfo;
  hazards?: HazardInfo;
  hourly?: Hourly;
  rules?: Restrictions;
}

/** Longest any one part may take; a slow forecast service should not hold the final score for the whole budget. */
export const PART_MS = 6000;

export interface DetailsRun {
  got: Details;
  /** Parts that have finished, successfully or not. */
  done: Record<PartKey, boolean>;
  /** Parts that failed (or timed out); an absent result is then not an all-clear. */
  failed: Record<PartKey, boolean>;
  /** Resolves when every part has finished. */
  finished: Promise<void>;
}

/**
 * Start every detail lookup at once. `onPart(key)` is called after each one finishes (value in `got`, or `failed[key]`),
 * so a screen can repaint as results arrive.
 */
export function collectDetails(lat: number, lng: number, elevation: number | undefined, opts: { signal?: AbortSignal; onPart?: (key: PartKey) => void; now?: Date } = {}): DetailsRun {
  const keys: PartKey[] = ['near', 'far', 'around', 'water', 'shelter', 'ground', 'avalanche', 'rules', 'noise', 'hazards', 'forecast'];
  const got: Details = {};
  const done = Object.fromEntries(keys.map((k) => [k, false])) as Record<PartKey, boolean>;
  const failed = Object.fromEntries(keys.map((k) => [k, false])) as Record<PartKey, boolean>;
  const { signal } = opts;
  const track = <T>(key: PartKey, p: Promise<T>, put: (v: T) => void, ms = PART_MS) =>
    withTimeout(p, ms)
      .then(put)
      .catch(() => {
        failed[key] = true;
      })
      .finally(() => {
        done[key] = true;
        opts.onPart?.(key);
      });
  const finished = Promise.allSettled([
    track('near', fetchProfiles(lat, lng, NEAR, signal), (v) => (got.near = v)),
    track('far', fetchProfiles(lat, lng, FAR, signal), (v) => (got.far = v), PART_MS + 2000),
    track('around', fetchSurroundings(lat, lng, signal), (v) => (got.around = v)),
    track('water', fetchWater(lat, lng, signal), (v) => (got.water = v)),
    track('shelter', fetchShelters(lat, lng, signal), (v) => (got.shelters = v)),
    track('ground', fetchGround(lat, lng, signal), (v) => (got.ground = v)),
    track('avalanche', fetchBulletin(signal).then((fc) => bulletinAt(fc, lat, lng, opts.now ?? new Date())), (v) => (got.avalanche = v)),
    track('rules', fetchRestrictions(lat, lng, signal), (v) => (got.rules = v)),
    track('noise', fetchNoise(lat, lng, signal), (v) => (got.noise = v)),
    track('hazards', fetchHazards(lat, lng, signal), (v) => (got.hazards = v)),
    track('forecast', fetchForecast(lat, lng, elevation, signal), (v) => (got.hourly = v)),
  ]).then(() => undefined);
  return { got, done, failed, finished };
}

/** Terrain metrics from the near profile (and the far one when it has arrived). */
export const terrainOf = (got: Details) => (got.near ? analyseTerrain(got.near, got.far) : undefined);
