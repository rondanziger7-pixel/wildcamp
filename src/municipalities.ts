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
  {
    bfs: 6057,
    name: 'Fiesch',
    officialHost: 'gemeinde-fiesch.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Polizeireglement (approved 2016), Art. 16: camping and overnighting on public ground is only allowed in the zones the municipality designates ("Campieren und Übernachten", so a tent is not required). Breaches can be fined up to CHF 5,000 (Art. 2). Public ground only, so it cannot be told from private land on a map. The municipality\'s notice board says camping outside campsites is banned, which is wider than the regulation\'s text.',
      sources: [
        { title: 'Polizeireglement der Gemeinde Fiesch (Urversammlung 23.6.2015), Art. 2, 16', url: 'https://www.gemeinde-fiesch.ch?action=get_file&id=90&resource_link_id=55a' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 6058,
    name: 'Fieschertal',
    officialHost: 'fieschertal.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Polizeireglement (approved 2021), Art. 18: camping and overnighting on public ground is only allowed in the zones the municipality designates ("Campieren und Übernachten", so a tent is not required). Breaches can be fined CHF 10 to 5,000 (Art. 2). Public ground only. The saved PDF is a scan transcribed by hand.',
      sources: [
        { title: 'Polizeireglement der Gemeinde Fieschertal (Urversammlung 19.8.2020), Art. 2, 18', url: 'https://www.fieschertal.ch/dienste/reglemente?action=get_file&id=56&resource_link_id=311' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 6111,
    name: 'Leukerbad',
    officialHost: 'regionalpolizei-leuk-leukerbad.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Polizeireglement (homologated 2014), Art. 16: camping and overnighting on public ground is only allowed in the zones the municipality designates, and exceptions need a permit from the municipality ("Campieren und Übernachten", so a tent is not required). Breaches can be fined up to CHF 5,000 (Art. 33). Public ground only. The PDF is hosted by the regional police and is a scan transcribed by hand.',
      sources: [
        { title: 'Polizeireglement der Gemeinde Leukerbad (Urversammlung 26.6.2012), Art. 16, 33', url: 'https://regionalpolizei-leuk-leukerbad.ch/wp-content/uploads/2022/10/Polizeireglement_Gemeinde_Leukerbad.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 1202,
    name: 'Andermatt',
    officialHost: 'lisag.ch',
    rule: {
      stance: 'banned',
      summary:
        'Bau- und Zonenordnung (approved by the Regierungsrat 2021, amended to 2025), Art. 95a: on the whole municipal territory camping is only allowed on approved campsites and wild camping is banned. Camping is defined as using tents, caravans, mobile homes and the like; sleeping outdoors without a tent is not mentioned. No fine is stated in the BZO. Published on the Uri planning geoportal.',
      sources: [
        { title: 'Bau- und Zonenordnung Andermatt (BZO), Art. 95a', url: 'https://webgis.lisag.ch/PDF/Nutzungsplanung/1202_BZO_Andermatt.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 1212,
    name: 'Realp',
    officialHost: 'lisag.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Bau- und Zonenordnung, Art. 50: on the whole municipal territory camping is only allowed on approved campsites and wild camping is banned (same wording as Andermatt). The copy on the Uri planning geoportal is a "Genehmigungsexemplar" with the Regierungsrat approval date left blank, so it is recorded as a restriction, not a ban, until that is confirmed. No fine is stated.',
      sources: [
        { title: 'Bau- und Zonenordnung Realp (BZO), Art. 50', url: 'https://webgis.lisag.ch/PDF/Nutzungsplanung/1212_BZO_Realp.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 1208,
    name: 'Goeschenen',
    officialHost: 'goeschenen.ch',
    rule: {
      stance: 'banned',
      summary:
        'Campingverordnung (Gemeindeversammlung 29.4.2022), Art. 2: pitching tents, caravans, motorhomes and camper buses to camp outside approved campsites or pitches is not permitted, on any land; Art. 3 allows temporary free camping on a residential property with the owner\'s consent. Breaches are punished with a fine (Art. 12, no amount in the text). Sleeping outdoors without a tent is not mentioned. The saved PDF is a scan transcribed by hand.',
      sources: [
        { title: 'Campingverordnung der Gemeinde Göschenen (29.4.2022), Art. 2, 3, 12', url: 'https://www.goeschenen.ch/files/bilder/Campingverordnung-vom-29.04.2022_unterzeichnet.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3851,
    name: 'Davos',
    officialHost: 'gemeindedavos.ch',
    rule: {
      stance: 'banned',
      summary:
        'Verordnung über das Campingwesen (DRB 30.22, state 1.6.2023), Art. 1: on the territory of the municipality camping, meaning pitching tents, caravans and motorhomes, is banned outside officially approved sites, on any land. Breaches can be fined up to CHF 200 (Art. 8). Sleeping outdoors without a tent is not defined.',
      sources: [
        { title: 'Verordnung über das Campingwesen der Gemeinde Davos (DRB 30.22), Art. 1, 8', url: 'https://www.gemeindedavos.ch/_docn/5008618/DRB_30.22_Verordnung_%C3%BCber_das_Campingwesen.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3871,
    name: 'Klosters',
    officialHost: 'gemeindeklosters.ch',
    rule: {
      stance: 'banned',
      summary:
        'Baugesetz (approved 2024), Art. 100: camping in tents, motorhomes and the like is banned outside the building zone and generally on public ground; only sites the municipality expressly designates are excepted. No fine is stated in the text. This is the law of the former Klosters district; whether Serneus has its own was not checked. Sleeping outdoors without a tent is not mentioned.',
      sources: [
        { title: 'Baugesetz der Gemeinde Klosters, Art. 100 Campieren', url: 'https://www.gemeindeklosters.ch/_doc/5073418' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3921,
    name: 'Arosa',
    officialHost: 'gemeindearosa.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Polizeigesetz (2024), Art. 24: on public ground camping in tents, caravans, motorhomes, cars and the like is only allowed at places designated by the municipality. Sleeping in a vehicle counts as camping except an unforeseen emergency stop (Reglement Art. 11). Ordnungsbusse CHF 100. Public ground only. Art. 24 was transcribed by hand from a scan.',
      sources: [
        { title: 'Polizeigesetz der Gemeinde Arosa (610.100), Art. 24', url: 'https://www.gemeindearosa.ch/_doc/5661181' },
        { title: 'Polizeireglement Arosa (610.110), Art. 11 and Ordnungsbussenliste', url: 'https://www.gemeindearosa.ch/_doc/7224430' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3784,
    name: 'Pontresina',
    officialHost: 'gemeinde-pontresina.ch',
    rule: {
      stance: 'banned',
      summary:
        'Polizeigesetz (revised 2025), Art. 26: on the territory of the municipality camping, meaning pitching tents, caravans and motorhomes to sleep in, is only allowed at places designated by the authorities and otherwise needs a permit from the Gemeindevorstand, on any land. Breaches can be fined CHF 50 to 10,000 (Art. 46). Sleeping outdoors without a tent is not mentioned.',
      sources: [
        { title: 'Polizeigesetz der Gemeinde Pontresina, Art. 26, 46', url: 'https://api.gemeinde-pontresina.ch/fileadmin/user_upload/gemeinde-pontresina/Dokumente/Gesetzessammlung/P_Polizeigesetz_Genehmigt_durch_Urnengemeinde_vom_28._September_20.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3787,
    name: 'St.Moritz',
    officialHost: 'gemeinde-stmoritz.ch',
    rule: {
      stance: 'banned',
      summary:
        'Polizeiordnung of 22.9.2002, Art. 16, kept in force by the Polizeigesetz (Anhang A, Art. 35; in force 1.2.2026): camping outside marked campsites is banned, on any land; there is no definition of camping and no mention of bivouacking. Ordnungsbusse CHF 100. The municipality may repeal Art. 16 later (the rule is to move to the Baugesetz). The 2002 ordinance itself was not found online; its article is quoted in the Anhang.',
      sources: [
        { title: 'Polizeigesetz St. Moritz (7.7), Anhang A and Art. 35', url: 'https://www.gemeinde-stmoritz.ch/fileadmin/user_upload/dokumente/pdf/gesetze/7.7_Polizeigesetz_Anhang_Teilrevision_vom_26.11.2025_in_Kraft_am_01.02.2026.pdf' },
        { title: 'Verordnung über Ordnungsbussen (7.7.1)', url: 'https://www.gemeinde-stmoritz.ch/fileadmin/user_upload/dokumente/pdf/gesetze/7.7.1_VO-Ordnungsbussen_Teilrevision_vom_26.11.2025_in_Kraft_am_01.02.2026.pdf' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 3732,
    name: 'Flims',
    officialHost: 'gemeindeflims.ch',
    rule: {
      stance: 'banned',
      summary:
        'Gastwirtschaftsgesetz der Gemeinde Flims (in force 2000), Art. 17: camping outside approved campsites is banned; the Gemeinderat can grant exceptions. No fine is stated (Art. 18 refers to the cantonal law). A draft Polizeigesetz with a camping and bivouac ban (Art. 23) is in consultation and not in force.',
      sources: [
        { title: 'Gastwirtschaftsgesetz der Gemeinde Flims, Art. 17, 18', url: 'https://www.gemeindeflims.ch/_doc/2010893' },
      ],
      checkedOn: '2026-10-04',
    },
  },
  {
    bfs: 6290,
    name: 'Saas-Fee',
    officialHost: '3906.ch',
    rule: {
      stance: 'restricted',
      summary:
        'Polizeireglement (adopted 15.12.2025, homologated by the Staatsrat 22.4.2026), Art. 29: camping on public ground outside the zones designated by the municipality is an offence; camping means staying in tents, caravans or similar installations, and merely pitching a tent counts. Breaches can be fined CHF 10 to 5,000 (Art. 47). Public ground only, so it cannot be told from private land on a map; sleeping outdoors without a tent is not addressed. The saved text is OCR of a scan and its lead-in sentence is damaged.',
      sources: [{ title: 'Polizeireglement der Gemeinde Saas-Fee, Art. 29 and 47', url: 'https://www.3906.ch/_rte/publikation/13186' }],
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

/**
 * A reported rule that has NOT been verified against the municipality's own regulation (its text could not be read).
 * It is shown as a warning and caps the verdict at "Be careful"; it never produces "Not allowed", which stays
 * reserved for rules read at the source (see MUNICIPAL_RULES).
 */
export interface UnverifiedNote {
  bfs: number;
  name: string;
  text: string;
  /** Where it was reported: press or guide pages, not the regulation. */
  sources: { title: string; url: string }[];
  checkedOn: string;
}

export const UNVERIFIED_NOTES: UnverifiedNote[] = [
  {
    bfs: 6300,
    name: 'Zermatt',
    text:
      'Press and hiking-guide reports say the municipal Polizeireglement (2022), Art. 43, bans camping on public land throughout the municipality, including at mountain lakes such as Riffelsee and Stellisee, with a fine of CHF 200 per tent. ' +
      'Camping means staying in tents, caravans or similar installations, and merely pitching a tent counts. The regulation text itself could not be read (its server blocks automated access), so this is not verified: treat it as probably banned and check with the municipality.',
    sources: [
      { title: 'SRF: Zermatt erhält umstrittenes Polizeireglement (press report)', url: 'https://www.srf.ch/news/bern-freiburg-wallis-zermatt-erhaelt-umstrittenes-polizeireglement' },
      { title: 'Hikebeast: Wildcampen am Riffelsee (guide, secondary)', url: 'https://hikebeast.ch/de/journal/wildcampen-riffelsee/' },
    ],
    checkedOn: '2026-10-04',
  },
];

export function findUnverifiedNote(bfs: number | undefined): UnverifiedNote | undefined {
  return UNVERIFIED_NOTES.find((n) => n.bfs === bfs);
}
