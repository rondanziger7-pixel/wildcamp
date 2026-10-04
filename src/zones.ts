export type Severity = 'prohibited' | 'restricted' | 'caution' | 'info';

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
 * heavily limited (details cantonal); caution = protected area where rules vary
 * and camping is often not allowed, so check before going; info = worth knowing,
 * no blanket ban.
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
    note: 'Free tenting and camping is prohibited (VEJ Art. 5 para. 1 let. e); only official campsites are allowed, and cantons can grant exceptions.',
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
    id: 'ch.bafu.bundesinventare-vogelreservate',
    label: 'Federal waterbird and migratory bird reserve',
    severity: 'caution',
    note:
      'The federal ordinance (WZVV) sets reserve-specific rules in each reserve\'s object sheet and has no general camping clause. ' +
      'Cantons such as NW, SG and JU state camping is not allowed in nature reserves. Check before going.',
  },
  {
    id: 'ch.pronatura.naturschutzgebiete',
    label: 'Pro Natura nature reserve',
    severity: 'caution',
    note:
      'Protected nature reserve. Cantons such as NW, SG and JU state camping is not allowed in nature reserves; check the reserve\'s own rules.',
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

/** Cantonal nature reserves (not geo.admin.ch layers): looked up from canton data, see src/reserves.ts. */
export const RESERVE_ZONES = {
  beDecreeBan: {
    id: 'be-nsg-decree',
    label: 'Bern nature reserve',
    severity: 'restricted',
    note: 'The reserve\'s protection decree prohibits camping and tenting.',
  },
  beDecreeEntry: {
    id: 'be-nsg-entry',
    label: 'Bern nature reserve',
    severity: 'restricted',
    note: 'The reserve\'s protection decree prohibits entering it (or leaving the marked paths), so camping is effectively prohibited.',
  },
  beOther: {
    id: 'be-nsg-other',
    label: 'Bern nature reserve',
    severity: 'caution',
    note: 'Protected nature reserve. The readable text of its protection decree has no camping or tenting clause (it may be an unreadable scan), so check the decree.',
  },
  vsDecisionBan: {
    id: 'vs-decision-ban',
    label: 'Valais protected site',
    severity: 'restricted',
    note: 'The canton\'s protection decision prohibits camping or tenting.',
  },
  vsDecisionEntry: {
    id: 'vs-decision-entry',
    label: 'Valais protected site',
    severity: 'restricted',
    note: 'The canton\'s protection decision prohibits entering the site (or leaving the marked paths), so camping is effectively prohibited.',
  },
  vsOther: {
    id: 'vs-decision-other',
    label: 'Valais protected site',
    severity: 'caution',
    note: 'Site under a cantonal protection decision. The decision does not prohibit camping by name, so check it.',
  },
  tiDecreeBan: {
    id: 'ti-decree-ban',
    label: 'Ticino nature protection area',
    severity: 'restricted',
    note: 'The protection decree prohibits camping (the camping law only exempts bivouac tenting in the mountains elsewhere).',
  },
  tiOther: {
    id: 'ti-decree-other',
    label: 'Ticino nature protection area',
    severity: 'caution',
    note: 'Area under a Ticino protection decree. The decree text has no camping prohibition, so check it.',
  },
  ju: {
    id: 'ju-reserve',
    label: 'Jura nature reserve',
    severity: 'restricted',
    note: 'The canton states that overnighting outside official campsites is prohibited in all nature reserves.',
  },
} as const satisfies Record<string, ZoneLayer>;
