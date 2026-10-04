export type CantonStance = 'banned' | 'restricted' | 'tolerated';

export interface Source {
  title: string;
  url: string;
}

/**
 * A verified cantonal rule. Only add one after reading the law or an official
 * cantonal page yourself; tests enforce an official source and a check date.
 * `banned` forces a "Not allowed" verdict, `restricted` caps the verdict at "Caution".
 */
export interface CantonRule {
  stance: CantonStance;
  summary: string;
  sources: Source[];
  /** ISO date (YYYY-MM-DD) the source was last read. */
  checkedOn: string;
}

export interface Canton {
  /** Two-letter code as returned by swissBOUNDARIES3D (`ak`). */
  code: string;
  name: string;
  rule?: CantonRule;
}

/** All 26 cantons. A rule is only set once its source has been read; text is saved under docs/sources/. See docs/CANTON_RESEARCH.md. */
export const CANTONS: Canton[] = [
  { code: 'AG', name: 'Aargau' },
  { code: 'AI', name: 'Appenzell Innerrhoden' },
  { code: 'AR', name: 'Appenzell Ausserrhoden' },
  { code: 'BE', name: 'Bern' },
  { code: 'BL', name: 'Basel-Landschaft' },
  { code: 'BS', name: 'Basel-Stadt' },
  { code: 'FR', name: 'Fribourg' },
  { code: 'GE', name: 'Geneva' },
  { code: 'GL', name: 'Glarus' },
  { code: 'GR', name: 'Graubünden' },
  { code: 'JU', name: 'Jura' },
  { code: 'LU', name: 'Lucerne' },
  { code: 'NE', name: 'Neuchâtel' },
  {
    code: 'NW',
    name: 'Nidwalden',
    rule: {
      stance: 'restricted',
      summary:
        'Official cantonal guidance (not a statute): wild camping is in principle not allowed and needs the landowner\'s consent. ' +
        'Exceptions: single nights, not in groups, in the mountains above the forest line (a tent must come down by day if staying more than one night), and emergency bivouacs. ' +
        'Wild camping is generally prohibited in nature reserves, federal hunting reserves, wildlife quiet zones and where access is prohibited. ' +
        'By ordinance, tents and camping away from marked paths are prohibited in protected bogs and dry sites.',
      sources: [
        { title: 'Merkblatt Stell- und Campingplätze Kanton Nidwalden, 18.11.2021, section 3.11', url: 'https://www.nw.ch/_docn/282097/Merkblatt_Nidwalden_Stellplatze_Camping_18.11.21.pdf' },
        { title: 'NG 332.11 Verordnung über den Schutz der Moore und Trockenstandorte', url: 'https://gesetze.nw.ch/app/de/texts_of_law/332.11' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    code: 'OW',
    name: 'Obwalden',
    rule: {
      stance: 'restricted',
      summary:
        'Pitching tents, caravans or motorhomes outside approved campsites is prohibited (Art. 6). ' +
        'Staying a single night without a permit is allowed if no public or private interests are impaired, at your own risk (Art. 8). ' +
        'Camping without a permit is punishable by a fine (Art. 11). Municipalities can grant exceptions (Art. 7).',
      sources: [{ title: 'GDB 971.4 Gesetz über das Campieren (in force since 2015-03-01)', url: 'https://gdb.ow.ch/app/de/texts_of_law/971.4' }],
      checkedOn: '2026-10-04',
    },
  },
  {
    code: 'SG',
    name: 'St. Gallen',
    rule: {
      stance: 'tolerated',
      summary:
        'Official cantonal forestry guidance: camping and free tenting (including bivouacking) by individuals and small groups in open country is allowed, or not prohibited, in most places. ' +
        'Landowner consent should be sought, especially for several nights. ' +
        'Not allowed in federal hunting reserves, nature reserves and areas protected by municipal ordinance. ' +
        'Avoid ecologically sensitive spots such as the upper forest line, floodplains and wetlands.',
      sources: [
        {
          title: 'Kantonsforstamt St.Gallen, Merkblatt Veranstaltungen nach Waldgesetzgebung, 02.05.2022, section 3.6',
          url: 'https://www.sg.ch/umwelt-natur/wald/bewilligungen-beantragen/veranstaltungen-im-lebensraum/_jcr_content/Par/sgch_downloadlist_982880595/DownloadListPar/sgch_download_764933553.ocFile/Veranstaltungen_nach_Waldgesetzgebung_Merkblatt_KFA_2022-05-02.pdf',
        },
      ],
      checkedOn: '2026-10-04',
    },
  },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'TG', name: 'Thurgau' },
  {
    code: 'TI',
    name: 'Ticino',
    rule: {
      stance: 'restricted',
      summary:
        'Camping (any temporary stop and overnight stay outside your home using tents, caravans or motorhomes) is only possible in authorised campsite areas (Art. 2 para. 1, Art. 3). ' +
        'The exception is tenting for a bivouac in the mountains (Art. 2 para. 2); the law does not define "in the mountains". ' +
        'Municipalities enforce the law and can fine breaches from CHF 50 to 10,000 (Art. 27).',
      sources: [{ title: 'Legge sui campeggi del 26 gennaio 2004 (stato 1.1.2024)', url: 'https://m3.ti.ch/CAN/RLeggi/public/index.php/raccolta-leggi/legge/num/631' }],
      checkedOn: '2026-10-04',
    },
  },
  { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Vaud' },
  { code: 'VS', name: 'Valais' },
  { code: 'ZG', name: 'Zug' },
  { code: 'ZH', name: 'Zurich' },
];

export function findCanton(code: string | undefined): Canton | undefined {
  return CANTONS.find((c) => c.code === code);
}

/** Official hosts per canton; federal sources (admin.ch) are accepted for any canton. */
const OFFICIAL_HOST: Record<string, string> = { JU: 'jura.ch' };

/** Problems that stop a rule from being accepted; an empty list means it is fine. */
export function validateRule(canton: Canton, rule: CantonRule): string[] {
  const problems: string[] = [];
  if (!['banned', 'restricted', 'tolerated'].includes(rule.stance)) problems.push('unknown stance');
  if (rule.summary.trim() === '') problems.push('empty summary');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.checkedOn) || Number.isNaN(Date.parse(rule.checkedOn))) {
    problems.push('checkedOn must be a valid YYYY-MM-DD date');
  }
  if (rule.sources.length === 0) problems.push('needs at least one source');
  const own = OFFICIAL_HOST[canton.code] ?? `${canton.code.toLowerCase()}.ch`;
  for (const src of rule.sources) {
    let host: string;
    try {
      const u = new URL(src.url);
      if (u.protocol !== 'https:') problems.push(`source must be https: ${src.url}`);
      host = u.hostname.toLowerCase();
    } catch {
      problems.push(`invalid source url: ${src.url}`);
      continue;
    }
    const official = [own, 'admin.ch'].some((d) => host === d || host.endsWith(`.${d}`));
    if (!official) problems.push(`not an official ${canton.name} or federal source: ${src.url}`);
  }
  return problems;
}
