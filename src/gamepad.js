// Game controller input (the standard layout: an Xbox 360 / One pad on a PC, or anything the browser maps the same way).
// poll() is called once a frame. It returns the sticks with a dead zone and a gentle response curve (fine control near the middle,
// full speed at the edge), the triggers as 0..1, and each button as held / just pressed / just released.
// Browsers keep a pad hidden until its first button press, so press any button once after loading the page.
const DEAD = 0.18, CURVE = 1.6;

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const pad = {
  connected: false, id: '',
  lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0,           // sticks -1..1 (up is negative y, as the browser reports it), triggers 0..1
  held: new Array(17).fill(false), pressed: new Array(17).fill(false), released: new Array(17).fill(false),
  active: 0,                                            // seconds since any input (for hints)
};
let prev = new Array(17).fill(false), idle = 99;

function stick(x, y, out, kx, ky) {
  const m = Math.hypot(x, y);
  if (m < DEAD) { out[kx] = 0; out[ky] = 0; return; }
  const s = Math.pow((Math.min(m, 1) - DEAD) / (1 - DEAD), CURVE);        // 0..1 after the dead zone, eased
  out[kx] = (x / m) * s; out[ky] = (y / m) * s;
}

export function pollPad(dt = 0) {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of list) if (p && p.connected && p.axes.length >= 4) { gp = p; break; }
  pad.connected = !!gp;
  if (!gp) { pad.lx = pad.ly = pad.rx = pad.ry = pad.lt = pad.rt = 0; pad.held.fill(false); pad.pressed.fill(false); pad.released.fill(false); prev.fill(false); return pad; }
  pad.id = gp.id;
  stick(gp.axes[0], gp.axes[1], pad, 'lx', 'ly');
  stick(gp.axes[2], gp.axes[3], pad, 'rx', 'ry');
  const b = gp.buttons;
  // triggers come as analog buttons; a few drivers report them as axes instead
  pad.lt = b[6] ? b[6].value : 0; pad.rt = b[7] ? b[7].value : 0;
  if (!b[6] && gp.axes[4] !== undefined) pad.lt = (gp.axes[4] + 1) / 2;
  if (!b[7] && gp.axes[5] !== undefined) pad.rt = (gp.axes[5] + 1) / 2;
  if (pad.lt < 0.06) pad.lt = 0; if (pad.rt < 0.06) pad.rt = 0;
  let any = pad.lx || pad.ly || pad.rx || pad.ry || pad.lt || pad.rt;
  for (let i = 0; i < 17; i++) {
    const down = i === 6 ? pad.lt > 0.5 : i === 7 ? pad.rt > 0.5 : !!(b[i] && b[i].pressed);        // the triggers count as buttons past half way
    pad.held[i] = down; pad.pressed[i] = down && !prev[i]; pad.released[i] = !down && prev[i]; prev[i] = down;
    if (down) any = true;
  }
  idle = any ? 0 : idle + dt; pad.active = idle;
  return pad;
}

/** a short buzz in the pad (if it has motors): strong 0..1 is the heavy motor, weak the light one */
export function rumble(strong = 0.4, weak = 0.2, ms = 90) {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of list) {
    if (!p || !p.connected) continue;
    const act = p.vibrationActuator;
    if (act && act.playEffect) { try { act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* no motors */ } }
    break;
  }
}
