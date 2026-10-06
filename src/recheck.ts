import { assessInputs, fetchLegalityInputs, type LegalityInputs } from './spotcheck';
import { nightDate, nightWindowFor } from './comfort/weather';
import { legalSummary, overallFrom, type LegalSummary } from './scores';
import type { LocalData } from './localstore';
import type { LegalPatch, SavedSpot, SpotSnapshot } from './saved';

/** The legality lookups per saved spot, asked for once however many nights use the spot. A lookup that failed is asked for again next time. */
export class InputsCache {
  private readonly map = new Map<string, Promise<LegalityInputs>>();
  constructor(private readonly fetch: typeof fetchLegalityInputs = fetchLegalityInputs) {}

  get(spot: Pick<SavedSpot, 'id' | 'lat' | 'lng' | 'elevation'>): Promise<LegalityInputs> {
    let p = this.map.get(spot.id);
    if (!p) {
      p = this.fetch(spot.lat, spot.lng, spot.elevation);
      this.map.set(spot.id, p);
      void p.then((inp) => inp.failed.length && this.map.delete(spot.id), () => this.map.delete(spot.id));
    }
    return p;
  }

  clear() {
    this.map.clear();
  }
}

/** The legality of a spot on the evening of `date` ("YYYY-MM-DD"), from lookups already made: no requests. */
export function legalForNight(inp: LegalityInputs, data: LocalData, date: string, now: string): LegalSummary {
  return legalSummary(assessInputs(inp, data, nightDate(nightWindowFor(date, now), now)));
}

export interface RecheckOutcome {
  spot: SavedSpot;
  before: SpotSnapshot['verdict'];
  after?: SpotSnapshot['verdict'];
  /** The check could not be made (a lookup failed): nothing is changed for this spot. */
  failed: boolean;
  /** The verdict is not the one that was saved (an unrated spot counts as changed once it has one). */
  changed: boolean;
  patch?: LegalPatch;
}

/**
 * Judge the legality of saved spots again for `date`, a few at a time. Only the legality part is redone (the sleep comfort needs
 * the terrain and takes far more requests): the overall score is worked out again from the saved comfort. Never rejects: a spot that
 * could not be checked is reported as `failed` and left as it was.
 */
export async function recheckSpots(
  spots: SavedSpot[],
  data: LocalData,
  opts: { date?: Date; concurrency?: number; fetch?: typeof fetchLegalityInputs; onProgress?: (done: number, total: number) => void } = {},
): Promise<RecheckOutcome[]> {
  const fetchInputs = opts.fetch ?? fetchLegalityInputs;
  const date = opts.date ?? new Date();
  const out: RecheckOutcome[] = new Array(spots.length);
  let next = 0;
  let done = 0;
  await data.load().catch(() => undefined);
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= spots.length) return;
      const spot = spots[i]!;
      const before = spot.snapshot.verdict;
      try {
        const inp = await fetchInputs(spot.lat, spot.lng, spot.elevation);
        const a = assessInputs(inp, data, date);
        const sum = legalSummary(a);
        if (sum.unchecked || sum.outside) {
          out[i] = { spot, before, failed: true, changed: false };
        } else {
          const overall = overallFrom(sum.verdict, sum.value, spot.snapshot.comfort);
          out[i] = {
            spot,
            before,
            after: sum.verdict,
            failed: false,
            changed: spot.snapshot.unrated ? false : sum.verdict !== before,
            patch: { verdict: sum.verdict, legal: sum.value, overall, municipality: a.municipality, canton: a.canton?.name },
          };
        }
      } catch {
        out[i] = { spot, before, failed: true, changed: false };
      }
      opts.onProgress?.(++done, spots.length);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, spots.length)) }, worker));
  return out;
}
