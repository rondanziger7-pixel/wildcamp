import { validateRuleAt, type CantonRule } from './cantons';

export interface MunicipalEntry {
  /** BFS municipality number, as returned by swissBOUNDARIES3D (`gde_nr`). */
  bfs: number;
  name: string;
  /** Official website host; sources must be on it. */
  officialHost: string;
  rule: CantonRule;
}

/**
 * Verified municipal camping rules. Same bar as cantonal rules: read the text yourself, save it under
 * docs/sources/municipal/<bfs>_<name>/, and cite an official page. Municipal rules usually apply only to
 * land the municipality owns, so say so in the summary; they cannot be known for private land from a map click.
 */
export const MUNICIPAL_RULES: MunicipalEntry[] = [
  {
    bfs: 351,
    name: 'Bern',
    officialHost: 'bern.ch',
    rule: {
      stance: 'restricted',
      summary:
        'City ordinance (Campingverordnung, Art. 2): pitching tents, caravans or similar and camping on the city\'s public ground outside specially designated areas is prohibited; ' +
        'the police inspectorate can grant exceptions (Art. 3), and breaches are fined up to CHF 2,000 (Art. 5). ' +
        'It applies to public ground owned by the city (Art. 1), not to private land, which cannot be told apart on the map.',
      sources: [{ title: 'SSSB 732.221 Campingverordnung der Stadt Bern (state 1.11.2012)', url: 'https://stadtrecht.bern.ch/lex-732_221' }],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 565,
    name: 'Kandersteg',
    officialHost: 'gemeindekandersteg.ch',
    rule: {
      stance: 'banned',
      summary:
        'Municipal police regulation (Art. 7): camping outside the specially designated and authorised areas is not permitted anywhere in the municipality, including forest, pasture and public waters (Art. 6 let. a); ' +
        'breaches can be fined up to CHF 5,000 (Art. 26), usually CHF 200. "Camping" means overnight stays in tents, caravans, motorhomes or cars; the regulation expressly excludes sleeping outdoors without a tent ("Biwakieren", Art. 6 let. c). ' +
        'Around Oeschinensee a separate court prohibition by the landowners also covers bivouacking.',
      sources: [
        { title: 'Gemeindepolizeireglement der Einwohnergemeinde Kandersteg (1.1.2021), Art. 6, 7, 26', url: 'https://www.gemeindekandersteg.ch/fileadmin/user_upload/Gemeindepolizeireglement.pdf' },
        { title: 'Gemeindepolizeiverordnung Kandersteg (1.1.2021), Art. 8: fixed fine CHF 200', url: 'https://www.gemeindekandersteg.ch/fileadmin/user_upload/Gemeindepolizeiverordnung.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
];

export function findMunicipalRule(bfs: number | undefined): MunicipalEntry | undefined {
  return MUNICIPAL_RULES.find((m) => m.bfs === bfs);
}

export function validateMunicipalEntry(m: MunicipalEntry): string[] {
  return validateRuleAt([m.officialHost], m.name, m.rule);
}
