import { loadForestMask, type ForestMask } from './forestmask';
import { loadReserveSet, type ReserveSet } from './reserves';
import { loadTreelineSurface, type TreelineSurface } from './treelinesurface';
import { FOREST_FILE, RESERVE_FILES, TREELINE_FILE } from './localdata';

/**
 * The data bundled with the app that every legality check reads locally: the forest map, the treeline surface and the
 * reserve and court-ban polygons. It remembers which files could not be loaded, so a check made without them is reported
 * as incomplete instead of as "nothing found", and it can be asked to try the failed files again.
 */
export class LocalData {
  forestMask?: ForestMask;
  treelineSurface?: TreelineSurface;
  reserveSets: ReserveSet[] = [];
  /** Files whose last attempt failed. */
  readonly failed = new Set<string>();
  private done = new Set<string>();
  private running?: Promise<void>;

  /** `loaders` exist so tests can supply their own. */
  constructor(
    private readonly base: string,
    private readonly loaders = { forest: loadForestMask, treeline: loadTreelineSurface, reserve: loadReserveSet },
  ) {}

  /** True once every file has been loaded. */
  get complete(): boolean {
    return this.done.size === RESERVE_FILES.length + 2 && this.failed.size === 0;
  }

  /** True while an attempt is still running. */
  get loading(): boolean {
    return this.running !== undefined;
  }

  /** Start loading (once); `urgent` false asks the browser to serve it after the map tiles. */
  load(urgent = true): Promise<void> {
    if (this.running) return this.running;
    if (this.done.size === RESERVE_FILES.length + 2) return Promise.resolve();
    const init: RequestInit = urgent ? {} : ({ priority: 'low' } as RequestInit);
    const attempt = async <T>(file: string, get: () => Promise<T>, put: (v: T) => void) => {
      if (this.done.has(file)) return;
      try {
        put(await get());
        this.done.add(file);
        this.failed.delete(file);
      } catch (err) {
        this.failed.add(file);
        console.warn(`${file} failed to load`, err);
      }
    };
    this.running = Promise.all([
      attempt(FOREST_FILE, () => this.loaders.forest(`${this.base}${FOREST_FILE}`, init), (m) => (this.forestMask = m)),
      attempt(TREELINE_FILE, () => this.loaders.treeline(`${this.base}${TREELINE_FILE}`, init), (t) => (this.treelineSurface = t)),
      ...RESERVE_FILES.map((file) =>
        attempt(file, () => this.loaders.reserve(`${this.base}${file}`, init), (r) => {
          this.reserveSets.push(r);
        }),
      ),
    ]).then(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** Try the files that failed again (the ones already loaded are kept). */
  retry(): Promise<void> {
    return this.load(true);
  }
}
