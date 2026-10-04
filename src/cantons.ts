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

/** All 26 cantons. No rule is set until one has been verified; see docs/CANTON_RESEARCH.md. */
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
  { code: 'NW', name: 'Nidwalden' },
  { code: 'OW', name: 'Obwalden' },
  { code: 'SG', name: 'St. Gallen' },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'TG', name: 'Thurgau' },
  { code: 'TI', name: 'Ticino' },
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
