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
  {
    bfs: 584,
    name: 'Lauterbrunnen',
    officialHost: 'lauterbrunnen.ch',
    rule: {
      stance: 'banned',
      summary:
        'Camping-Reglement (in force 1.1.2025), Art. 2 and 3: camping in tents, caravans, campers and similar shelters outside campsites is generally not permitted, on any land. Exceptions: occasional camping on private land for private purposes, and permits from the Sicherheitskommission with the landowner\'s consent. Breaches can be fined up to CHF 5,000 (Art. 24). The text does not say whether sleeping outdoors without a tent counts.',
      sources: [
        { title: 'Camping-Reglement der Gemeinde Lauterbrunnen (ab 1.1.2025), Art. 2, 3, 24', url: 'https://www.lauterbrunnen.ch/_doc/5268094' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 576,
    name: 'Grindelwald',
    officialHost: 'gemeinde-grindelwald.ch',
    rule: {
      stance: 'banned',
      summary:
        'Camping-Reglement (valid from 1.1.2017), Art. 2 and 9: pitching tents, caravans and similar mobile shelters outside approved campsites is generally not permitted, and the regulation is not limited to public ground. The Ortspolizeibehörde can grant exceptions for tent camps with the landowner\'s consent (Art. 10). Breaches can be fined up to CHF 1,000 (Art. 53). Sleeping outdoors without a tent is not mentioned. The saved PDF is a scan read by OCR.',
      sources: [
        { title: 'Camping-Reglement der Gemeinde Grindelwald (gültig ab 1.1.2017), Art. 2, 9, 10, 53', url: 'https://www.gemeinde-grindelwald.ch/wp-content/uploads/2020/06/Camping-Reglement_2017.pdf' },
        { title: 'Polizeireglement Grindelwald (ab 1.1.2024), Art. 14 refers to the Camping-Reglement', url: 'https://www.gemeinde-grindelwald.ch/wp-content/uploads/2024/01/Polizeireglement-PR-gueltig-ab-1.-Januar-2024.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 581,
    name: 'Interlaken',
    officialHost: 'interlaken-gemeinde.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Gemeindepolizeireglement ISR 552.11 (version in force since 1.4.2025), Art. 5 para. 5 and Art. 12 para. 4: on public ground camping and overnighting in vehicles is only allowed at places designated by the authorities, and pitching tents, camper roofs, emergency roofs, campers or vehicles is banned even where single overnights in public parks are otherwise free of permit. Breaches can be fined up to CHF 5,000 (Art. 44). Public ground only, so it cannot be told from private land on a map; sleeping outdoors without a tent is not addressed.',
      sources: [
        { title: 'Gemeindepolizeireglement der Einwohnergemeinde Interlaken, ISR 552.11, Art. 5, 12, 44', url: 'https://www.interlaken-gemeinde.ch/download/pictures/54/2op97kiydl3cmz32q1e4j6qt0h3xlx/552-11_gepor_belex.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 594,
    name: 'Wilderswil',
    officialHost: 'wilderswil.ch',
    rule: {
      stance: 'banned',
      summary:
        'Campingreglement (from 21.7.2025), Art. 3: camping outside approved campsites is generally not permitted, on any land; exceptions are occasional camping in private gardens by relatives and the occasional pitching of tents with the landowner\'s consent (permit from the Sicherheitskommission). The Gemeindepolizeireglement (Art. 15) also bans overnighting in vehicles and tents on public ground outside designated areas. Breaches can be fined up to CHF 5,000. Sleeping outdoors without a tent is not addressed. The Campingreglement PDF is a scan read by OCR.',
      sources: [
        { title: 'Campingreglement Wilderswil (ab 21.7.2025), Art. 2, 3, 27', url: 'https://wilderswil.ch/images/files/dokumente/reglemente/Gemeindeschreiberei%20Campingreglement%2021.07.2025%20-%20auf%20weiteres%202025.06.16.pdf' },
        { title: 'Gemeindepolizeireglement Wilderswil (1.1.2017), Art. 15, 28', url: 'https://wilderswil.ch/images/files/dokumente/reglemente/Gemeindepolizeireglement%2001.01.2017-.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 573,
    name: 'Brienz',
    officialHost: 'brienz.ch',
    rule: {
      stance: 'banned',
      summary:
        'Gemeindepolizeireglement (11.12.2014), Art. 4 and 5: camping in the "öffentlicher Raum" is banned. That is all freely accessible municipal land, including forest, pasture and public waters (Art. 4 let. a), and "camping" expressly includes sleeping outdoors without a tent ("Biwakieren", Art. 4 let. c). The municipality can grant exceptions on request. Breaches can be fined up to CHF 5,000 (Art. 19). The municipality\'s web page quotes a different, older wording; the regulation PDF is what is recorded here.',
      sources: [
        { title: 'Gemeindepolizeireglement der Einwohnergemeinde Brienz (11.12.2014), Art. 4, 5, 19', url: 'https://www.brienz.ch/_doc/1046522' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 561,
    name: 'Adelboden',
    officialHost: '3715.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Ortspolizeireglement (state 1.1.2021), Art. 32: on public ground camping is only allowed at places designated by the Ortspolizeibehörde. The older Camping-Reglement (1973), Art. 4, bans camping on public streets and places and allows the occasional pitching of tents on other land only with the landowner\'s consent. Fine CHF 200 for a first offence and CHF 400 for a repeat; up to CHF 5,000 in the regulation (Art. 60). Sleeping outdoors without a tent is not addressed.',
      sources: [
        { title: 'Ortspolizeireglement Adelboden (1.7.2009, rev. 1.1.2021), Art. 32, 60', url: 'https://www.3715.ch/public/upload/assets/678/Ortspolizeireglement_rev._1.1.2021.pdf' },
        { title: 'Camping-Reglement Adelboden (1973), Art. 2, 4', url: 'https://www.3715.ch/public/upload/assets/662/Campingreglement.pdf' },
        { title: 'Gebühren- und Bussenverordnung zum Ortspolizeireglement', url: 'https://www.3715.ch/public/upload/assets/667/Gebuehren-Bussenverordnung_zu_OPR_01.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 792,
    name: 'Lenk',
    officialHost: 'lenkgemeinde.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Gemeindepolizeireglement (in force 1.1.2008), Art. 21: on public ground overnighting in vehicles and tents outside the designated areas is banned; the Gemeindepolizei can grant exceptions. The Campingreglement (1969), Art. 6, allows occasional camping away from approved campsites only with the consent of the landowner and the municipality. Breaches can be fined up to CHF 5,000 (Art. 50). Sleeping outdoors without a tent is not addressed. The Campingreglement PDF is a scan read by OCR.',
      sources: [
        { title: 'Gemeindepolizeireglement Lenk (11.12.2007), Art. 21, 50', url: 'https://www.lenkgemeinde.ch/_doc/285208' },
        { title: 'Campingreglement Lenk (1969), Art. 2, 6', url: 'https://www.lenkgemeinde.ch/_doc/1455957' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 843,
    name: 'Saanen',
    officialHost: 'saanen.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Ortspolizeireglement (rev. 2023), Art. 29: on public ground camping is only allowed at places designated by the police organs, but para. 3 says camping in caravans, campers or tents away from approved campsites needs no permit for three consecutive nights (a permit is needed from the fourth). The two paragraphs do not sit easily together and the text does not resolve it, so this is recorded as a restriction, not a ban. Overnighting is liable to the tourist tax. Breaches can be fined up to CHF 5,000 (Art. 56). Sleeping outdoors without a tent is not addressed.',
      sources: [
        { title: 'Ortspolizeireglement der Einwohnergemeinde Saanen (16.10.2012, rev. 2023), Art. 29, 56', url: 'https://www.saanen.ch/wAssets/docs/Reglemente/Ortspolizeireglement.pdf' },
        { title: 'Verordnung zum Ortspolizeireglement Saanen, Art. 4', url: 'https://www.saanen.ch/wAssets/docs/Sicherheit/Polizei/Verordnung-zum-Ortspolizeireglement.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 842,
    name: 'Lauenen',
    officialHost: 'lauenen.ch',
    rule: {
      stance: 'banned',
      summary:
        'Campingreglement (5.12.1984), Art. 2 and 6: occasional camping away from approved campsites is only allowed with the consent of the landowner and the Gemeinderat, and camping on public ground is not allowed. "Camping" includes staying in tents and sleeping bags, and even the bare pitching of a tent. Breaches can be fined up to CHF 1,000 (Art. 23). The municipality\'s list of regulations shows no separate police regulation.',
      sources: [
        { title: 'Campingreglement der Gemeinde Lauenen (5.12.1984), Art. 2, 6, 23', url: 'https://www.lauenen.ch/_docn/1871296/Campingreglement_vom_05.12.1984.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 841,
    name: 'Gsteig',
    officialHost: 'gsteig.ch',
    rule: {
      stance: 'banned',
      summary:
        'Camping-Reglement (9.12.2005, amended 2013), Art. 2: camping outside the campsite zone ("wildes Campieren") is generally not permitted, on any land. The exception is a single night with the express consent of the landowner or farmer; more than one night also needs the authority\'s permission. Breaches can be fined up to CHF 1,000 (Art. 32). Sleeping outdoors without a tent is not addressed.',
      sources: [
        { title: 'Camping-Reglement der Gemeinde Gsteig (9.12.2005), Art. 2, 32', url: 'https://www.gsteig.ch/_doc/6004639' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 567,
    name: 'Reichenbach-im-Kandertal',
    officialHost: 'reichenbach.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Gemeindepolizeireglement (in force 1.7.2008, Art. 10a added 2014), Art. 10a: on public ground overnighting in vehicles and tents outside the designated areas is banned; the municipality can grant exceptions. Breaches can be fined up to CHF 5,000 (Art. 15). Sleeping outdoors without a tent is not addressed. The saved PDF is a scan read by OCR only. Covers Kiental.',
      sources: [
        { title: 'Gemeindepolizeireglement Reichenbach im Kandertal (1.12.704), Art. 10a, 15', url: 'https://www.reichenbach.ch/wAssets/docs/dienstleistungen/1.12.704-Gemeindepolizeireglement-unterschrieben.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 768,
    name: 'Spiez',
    officialHost: 'spiez.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Gemeindepolizeireglement (3.3.2013, revised 2014), Art. 20: camping on public ground is banned. Single overnights in caravans and campers on public car parks are permit-free, but pitching tents and emergency roofs of any kind is banned; the Abteilung Sicherheit can grant exceptions. Breaches can be fined up to CHF 5,000 (Art. 46). Public ground only; sleeping outdoors without a tent is not addressed.',
      sources: [
        { title: 'Gemeindepolizeireglement der Einwohnergemeinde Spiez (3.3.2013, rev. 28.4.2014), Art. 20, 46', url: 'https://www.spiez.ch/de/verwaltung/dokumente/dokumente/gemeindepolizeireglement.pdf' },
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
