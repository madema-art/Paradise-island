// School inspection (development only). Loaded only when the page address has ?inspect=. It holds the main camera on one school:
// the camera controller still runs, but this updater runs after it each frame and sets the view, so nothing overrides it.
//
// Address options: ?inspect=<part of a school name or a number 1-10>&view=side|close|above|orbit&tod=<hour>&hud=0
// Keys: 1-9, 0 choose a school; N / P next and previous school; V next view; [ / ] closer and further; H hide the overlay.
import { updaters, camera, env, creatures } from '../core.js';
import { cam } from '../camera.js';

const VIEWS = ['side', 'close', 'above', 'orbit'];
const st = { school: null, view: 'side', zoom: 1, hud: null, active: false, t: 0 };

const schools = () => creatures.filter((c) => c.sim && Array.isArray(c.sim.fish) && c.sim.spec);

function choose(key) {
  const list = schools();
  if (!list.length) return;
  if (typeof key === 'number') { st.school = list[(key - 1 + list.length) % list.length]; return; }
  const q = String(key || '').toLowerCase();
  const hit = list.find((c) => c.name.toLowerCase().includes(q));
  st.school = hit || list[0];
}
function cycle(delta) {
  const list = schools();
  const i = Math.max(0, list.indexOf(st.school));
  st.school = list[(i + delta + list.length) % list.length];
}

function place(dt) {
  const s = st.school;
  if (!s) return;
  const m = s.sim;
  st.t += dt;
  const C = { x: m.cx, y: m.cy, z: m.cz };
  // the shoal's radius and the fish's own length set the framing
  const R = Math.max(1.2, m.spread * 0.9 + 1.2) * st.zoom;
  const span = m.spec.len * 6 + R;
  let eye, look;
  if (st.view === 'close') {
    eye = { x: C.x + R * 0.9, y: C.y + 0.1 * R, z: C.z + R * 0.9 };
  } else if (st.view === 'above') {
    // above the lagoon: out of the water, looking down through the surface at the shoal
    const H = 2.2 + R * 1.2;
    eye = { x: C.x - R * 0.35, y: Math.max(1.5, H), z: C.z - R * 1.3 };
    look = { x: C.x, y: C.y, z: C.z };
  } else if (st.view === 'orbit') {
    const a = st.t * 0.12;
    eye = { x: C.x + Math.cos(a) * R * 2.2, y: C.y + 0.2 * R, z: C.z + Math.sin(a) * R * 2.2 };
  } else {
    // side: a level underwater view, slightly to one side of the shoal's heading so its shape reads
    const a = 0.6;
    eye = { x: C.x + Math.cos(a) * R * 2.2, y: C.y + 0.1 * R, z: C.z + Math.sin(a) * R * 2.2 };
  }
  if (!look) look = C;
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(look.x, look.y, look.z);
  camera.updateMatrixWorld();
  cam.target.set(look.x, look.y, look.z);
  cam.follow = null;
  if (st.hud) {
    const sp = m.fish.reduce((a, f) => a + Math.hypot(f.vx, f.vy, f.vz), 0) / m.fish.length;
    st.hud.textContent = `${s.name} · ${m.fish.length} fish · ${m.state} · radius ${m.spread.toFixed(1)} m · ${(sp / m.spec.len).toFixed(1)} body lengths/s · view ${st.view} · tod ${env.tod.toFixed(1)}`;
  }
}

export function startSchoolInspect() {
  const q = new URLSearchParams(location.search);
  st.active = true;
  st.view = VIEWS.includes(q.get('view')) ? q.get('view') : 'side';
  if (q.get('tod')) { env.tod = Number(q.get('tod')); env.paused = true; }
  // hide the game's interface so only the fish are in view
  const css = document.createElement('style');
  css.textContent = 'body > :not(canvas):not(#schoolInspectHud){display:none !important}';
  document.head.appendChild(css);
  const hud = document.createElement('div');
  hud.id = 'schoolInspectHud';
  hud.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:50;padding:6px 10px;border-radius:6px;background:rgba(8,20,28,.72);color:#e8f4f8;font:12px/1.4 system-ui,sans-serif;pointer-events:none';
  if (q.get('hud') !== '0') document.body.appendChild(hud);
  st.hud = hud;
  choose(q.get('inspect'));
  window.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) choose(e.key === '0' ? 10 : Number(e.key));
    else if (e.key === 'n' || e.key === 'N') cycle(1);
    else if (e.key === 'p' || e.key === 'P') cycle(-1);
    else if (e.key === 'v' || e.key === 'V') st.view = VIEWS[(VIEWS.indexOf(st.view) + 1) % VIEWS.length];
    else if (e.key === '[') st.zoom = Math.min(4, st.zoom * 1.2);
    else if (e.key === ']') st.zoom = Math.max(0.25, st.zoom / 1.2);
    else if (e.key === 'h' || e.key === 'H') st.hud.style.display = st.hud.style.display === 'none' ? '' : 'none';
  });
  updaters.push((dt) => place(dt));
  window.__inspect = {
    choose: (k) => choose(k), cycle, view: (v) => { if (VIEWS.includes(v)) st.view = v; }, zoom: (z) => { st.zoom = z; },
    get school() { return st.school ? st.school.name : null; },
  };
}
