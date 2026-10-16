// The one menu and the mode it runs in. PLAY: the sticks and the keys drive the camera (and the castaway, when he is under control).
// MENU (Start or Tab): the same buttons move through the menu, and gameplay ignores them (camera.js reads isOpen(); the keys and the sticks
// are idle meanwhile).
//
// The menu's content is the game's own controls (View, World, Sound, Guide, Journal), so navigation walks the real DOM. Movement is
// spatial: the D-pad (or the left stick, or the arrow keys) goes to the nearest control in the direction pressed, so a grid is walked by
// row and column, and the section tabs sit above the pane and are reached by moving up from its top row. Left and right change a
// slider, a checkbox, a select or a choice in a segmented control, and otherwise move sideways. LB and RB change section. A presses the
// focused control. B or Start closes the menu.
//
// The hint bar shows the controls of the input family used most recently (input_device.js): the keyboard and mouse, or the pad.
import { BTN } from './gamepad.js';
import { device, onDevice } from './input_device.js';

export const SECTIONS = ['view', 'world', 'sound', 'guide', 'journal'];
const SEL = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-nav]';

let open = false, section = 0, following = false;
// under direct control: null, or the view he is seen from ('third' or 'first')
let controlView = null;
let lastHint = '';
// the stick and the D-pad held in a direction: the first step at once, then repeats while it is held
const held = { k: '', next: 0 };

const menuEl = () => document.getElementById('menu');
const paneEl = (name) => document.getElementById('p-' + name);
const shown = (el) => el.getClientRects().length > 0;
const tabsEl = () => [...document.querySelectorAll('#menuTabs button')].filter(shown);

/** the controls of the current section that can be reached */
function items() {
  const pane = paneEl(SECTIONS[section]);
  return pane ? [...pane.querySelectorAll(SEL)].filter(shown) : [];
}

function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** a control that changes its value when pushed left and right, rather than moving focus */
const adjustable = (el) => !!el && ((el.tagName === 'INPUT' && (el.type === 'range' || el.type === 'checkbox')) || el.tagName === 'SELECT' || !!el.closest('.seg'));

/** spatial move: the nearest reachable control in direction (dx, dy), by screen position */
function moveSpatial(dx, dy) {
  const cands = [...tabsEl(), ...items()];
  if (!cands.length) return;
  const cur = document.activeElement;
  if (!cands.includes(cur)) { focusEl(items()[0] || cands[0]); return; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of cands) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
    const ddx = ex - cx, ddy = ey - cy;
    const primary = dx ? ddx * dx : ddy * dy;
    if (primary <= 2) continue;                              // only controls that lie in the direction pressed
    const cross = dx ? Math.abs(ddy) : Math.abs(ddx);
    const score = primary + cross * 2.5;                     // a control straight ahead beats one far off to the side
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focusEl(best);
}

/** left and right: change the focused control when it takes a value, otherwise move sideways */
function horizontal(dir) {
  const el = document.activeElement;
  if (!el || !menuEl().contains(el)) { moveSpatial(dir, 0); return; }
  if (!adjustable(el)) { moveSpatial(dir, 0); return; }
  if (el.tagName === 'INPUT' && el.type === 'range') {
    // steps on the slider's own grid, snapped from the minimum: one step for a fine slider (the field of view), a tenth of the range for a volume
    const min = +el.min || 0, max = +el.max || 100, step = +el.step || 1, v = +el.value;
    const big = (max - min) / step > 30 ? (max - min) / 10 : step;
    const next = Math.min(max, Math.max(min, min + Math.round((v - min + dir * big) / step) * step));
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (el.tagName === 'INPUT' && el.type === 'checkbox') {
    if (el.checked !== (dir > 0)) el.click();
  } else if (el.tagName === 'SELECT') {
    const n = el.options.length;
    el.selectedIndex = Math.min(n - 1, Math.max(0, el.selectedIndex + dir));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.closest('.seg')) {
    const btns = [...el.parentElement.querySelectorAll('button')];
    const j = Math.min(btns.length - 1, Math.max(0, btns.indexOf(el) + dir));
    btns[j].click();
    focusEl(btns[j]);
  }
}

/** A: press the focused control (a slider or a select is entered, not pressed) */
function activate() {
  const el = document.activeElement;
  if (!el || !menuEl().contains(el)) { if (tabsEl().length) focusEl(tabsEl()[section]); else moveSpatial(0, 1); return; }
  if (el.tagName === 'INPUT' && el.type === 'range') return;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' && el.type === 'search') { el.focus(); return; }
  el.click();
}

function emit() {
  window.dispatchEvent(new CustomEvent('menu:change', { detail: { open, section: SECTIONS[section] } }));
}

export function isOpen() { return open; }
export function currentSection() { return SECTIONS[section]; }

export function setSection(name) {
  const i = SECTIONS.indexOf(name);
  if (i < 0) return;
  section = i;
  for (const b of document.querySelectorAll('#menuTabs button')) b.classList.toggle('on', b.dataset.s === name);
  for (const p of document.querySelectorAll('#menu .body > .pane')) p.classList.toggle('on', p.id === 'p-' + name);
  if (open) focusEl(items()[0]);
  emit();
  renderHints();
}

export function openMenu(name) {
  if (!open) {
    open = true;
    document.body.classList.add('menu-open');
    document.body.classList.remove('hidden-ui');                 // a menu is never opened behind a hidden interface
  }
  if (name) setSection(name); else { setSection(SECTIONS[section]); }
  if (!document.activeElement || !menuEl().contains(document.activeElement)) focusEl(items()[0]);
  emit();
  renderHints();
}

export function closeMenu() {
  if (!open) return;
  open = false;
  document.body.classList.remove('menu-open');
  if (document.activeElement && menuEl().contains(document.activeElement)) document.activeElement.blur();
  emit();
  renderHints();
}

export function toggleMenu() { if (open) closeMenu(); else openMenu(); }

/** the follow state, for the hint bar */
export function setFollowing(on) { following = !!on; renderHints(); }
/** direct control, for the hint bar: the view (third or first person) while he is under control, or null */
export function setControl(view) { controlView = view || null; renderHints(); }

// The controls each family uses. Each line is written for its own device: a key name on the keyboard, a button name on the pad.
const HINT = {
  play: {
    kbd: '[ ] creature  ·  1–0 places  ·  V castaway  ·  Tab menu  ·  H hide',
    pad: '◀▶ creature  ·  LB RB places  ·  Y nearest  ·  Back castaway  ·  Start menu',
  },
  control: {
    kbd: 'WASD walk  ·  Shift run  ·  Space jump  ·  F pick up  ·  T view  ·  V let go  ·  Tab menu',
    pad: 'Stick walk  ·  RT run  ·  A jump  ·  X pick up  ·  R3 view  ·  Back let go  ·  Start menu',
  },
  following: { kbd: 'Esc release', pad: 'hold B release' },
  menu: {
    kbd: '↑↓←→ move  ·  Q E section  ·  Enter select  ·  Esc close',
    pad: 'D-pad move  ·  ◀▶ change  ·  LB RB section  ·  A select  ·  B close',
  },
};

/** the hint bar: one line for the family in use, rewritten only when its text changes */
export function renderHints() {
  const el = document.getElementById('hints');
  if (!el) return;
  const kind = device.last === 'pad' ? 'pad' : 'kbd';
  let text;
  if (open) text = HINT.menu[kind];
  else if (controlView) text = (controlView === 'first' ? 'First person  ·  ' : 'Third person  ·  ') + HINT.control[kind];
  else text = HINT.play[kind] + (following ? '  ·  ' + HINT.following[kind] : '');
  if (text === lastHint) return;
  lastHint = text;
  el.textContent = text;
}
onDevice(() => renderHints());

/** the pad, once a frame, while the menu is open. Each button counts once; a held direction repeats. */
export function padMenu(pad) {
  const now = performance.now();
  // the D-pad and the left stick give one direction between them
  const sx = pad.held[BTN.LEFT] ? -1 : pad.held[BTN.RIGHT] ? 1 : Math.abs(pad.lx) > 0.6 ? Math.sign(pad.lx) : 0;
  const sy = pad.held[BTN.UP] ? -1 : pad.held[BTN.DOWN] ? 1 : Math.abs(pad.ly) > 0.6 ? Math.sign(pad.ly) : 0;
  const k = sx + ',' + sy;
  if (!sx && !sy) held.k = '';
  else if (k !== held.k || now >= held.next) {
    const fresh = k !== held.k;
    held.k = k; held.next = now + (fresh ? 420 : 170);
    if (sx) horizontal(sx);
    if (sy) moveSpatial(0, sy);
  }
  if (pad.pressed[BTN.LB]) setSection(SECTIONS[(section - 1 + SECTIONS.length) % SECTIONS.length]);
  if (pad.pressed[BTN.RB]) setSection(SECTIONS[(section + 1) % SECTIONS.length]);
  if (pad.pressed[BTN.A]) activate();
  if (pad.pressed[BTN.B] || pad.pressed[BTN.START]) closeMenu();
}

/** the keyboard: Tab opens the menu from play; the menu's own keys work while it is open. Returns true when the key was used. */
export function keyMenu(e, typing) {
  if (!open) {
    if (e.code === 'Tab' && !typing) { e.preventDefault(); openMenu(); return true; }
    return false;
  }
  if (e.code === 'Tab' || e.code === 'Escape' || (e.code === 'Backspace' && !typing)) { e.preventDefault(); closeMenu(); return true; }
  if (typing) return false;
  if (e.code === 'ArrowUp') { e.preventDefault(); moveSpatial(0, -1); return true; }
  if (e.code === 'ArrowDown') { e.preventDefault(); moveSpatial(0, 1); return true; }
  if (e.code === 'ArrowLeft') { e.preventDefault(); horizontal(-1); return true; }
  if (e.code === 'ArrowRight') { e.preventDefault(); horizontal(1); return true; }
  if (e.repeat) return true;
  if (e.code === 'KeyQ') { setSection(SECTIONS[(section - 1 + SECTIONS.length) % SECTIONS.length]); return true; }
  if (e.code === 'KeyE') { setSection(SECTIONS[(section + 1) % SECTIONS.length]); return true; }
  if (e.code === 'Enter') { e.preventDefault(); activate(); return true; }
  return true;                                                   // the menu is modal: other keys do not reach play
}
