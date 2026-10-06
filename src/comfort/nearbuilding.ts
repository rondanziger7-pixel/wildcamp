import type { Shelter, ShelterResult } from './shelters';
import { tr } from '../i18n';

/**
 * Sleeping next to a mountain hut, inn or alp. There is no federal or cantonal distance rule; the Swiss Alpine Club's
 * leaflet "Campieren und Biwakieren in den Schweizer Bergen" (2014) is the guidance: do not sleep too close to huts, ask the
 * hut team (and offer to pay for the toilet or buy something), and ask the farmer or hut team before sleeping near alp or
 * mountain huts. The leaflet names no distance, so "close" is this app's own choice.
 */
export const NEAR_BUILDING_M = 300;
export const SAC_MERKBLATT = 'https://www.sac-cas.ch/fileadmin/Umwelt/Bergsport_und_Umwelt/Campieren___Biwakieren/SAC-Merkblatt-Campieren-Biwakieren-DE.pdf';

export interface NearBuildingNote {
  tone: 'warn';
  title: string;
  text: string;
  sources: string[];
  at: { e: number; n: number; label: string };
}

const KINDS: Shelter['kind'][] = ['hut', 'inn', 'alp'];

/** The nearest hut, mountain inn or alp within NEAR_BUILDING_M of the spot, as a note for the legality details. */
export function nearBuildingNote(r: ShelterResult | undefined): NearBuildingNote | undefined {
  const s = r?.shelters.filter((x) => KINDS.includes(x.kind) && x.meters <= NEAR_BUILDING_M).sort((a, b) => a.meters - b.meters)[0];
  if (!s) return undefined;
  const dist = `${Math.max(10, Math.round(s.meters / 10) * 10)} m`;
  const common = { tone: 'warn' as const, sources: [SAC_MERKBLATT], at: { ...s.at, label: s.name } };
  if (s.kind === 'alp')
    return { ...common, title: tr('Close to an alp'), text: tr('{name} is about {dist} away. The Swiss Alpine Club asks you to ask the farmer for permission before sleeping near alp huts. This is the club\'s guidance, not a law.', { name: s.name, dist }) };
  if (s.kind === 'inn')
    return { ...common, title: tr('Close to a mountain inn'), text: tr('{name} is about {dist} away. The land around an inn or restaurant is usually private: ask the owner or host before you camp. The Swiss Alpine Club gives the same advice for huts. This is guidance, not a law.', { name: s.name, dist }) };
  return { ...common, title: tr('Close to a mountain hut'), text: tr('{name} is about {dist} away. The Swiss Alpine Club asks you not to sleep close to huts. If you still camp nearby, ask the hut team and offer to pay for the toilet or buy something in the hut. This is the club\'s guidance, not a law.', { name: s.name, dist }) };
}
