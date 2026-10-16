// Which input family the player used most recently: the keyboard and mouse, or the gamepad. The hint bar, the focus card and the on-screen
// reference show the controls for that family only, and switch the moment the other one is used. A key press or a click means keyboard
// and mouse; a stick move or a button press on a connected pad means the pad. Nothing else changes it (a pad lying idle does not).
const listeners = new Set();
export const device = { last: 'kbd' };

/** the body carries the family as a class, so the help text can be shown or hidden with CSS alone (index.html: .kbd-only / .pad-only) */
export function setDevice(kind) {
  if (kind !== 'kbd' && kind !== 'pad') return;
  if (kind === device.last) return;
  device.last = kind;
  document.body.classList.toggle('input-pad', kind === 'pad');
  document.body.classList.toggle('input-kbd', kind === 'kbd');
  for (const fn of listeners) fn(kind);
}
/** call fn(kind) whenever the family changes */
export function onDevice(fn) { listeners.add(fn); fn(device.last); }

window.addEventListener('keydown', (e) => { if (!e.repeat) setDevice('kbd'); }, true);
window.addEventListener('pointerdown', () => setDevice('kbd'), true);
window.addEventListener('wheel', () => setDevice('kbd'), { capture: true, passive: true });
document.body.classList.add('input-kbd');
