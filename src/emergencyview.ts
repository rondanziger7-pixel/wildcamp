import { EMERGENCY_SOURCES, emergencyNumbers, positionMessage, positionText, smsLink, whatToSay, type Position } from './emergency';
import { tr } from './i18n';

/** An element with a class and children (text or nodes). */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...kids: (string | Node)[]) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
};

export interface EmergencyHooks {
  /** The spot checked last, offered as the position when there is one. */
  spot?: Position;
  /** One fix from the phone. Rejects when it cannot be had. */
  locate(): Promise<Position>;
  /** A short message to the person (the toast). */
  say(text: string): void;
  onBack?: () => void;
}

/** The emergency page: tap-to-call numbers, the position to read out, what to say, and what to do without a signal. */
export function renderEmergency(root: HTMLElement, hooks: EmergencyHooks) {
  const title = el('h2', 'em-title', '🆘 ' + tr('Emergency'));
  const lead = el('p', 'em-lead', tr('In the mountains, call first and read afterwards. The numbers and this page work without a data connection.'));

  const numbers = el('ul', 'em-numbers');
  for (const n of emergencyNumbers()) {
    const li = el('li');
    const a = el('a', 'em-call');
    a.href = `tel:${n.number}`;
    a.append(el('strong', undefined, n.number), el('span', undefined, n.label));
    li.append(a, el('p', 'em-when', n.when));
    numbers.append(li);
  }

  // the position to read out
  const pos = el('section', 'em-pos');
  const posHead = el('h3', undefined, tr('Your position'));
  const posBody = el('div', 'em-pos-body');
  const actions = el('div', 'em-actions');
  const showPosition = (p: Position, source: string) => {
    const t = positionText(p);
    const rows: [string, string][] = [
      [tr('Coordinates'), t.decimal],
      [tr('Degrees, minutes, seconds'), t.dms],
      [tr('Swiss grid'), t.lv95],
      ...(t.elevation ? [[tr('Elevation'), t.elevation] as [string, string]] : []),
      ...(t.accuracy ? [[tr('GPS accuracy'), t.accuracy] as [string, string]] : []),
    ];
    const dl = el('dl', 'em-dl');
    for (const [k, v] of rows) dl.append(el('dt', undefined, k), el('dd', undefined, v));
    const vague = p.accuracyM !== undefined && p.accuracyM > 100 ? [el('p', 'em-warn', tr('The fix is rough (about {m} m). Say so when you give the position, and move to open sky to improve it.', { m: Math.round(p.accuracyM / 10) * 10 }))] : [];
    posBody.replaceChildren(el('p', 'em-source', source), ...vague, dl);
    const message = positionMessage(p);
    const copy = el('button', 'save-btn', '📋 ' + tr('Copy'));
    copy.type = 'button';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(message);
        hooks.say(tr('Copied the position.'));
      } catch {
        hooks.say(message);
      }
    };
    const sms = el('a', 'save-btn', '✉️ ' + tr('Send as SMS'));
    sms.href = smsLink(message);
    actions.replaceChildren(copy, sms);
    if (typeof navigator.share === 'function') {
      const share = el('button', 'save-btn', '↗ ' + tr('Share'));
      share.type = 'button';
      share.onclick = () => void navigator.share({ title: tr('Emergency position'), text: message }).catch(() => undefined);
      actions.append(share);
    }
  };
  const here = el('button', 'finder-btn', '📍 ' + tr('Find my position'));
  here.type = 'button';
  here.onclick = async () => {
    here.disabled = true;
    posBody.replaceChildren(el('p', 'where', tr('Waiting for a GPS fix… in the open it takes a few seconds.')));
    try {
      showPosition(await hooks.locate(), tr('From your phone\'s GPS.'));
    } catch {
      posBody.replaceChildren(el('p', 'where', tr('No position could be had. Allow location access for this site, and go to open sky.')));
    } finally {
      here.disabled = false;
    }
  };
  const buttons = [here];
  if (hooks.spot) {
    const spot = hooks.spot;
    const use = el('button', 'save-btn', tr('Use the spot I checked'));
    use.type = 'button';
    use.onclick = () => showPosition(spot, tr('The spot you checked on the map, not necessarily where you are.'));
    buttons.push(use);
  }
  pos.append(posHead, el('div', 'em-pos-buttons', ...buttons), posBody, actions);

  const say = el('section', 'em-say');
  const list = el('ul');
  for (const s of whatToSay()) list.append(el('li', undefined, s));
  say.append(el('h3', undefined, tr('What to say')), list);

  const rega = el('section', 'em-rega');
  const regaLink = el('a', 'linkish', tr('Rega app'));
  regaLink.href = 'https://www.rega.ch/en/our-missions/this-is-how-we-help-you/rega-app';
  regaLink.target = '_blank';
  regaLink.rel = 'noopener';
  rega.append(
    el('h3', undefined, tr('Rega app')),
    el('p', undefined, tr('The Rega app sends your position straight to the operations centre. It needs "Share my location" switched on, a SIM card and at least a minimal mobile connection.')),
    regaLink,
  );

  const nosig = el('section', 'em-nosignal');
  nosig.append(
    el('h3', undefined, tr('No signal?')),
    el('ul', undefined,
      el('li', undefined, tr('If a call or the app does not go through, change your location if you can and try again. A text message may get through when a call does not.')),
      el('li', undefined, tr('With a radio: Rega emergency channel 161.300 MHz, which anyone may use where there is coverage.')),
      el('li', undefined, tr('Alpine distress signal: six signals a minute (call, whistle, flash), then a minute\'s pause, and repeat. The answer is three signals a minute.')),
    ),
    el('p', 'em-note', tr('Rescue costs are usually charged to the person rescued, and basic health insurance covers little of them. Never delay a call because of cost.')),
  );

  const src = el('details', 'more');
  src.append(el('summary', undefined, tr('Sources')));
  const sl = el('ul', 'em-sources');
  for (const s of EMERGENCY_SOURCES) {
    const li = el('li');
    const a = el('a', undefined, s.label);
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a);
    sl.append(li);
  }
  src.append(sl, el('p', 'disclaimer', tr('Read on 6 October 2026. Check the current numbers on the sources if in doubt.')));

  const parts: HTMLElement[] = [];
  if (hooks.onBack) {
    const back = el('button', 'linkish', '← ' + tr('Back'));
    back.type = 'button';
    back.onclick = hooks.onBack;
    parts.push(back);
  }
  root.replaceChildren(...parts, title, lead, numbers, pos, say, rega, nosig, src);
}
