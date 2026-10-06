import { tr } from './i18n';

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
    get label() { return tr('Swiss National Park'); },
    severity: 'prohibited',
    get note() { return tr('Staying is only allowed by day (civil twilight to civil twilight) and only on the marked trails and rest places, so overnight camping is prohibited (park rules, nationalpark.ch/schutzbestimmungen). The park is closed in winter.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-jagdbanngebiete',
    // the layer also holds the "Wildschadenperimeter" polygons, which lie OUTSIDE the reserve (VEJ Art. 2 para. 2 let. d); see below
    accept: (a) => a.typ_de !== 'Wildschadenperimeter',
    get label() { return tr('Federal wildlife reserve (Jagdbanngebiet)'); },
    severity: 'restricted',
    get note() { return tr('Free tenting and camping is prohibited (VEJ Art. 5 para. 1 let. e); only official campsites are allowed, and cantons can grant exceptions.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-jagdbanngebiete',
    // Not a ban: the perimeters beside a reserve in which the canton pays for wildlife damage. Shown so the pink on the map is explained.
    accept: (a) => a.typ_de === 'Wildschadenperimeter',
    get label() { return tr('Wildlife-damage perimeter next to a federal hunting reserve'); },
    severity: 'info',
    get note() { return tr('This polygon lies outside the hunting reserve (VEJ Art. 2 para. 2 let. d), so the reserve\'s camping ban does not apply here. Other rules, such as wildlife quiet zones or cantonal rules, still can.'); },
  },
  {
    id: 'ch.bafu.wrz-wildruhezonen_portal',
    get label() { return tr('Wildlife quiet zone (Wildruhezone)'); },
    severity: 'restricted',
    // Overridden per feature in parseZoneHits from the zone's own status, restriction and season.
    get note() { return tr('In statutory zones only the marked paths may be used (BAFU), so camping is effectively not possible. Many restrictions apply only in winter.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-auen',
    get label() { return tr('Floodplain or glacier foreland of national importance'); },
    severity: 'caution',
    get note() { return tr('The federal ordinance (AuenV) has no camping ban, but the cantons must keep recreation compatible with the protection aim (Art. 5 para. 2 let. c), so local rules may forbid camping. Check before going.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-auen_anhang2',
    get label() { return tr('Floodplain or glacier foreland of national importance (provisional list)'); },
    severity: 'caution',
    get note() { return tr('The federal ordinance (AuenV) has no camping ban, but the cantons must keep recreation compatible with the protection aim (Art. 5 para. 2 let. c), so local rules may forbid camping. Check before going.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-hochmoore',
    get label() { return tr('Raised bog'); },
    severity: 'caution',
    get note() { return tr('The federal ordinance (Hochmoorverordnung Art. 5 para. 1 let. i, k) requires protection from trampling and puts recreation below the protection aim. It has no camping ban by name, so local rules decide. Avoid camping here.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-flachmoore',
    get label() { return tr('Fen'); },
    severity: 'caution',
    get note() { return tr('The federal ordinance (Flachmoorverordnung Art. 5 para. 2 let. l, m) requires protection from trampling and recreation compatible with the protection aim. It has no camping ban by name, so local rules decide. Avoid camping here.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-trockenwiesen_trockenweiden',
    get label() { return tr('Dry meadow / pasture'); },
    severity: 'caution',
    get note() { return tr('Must be preserved undiminished (TwwV Art. 6). The ordinance has no camping clause, so local rules decide. Avoid camping here.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-amphibien_wanderobjekte',
    get label() { return tr('Amphibian breeding site'); },
    severity: 'caution',
    get note() { return tr('Must be preserved undiminished (AlgV Art. 6). The ordinance has no camping clause, so local rules decide. Avoid camping here.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-vogelreservate',
    get label() { return tr('Federal waterbird and migratory bird reserve'); },
    severity: 'caution',
    get note() { return tr('The federal ordinance (WZVV) sets reserve-specific rules in each reserve\'s object sheet and has no general camping clause. Cantons such as NW, SG and JU state camping is not allowed in nature reserves. Check before going.'); },
  },
  {
    id: 'ch.pronatura.naturschutzgebiete',
    get label() { return tr('Pro Natura nature reserve'); },
    severity: 'caution',
    get note() { return tr('Protected nature reserve. Cantons such as NW, SG and JU state camping is not allowed in nature reserves; check the reserve\'s own rules.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-moorlandschaften',
    get label() { return tr('Mire landscape'); },
    severity: 'info',
    get note() { return tr('The federal ordinance (Moorlandschaftsverordnung Art. 5 para. 2 let. e) requires recreation to be compatible with the protection aims; no blanket camping ban.'); },
  },
  {
    id: 'ch.vbs.schiessanzeigen',
    get label() { return tr('Army shooting zone'); },
    severity: 'info',
    get note() { return tr('Published shooting range. Check the firing notice for the days and times shooting takes place before staying here.'); },
  },
  {
    id: 'ch.swisstopo.geologie-gletscherausdehnung',
    get label() { return tr('On a glacier'); },
    severity: 'info',
    get note() { return tr('No specific camping rule was found for glacier ice itself, but crevasses, ice fall and meltwater make it dangerous. This is a hazard note, not a legal finding.'); },
  },
  {
    id: 'ch.bafu.bundesinventare-bln',
    get label() { return tr('Landscape of national importance (BLN)'); },
    severity: 'info',
    get note() { return tr('No blanket camping ban.'); },
  },
];

/** Cantonal nature reserves (not geo.admin.ch layers): looked up from canton data, see src/reserves.ts. */
export const RESERVE_ZONES = {
  beDecreeBan: {
    id: 'be-nsg-decree',
    get label() { return tr('Bern nature reserve'); },
    severity: 'restricted',
    get note() { return tr('The reserve\'s protection decree prohibits camping and tenting.'); },
  },
  beDecreeEntry: {
    id: 'be-nsg-entry',
    get label() { return tr('Bern nature reserve'); },
    severity: 'restricted',
    get note() { return tr('The reserve\'s protection decree prohibits entering it (or leaving the marked paths), so camping is effectively prohibited.'); },
  },
  beOther: {
    id: 'be-nsg-other',
    get label() { return tr('Bern nature reserve'); },
    severity: 'caution',
    get note() { return tr('Protected nature reserve. The readable text of its protection decree has no camping or tenting clause (it may be an unreadable scan), so check the decree.'); },
  },
  vsDecisionBan: {
    id: 'vs-decision-ban',
    get label() { return tr('Valais protected site'); },
    severity: 'restricted',
    get note() { return tr('The canton\'s protection decision prohibits camping or tenting.'); },
  },
  vsDecisionEntry: {
    id: 'vs-decision-entry',
    get label() { return tr('Valais protected site'); },
    severity: 'restricted',
    get note() { return tr('The canton\'s protection decision prohibits entering the site (or leaving the marked paths), so camping is effectively prohibited.'); },
  },
  vsOther: {
    id: 'vs-decision-other',
    get label() { return tr('Valais protected site'); },
    severity: 'caution',
    get note() { return tr('Site under a cantonal protection decision. The decision does not prohibit camping by name, so check it.'); },
  },
  tiDecreeBan: {
    id: 'ti-decree-ban',
    get label() { return tr('Ticino nature protection area'); },
    severity: 'restricted',
    get note() { return tr('The protection decree prohibits camping (the camping law only exempts bivouac tenting in the mountains elsewhere).'); },
  },
  tiOther: {
    id: 'ti-decree-other',
    get label() { return tr('Ticino nature protection area'); },
    severity: 'caution',
    get note() { return tr('Area under a Ticino protection decree. The decree text has no camping prohibition, so check it.'); },
  },
  ju: {
    id: 'ju-reserve',
    get label() { return tr('Jura nature reserve'); },
    severity: 'restricted',
    get note() { return tr('The canton states that overnighting outside official campsites is prohibited in all nature reserves.'); },
  },
} as const satisfies Record<string, ZoneLayer>;
