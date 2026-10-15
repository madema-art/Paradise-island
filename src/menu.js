// The one menu and the mode it runs in. PLAY: the sticks and the keys drive the camera and the creature cycle. MENU (Start, or Tab): the
// same buttons move through the menu, and gameplay ignores them (camera.js reads isOpen(); the keys and the sticks are idle meanwhile).
//
// The menu's content is the game's own controls (the view, world and sound panes, the Field Guide, the Journal's notes, secrets and
// inspection), so navigation walks the real DOM: the d-pad moves between the controls of the current section, left and right change a
// slider, a choice or a select, A presses the highlighted control, LB and RB change section, B or Start close the menu.
import { BTN } from './gamepad.js';

export const SECTIONS = ['view', 'world', 'sound', 'guide', 'journal'];
const SEL = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-nav]';

let open = false, section = 0, following = false, controller = false;
// under direct control: null, or the view he is seen from ('third' or 'first')
let controlView = null;
let lastHint = '';

const menuEl = () => document.getElementById('menu');
const paneEl = (name) => document.getElementById('p-' + name);
const shown = (el) => el.getClientRects().length > 0;

/** the controls of the current section that can be reached (in order) */
function items() {
  const pane = paneEl(SECTIONS[section]);
  return pane ? [...pane.querySelectorAll(SEL)].filter(shown) : [];
}

function focusEl(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

function move(dir) {
  const list = items();
  if (!list.length) return;
  let i = list.indexOf(document.activeElement);
  i = i < 0 ? (dir > 0 ? -1 : list.length) : i;
  focusEl(list[(i + dir + list.length) % list.length]);
}

function adjust(dir) {
  const el = document.activeElement;
  if (!el || !menuEl().contains(el)) return;
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

function activate() {
  const el = document.activeElement;
  if (!el || !menuEl().contains(el)) { move(1); return; }
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

/** true when the last input came from the pad (within half a second), so the hints name the pad's buttons */
// pad input switches the hints to the controller; a key press (below) switches them back. Stick and button activity counts, however old.
export function noteInput(connected, active) {
  if (connected && active < 0.5 && !controller) { controller = true; renderHints(); }
}

const HINT = {
  control: {
    pad: 'stick walk  ·  right stick look  ·  RT run  ·  A pick up  ·  R3 view  ·  Back let go  ·  Start menu',
    keys: 'WASD walk  ·  Shift run  ·  F pick up  ·  T view  ·  V let go  ·  Tab menu',
  },
  play: {
    pad: '◀▶ creature  ·  LB RB view  ·  Y nearest  ·  Start menu',
    keys: '[ ] creature  ·  1–0 places  ·  Tab menu  ·  H hide',
  },
  menu: {
    pad: '▲▼ move  ·  ◀▶ change  ·  LB RB section  ·  A select  ·  B close',
    keys: '↑↓ move  ·  ←→ change  ·  Q E section  ·  Enter select  ·  Backspace close',
  },
};

/** the hint bar: one line, rewritten only when its text changes */
export function renderHints() {
  const el = document.getElementById('hints');
  if (!el) return;
  const kind = controller ? 'pad' : 'keys';
  let text = open ? HINT.menu[kind] : controlView ? HINT.control[kind] : HINT.play[kind];
  if (!open && controlView) text = (controlView === 'first' ? 'First person' : 'Third person') + '  ·  ' + text;
  if (!open && !controlView && following) text = (controller ? 'hold B let go  ·  ' : 'Esc release  ·  ') + text;
  if (text === lastHint) return;
  lastHint = text;
  el.textContent = text;
}

// a key press switches the hints to the keyboard
window.addEventListener('keydown', () => { if (controller) { controller = false; renderHints(); } });

/** the pad, once a frame, while the menu is open. Each button counts once (the pad reports edges). */
export function padMenu(pad) {
  if (pad.pressed[BTN.UP]) move(-1);
  if (pad.pressed[BTN.DOWN]) move(1);
  if (pad.pressed[BTN.LEFT]) adjust(-1);
  if (pad.pressed[BTN.RIGHT]) adjust(1);
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
  const arrows = { ArrowUp: -1, ArrowDown: 1 };
  if (e.code in arrows) { e.preventDefault(); move(arrows[e.code]); return true; }
  if (e.code === 'ArrowLeft') { e.preventDefault(); adjust(-1); return true; }
  if (e.code === 'ArrowRight') { e.preventDefault(); adjust(1); return true; }
  if (e.repeat) return true;
  if (e.code === 'KeyQ') { setSection(SECTIONS[(section - 1 + SECTIONS.length) % SECTIONS.length]); return true; }
  if (e.code === 'KeyE') { setSection(SECTIONS[(section + 1) % SECTIONS.length]); return true; }
  if (e.code === 'Enter') { e.preventDefault(); activate(); return true; }
  return true;                                                   // the menu is modal: other keys do not reach play
}
