export type Severity = 'prohibited' | 'restricted' | 'info';

export interface ZoneLayer {
  /** geo.admin.ch layerBodId (verified queryable via the identify endpoint). */
  id: string;
  /** Layer drawn on the map, if different from `id`. */
  overlayId?: string;
  /** Only count features whose attributes pass this test. */
  accept?: (attrs: Record<string, unknown>) => boolean;
  label: string;
  severity: Severity;
  note: string;
}

/**
 * Federal inventories that matter for wild camping.
 * prohibited = camping banned by federal law; restricted = usually banned or
 * heavily limited (details cantonal); info = worth knowing, no blanket ban.
 */
export const ZONE_LAYERS: ZoneLayer[] = [
  {
    // The dedicated national-park layer is not queryable; the parks layer is, and
    // category SNP is the Swiss National Park (other parks have no blanket ban).
    id: 'ch.bafu.schutzgebiete-paerke_nationaler_bedeutung',
    overlayId: 'ch.bafu.schutzgebiete-schweizerischer_nationalpark',
    accept: (a) => a.kategorie === 'SNP',
    label: 'Swiss National Park',
    severity: 'prohibited',
    note: 'Camping and leaving marked trails are prohibited.',
  },
  {
    id: 'ch.bafu.bundesinventare-jagdbanngebiete',
    label: 'Federal wildlife reserve (Jagdbanngebiet)',
    severity: 'restricted',
    note: 'Wildlife protection area; camping is usually restricted by the canton.',
  },
  {
    id: 'ch.bafu.wrz-wildruhezonen_portal',
    label: 'Wildlife quiet zone (Wildruhezone)',
    severity: 'restricted',
    note: 'Cantonal rules often forbid leaving trails or camping, especially in winter.',
  },
  {
    id: 'ch.bafu.bundesinventare-auen',
    label: 'Floodplain of national importance',
    severity: 'restricted',
    note: 'Protected habitat; camping generally not permitted.',
  },
  {
    id: 'ch.bafu.bundesinventare-hochmoore',
    label: 'Raised bog',
    severity: 'restricted',
    note: 'Strictly protected habitat.',
  },
  {
    id: 'ch.bafu.bundesinventare-flachmoore',
    label: 'Fen',
    severity: 'restricted',
    note: 'Strictly protected habitat.',
  },
  {
    id: 'ch.bafu.bundesinventare-trockenwiesen_trockenweiden',
    label: 'Dry meadow / pasture',
    severity: 'restricted',
    note: 'Protected habitat; avoid.',
  },
  {
    id: 'ch.bafu.bundesinventare-amphibien_wanderobjekte',
    label: 'Amphibian breeding site',
    severity: 'restricted',
    note: 'Protected habitat; avoid.',
  },
  {
    id: 'ch.bafu.bundesinventare-moorlandschaften',
    label: 'Mire landscape',
    severity: 'info',
    note: 'Protected landscape; no blanket camping ban but extra care needed.',
  },
  {
    id: 'ch.bafu.bundesinventare-bln',
    label: 'Landscape of national importance (BLN)',
    severity: 'info',
    note: 'No blanket camping ban.',
  },
];
