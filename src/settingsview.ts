import { AREAS_KEY, clearMaps, loadAreas, megabytes, savedTileCount, sizeText, storageUsed } from './offline';
import { SENT, keptSummary, wipeKept, wipePlans } from './privacy';
import { el } from './resultview';
import { MAX_PEOPLE, SHELTERS, cleanGear, shelterName, type Gear } from './gear';
import { tr } from './i18n';

/** The parts of the settings panel that show what the app keeps and sends: saved maps and storage, installing, privacy. */

export interface SettingsHooks {
  store: Storage | undefined;
  today: () => string;
  /** Save the map for the area on screen (the same as the menu item). */
  saveVisible(): void;
  /** Saved spots, trips or the route were removed: the map and pages must be redrawn. */
  onWiped(): void;
  say(text: string): void;
  /** How the person sleeps now, and a change of it (the open result is read again for it). */
  gear: () => Gear;
  onGear(g: Gear): void;
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installPrompt: InstallPrompt | undefined;
let installed = false;

/** Keep the browser's "install" offer for later: shown as a button in the settings instead of a pop-up in the way. */
export function listenInstall(): void {
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installPrompt = ev as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = undefined;
  });
}

const standalone = () => installed || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** A button that asks twice: the first tap turns it into "Delete? Tap again", a second tap within 6 s does it. */
function twoStep(label: string, ask: string, run: () => void | Promise<void>, cls = 'save-btn danger'): HTMLButtonElement {
  const b = el('button', cls, label) as HTMLButtonElement;
  b.type = 'button';
  let armed: number | undefined;
  b.onclick = () => {
    if (armed === undefined) {
      b.textContent = ask;
      armed = window.setTimeout(() => {
        armed = undefined;
        b.textContent = label;
      }, 6000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    b.textContent = label;
    void run();
  };
  return b;
}

export function renderSettings(host: HTMLElement, hooks: SettingsHooks): void {
  host.replaceChildren(gearSection(hooks), offlineSection(hooks), privacySection(hooks));
}

function offlineSection(hooks: SettingsHooks): HTMLElement {
  const d = el('details', 'more settings-more');
  d.append(el('summary', undefined, tr('Offline maps and installing')));
  const status = el('p', 'settings-note', tr('Counting saved maps…'));
  const areas = el('ul', 'settings-list');
  const actions = el('div', 'settings-actions');
  const save = el('button', 'save-btn', tr('Save the map on screen')) as HTMLButtonElement;
  save.type = 'button';
  save.onclick = () => hooks.saveVisible();
  actions.append(save);
  d.append(
    el('p', 'settings-note', tr('Saved maps stay on this device so the map still draws without a connection. Zone, water and weather checks still need one.')),
    status,
    areas,
    actions,
    el('p', 'settings-note', tr('Routes and saved spots have their own “save the map” button on their pages.')),
  );

  const show = async () => {
    const n = await savedTileCount();
    const use = await storageUsed();
    const parts = [n ? tr('{n} saved map tiles (about {mb} MB).', { n, mb: megabytes(n) }) : tr('No saved maps yet.')];
    if (use) parts.push(tr('This site uses {size} on this device.', { size: sizeText(use.used) }));
    status.textContent = parts.join(' ');
    areas.replaceChildren(
      ...loadAreas(hooks.store)
        .slice(0, 6)
        .map((a) => el('li', undefined, tr('{name}: zoom {from} to {to}, {n} tiles, {date}', { name: a.name, from: a.from, to: a.to, n: a.tiles, date: a.at.slice(0, 10) }))),
    );
    actions.querySelectorAll('.wipe-maps').forEach((b) => b.remove());
    if (n) {
      const wipe = twoStep(tr('Delete saved maps'), tr('Delete them? Tap again'), async () => {
        await clearMaps();
        try {
          hooks.store?.removeItem(AREAS_KEY);
        } catch {
          /* blocked: nothing to remove */
        }
        hooks.say(tr('Saved maps deleted.'));
        void show();
      });
      wipe.classList.add('wipe-maps');
      actions.append(wipe);
    }
  };
  void show();

  const install = el('div', 'settings-actions');
  if (standalone()) install.append(el('p', 'settings-note', tr('The app is installed on this device.')));
  else if (installPrompt) {
    const b = el('button', 'save-btn', tr('Install the app')) as HTMLButtonElement;
    b.type = 'button';
    b.onclick = () => {
      const p = installPrompt;
      installPrompt = undefined;
      b.remove();
      void p?.prompt().then(() => p.userChoice).catch(() => undefined);
    };
    install.append(b);
  } else install.append(el('p', 'settings-note', tr('To install it like an app, open your browser’s menu and choose “Install app” or “Add to Home Screen”.')));
  d.append(install);
  return d;
}

function privacySection(hooks: SettingsHooks): HTMLElement {
  const d = el('details', 'more settings-more');
  d.append(el('summary', undefined, tr('Your data and privacy')));
  const kept = keptSummary(hooks.store, hooks.today());
  const have: string[] = [];
  if (kept.spots) have.push(tr('{n} saved spots', { n: kept.spots }));
  if (kept.nights) have.push(tr('{n} planned nights', { n: kept.nights }));
  if (kept.route) have.push(tr('the route “{name}”', { name: kept.route }));
  d.append(
    el('p', 'settings-note', tr('Kept on this device only (nothing is uploaded): {what}.', { what: have.length ? have.join(', ') : tr('nothing yet') }) + ' ' + tr('Also your language and these settings.')),
    el('p', 'settings-note', tr('What is sent when you check a spot or move the map:')),
  );
  const sent = el('ul', 'settings-list');
  for (const s of SENT) sent.append(el('li', undefined, el('b', undefined, `${s.host}: `), tr(s.what)));
  d.append(
    sent,
    el('p', 'settings-note', tr('Like any website, these services see your internet address and the position they are asked about. No accounts, no advertising, no analytics, no cookies. Your phone’s position is read only when you tap the location button, once, and the receiver is switched off again.')),
  );
  const actions = el('div', 'settings-actions');
  actions.append(
    twoStep(tr('Delete my spots, trips and route'), tr('Delete them? Tap again'), () => {
      wipePlans(hooks.store);
      hooks.say(tr('Saved spots, trips and the route were deleted.'));
      hooks.onWiped();
      d.replaceWith(privacySection(hooks));
    }),
    twoStep(tr('Delete everything this app stored'), tr('Delete everything? Tap again'), async () => {
      wipeKept(hooks.store);
      await clearMaps();
      hooks.say(tr('Everything this app stored on this device was deleted.'));
      hooks.onWiped();
      d.replaceWith(privacySection(hooks));
    }),
  );
  d.append(actions);
  return d;
}

/** How you sleep: the shelter, how many people, a dog. The notes in the legality details follow it. */
function gearSection(hooks: SettingsHooks): HTMLElement {
  const box = el('fieldset', 'gear-set');
  box.append(el('legend', undefined, tr('How you sleep')));
  let g = hooks.gear();
  const change = (patch: Partial<Gear>) => {
    g = cleanGear({ ...g, ...patch });
    hooks.onGear(g);
  };
  const grid = el('div', 'gear-shelters');
  for (const s of SHELTERS) {
    const label = el('label', 'gear-option');
    const input = el('input') as HTMLInputElement;
    input.type = 'radio';
    input.name = 'gear-shelter';
    input.value = s;
    input.checked = g.shelter === s;
    input.onchange = () => input.checked && change({ shelter: s });
    label.append(input, ' ', shelterName(s));
    grid.append(label);
  }
  const people = el('label', 'gear-row', tr('People'), ' ') as HTMLLabelElement;
  const n = el('input', 'gear-people') as HTMLInputElement;
  n.type = 'number';
  n.min = '1';
  n.max = String(MAX_PEOPLE);
  n.inputMode = 'numeric';
  n.value = String(g.people);
  n.onchange = () => {
    if (Number(n.value) > MAX_PEOPLE) hooks.say(tr('At most {n} people.', { n: MAX_PEOPLE }));
    change({ people: Number(n.value) });
    n.value = String(g.people);
  };
  people.append(n);
  const dog = el('label', 'gear-row') as HTMLLabelElement;
  const d = el('input') as HTMLInputElement;
  d.type = 'checkbox';
  d.checked = g.dog;
  d.onchange = () => change({ dog: d.checked });
  dog.append(d, ' ', tr('I have a dog with me'));
  box.append(grid, people, dog, el('p', 'settings-note', tr('The rules in this app are written for tents. For another set-up the legality details add notes on how the texts read for it. They never make a spot legal.')));
  return box;
}
