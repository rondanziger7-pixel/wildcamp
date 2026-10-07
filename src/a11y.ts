/**
 * What a screen reader is told when something finishes (a spot checked, the best spots found, a route checked). The sheet itself is not
 * a live region: it changes many times while a check runs, and every change would be read out.
 */
let host: HTMLElement | null | undefined;

export function announce(text: string): void {
  if (host === undefined) host = typeof document === 'undefined' ? null : document.getElementById('announce');
  if (!host) return;
  const el = host;
  el.textContent = '';
  // an empty region first, then the text: the same sentence twice in a row is read twice
  window.setTimeout(() => (el.textContent = text), 60);
}
