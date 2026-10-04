/** Reserve and ban polygon sets bundled with the app (loaded at start, cached for offline use). */
export const RESERVE_FILES = [
  'reserves-be.json.gz',
  'reserves-ti.json.gz',
  'reserves-vs.json.gz',
  'reserves-ge.json.gz',
  'reserves-gl.json.gz',
  'reserves-fr.json.gz',
  'reserves-lu.json.gz',
  'reserves-so.json.gz',
  'bans-court.json.gz',
];
export const FOREST_FILE = 'forest-mask.bin.gz';
export const TREELINE_FILE = 'treeline-surface.bin.gz';
/** Everything the legality check reads locally. */
export const LOCAL_DATA_FILES = [FOREST_FILE, TREELINE_FILE, ...RESERVE_FILES];
