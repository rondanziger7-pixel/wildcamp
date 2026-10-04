import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { MUNICIPAL_RULES, findMunicipalRule } from '../src/municipalities';

const squash = (t: string) => t.replace(/(?<=\p{L})-\s*\n\s*(?=\p{L})/gu, '').replace(/[’]/g, "'").replace(/\s+/g, ' ').toLowerCase();
const text = (dir: string, file: string) => squash(readFileSync(`docs/sources/municipal/${dir}/${file}`, 'utf8'));

/** bfs, folder, file, a sentence the recorded rule rests on */
const QUOTES: [number, string, string, string][] = [
  [261, '261_Zuerich', 'Allgemeine-Polizeiverordnung_2026-04-01.txt', 'Das Campieren in Zelten, Wohnwagen und dergleichen auf öffentlichem Grund ausserhalb besonders bezeichneter oder hierfür eingerichteter Plätze bedarf einer Bewilligung des Sicherheitsdepartements'],
  [230, '230_Winterthur', 'Allgemeine-Polizeiverordnung_2014-06-01.txt', 'Das Campieren in Zelten, Wohnwagen, Wohnmobilen und dergleichen auf öffentlichem Grund ausserhalb besonders bezeichneter oder hiefür eingerichteter Campingplätze ist bewilligungspflichtig'],
  [230, '230_Winterthur', 'Allgemeine-Polizeiverordnung_2014-06-01.txt', 'Auf privatem Grund ist das Zelten und Campieren nur mit Bewilligung der Grundeigentümerin oder des Grundeigentümers gestattet'],
  [3203, '3203_St.Gallen', 'Polizeireglement_2025-10-01.txt', 'Auf dem öffentlichen Grund ist das Campieren ausserhalb der von den zuständigen Behörden bezeichneten Grundstücke verboten'],
  [4001, '4001_Aarau', 'Polizeiverordnung_2023-01-01.txt', 'Wer ohne Bewilligung auf öffentlichem Grund zum Zwecke des Campierens Wohnwagen, Wohnmobile oder Zelte etc. aufstellt, wird bestraft'],
  [371, '371_Biel-Bienne', 'Ortspolizeireglement_2023-01-01.txt', 'Übernachten in Zelten, Fahrzeugen und fahrzeugähnlichen Objekten ausserhalb der speziell dafür vorgesehenen Flächen'],
  [371, '371_Biel-Bienne', 'Ortspolizeireglement_2023-01-01.txt', 'Auf öffentlichem Grund ist das Übernachten im Freien erlaubt'],
  [2601, '2601_Solothurn', 'Polizeiordnung_2024-09-01.txt', 'Das Campieren, das Aufstellen von Zelten, Wohnwagen usw. auf öffentlichem Grund und Boden ist nur auf den vom Stadtpräsidium bezeichneten und bewilligten Plätzen zulässig'],
  [2939, '2939_Schaffhausen', 'Polizeiverordnung_2016-01-01.txt', 'Das Aufstellen von Wohnwagen und Zelten auf öffentlichem Grund ist nur auf den dafür eingerichteten Campingplätzen zulässig'],
  [355, '355_Koeniz', 'Ortspolizeireglement_2012-06-25.txt', 'Der Aufenthalt in Zelten auf öffentlichem Boden ist ausschliesslich auf den behördlich bezeichneten Plätzen zulässig'],
  [3901, '3901_Chur', 'Polizeigesetz_2026-10-01.txt', 'Auf öffentlichem Grund ist das Campieren nur an den von den Behörden bezeichneten Stellen erlaubt'],
  [3901, '3901_Chur', 'Waldgesetz_2000-01-01.txt', 'Das Campieren im Wald ist in der Regel verboten'],
  [942, '942_Thun', 'Ortspolizeireglement_2024-03-01.txt', 'Zelten oder Notdächern jeglicher Art zu Übernachtungszwecken ist auf öffentlichem Grund verboten'],
  [5113, '5113_Locarno', 'Ordinanza-sul-campeggio_2010-01-01.txt', "Il campeggio su suolo demaniale comunale, quale i giardini, parchi, strade, piazze, parcheggi, boschi, golene e su aree private aperte è vietato"],
  [5586, '5586_Lausanne', 'Reglement-general-de-police-RGP_2017-11-01.txt', 'Il est interdit de camper sur la voie publique et ses abords ainsi que dans les forêts'],
  [5586, '5586_Lausanne', 'Dispositions-espaces-verts_2021-07-01.txt', 'Le camping et les bivouacs sont strictement interdits'],
  [2196, '2196_Fribourg', 'Reglement-general-de-police_2025-01-01.txt', 'ainsi que l\'installation de tentes de camping'],
  [6458, '6458_Neuchatel', 'Reglement-de-police-12.2_2019-04-01.txt', "n'est autorisé qu'aux endroits"],
  [6266, '6266_Sion', 'Reglement-communal-de-police-5.1_1997-11-05.txt', "Le camping, le caravaning et ce qui leur est assimilable sont interdits en dehors des emplacements autorisés par l'autorité communale"],
];

describe('city police regulations (texts read 2026-10-04)', () => {
  it('each recorded rule rests on a sentence found in the saved regulation', () => {
    for (const [bfs, dir, file, quote] of QUOTES) {
      expect(findMunicipalRule(bfs), String(bfs)).toBeDefined();
      const saved = text(dir, file);
      expect(saved, `${dir}: ${quote.slice(0, 60)}`).toContain(squash(quote));
    }
  });
  it('Locarno is the only city recorded as banned: it names private land open to the public', () => {
    const banned = MUNICIPAL_RULES.filter((m) => [261, 230, 3203, 4001, 371, 2601, 2939, 355, 3901, 942, 5113, 5586, 2196, 6458, 6266].includes(m.bfs) && m.rule.stance === 'banned');
    expect(banned.map((m) => m.bfs)).toEqual([5113]);
    expect(findMunicipalRule(5113)!.rule.summary).toMatch(/private areas open to the public/);
  });
  it('a recorded city rule caps at caution, Locarno forces no', () => {
    const v = (bfs: number) => assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: findMunicipalRule(bfs)!.rule }).verdict;
    for (const bfs of [261, 230, 3203, 4001, 371, 2601, 2939, 355, 3901, 942, 5586, 2196, 6458, 6266]) expect(v(bfs), String(bfs)).toBe('caution');
    expect(v(5113)).toBe('no');
  });
  it('summaries say what is not addressed and give the article', () => {
    for (const bfs of [261, 230, 3203, 4001, 371, 2601, 2939, 355, 3901, 942, 5113, 5586, 2196, 6458, 6266]) {
      const s = findMunicipalRule(bfs)!.rule.summary;
      expect(s, String(bfs)).toMatch(/Art\. \d+|§ \d+/);
      expect(s, String(bfs)).toMatch(/not addressed|covered only|Caution|pending|amended|expressly allowed/i);
    }
  });
  it('Biel and Thun say that sleeping outdoors without a tent is allowed, so the rule is not a blanket ban', () => {
    expect(findMunicipalRule(371)!.rule.summary).toMatch(/without a tent is expressly allowed/);
    expect(findMunicipalRule(942)!.rule.summary).toMatch(/without a tent in public parks/);
  });
  it('Neuchâtel flags that its regulation may no longer be the one in force', () => {
    expect(findMunicipalRule(6458)!.rule.summary).toMatch(/could not be confirmed/);
  });
  it('cities with no general camping rule are read and deliberately not recorded', () => {
    for (const bfs of [2701, 1061, 5002, 6621, 5192, 1711]) expect(findMunicipalRule(bfs), String(bfs)).toBeUndefined();
    expect(text('6621_Geneve', 'Reglement-plage-Eaux-Vives-LC213164_2022-11-01.txt')).toContain('toute forme de camping est interdite');
    expect(text('5192_Lugano', 'Ordinanza-parchi-urbani-giardini-pubblici_2024-11-07.txt')).toContain('è vietato campeggiare o pernottare nei parchi');
    expect(text('1711_Zug', 'Benuetzung-oeffentliche-Anlagen_2025-01-01.txt')).toContain('verbot des unbewilligten campierens');
  });
});
