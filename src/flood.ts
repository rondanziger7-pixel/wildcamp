import { getLang, tr } from './i18n';

/**
 * The national flood warning of the Federal Office for the Environment (BAFU): a hazard level from 1 to 5 for the region (and for
 * rivers and lakes where the map has them), read live at the spot through the WMS of geo.admin.ch. Level names are the ones of the
 * layer's own legend in each language (read from the legend images of ch.bafu.hydroweb-warnkarte_national, 2026-10-07).
 */

const WMS = 'https://wms.geo.admin.ch/';
const LAYER = 'ch.bafu.hydroweb-warnkarte_national';
export const FLOOD_SOURCE = `https://map.geo.admin.ch/?layers=${LAYER}`;
const NUMBERS = 'https://www.hydrodaten.admin.ch/';

export type FloodKind = 'Region' | 'River' | 'Lake';

export interface FloodWarning {
  /** 1 (no or minor danger) to 5 (very high). */
  level: number;
  /** Name of the region, river section or lake. */
  name: string;
  kind: FloodKind;
}

/** The legend's words for levels 1 to 5, from the legend images of the layer. */
const WORDS = {
  en: ['no or minor', 'moderate', 'considerable', 'high', 'very high'],
  de: ['keine oder geringe', 'mässige', 'erhebliche', 'grosse', 'sehr grosse'],
  fr: ['aucun ou faible', 'limité', 'marqué', 'fort', 'très fort'],
  it: ['nullo o debole', 'moderato', 'marcato', 'forte', 'molto forte'],
} as const;

export const floodWord = (level: number, lang = getLang()) => WORDS[lang][Math.max(1, Math.min(5, Math.round(level))) - 1]!;

/** The warnings in a text/plain GetFeatureInfo answer (one block per feature, the same area can appear in two layers). */
export function parseFloodInfo(text: string): FloodWarning[] {
  const out: FloodWarning[] = [];
  const seen = new Set<string>();
  for (const block of text.split(/Feature \d+:/).slice(1)) {
    const cls = /ws-class = '([A-Za-z]+)\.(\d)'/.exec(block);
    if (!cls) continue;
    const kind = cls[1] as FloodKind;
    const level = Number(cls[2]);
    if ((kind !== 'Region' && kind !== 'River' && kind !== 'Lake') || level < 1 || level > 5) continue; // level 0: no level given
    const bold = /<b>([^<]+)<\/b>/.exec(block)?.[1]?.trim();
    const river = /Fluss = '([^']*)'/.exec(block)?.[1]?.trim();
    const section = /Abschnitt = '([^']*)'/.exec(block)?.[1]?.trim();
    const name = bold || [river, section].filter(Boolean).join(', ');
    if (!name) continue;
    const key = `${kind}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ level, name: name.replace(/&amp;/g, '&'), kind });
  }
  return out;
}

export async function fetchFloodWarnings(e: number, n: number, signal?: AbortSignal): Promise<FloodWarning[]> {
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: LAYER,
    QUERY_LAYERS: LAYER,
    STYLES: '',
    CRS: 'EPSG:2056',
    BBOX: `${e - 50},${n - 50},${e + 50},${n + 50}`,
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'text/plain',
    FEATURE_COUNT: '10',
  });
  const res = await fetch(`${WMS}?${q}`, { signal });
  if (!res.ok) throw new Error(`flood warning ${res.status}`);
  const text = await res.text();
  if (/ServiceException/.test(text)) throw new Error('flood warning: service error');
  return parseFloodInfo(text);
}

/** The most serious warning at the spot, if any is above level 1. */
export function worstFlood(list: readonly FloodWarning[] | undefined): FloodWarning | undefined {
  const top = [...(list ?? [])].sort((a, b) => b.level - a.level)[0];
  return top && top.level >= 2 ? top : undefined;
}

export const FLOOD_SOURCES = [FLOOD_SOURCE, NUMBERS];

/** The warning as a detail for the sleep tab, when one above level 1 applies; level 3 and up is also a line on the first view. */
export function floodFactor(list: readonly FloodWarning[] | undefined): { tone: 'bad' | 'warn'; alert: boolean; title: string; text: string; sources: string[] } | undefined {
  const w = worstFlood(list);
  if (!w) return undefined;
  const where = w.kind === 'Region' ? tr('the region {name}', { name: w.name }) : w.kind === 'River' ? tr('the river section {name}', { name: w.name }) : tr('the lake {name}', { name: w.name });
  const head = tr('Flood warning, level {level} ({word}), for {where}.', { level: w.level, word: floodWord(w.level), where });
  const advice = tr('Streams and rivers can rise within hours, also where it is dry at your spot. Do not camp on a bank, on the shore of a lake or river, or in a dry stream bed, and look at the current warnings of the Federal Office for the Environment.');
  const alert = w.level >= 3;
  return { tone: w.level >= 4 ? 'bad' : 'warn', alert, title: alert ? tr('Flood warning, level {level}: keep away from streams and shores', { level: w.level }) : tr('Flood warning: level {level}', { level: w.level }), text: `${head} ${advice}`, sources: FLOOD_SOURCES };
}
