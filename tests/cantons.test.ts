import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assess } from '../src/assess';
import { CANTONS, findCanton, validateRule, type Canton, type CantonRule } from '../src/cantons';
import { parseCanton, parseMunicipality } from '../src/geoadmin';
import { MUNICIPAL_RULES, findMunicipalRule, validateMunicipalEntry } from '../src/municipalities';

const rule = (over: Partial<CantonRule> = {}): CantonRule => ({
  stance: 'tolerated',
  summary: 'Example summary.',
  sources: [{ title: 'Example law', url: 'https://www.vs.ch/example' }],
  checkedOn: '2026-10-04',
  ...over,
});
const VS: Canton = { code: 'VS', name: 'Valais' };
const withRule = (r: CantonRule): Canton => ({ ...VS, rule: r });

describe('canton list', () => {
  it('has all 26 cantons with unique codes', () => {
    expect(CANTONS).toHaveLength(26);
    expect(new Set(CANTONS.map((c) => c.code)).size).toBe(26);
  });
  it('every rule that is set passes validation', () => {
    for (const c of CANTONS) {
      if (c.rule) expect(validateRule(c, c.rule), c.name).toEqual([]);
    }
  });
  it('every rule has its source text saved under docs/sources/<code>/', () => {
    for (const c of CANTONS) {
      if (!c.rule) continue;
      const dir = `docs/sources/${c.code}`;
      expect(existsSync(dir) && readdirSync(dir).length > 0, `${c.name}: no saved source in ${dir}`).toBe(true);
    }
  });
  it('finds by code', () => {
    expect(findCanton('GR')?.name).toBe('Graubünden');
    expect(findCanton('XX')).toBeUndefined();
    expect(findCanton(undefined)).toBeUndefined();
  });
});

describe('validateRule', () => {
  it('accepts official cantonal and federal sources', () => {
    expect(validateRule(VS, rule())).toEqual([]);
    expect(validateRule(VS, rule({ sources: [{ title: 'x', url: 'https://www.fedlex.admin.ch/eli/x' }] }))).toEqual([]);
    expect(validateRule({ code: 'GR', name: 'Graubünden' }, rule({ sources: [{ title: 'x', url: 'https://www.gr-lex.gr.ch/app/de/x' }] }))).toEqual([]);
    expect(validateRule({ code: 'JU', name: 'Jura' }, rule({ sources: [{ title: 'x', url: 'https://www.jura.ch/x' }] }))).toEqual([]);
  });
  it('rejects blogs, other cantons, lookalike hosts and plain http', () => {
    const bad = (url: string) => validateRule(VS, rule({ sources: [{ title: 'x', url }] })).length > 0;
    expect(bad('https://hikebeast.ch/journal/wild-camping-switzerland/')).toBe(true);
    expect(bad('https://www.be.ch/example')).toBe(true);
    expect(bad('https://notvs.ch/example')).toBe(true);
    expect(bad('https://vs.ch.evil.example/x')).toBe(true);
    expect(bad('http://www.vs.ch/example')).toBe(true);
    expect(bad('not a url')).toBe(true);
  });
  it('requires a source, a real date and a summary', () => {
    expect(validateRule(VS, rule({ sources: [] }))).toContain('needs at least one source');
    expect(validateRule(VS, rule({ checkedOn: '4 Oct 2026' }))).not.toEqual([]);
    expect(validateRule(VS, rule({ checkedOn: '2026-13-45' }))).not.toEqual([]);
    expect(validateRule(VS, rule({ summary: '  ' }))).toContain('empty summary');
  });
});

describe('parseCanton', () => {
  it('reads the canton code from an identify response', () => {
    const body = { results: [{ layerBodId: 'ch.swisstopo.swissboundaries3d-kanton-flaeche.fill', attributes: { ak: 'VS', name: 'Valais', label: 'Valais' } }] };
    expect(parseCanton(body)?.code).toBe('VS');
  });
  it('is undefined for empty or unknown results', () => {
    expect(parseCanton({})).toBeUndefined();
    expect(parseCanton({ results: [] })).toBeUndefined();
    expect(parseCanton({ results: [{ layerBodId: 'x', attributes: { ak: 'XX' } }] })).toBeUndefined();
  });
});

describe('assess with a canton', () => {
  const clear = { zones: [], treeline: 'above' as const };
  it('without a verified rule, says so and leaves the verdict alone', () => {
    const a = assess({ ...clear, canton: VS });
    expect(a.verdict).toBe('likely_ok');
    expect(a.reasons.join(' ')).toMatch(/Valais: cantonal rules are not verified/);
  });
  it('a verified ban overrides an otherwise clear spot and cites its source', () => {
    const a = assess({ ...clear, canton: withRule(rule({ stance: 'banned' })) });
    expect(a.verdict).toBe('no');
    expect(a.reasons.join(' ')).toContain('https://www.vs.ch/example');
  });
  it('a verified restriction downgrades likely_ok to caution only', () => {
    expect(assess({ ...clear, canton: withRule(rule({ stance: 'restricted' })) }).verdict).toBe('caution');
    expect(assess({ zones: [], treeline: 'unknown', canton: withRule(rule({ stance: 'restricted' })) }).verdict).toBe('unknown');
  });
  it('a tolerated stance does not make anything more permissive', () => {
    expect(assess({ zones: [], treeline: 'forest', canton: withRule(rule()) }).verdict).toBe('caution');
  });
  it('works with no canton at all', () => {
    expect(assess(clear).verdict).toBe('likely_ok');
  });
});

describe('municipality', () => {
  // Attributes copied from a live identify response with timeInstant=2026.
  const current = { layerBodId: 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill', attributes: { gemname: 'Zermatt', gde_nr: 6300, jahr: 2026, kanton: 'VS', is_current_jahr: true } };
  const old = { layerBodId: 'x', attributes: { gemname: 'Zermatt', gde_nr: 6300, jahr: 1861, kanton: 'VS', is_current_jahr: false } };
  it('reads the current municipality and ignores historical years', () => {
    expect(parseMunicipality({ results: [old, current] })).toEqual({ name: 'Zermatt', bfs: 6300, canton: 'VS' });
    expect(parseMunicipality({ results: [old] })).toBeUndefined();
    expect(parseMunicipality({})).toBeUndefined();
  });
  it('is mentioned in the assessment without changing the verdict', () => {
    const a = assess({ zones: [], treeline: 'above', municipality: 'Zermatt' });
    expect(a.verdict).toBe('likely_ok');
    expect(a.municipality).toBe('Zermatt');
    expect(a.reasons.join(' ')).toMatch(/Municipality: Zermatt/);
  });
});

describe('municipal rules', () => {
  it('every entry passes the source gate and has its text saved', () => {
    for (const m of MUNICIPAL_RULES) {
      expect(validateMunicipalEntry(m), m.name).toEqual([]);
      const dir = `docs/sources/municipal/${m.bfs}_${m.name}`;
      expect(existsSync(dir) && readdirSync(dir).length > 0, `${m.name}: no saved source in ${dir}`).toBe(true);
    }
    expect(new Set(MUNICIPAL_RULES.map((m) => m.bfs)).size).toBe(MUNICIPAL_RULES.length);
  });
  it('rejects a municipal source that is not on the municipality\'s own site', () => {
    const bad = { ...MUNICIPAL_RULES[0]!, rule: { ...MUNICIPAL_RULES[0]!.rule, sources: [{ title: 'x', url: 'https://hikebeast.ch/x' }] } };
    expect(validateMunicipalEntry(bad)).not.toEqual([]);
  });
  it('Bern city (BFS 351) caps a clear spot at caution and cites the ordinance', () => {
    const entry = findMunicipalRule(351)!;
    const a = assess({ zones: [], treeline: 'above', municipality: 'Bern', municipalRule: entry.rule });
    expect(a.verdict).toBe('caution');
    expect(a.reasons.join(' ')).toContain('stadtrecht.bern.ch/lex-732_221');
    expect(findMunicipalRule(6300)).toBeUndefined();
  });
  it('a municipal ban forces no', () => {
    const rule = { ...MUNICIPAL_RULES[0]!.rule, stance: 'banned' as const };
    expect(assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: rule }).verdict).toBe('no');
  });
});

describe('Kandersteg (BFS 565)', () => {
  const k = findMunicipalRule(565)!;
  it('is recorded with the municipality\'s own documents', () => {
    expect(k.name).toBe('Kandersteg');
    expect(k.rule.stance).toBe('banned');
    expect(k.rule.sources.every((x) => x.url.startsWith('https://www.gemeindekandersteg.ch/'))).toBe(true);
  });
  it('forces no, and the summary says the tentless bivouac is outside the municipal ban', () => {
    const a = assess({ zones: [], treeline: 'above', municipality: 'Kandersteg', municipalRule: k.rule });
    expect(a.verdict).toBe('no');
    expect(k.rule.summary).toMatch(/Biwakieren/);
    expect(k.rule.summary).toMatch(/Art\. 7/);
  });
  it('the saved regulation says what the summary says', () => {
    const text = readFileSync('docs/sources/municipal/565_Kandersteg/Gemeindepolizeireglement_2021-01-01.txt', 'utf8');
    expect(text).toMatch(/Das Campieren ausserhalb der speziell dafür vorgesehenen und\s+bewilligten Flächen ist nicht gestattet/);
    expect(text).toMatch(/Übernachten im Freien ohne Zelt, im Iglu oder in einer\s+Schneehöhle \(Biwakieren\)/);
    expect(text).toMatch(/Fr\. 5’000/);
  });
});

describe('Bernese Oberland municipalities', () => {
  const banned = [565, 573, 576, 584, 594, 841, 842];
  const restricted = [561, 567, 581, 768, 792, 843];
  const squash = (t: string) => t.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').toLowerCase();
  const text = (dir: string, file: string) => squash(readFileSync(`docs/sources/municipal/${dir}/${file}`, 'utf8'));
  it('records each municipality with the stance its regulation supports', () => {
    for (const b of banned) expect(findMunicipalRule(b)?.rule.stance, String(b)).toBe('banned');
    for (const r of restricted) expect(findMunicipalRule(r)?.rule.stance, String(r)).toBe('restricted');
  });
  it('a ban forces no and a public-ground-only rule caps at caution', () => {
    for (const b of banned) expect(assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: findMunicipalRule(b)!.rule }).verdict).toBe('no');
    for (const r of restricted) expect(assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: findMunicipalRule(r)!.rule }).verdict).toBe('caution');
  });
  it('every summary names its fine and says whether a tentless bivouac is covered or not addressed', () => {
    for (const m of MUNICIPAL_RULES.filter((x) => [565, 573, 576, 584, 594, 841, 842, 561, 567, 581, 768, 792, 843].includes(x.bfs))) {
      expect(m.rule.summary, m.name).toMatch(/CHF [\d,]+/);
      expect(m.rule.summary, m.name).toMatch(/without a tent|Biwakieren|tent/);
    }
  });
  it('the saved regulations contain the sentences the summaries rely on', () => {
    expect(text('581_Interlaken', 'gemeindepolizeireglement_552.11.txt')).toContain('campieren und feste feiern ist auf öffentlichem grund ohne bewilligung verboten');
    expect(text('573_Brienz', 'gemeindepolizeireglement_2014.txt')).toContain('das campieren im öffentlichen raum ist verboten');
    expect(text('573_Brienz', 'gemeindepolizeireglement_2014.txt')).toContain('das biwakieren');
    expect(text('768_Spiez', 'gemeindepolizeireglement_2013.txt')).toContain('auf öffentlichem grund ist das campieren verboten');
    expect(text('843_Saanen', 'ortspolizeireglement.txt')).toContain('drei aufeinanderfolgenden nächten bewilligungsfrei');
    expect(text('842_Lauenen', 'campingreglement_1984.txt')).toContain('auf öffentlichem grund ist das campieren nicht gestattet');
    expect(text('841_Gsteig', 'camping-reglement_2006.txt')).toContain('wildes campieren');
    expect(text('594_Wilderswil', 'gemeindepolizeireglement_2017.txt')).toContain('übernachten in fahrzeugen und zelten (campieren) ausserhalb der speziell dafür vorgesehenen flächen verboten');
    expect(text('561_Adelboden', 'ortspolizeireglement.txt')).toContain('auf öffentlichem grund ist das campieren nur an den von der ortspolizeibehörde bezeichneten stellen gestattet');
    expect(text('792_Lenk', 'gemeindepolizeireglement_2007.txt')).toContain('übernachten in fahrzeugen und zelten (campieren) ausserhalb der speziell dafür vorgesehenen flächen verboten');
  });
  it('Meiringen was read and has no camping ban, so it is deliberately not recorded', () => {
    expect(findMunicipalRule(785)).toBeUndefined();
    expect(text('785_Meiringen', 'ortspolizeireglement_2009.txt')).toContain('campingzwecke zur verfügung stellt, benötigt eine baubewilligung');
  });
});

describe('municipalities in Valais, Uri and Graubünden', () => {
  const banned = [1202, 1208, 3732, 3784, 3787, 3851, 3871];
  const restricted = [1212, 3921, 6057, 6058, 6111];
  const squash = (t: string) => t.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').toLowerCase();
  const text = (dir: string, file: string) => squash(readFileSync(`docs/sources/municipal/${dir}/${file}`, 'utf8'));
  it('records each with the stance its text supports', () => {
    for (const b of banned) expect(findMunicipalRule(b)?.rule.stance, String(b)).toBe('banned');
    for (const r of restricted) expect(findMunicipalRule(r)?.rule.stance, String(r)).toBe('restricted');
  });
  it('a ban forces no and a public-ground-only rule caps at caution', () => {
    for (const b of banned) expect(assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: findMunicipalRule(b)!.rule }).verdict).toBe('no');
    for (const r of restricted) expect(assess({ zones: [], treeline: 'above', municipality: 'X', municipalRule: findMunicipalRule(r)!.rule }).verdict).toBe('caution');
  });
  it('the saved texts contain the sentences the summaries rely on', () => {
    for (const [dir, file] of [['6057_Fiesch', 'polizeireglement.txt'], ['6058_Fieschertal', 'polizeireglement.txt'], ['6111_Leukerbad', 'polizeireglement.txt']] as const)
      expect(text(dir, file)).toContain('das campieren und übernachten auf öffentlichem grund und boden ist nur in den von der gemeinde dafür bezeichneten zonen gestattet');
    expect(text('1202_Andermatt', 'bzo.txt')).toContain('das wilde campieren ist verboten');
    expect(text('1212_Realp', 'bzo.txt')).toContain('das wilde campieren ist verboten');
    expect(text('1208_Goeschenen', 'campingverordnung_2022.txt')).toContain('ausserhalb behördlich bewilligter camping- oder stellplätze ist nicht gestattet');
    expect(text('3851_Davos', 'verordnung_campingwesen.txt')).toContain('ausserhalb von behördlich bewilligten standorten untersagt');
    expect(text('3871_Klosters', 'baugesetz.txt')).toContain('ausserhalb der bauzone sowie generell auf öffentlichem grund untersagt');
    expect(text('3921_Arosa', 'polizeigesetz_610.100.txt')).toContain('nur an den von der gemeinde bezeichneten stellen erlaubt');
    expect(text('3784_Pontresina', 'polizeigesetz.txt')).toContain('ansonsten ist das campieren ohne bewilligung des gemeindevorstandes untersagt');
    expect(text('3787_St.Moritz', 'polizeigesetz_7.7_rev2026.txt')).toContain('ausserhalb von gekennzeichneten campingplätzen ist das campieren untersagt');
    expect(text('3732_Flims', 'gastwirtschaftsgesetz.txt')).toContain('das campieren ausserhalb von bewilligten campingplätzen ist verboten');
  });
  it('Grächen, Wildhaus-Alt St. Johann and Muotathal were read and have no camping article, so they are not recorded', () => {
    for (const b of [6285, 3359, 1367]) expect(findMunicipalRule(b)).toBeUndefined();
  });
  it('Zermatt, Saas-Fee, Riederalp, Bettmeralp and Glarus Süd are not recorded because their regulations could not be read', () => {
    for (const b of [6300, 6290, 6181, 6205, 1631]) expect(findMunicipalRule(b)).toBeUndefined();
  });
});

describe('Ticino mountain exception', () => {
  const ti = findCanton('TI')!;
  it('is restricted below the treeline but tolerated above it (Art. 2 para. 2 of the camping law)', () => {
    expect(ti.rule?.aboveTreeline).toBe('tolerated');
    expect(assess({ zones: [], treeline: 'above', canton: ti }).verdict).toBe('likely_ok');
    expect(assess({ zones: [], treeline: 'below', canton: ti }).verdict).toBe('caution');
    expect(assess({ zones: [], treeline: 'forest', canton: ti }).verdict).toBe('caution');
  });
  it('says that "in the mountains" is not defined', () => {
    const a = assess({ zones: [], treeline: 'above', canton: ti });
    expect(a.items.find((i) => i.title === 'Ticino rules')?.text).toMatch(/does not define/);
  });
  it('a Ticino reserve ban still wins above the treeline', () => {
    const zone = { layer: { id: 'x', label: 'Ticino protected area', severity: 'restricted' as const, note: 'ban' } };
    expect(assess({ zones: [zone], treeline: 'above', canton: ti }).verdict).toBe('no');
  });
});
