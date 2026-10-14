// Survival mode input. While the game is active it takes over the keyboard, the mouse and the wheel on the 3D view
// (in the capture phase, so the observation-mode camera and shortcuts never see them).
import { renderer } from '../core.js';
import { isTyping } from '../typing.js';

const dom = renderer.domElement;
const GAME_KEYS = /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|Space|Tab|Escape|Enter|Shift(Left|Right)|Control(Left|Right)|Backquote)$/;

export const input = {
  active: false,
  keys: new Set(),
  pressed: new Set(),          // keys that went down since the last frame
  dx: 0, dy: 0,                // mouse look this frame
  wheel: 0,
  down: false, moved: 0,
  onKey: null,                 // (code, event) for keys that should act at once (Tab, Esc, Digits…)
  frame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; },
  /** true while the key is held */
  held: (c) => input.keys.has(c),
  /** true once, the frame the key went down */
  hit: (c) => input.pressed.has(c),
};

let last = null;
window.addEventListener('keydown', (e) => {
  if (!input.active || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!GAME_KEYS.test(e.code)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (!e.repeat) { input.keys.add(e.code); input.pressed.add(e.code); if (input.onKey) input.onKey(e.code, e); }
  else input.keys.add(e.code);
}, true);
window.addEventListener('keyup', (e) => {
  if (!input.active) return;
  input.keys.delete(e.code);
  if (GAME_KEYS.test(e.code) && !isTyping(e)) e.stopImmediatePropagation();
}, true);
window.addEventListener('blur', () => { input.keys.clear(); input.down = false; });

const onCanvas = (e) => e.target === dom;
window.addEventListener('pointerdown', (e) => {
  if (!input.active || !onCanvas(e)) return;
  e.stopImmediatePropagation(); e.preventDefault();
  dom.focus();
  try { dom.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  input.down = true; input.moved = 0; last = { x: e.clientX, y: e.clientY };
}, true);
window.addEventListener('pointermove', (e) => {
  if (!input.active) return;
  if (onCanvas(e)) e.stopImmediatePropagation();
  if (!input.down || !last) return;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  last = { x: e.clientX, y: e.clientY };
  input.dx += dx; input.dy += dy; input.moved += Math.abs(dx) + Math.abs(dy);
}, true);
const up = (e) => {
  if (!input.active) return;
  if (onCanvas(e)) e.stopImmediatePropagation();
  input.down = false; last = null;
};
window.addEventListener('pointerup', up, true);
window.addEventListener('pointercancel', up, true);
window.addEventListener('wheel', (e) => {
  if (!input.active) return;
  if (e.target.closest && e.target.closest('.sv-scroll')) return;       // panels scroll themselves
  e.stopImmediatePropagation(); e.preventDefault();
  input.wheel += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
}, { capture: true, passive: false });
window.addEventListener('contextmenu', (e) => { if (input.active && onCanvas(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
