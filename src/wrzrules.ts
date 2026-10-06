import type { Lang } from './i18n';

/**
 * The rule of a wildlife quiet zone as the federal data words it (`best_de` of ch.bafu.wrz-wildruhezonen_portal), in the
 * reader's language. The data has 18 distinct rule texts, one per rule code (R10 "Zutrittsverbot" ... R900 "Andere
 * Bestimmung" for binding zones, E10 ... E900 for recommended ones: "Bitte ..." is a request, never a ban), plus the one text
 * of the federal hunting-ban districts (ch.bafu.wrz-jagdbanngebiete_select).
 *
 * German is returned as it is. The other languages are plain renderings of the German, not of the data's own French and
 * Italian wording (`best_fr`, `best_it`): that wording is close but adds and drops words (both leave out the cross-country
 * trails of R110 and R120, and the Italian states a leash as an obligation in the zones that only ask for one). A text
 * that is not known is returned unchanged, so a new rule shows up as German instead of being guessed at.
 */
type Row = readonly [german: string, en: string, fr: string, it: string];

const RULES: readonly Row[] = [
  ['Andere Bestimmung', 'Other provision', 'Autre disposition', 'Altre disposizioni'],
  [
    'Zutrittsverbot abseits der eingezeichneten Wege, Leinenpflicht',
    'Entry prohibited off the marked paths; dogs must be kept on a leash',
    'Interdiction d’accès hors des chemins indiqués ; obligation de tenir les chiens en laisse',
    'Divieto di accesso al di fuori dei sentieri segnalati; obbligo di tenere i cani al guinzaglio',
  ],
  [
    'Zutrittsverbot (zu Fuss und Wintersportarten)',
    'Entry prohibited (on foot and for winter sports)',
    'Interdiction d’accès (à pied ou pour les sports d’hiver)',
    'Divieto di accesso (a piedi o per la pratica di sport invernali)',
  ],
  [
    'Zutrittsverbot, durchqueren auf eingezeichnetem Weg gestattet',
    'Entry prohibited; crossing allowed on the marked path',
    'Interdiction d’accès ; traversée autorisée sur le chemin indiqué',
    'Divieto di accesso; attraversamento consentito sul sentiero segnalato',
  ],
  ['Zutrittsverbot', 'Entry prohibited', 'Interdiction d’accès', 'Divieto di accesso'],
  [
    'Bitte eingezeichnete Routen und Wege nicht verlassen, Hunde an der Leine führen',
    'Please do not leave the marked routes and paths; keep dogs on a leash',
    'Merci de ne pas quitter les itinéraires et les chemins indiqués ; tenir les chiens en laisse',
    'Si prega di non abbandonare i percorsi e i sentieri segnalati e di tenere i cani al guinzaglio',
  ],
  [
    'Betreten oder befahren nur auf Pisten, Loipen und eingezeichneten Wegen oder Routen, Leinenpflicht',
    'Entering or riding allowed only on pistes, cross-country trails and the marked paths or routes; dogs must be kept on a leash',
    'Accès et circulation autorisés uniquement sur les pistes, les pistes de ski de fond et les chemins ou itinéraires indiqués ; obligation de tenir les chiens en laisse',
    'Accesso e transito consentiti solo su piste, piste di fondo e sentieri o percorsi segnalati; obbligo di tenere i cani al guinzaglio',
  ],
  [
    'Wegegebot, Leinenpflicht',
    'Keep to the paths; dogs must be kept on a leash',
    'Obligation de rester sur les chemins et de tenir les chiens en laisse',
    'Obbligo di rimanere sui sentieri e di tenere i cani al guinzaglio',
  ],
  [
    'Wintersportverbot abseits eingezeichneter Routen',
    'Winter sports prohibited off the marked routes',
    'Interdiction de pratiquer des sports d’hiver hors des itinéraires indiqués',
    'Divieto di praticare sport invernali al di fuori dei percorsi segnalati',
  ],
  ['Bitte nicht betreten', 'Please do not enter', 'Merci de ne pas entrer', 'Si prega di non entrare'],
  ['Wegegebot', 'Keep to the paths', 'Obligation de rester sur les chemins', 'Obbligo di rimanere sui sentieri'],
  [
    'Betreten oder befahren nur auf eingezeichneten Wegen oder Routen gestattet',
    'Entering or riding allowed only on the marked paths or routes',
    'Accès et circulation autorisés uniquement sur les chemins ou itinéraires indiqués',
    'Accesso e transito consentiti solo sui sentieri o percorsi segnalati',
  ],
  [
    'Bitte nicht betreten, durchqueren nur auf eingezeichneter Route, Hunde an der Leine führen',
    'Please do not enter; cross only on the marked route; keep dogs on a leash',
    'Merci de ne pas entrer ; traverser uniquement sur l’itinéraire indiqué ; tenir les chiens en laisse',
    'Si prega di non entrare; attraversare solo sul percorso segnalato; tenere i cani al guinzaglio',
  ],
  [
    'Zutrittsverbot, Abfahrt durch eingezeichneten Korridor gestattet',
    'Entry prohibited; descent through the marked corridor allowed',
    'Interdiction d’accès ; descente autorisée dans le couloir indiqué',
    'Divieto di accesso; discesa consentita nel corridoio segnalato',
  ],
  [
    'Bitte nicht betreten, durchqueren nur auf eingezeichneter Route',
    'Please do not enter; cross only on the marked route',
    'Merci de ne pas entrer ; traverser uniquement sur l’itinéraire indiqué',
    'Si prega di non entrare; attraversare solo sul percorso segnalato',
  ],
  [
    'Zutrittsverbot, durchqueren auf eingezeichneter Route gestattet',
    'Entry prohibited; crossing allowed on the marked route',
    'Interdiction d’accès ; traversée autorisée sur l’itinéraire indiqué',
    'Divieto di accesso; attraversamento consentito sul percorso segnalato',
  ],
  [
    'Betreten oder befahren nur auf Pisten, Loipen und eingezeichneten Wegen oder Routen',
    'Entering or riding allowed only on pistes, cross-country trails and the marked paths or routes',
    'Accès et circulation autorisés uniquement sur les pistes, les pistes de ski de fond et les chemins ou itinéraires indiqués',
    'Accesso e transito consentiti solo su piste, piste di fondo e sentieri o percorsi segnalati',
  ],
  ['Wintersportverbot', 'Winter sports prohibited', 'Interdiction de pratiquer des sports d’hiver', 'Divieto di praticare sport invernali'],
  // federal hunting-ban districts (ch.bafu.wrz-jagdbanngebiete_select)
  [
    'Schneesportarten verboten ausserhalb markierter Pisten, Routen und Loipen',
    'Snow sports prohibited outside the marked pistes, routes and cross-country trails',
    'Sports de neige interdits en dehors des pistes, itinéraires et pistes de ski de fond balisés',
    'Sport sulla neve vietati al di fuori di piste, percorsi e piste di fondo segnalati',
  ],
];

/** The parts a rule is made of, for a combination the table does not list ("Zutrittsverbot, Leinenpflicht"). */
const CLAUSES: readonly Row[] = [
  ['Zutrittsverbot', 'Entry prohibited', 'Interdiction d’accès', 'Divieto di accesso'],
  ['Betretungsverbot', 'Entry prohibited', 'Interdiction d’accès', 'Divieto di accesso'],
  ['Wintersportverbot', 'Winter sports prohibited', 'Interdiction de pratiquer des sports d’hiver', 'Divieto di praticare sport invernali'],
  ['Wegegebot', 'Keep to the paths', 'Obligation de rester sur les chemins', 'Obbligo di rimanere sui sentieri'],
  ['Leinenpflicht', 'Dogs must be kept on a leash', 'Obligation de tenir les chiens en laisse', 'Obbligo di tenere i cani al guinzaglio'],
  ['Hunde an der Leine führen', 'Keep dogs on a leash', 'Tenir les chiens en laisse', 'Tenere i cani al guinzaglio'],
  ['Bitte nicht betreten', 'Please do not enter', 'Merci de ne pas entrer', 'Si prega di non entrare'],
];

const INDEX: Record<'en' | 'fr' | 'it', number> = { en: 1, fr: 2, it: 3 };
const key = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '').toLowerCase();
const table = (rows: readonly Row[]) => new Map(rows.map((r) => [key(r[0]), r] as const));
const WHOLE = table(RULES);
const PART = table(CLAUSES);

/** Commas outside brackets separate the parts of a rule. */
const parts = (s: string) => s.trim().split(/,\s*(?![^()]*\))/);

/**
 * The zone rule `german` (as in `best_de`) in `lang`. German comes back unchanged; so does any text this does not know,
 * including a combination in which one part is unknown.
 */
export function explainWrzRule(german: string, lang: Lang): string {
  if (lang === 'de') return german;
  const i = INDEX[lang];
  const whole = WHOLE.get(key(german));
  if (whole) return whole[i]!;
  const known = parts(german).map((p) => PART.get(key(p)));
  if (known.length === 0 || known.some((r) => !r)) return german;
  // the parts of a combination run on after the first: "Entry prohibited; dogs must be kept on a leash"
  return known.map((r, n) => (n === 0 ? r![i]! : r![i]!.replace(/^./, (c) => c.toLowerCase()))).join(lang === 'fr' ? ' ; ' : '; ');
}
