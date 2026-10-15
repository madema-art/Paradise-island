// The castaway's inner life: drives, goals, plans, memory, keepsakes and the things he makes.
//
//   CONTEXT (time of day, weather, place, wildlife: castaway_mind.js chooses his activities from these)
//     -> DRIVES (adventure, curiosity, creativity, play, hunting, collecting, building, creating): appetites with their own dynamics
//     -> GOALS (a drive plus a concrete target and a reason)  -> PLANS (steps)  -> ACTIONS/ANIMATIONS (human.js runs the steps)
//     -> OUTCOMES (a find, a keepsake, a structure, a design) -> MEMORIES (places, discoveries, skills, preferences, fears)
//
// A drive is not an emergency meter. Its appetite eases toward a target set by his temperament and by what the world offers him right now
// (an unexplored place, something to pick up, materials in hand); acting on it eases the appetite and starts a rest period; nothing gets worse
// when he does not act, so he is never distressed for not having built something. Goals are proposed rarely (every few real seconds), are
// interruptible and resumable, and after one ends he is content for a while. All world changes persist: taken keepsakes, his collection,
// the things he arranges and builds, designs he has worked out, and his memories (localStorage 'paradise.castaway.life.v2').
// Placement uses a local seeded generator, so the island's random stream is untouched.
import * as THREE from 'three';
import { scene } from './core.js';
import { getHeight, getSlope, riverDist, lavaDist, VOL, falls, SPRING, TEMPLE, FAIRY } from './world.js';
import { mulberry32, clamp, TAU } from './util.js';
import { eco } from './ecology.js';

export const LIFE_KEY = 'paradise.castaway.life.v2';
export const DRIVES = ['adventure', 'curiosity', 'creativity', 'play', 'hunting', 'collecting', 'building', 'creating'];
const TASTE = { adventure: 0.62, curiosity: 0.78, creativity: 0.5, play: 0.66, hunting: 0.45, collecting: 0.58, building: 0.48, creating: 0.45 };

/* ------------------------------------------------------------------ keepsakes: small things lying about the island */
export const KINDS = {
  shell: { label: 'a seashell', n: 32, sc: [0.9, 1.5], col: [0xf2d9c4, 0xf6c9b8, 0xeadfce, 0xe8b4a0, 0xd9c2e0] },
  pebble: { label: 'a smooth stone', n: 28, sc: [0.8, 1.4], col: [0x8d8f92, 0x6e7378, 0xa6a39a, 0x5d6166, 0xb0aaa0] },
  driftwood: { label: 'a piece of driftwood', n: 18, sc: [0.8, 1.5], col: [0xcdbd9e, 0xb9a687, 0xd8cbb0, 0xa59274] },
  feather: { label: 'a feather', n: 14, sc: [0.9, 1.3], col: [0xf4f1ea, 0xcfd6dc, 0xe8c9a0, 0x3a4a6b, 0xe0463a] },
  curio: { label: 'an unusual stone', n: 10, sc: [0.9, 1.3], col: [0x3fb7b0, 0x8a6fd0, 0xd0a040, 0x48a0e0] },
};
const geoFor = (k) => {
  if (k === 'shell') { const g = new THREE.ConeGeometry(0.05, 0.13, 7); g.rotateX(Math.PI / 2 - 0.5); g.translate(0, 0.035, 0); return g; }
  if (k === 'pebble') { const g = new THREE.IcosahedronGeometry(0.07, 1); g.scale(1.2, 0.6, 0.9); g.translate(0, 0.03, 0); return g; }
  if (k === 'driftwood') { const g = new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6, 2); g.rotateZ(Math.PI / 2); g.translate(0, 0.05, 0); return g; }
  if (k === 'feather') { const g = new THREE.ConeGeometry(0.022, 0.24, 4); g.scale(1, 1, 0.25); g.rotateZ(Math.PI / 2); g.translate(0, 0.012, 0); return g; }
  const g = new THREE.DodecahedronGeometry(0.085, 0); g.scale(1, 0.8, 1); g.translate(0, 0.05, 0); return g;
};
const MAT = {};
const matFor = (k) => MAT[k] || (MAT[k] = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: k === 'shell' || k === 'curio' ? 0.4 : 0.85, emissive: k === 'curio' ? 0x0c1a1a : 0x000000, flatShading: true }));

function placeKeepsakes() {
  const rng = mulberry32(88211), R = (a, b) => a + (b - a) * rng();
  const items = [];
  const anchors = [falls.pool, SPRING, TEMPLE, FAIRY].filter(Boolean);
  const ok = {
    shell: (x, z, h) => h > 0.25 && h < 1.1 && getSlope(x, z) < 0.25,
    driftwood: (x, z, h) => h > 0.35 && h < 1.6 && getSlope(x, z) < 0.3,
    pebble: (x, z, h) => h > 0.5 && h < 14 && getSlope(x, z) < 0.45 && (h < 1.8 || riverDist(x, z) < 6),
    feather: (x, z, h) => h > 2 && h < 20 && getSlope(x, z) < 0.3 && Math.hypot(x - VOL.x, z - VOL.z) > 60,
  };
  for (const [kind, K] of Object.entries(KINDS)) {
    let n = 0;
    for (let tries = 0; n < K.n && tries < 6000; tries++) {
      let x, z;
      if (kind === 'curio') { const a = anchors[Math.floor(rng() * anchors.length)] || { x: 0, z: 0 }, ang = R(0, TAU), r = R(3, 12); x = a.x + Math.cos(ang) * r; z = a.z + Math.sin(ang) * r; }
      else { const ang = R(0, TAU), r = R(40, 235); x = Math.cos(ang) * r; z = Math.sin(ang) * r; }
      const h = getHeight(x, z);
      if (kind === 'curio' ? !(h > 0.5 && getSlope(x, z) < 0.5 && lavaDist(x, z) > 25) : !ok[kind](x, z, h)) continue;
      items.push({ id: `${kind}${n}`, kind, x, z, y: h, rot: R(0, TAU), sc: R(K.sc[0], K.sc[1]), ci: Math.floor(rng() * K.col.length), alive: true, back: 0, noticed: false });
      n++;
    }
  }
  return items;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function makeLayer(cap) {
  const meshes = {};
  for (const k of Object.keys(KINDS)) {
    const im = new THREE.InstancedMesh(geoFor(k), matFor(k), cap[k]);
    im.frustumCulled = false; im.castShadow = false; im.count = cap[k]; im.userData.lodBatch = true;   // their contents change, so the static culling pass must leave them alone
    for (let i = 0; i < cap[k]; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setHex(0xffffff)); }
    scene.add(im); meshes[k] = im;
  }
  return meshes;
}
function setInst(im, i, x, y, z, rx, ry, rz, sx, sy, sz, hex) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); im.setMatrixAt(i, _m);
  if (hex !== undefined) im.setColorAt(i, _c.setHex(hex));
}

/* ------------------------------------------------------------------ designs: what he can arrange or build from what he has collected */
// each returns parts: [kind, dx, dy, dz, rx, ry, rz, scale xyz]
const DESIGNS = {
  spiral: { label: 'a spiral of shells', cost: { shell: 5 }, base: true, parts: () => Array.from({ length: 5 }, (_, i) => ['shell', Math.cos(i * 2.4) * (0.12 + i * 0.09), 0, Math.sin(i * 2.4) * (0.12 + i * 0.09), 0, i * 2.4 + 1.2, 0, [1, 1, 1]]) },
  cairn: { label: 'a small cairn of smooth stones', cost: { pebble: 3 }, base: true, parts: () => [0, 1, 2].map((i) => ['pebble', 0, 0.05 + i * 0.075, 0, 0, i * 1.3, 0, [1.5 - i * 0.27, 1.5 - i * 0.27, 1.5 - i * 0.27]]) },
  arch: { label: 'a leaning driftwood arch with a feather', cost: { driftwood: 2, feather: 1 }, unlock: 'leaning',
    parts: () => [['driftwood', -0.26, 0.31, 0, 0, 0, -1.15, [0.95, 1, 1]], ['driftwood', 0.26, 0.31, 0, 0, 0, 1.15, [0.95, 1, 1]], ['feather', 0, 0.66, 0, 0.3, 0.4, 0, [1.5, 1.5, 1.5]]] },
  chime: { label: 'a driftwood wind chime of shells and feathers', cost: { driftwood: 3, shell: 3, feather: 2 }, unlock: 'hanging',
    parts: () => [['driftwood', -0.5, 0.45, 0, 0, 0, Math.PI / 2, [0.55, 1, 1]], ['driftwood', 0.5, 0.45, 0, 0, 0, Math.PI / 2, [0.55, 1, 1]], ['driftwood', 0, 0.92, 0, 0, 0, 0, [1.7, 1, 1]],
      ['shell', -0.35, 0.72, 0, 0, 0, 0, [1, 1, 1]], ['shell', 0, 0.66, 0, 0, 0.5, 0, [1, 1, 1]], ['shell', 0.35, 0.74, 0, 0, 1, 0, [1, 1, 1]], ['feather', -0.18, 0.7, 0, 0, 0, 1.4, [1.2, 1.2, 1.2]], ['feather', 0.18, 0.69, 0, 0, 0, 1.7, [1.2, 1.2, 1.2]]] },
  bench: { label: 'a driftwood bench by the fire', cost: { driftwood: 3 }, build: true,
    parts: () => [['driftwood', -0.55, 0.12, 0, 0, 0, 0.0, [0.28, 1.8, 1.8]], ['driftwood', 0.55, 0.12, 0, 0, 0, 0.0, [0.28, 1.8, 1.8]], ['driftwood', 0, 0.3, 0, 0, 0, 0, [2.5, 1.2, 1.2]]] },
  ring: { label: 'a ring of stones round the fire', cost: { pebble: 8 }, build: true, parts: () => Array.from({ length: 8 }, (_, i) => ['pebble', Math.cos(i * TAU / 8) * 1.15, 0, Math.sin(i * TAU / 8) * 1.15, 0, i, 0, [1.7, 1.7, 1.7]]) },
};
const COLOR_OF = { shell: 0xf2d9c4, pebble: 0x8d8f92, driftwood: 0xcdbd9e, feather: 0xf4f1ea, curio: 0x3fb7b0 };

/** @param api { camp, hut, pois(): [{x,z,name}], fire(): {x,z}|null, safe(p), mind, ctxNow() } */
export function createLife(api) {
  const { camp, mind } = api;
  const items = placeKeepsakes();
  const itemMeshes = makeLayer(Object.fromEntries(Object.keys(KINDS).map((k) => [k, KINDS[k].n])));
  const idx = {}; for (const k of Object.keys(KINDS)) idx[k] = 0;
  for (const it of items) { it.i = idx[it.kind]++; }
  const writeItem = (it) => { const im = itemMeshes[it.kind]; if (it.alive) setInst(im, it.i, it.x, it.y, it.z, 0, it.rot, 0, it.sc, it.sc, it.sc, KINDS[it.kind].col[it.ci]); else im.setMatrixAt(it.i, ZERO); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
  for (const it of items) writeItem(it);
  const CAPS = { shell: 70, pebble: 90, driftwood: 40, feather: 24, curio: 12 };
  const placed = makeLayer(CAPS), placedN = {}; for (const k of Object.keys(KINDS)) placedN[k] = 0;
  const resetPlaced = () => { for (const k of Object.keys(KINDS)) { for (let i = 0; i < CAPS[k]; i++) placed[k].setMatrixAt(i, ZERO); placedN[k] = 0; placed[k].instanceMatrix.needsUpdate = true; } };

  // ---------------- persistent state
  const S = {
    v: 1, drives: Object.fromEntries(DRIVES.map((d) => [d, { a: 0.3, cool: 0, taste: TASTE[d], done: 0 }])),
    stored: { shell: 0, pebble: 0, driftwood: 0, feather: 0, curio: 0 }, carried: { shell: 0, pebble: 0, driftwood: 0, feather: 0, curio: 0 },
    collection: { total: 0, firsts: [] }, creations: [], built: [], designs: ['spiral', 'cairn'], taken: {},
    lastKind: {}, places: {}, discoveries: [], fears: [], prefs: {}, skills: { hunt: 0.1, create: 0.1, build: 0.1, explore: 0.1, collect: 0.1 }, stats: { quests: 0, completed: 0, abandoned: 0, byKind: {} },
  };
  let forced = null, lastCands = [];
  let content = 0, saveT = 0, dirty = false, propT = 0, proposal = null, quest = null, lastDistract = -9;
  const recent = [];
  const log = (text) => { recent.push({ at: +mind.clock.toFixed(2), text }); if (recent.length > 14) recent.shift(); };

  // ---------------- placing and restoring what he has made
  function applyParts(parts, cx, cz, yaw, ground) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (const [kind, dx, dy, dz, rx, ry, rz, sc] of parts) {
      const n = placedN[kind]; if (n >= CAPS[kind]) continue;
      const x = cx + dx * cs - dz * sn, z = cz + dx * sn + dz * cs, g = ground ?? getHeight(x, z);
      setInst(placed[kind], n, x, g + dy, z, rx, ry + yaw, rz, sc[0], sc[1], sc[2], COLOR_OF[kind]);
      placedN[kind]++;
    }
    for (const k of Object.keys(KINDS)) { placed[k].instanceMatrix.needsUpdate = true; if (placed[k].instanceColor) placed[k].instanceColor.needsUpdate = true; }
  }
  const siteOf = (rec) => ({ x: rec.x, z: rec.z, yaw: rec.yaw });
  function rebuildPlaced() {
    resetPlaced();
    for (const c of S.creations) applyParts(DESIGNS[c.design].parts(), c.x, c.z, c.yaw);
    for (const b of S.built) applyParts(DESIGNS[b.design].parts(), b.x, b.z, b.yaw);
  }

  // ---------------- load / save
  try {
    const raw = JSON.parse(localStorage.getItem(LIFE_KEY) || 'null');
    if (raw && raw.v === 1) {
      for (const d of DRIVES) if (raw.drives?.[d]) { const r = raw.drives[d]; S.drives[d] = { a: clamp(+r.a || 0.3, 0, 1), cool: Math.max(0, +r.cool || 0), taste: clamp(+r.taste || TASTE[d], 0.15, 0.95), done: Math.max(0, r.done | 0) }; }
      for (const k of Object.keys(KINDS)) { S.stored[k] = clamp(raw.stored?.[k] | 0, 0, 200); S.carried[k] = clamp(raw.carried?.[k] | 0, 0, 20); }
      S.collection = { total: Math.max(0, raw.collection?.total | 0), firsts: (raw.collection?.firsts || []).slice(0, 12) };
      S.creations = (raw.creations || []).filter((c) => DESIGNS[c.design] && Number.isFinite(c.x) && Number.isFinite(c.z)).slice(-10);
      S.built = (raw.built || []).filter((c) => DESIGNS[c.design] && Number.isFinite(c.x) && Number.isFinite(c.z)).slice(-4);
      S.designs = Array.from(new Set(['spiral', 'cairn', ...(raw.designs || []).filter((d) => DESIGNS[d])]));
      S.taken = typeof raw.taken === 'object' && raw.taken ? raw.taken : {};
      S.places = raw.places && typeof raw.places === 'object' ? raw.places : {};
      S.lastKind = raw.lastKind && typeof raw.lastKind === 'object' ? raw.lastKind : {};
      S.discoveries = (raw.discoveries || []).slice(-30); S.fears = (raw.fears || []).slice(-6);
      S.prefs = raw.prefs || {}; Object.assign(S.skills, raw.skills || {}); Object.assign(S.stats, raw.stats || {});
      for (const it of items) { const back = S.taken[it.id]; if (back !== undefined && back > mind.clock) { it.alive = false; it.back = back; writeItem(it); } }
    }
  } catch { /* an unreadable save leaves a fresh life; nothing else depends on it */ }
  rebuildPlaced();
  function save() {
    try {
      const t = {}; for (const it of items) if (!it.alive) t[it.id] = it.back;
      S.taken = t; localStorage.setItem(LIFE_KEY, JSON.stringify(S)); dirty = false;
    } catch { /* storage unavailable */ }
  }
  const touch = () => { dirty = true; };

  // ---------------- memory helpers
  const nearestPoi = (x, z) => { let b = null, bd = 1e9; for (const p of api.pois()) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b ? { name: b.name, d: bd } : { name: 'the island', d: 0 }; };
  const place = (name) => S.places[name] || (S.places[name] = { visits: 0, joy: 0, found: 0, last: -99 });
  const addDiscovery = (text, x, z, kind) => {
    if (S.discoveries.some((d) => d.text === text)) return null;
    const d = { id: 'd' + (S.stats.quests + S.discoveries.length + Math.floor(mind.clock)), text, x, z, kind, at: +mind.clock.toFixed(1), used: false };
    S.discoveries.push(d); if (S.discoveries.length > 30) S.discoveries.shift(); log('Noticed: ' + text); touch(); return d;
  };
  const fearAt = (x, z) => { let f = 0; for (const e of S.fears) { const age = mind.clock - e.t; if (age < 10) f = Math.max(f, e.level * (1 - age / 10) * clamp(1 - Math.hypot(e.x - x, e.z - z) / 40, 0, 1)); } return f; };
  const skill = (k, d) => { S.skills[k] = clamp((S.skills[k] || 0.1) + d * (1 - (S.skills[k] || 0.1)), 0.05, 1); };
  const satisfy = (drive, gain, rest) => { const D = S.drives[drive]; D.a = Math.max(0, D.a - gain); D.cool = mind.clock + rest; D.done++; touch(); };
  const learn = (kind, drive, joy) => { S.prefs[kind] = clamp((S.prefs[kind] ?? 0.5) + 0.08 * (joy - 0.45), 0.2, 1); const D = S.drives[drive]; D.taste = clamp(D.taste + 0.015 * (joy - 0.45), 0.2, 0.95); touch(); };

  /* ================================================================== opportunities and drive dynamics (cheap; every few seconds, never per frame) */
  const blocked = (p) => (S.places[p.name]?.blocked || 0) >= 2;        // somewhere he has twice failed to get to is left alone
  const unvisited = () => api.pois().filter((p) => (S.places[p.name]?.visits || 0) === 0 && !blocked(p));
  function nearestKeepsake(x, z, max, filter) {
    let best = null, bd = max;
    for (const it of items) { if (!it.alive || (filter && !filter(it))) continue; const d = Math.hypot(it.x - x, it.z - z); if (d < bd && api.safe(it) && fearAt(it.x, it.z) < 0.4) { bd = d; best = it; } }
    return best;
  }
  const storedKinds = () => Object.keys(KINDS).filter((k) => S.stored[k] > 0).length;
  const afford = (design) => Object.entries(DESIGNS[design].cost).every(([k, n]) => S.stored[k] >= n);
  const creatableDesigns = () => S.designs.filter((d) => !DESIGNS[d].build && afford(d));
  const buildableDesigns = () => Object.keys(DESIGNS).filter((d) => DESIGNS[d].build && !S.built.some((b) => b.design === d) && afford(d));
  function opportunities(pos, ctx) {
    const night = ctx.hour >= 20.5 || ctx.hour < 6;
    const uv = unvisited().length, total = Math.max(1, api.pois().length);
    const far = api.pois().some((p) => !blocked(p) && p.name !== 'a quiet corner of the island' && Math.hypot(p.x - camp.x, p.z - camp.z) > 60 && (S.places[p.name]?.visits || 0) < 2 + (mind.clock > 72 ? 1 : 0));
    const near = nearestKeepsake(pos.x, pos.z, 120);
    const pending = S.discoveries.filter((d) => !d.used).length;
    return {
      adventure: far ? 1 : 0.3, curiosity: clamp(0.3 + 0.3 * Math.min(2, pending) + 0.4 * uv / total, 0, 1),
      collecting: near ? clamp(1 - Math.hypot(near.x - pos.x, near.z - pos.z) / 140, 0.3, 1) : 0.1,
      building: buildableDesigns().length ? 1 : 0.08, creating: creatableDesigns().length && S.creations.length < 8 ? 1 : 0.08,
      creativity: storedKinds() >= 2 ? (S.designs.length < 4 ? 1 : 0.4) : 0.2, play: 0.4 + (ctx.hour >= 9 && ctx.hour < 17 && ctx.rain < 0.1 ? 0.3 : 0) + (ctx.hour >= 16 && ctx.hour < 19 && ctx.rain < 0.1 ? 0.1 : 0),
      hunting: (night || (ctx.hour >= 17 && ctx.hour < 21) ? 0.8 : 0.3) + (ctx.ratC ? 0.2 : 0),
    };
  }
  function tick(dh) {
    const ctx = api.ctxNow(); if (!ctx) return;
    const opp = opportunities(api.pos(), ctx); life.opp = opp;
    const k = 1 - Math.exp(-0.3 * dh);
    for (const d of DRIVES) {
      const D = S.drives[d], target = D.taste * (0.3 + 0.7 * (opp[d] ?? 0.5));
      D.a += (target - D.a) * k;
      if (mind.clock < D.cool) D.a = Math.min(D.a, 0.18);
    }
    // noticing: things within sight of where he is passing become remembered finds
    const p = api.pos();
    for (const it of items) {
      if (!it.alive || it.noticed || it.kind !== 'curio' || Math.hypot(it.x - p.x, it.z - p.z) > 14) continue;
      it.noticed = true; const np = nearestPoi(it.x, it.z);
      addDiscovery(`unusual stones near ${np.name}`, it.x, it.z, 'curio');
    }
    // anything he is still carrying goes into his collection when he is back at camp
    if (carriedTotalNow() > 0 && Math.hypot(p.x - camp.x, p.z - camp.z) < 9) { const r = events.store({}, quest || {}); if (r.text) { log(r.text); mind.note(r.text, 'quest', 0.01, true); } }
    // keepsakes grow back slowly (after about three days), so nothing runs out for good
    for (const it of items) if (!it.alive && mind.clock >= it.back) { it.alive = true; writeItem(it); }
  }

  /* ================================================================== goal proposals */
  const quiet = (ctx) => ctx.rain > 0.25 || ctx.hour >= 20 || ctx.hour < 5.5;
  function candidate(kind, drive, why, value, expected, build) { return { kind, drive, why, value, expected, build }; }

  function propose(ctx) {
    const pos = api.pos(), out = [];
    if (forced) return forced;
    const ok = (d) => { const D = S.drives[d]; return mind.clock >= D.cool && D.a > 0.3; };
    const pref = (k) => S.prefs[k] ?? 0.5;
    if (quest && mind.clock - quest.touched < 16) return { resume: true, kind: quest.kind, drive: quest.drive, why: quest.why, value: 0.7 + 0.2 * S.drives[quest.drive].a, expected: 'finish what he started', quest };
    if (quest) { S.stats.abandoned++; log('Let go of what he had set out to do.'); D(quest.drive).cool = mind.clock + 1; quest = null; touch(); }
    if (mind.clock < content || quiet(ctx)) return null;
    if (ok('collecting')) {
      const want = Object.keys(KINDS).filter((k) => nearestKeepsake(pos.x, pos.z, 130, (i) => i.kind === k)).sort((a, b) => (pref(b) + (S.collection.firsts.includes(b) ? 0 : 0.3)) - (pref(a) + (S.collection.firsts.includes(a) ? 0 : 0.3)))[0];
      const it = want && nearestKeepsake(pos.x, pos.z, 130, (i) => i.kind === want);
      if (it) out.push(candidate('collect', 'collecting', `spotted ${KINDS[it.kind].label} to add to his collection`, S.drives.collecting.a * (0.6 + pref('collect')), 'a new keepsake and a calmer wish to collect', () => planCollect(it)));
    }
    if (ok('curiosity')) {
      const pend = S.discoveries.filter((d) => !d.used).sort((a, b) => b.at - a.at)[0], uv = unvisited().sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z))[0];
      if (pend && fearAt(pend.x, pend.z) < 0.4) out.push(candidate('investigate', 'curiosity', `wants a closer look at the ${pend.text} he noticed`, S.drives.curiosity.a * (0.7 + pref('investigate')), 'to understand what he noticed', () => planInvestigate(pend, null)));
      else if (uv && fearAt(uv.x, uv.z) < 0.4) out.push(candidate('investigate', 'curiosity', `has never been to ${uv.name}`, S.drives.curiosity.a * (0.6 + pref('investigate')), 'a new place, remembered', () => planInvestigate(null, uv)));
    }
    if (ok('adventure')) {
      // a named place a good walk away (not the farthest corner: the island is big and a day is ten minutes), the one he knows least
      const far = api.pois().filter((p) => !blocked(p) && p.name !== 'a quiet corner of the island' && Math.hypot(p.x - camp.x, p.z - camp.z) > 60 && Math.hypot(p.x - camp.x, p.z - camp.z) < 190 && fearAt(p.x, p.z) < 0.4).sort((a, b) => ((S.places[a.name]?.visits || 0) - (S.places[b.name]?.visits || 0)) || (Math.hypot(a.x - camp.x, a.z - camp.z) - Math.hypot(b.x - camp.x, b.z - camp.z)))[0];
      if (far) out.push(candidate('adventure', 'adventure', `feels like a long trip to ${far.name}`, S.drives.adventure.a * (0.6 + pref('adventure')), 'the view from somewhere far, and a story to remember', () => planAdventure(far)));
    }
    if (ok('creating') && S.creations.length < 8) {
      const ds = creatableDesigns();
      if (ds.length) { const d = ds.sort((a, b) => (S.creations.filter((c) => c.design === a).length - S.creations.filter((c) => c.design === b).length) || (Math.random() - 0.5))[0]; out.push(candidate('create', 'creating', `has what he needs for ${DESIGNS[d].label}`, S.drives.creating.a * (0.6 + pref('create')), 'something lasting made for its own sake', () => planCreate(d))); }
    }
    if (ok('creativity') && storedKinds() >= 2 && S.designs.length < Object.keys(DESIGNS).filter((d) => !DESIGNS[d].build).length) {
      out.push(candidate('experiment', 'creativity', 'wonders what he could make by combining the things he has gathered', S.drives.creativity.a * (0.6 + pref('experiment')), 'a new idea for something to make', () => planExperiment()));
    }
    if (ok('building')) {
      const bs = buildableDesigns();
      if (bs.length) out.push(candidate('build', 'building', `has gathered enough for ${DESIGNS[bs[0]].label}`, S.drives.building.a * (0.6 + pref('build')), 'a lasting improvement to his camp', () => planBuild(bs[0])));
    }
    if (ok('play')) {
      const beach = findBeach(pos);
      if (beach) out.push(candidate('beachplay', 'play', 'wants to be silly on the beach for a while', S.drives.play.a * (0.6 + pref('beachplay')), 'a good laugh', () => planBeachPlay(beach)));
    }
    if (ok('hunting') && (ctx.hour >= 16.5 || ctx.hour < 6)) {
      const b = nearestBurrow(pos);
      if (b) out.push(candidate('track', 'hunting', 'wants to practise reading tracks and stalking rats', S.drives.hunting.a * (0.6 + pref('track')), 'better hunting skill', () => planTrack(b)));
    }
    if (!out.length) return null;
    // variety: what he has not done for a while is more attractive than what he did recently, and no two days are the same
    const score = (c) => c.value * (0.4 + 0.6 * clamp((mind.clock - (S.lastKind[c.kind] ?? -99)) / 12, 0, 1)) * (0.88 + 0.24 * Math.random());
    out.sort((a, b) => score(b) - score(a));
    lastCands = out.map((c) => c.kind + ":" + c.value.toFixed(2));
    return out[0];
  }

  /* ================================================================== plans: coherent sequences with a beginning, middle and end */
  const goto = (x, z, label, o = {}) => ({ t: 'goto', x, z, label, ...o });
  const campSpot = () => { const f = api.fire() || camp; return { x: f.x + 4.5, z: f.z - 3.0 }; };
  function planCollect(first) {
    const steps = [];
    const pick = (it) => {
      steps.push(goto(it.x, it.z, `heading for ${KINDS[it.kind].label}`));
      steps.push({ t: 'look', secs: 1.3, clip: 'look_curious', at: it, face: 'curious', label: 'noticing something on the ground' });
      steps.push({ t: 'anim', clip: 'kneel_down', once: true, face: 'curious', label: 'kneeling to look' });
      steps.push({ t: 'anim', clip: 'kneel_idle', secs: 1.2, event: { at: 0.4, do: 'pickup', item: it }, face: 'curious', label: `picking up ${KINDS[it.kind].label}` });
      steps.push({ t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' });
      steps.push({ t: 'anim', clip: 'fish_inspect_catch', secs: 2.6, hold: it.kind, face: it.kind === 'curio' ? 'surprise' : 'friendly', label: `turning ${KINDS[it.kind].label} over in his fingers` });
    };
    pick(first);
    const got = [first];                       // finds tend to lie together: he usually picks up a few before heading back
    for (let k = 0; k < 3; k++) {
      const last = got[got.length - 1], more = nearestKeepsake(last.x, last.z, 24, (i) => !got.includes(i) && (i.kind === first.kind || Math.random() < 0.5));
      if (!more || Math.random() > 0.85) break;
      got.push(more); pick(more);
    }
    const s = campSpot();
    steps.push(goto(s.x, s.z, 'carrying his finds back to camp'));
    steps.push({ t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling at his collection' });
    steps.push({ t: 'anim', clip: 'kneel_idle', secs: 2.2, event: { at: 0.5, do: 'store' }, face: 'friendly', label: 'adding to his collection' });
    steps.push({ t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' });
    steps.push({ t: 'anim', clip: first.kind === 'curio' ? 'excitement' : 'contemplation', secs: 2.8, face: 'friendly', label: 'pleased with his finds' });
    return steps;
  }
  function planInvestigate(disc, poi) {
    const tx = disc ? disc.x : poi.x, tz = disc ? disc.z : poi.z, name = disc ? nearestPoi(disc.x, disc.z).name : poi.name;
    const steps = [{ t: 'anim', clip: 'idle_look_around', secs: 2, face: 'curious', label: `thinking about ${disc ? 'what he noticed' : name}` }, goto(tx, tz, `making his way to ${name}`, { wander: true, poi: name })];
    steps.push({ t: 'look', secs: 1.5, clip: 'look_curious', at: { x: tx, z: tz }, face: 'curious', label: `taking in ${name}` });
    if (disc) {
      const near = nearestKeepsake(tx, tz, 14, (i) => i.kind === 'curio');
      steps.push({ t: 'anim', clip: 'track_animals', secs: 4, face: 'curious', label: 'looking closely at the ground' });
      if (near) {
        steps.push(goto(near.x, near.z, 'stepping over to the stones'));
        steps.push({ t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling to examine' });
        steps.push({ t: 'anim', clip: 'kneel_idle', secs: 1.5, event: { at: 0.4, do: 'pickup', item: near }, face: 'surprise', label: 'picking up a specimen' });
        steps.push({ t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' });
        steps.push({ t: 'anim', clip: 'fish_inspect_catch', secs: 3, hold: 'curio', face: 'surprise', label: 'examining the specimen' });
      }
    } else {
      steps.push({ t: 'anim', clip: Math.random() < 0.5 ? 'contemplation' : 'look_up_sky', secs: 4, face: 'friendly', label: `looking round ${name}` });
    }
    steps.push({ t: 'event', do: 'discover', name, disc, x: tx, z: tz });
    if (Math.random() < 0.6) { const s = campSpot(); steps.push(goto(s.x, s.z, 'heading back to camp')); if (disc) { steps.push({ t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling at his collection' }); steps.push({ t: 'anim', clip: 'kneel_idle', secs: 1.8, event: { at: 0.5, do: 'store' }, label: 'adding the specimen' }); steps.push({ t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' }); } }
    return steps;
  }
  function planAdventure(poi) {
    const a = { x: camp.x, z: camp.z }, mid = { x: (a.x + poi.x) / 2 + (poi.z - a.z) * 0.12, z: (a.z + poi.z) / 2 - (poi.x - a.x) * 0.12 };
    const high = getHeight(poi.x, poi.z) > 6;
    const steps = [{ t: 'anim', clip: 'staff_pickup', once: true, label: 'taking up his staff for a long walk' }, goto(poi.x, poi.z, 'setting out for ' + poi.name, { wander: true, staff: true, poi: poi.name })];
    steps.push({ t: 'anim', clip: high ? 'high_lookout' : 'contemplation', secs: 6, face: 'friendly', label: `taking in the view at ${poi.name}` });
    if (high) steps.push({ t: 'anim', clip: 'look_down_from_height', secs: 3, face: 'surprise', label: 'looking down from the height' });
    if (high && Math.random() < 0.6) steps.push({ t: 'anim', clip: 'shout', once: true, face: 'laugh', label: 'shouting out over the island' });
    const e = { x: poi.x + (Math.random() - 0.5) * 30, z: poi.z + (Math.random() - 0.5) * 30 };
    steps.push(goto(e.x, e.z, `exploring around ${poi.name}`, { wander: true, staff: true }));
    steps.push({ t: 'look', secs: 2, clip: 'look_curious', at: { x: e.x + 8, z: e.z + 8 }, face: 'curious', label: 'peering around' });
    steps.push({ t: 'event', do: 'discover', name: poi.name, x: poi.x, z: poi.z });
    steps.push({ t: 'anim', clip: Math.random() < 0.5 ? 'wave_hello' : 'celebrate', once: true, face: 'grin', label: 'pleased with the trip' });
    const s = campSpot(); steps.push(goto(s.x, s.z, 'the long walk home', { wander: true, staff: true }));
    return steps;
  }
  function planCreate(design) {
    const site = gallerySite();
    const parts = DESIGNS[design].parts();
    const steps = [goto(site.x, site.z + 1.4, 'taking his things to a good spot'), { t: 'look', secs: 1.4, clip: 'contemplation', at: site, face: 'friendly', label: 'deciding how to arrange them' },
      { t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling to work' }];
    steps.push({ t: 'anim', clip: 'kneel_idle', secs: 7, event: { at: 0.15, do: 'create', design, site, stages: parts.length }, face: 'curious', label: `making ${DESIGNS[design].label}` });
    steps.push({ t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' });
    steps.push({ t: 'look', secs: 4, clip: 'contemplation', at: site, face: 'friendly', label: 'looking over what he made' });
    steps.push({ t: 'anim', clip: Math.random() < 0.4 ? 'clap' : 'nod_yes', once: true, face: 'grin', label: 'satisfied' });
    return steps;
  }
  function planExperiment() {
    const s = campSpot();
    return [goto(s.x, s.z, 'sitting down with his materials'), { t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling to tinker' },
      { t: 'anim', clip: 'kneel_idle', secs: 6, face: 'curious', event: { at: 0.9, do: 'experiment' }, label: 'trying things together' }, { t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' }, { t: 'event', do: 'experiment-result' }];
  }
  function planBuild(design) {
    const site = buildSite(design);
    return [goto(site.x, site.z + 1.6, 'carrying driftwood to the fire'), { t: 'look', secs: 1.2, clip: 'contemplation', at: site, label: 'working out where it should go' },
      { t: 'anim', clip: 'kneel_down', once: true, label: 'kneeling to build' },
      { t: 'anim', clip: 'kneel_idle', secs: 9, face: 'curious', event: { at: 0.1, do: 'build', design, site, stages: DESIGNS[design].parts().length }, label: `building ${DESIGNS[design].label}` },
      { t: 'anim', clip: 'kneel_rise', once: true, label: 'standing up' }, { t: 'look', secs: 3, clip: 'contemplation', at: site, face: 'friendly', label: 'looking over his work' },
      design === 'bench' ? { t: 'anim', clip: 'sit_down', once: true, label: 'trying it out' } : { t: 'anim', clip: 'nod_yes', once: true, label: 'pleased' },
      design === 'bench' ? { t: 'anim', clip: 'sit_idle', secs: 6, face: 'friendly', label: 'sitting on his own bench' } : { t: 'anim', clip: 'idle_relaxed', secs: 2, label: 'resting' }];
  }
  function planBeachPlay(b) {
    const choices = ['play_kick_sand', 'play_flex_pose', 'play_skip'].sort(() => Math.random() - 0.5);
    const steps = [goto(b.x, b.z, 'heading to the beach')];
    for (const c of choices.slice(0, 2)) {
      if (c === 'play_skip') steps.push({ t: 'skipwalk', x: b.x + (Math.random() - 0.5) * 16, z: b.z + (Math.random() - 0.5) * 16, label: 'skipping along the sand' });
      else steps.push({ t: 'anim', clip: c, once: true, face: 'grin', label: c === 'play_flex_pose' ? 'striking silly poses' : 'kicking sand about' });
    }
    steps.push({ t: 'anim', clip: 'laugh_hearty', once: true, face: 'laugh', label: 'laughing' });
    return steps;
  }
  function planTrack(b) {
    return [goto(b.x - 6, b.z - 6, 'creeping toward a rat burrow', { speed: 1.6 }), { t: 'anim', clip: 'track_animals', secs: 6, face: 'curious', label: 'reading tracks round the burrow' },
      { t: 'event', do: 'hunt-ready' }];
  }
  // open stretches of sand to play on, found once with a seeded generator
  const beaches = (() => {
    const rng = mulberry32(5521), out = [];
    for (let t = 0; out.length < 14 && t < 8000; t++) {
      const a = rng() * TAU, r = 60 + rng() * 175, x = Math.cos(a) * r, z = Math.sin(a) * r, h = getHeight(x, z);
      if (h > 0.55 && h < 1.3 && getSlope(x, z) < 0.12 && getHeight(x + Math.cos(a) * 14, z + Math.sin(a) * 14) < 0.3 && out.every((q) => Math.hypot(q.x - x, q.z - z) > 22)) out.push({ x, z });
    }
    return out;
  })();
  function findBeach(pos) {
    let best = null, bd = 1e9;
    for (const b of beaches) { const d = Math.hypot(b.x - pos.x, b.z - pos.z); if (d < bd && d < 190 && api.safe(b) && fearAt(b.x, b.z) < 0.4) { bd = d; best = b; } }
    return best;
  }
  const nearestBurrow = (pos) => { let b = null, bd = 90; for (const u of eco.burrows) { const d = Math.hypot(u.x - pos.x, u.z - pos.z); if (d < bd && api.safe(u)) { bd = d; b = u; } } return b; };
  function gallerySite() {
    const used = S.creations.length, f = api.fire() || camp, a = 2.3 + used * 0.62;
    for (let k = 0; k < 20; k++) { const x = f.x + Math.cos(a + k * 0.45) * (7 + (used % 3) * 1.6), z = f.z + Math.sin(a + k * 0.45) * (7 + (used % 3) * 1.6); if (getHeight(x, z) > 0.9 && api.safe({ x, z })) return { x, z, yaw: a + k * 0.45 + 1.57 }; }
    return { x: f.x + 7, z: f.z + 1, yaw: 0 };
  }
  function buildSite(design) {
    const f = api.fire() || camp;
    if (design === 'ring') return { x: f.x, z: f.z, yaw: 0 };
    return { x: f.x + 2.6, z: f.z + 0.9, yaw: Math.atan2(f.x - (f.x + 2.6), f.z - (f.z + 0.9)) + Math.PI / 2 };
  }

  /* ================================================================== running a quest: human.js calls these as it executes the steps */
  function start(prop) {
    if (prop.forced) forced = null;
    const steps = prop.build();
    quest = { forced: !!prop.forced, id: S.stats.quests + 1, kind: prop.kind, drive: prop.drive, why: prop.why, expected: prop.expected, steps, i: 0, touched: mind.clock, started: mind.clock, got: 0 };
    S.stats.quests++; S.stats.byKind[prop.kind] = (S.stats.byKind[prop.kind] || 0) + 1; log(`Set out: ${prop.why}.`); touch();
    return quest;
  }
  // a keepsake he picks up himself (under direct control): the same record as a collecting walk
  function pickupNear(x, z, r) {
    let best = null, bd = r;
    for (const it of items) { if (!it.alive) continue; const d = Math.hypot(it.x - x, it.z - z); if (d < bd) { bd = d; best = it; } }
    if (!best) return null;
    const got = events.pickup({ item: best }, { got: 0 });
    if (got) log(got.text);
    return got;
  }
  // what he has gathered, for the Collection (Journal): stored at camp, and carried until he gets back there
  const collection = () => ({ stored: { ...S.stored }, carried: { ...S.carried }, total: S.collection.total, firsts: S.collection.firsts.slice() });
  const resume = () => { if (quest) { quest.touched = mind.clock; } return quest; };
  function pause(why) { if (quest) { quest.touched = mind.clock; log('Put aside what he was doing (' + why + ').'); } }
  function finish(ok, text) {
    if (!quest) return;
    const q = quest; quest = null; content = mind.clock + 0.6 + Math.random() * 1.2; S.lastKind[q.kind] = mind.clock;
    if (ok) {
      S.stats.completed++;
      const enjoy = { collect: 0.55, investigate: 0.6, adventure: 0.75, create: 0.8, experiment: 0.55, build: 0.8, beachplay: 0.85, track: 0.5 }[q.kind] ?? 0.5;
      const rest = { collect: 2.5, investigate: 4, adventure: 9, create: 6, experiment: 5, build: 10, beachplay: 4, track: 3 }[q.kind] ?? 3;
      satisfy(q.drive, 0.55, rest);
      if (q.kind === 'adventure') satisfy('curiosity', 0.15, 1.5);
      if (q.kind === 'investigate') satisfy('adventure', 0.1, 1);
      learn(q.kind, q.drive, enjoy);
      mind.note(text || `Finished: ${q.why}.`, 'quest', enjoy * 0.12, true);
      log(text || 'Finished.'); skill({ collect: 'collect', create: 'create', experiment: 'create', build: 'build', adventure: 'explore', investigate: 'explore' }[q.kind] || 'explore', 0.1);
    } else { S.stats.abandoned++; D(q.drive).cool = mind.clock + 2; log(text || 'Gave up.'); }
    touch(); save();
  }
  const D = (d) => S.drives[d];

  // events from steps
  const events = {
    pickup(ev, q) {
      const it = ev.item; if (!it || !it.alive) return null;
      it.alive = false; it.back = mind.clock + 72; writeItem(it); S.carried[it.kind]++; q.got++; skill('collect', 0.05);
      const np = nearestPoi(it.x, it.z); place(np.name).found++; touch();
      return { held: it.kind, text: `Picked up ${KINDS[it.kind].label} near ${np.name}.` };
    },
    store(ev, q) {
      let n = 0, rare = null;
      for (const k of Object.keys(KINDS)) { const c = S.carried[k]; if (!c) continue; S.stored[k] += c; S.collection.total += c; n += c; S.carried[k] = 0; if (!S.collection.firsts.includes(k)) { S.collection.firsts.push(k); rare = k; } }
      touch(); if (n) log(`Added ${n} to his collection (${S.collection.total} in all).`);
      return { text: n ? `Added ${n} find${n > 1 ? 's' : ''} to his collection.` : null, rare };
    },
    create(ev, q) { q.staged = { kind: 'create', design: ev.design, site: ev.site, n: 0, total: ev.stages }; return {}; },
    build(ev, q) { q.staged = { kind: 'build', design: ev.design, site: ev.site, n: 0, total: ev.stages }; return {}; },
    experiment(ev, q) {
      const un = Object.keys(DESIGNS).filter((d) => !DESIGNS[d].build && !S.designs.includes(d)), chance = 0.45 + 0.4 * S.skills.create;
      q.exp = { ok: un.length && Math.random() < chance, design: un[0] }; return {};
    },
  };
  // a staged result: parts appear one by one while he works
  function stageProgress(frac) {
    const st = quest && quest.staged; if (!st) return;
    const want = Math.min(st.total, Math.floor(frac * st.total + 0.0001));
    if (want <= st.n) return;
    if (st.n === 0 && !st.paid) { for (const [k, n] of Object.entries(DESIGNS[st.design].cost)) S.stored[k] = Math.max(0, S.stored[k] - n); st.paid = true; }
    const parts = DESIGNS[st.design].parts(), site = st.site;
    applyParts(parts.slice(st.n, want), site.x, site.z, site.yaw || 0);
    st.n = want;
    if (st.n >= st.total) {
      const rec = { design: st.design, x: site.x, z: site.z, yaw: site.yaw || 0, at: +mind.clock.toFixed(1) };
      if (st.kind === 'create') { S.creations.push(rec); if (S.creations.length > 10) { S.creations.shift(); rebuildPlaced(); } skill('create', 0.1); }
      else { S.built.push(rec); skill('build', 0.15); }
      log(`Finished ${DESIGNS[st.design].label}.`); quest.madeText = `${st.kind === 'build' ? 'Built' : 'Made'} ${DESIGNS[st.design].label}.`; quest.staged = null; touch(); save();
    }
  }
  function runEvent(ev, q) {
    const f = events[ev.do]; return f ? f(ev, q) : null;
  }
  function discover(step, q) {
    if (step.x !== undefined && Math.hypot(api.pos().x - step.x, api.pos().z - step.z) > 32) { log(`Could not quite reach ${step.name}.`); q.madeText = `Turned back before reaching ${step.name}.`; return; }
    const pl = place(step.name); pl.visits++; pl.last = mind.clock; pl.joy = clamp(pl.joy + 0.2, 0, 1);
    if (step.disc) { step.disc.used = true; }
    skill('explore', 0.08); log(`Reached ${step.name}${step.disc ? ' and found out what it was' : ''}.`); touch();
    mind.visit?.(step.name, 'hike');
  }
  function experimentResult(q) {
    const r = q.exp || {};
    if (r.ok) { S.designs.push(r.design); skill('create', 0.12); log(`Worked out how to make ${DESIGNS[r.design].label}.`); touch(); return { ok: true, text: `Worked out how to make ${DESIGNS[r.design].label}.`, clip: 'excitement', face: 'grin' }; }
    skill('create', 0.04); return { ok: false, text: 'Tinkered for a while and learned a little.', clip: Math.random() < 0.5 ? 'head_scratch' : 'shrug', face: 'neutral' };
  }
  function blockedPlace(name) { if (!name) return; place(name).blocked = (place(name).blocked || 0) + 1; log(`Could not find a way to ${name}.`); touch(); }
  function scare(x, z) { S.fears.push({ x, z, level: 0.9, t: mind.clock }); if (S.fears.length > 6) S.fears.shift(); log('A frightening encounter keeps him wary of that ground.'); touch(); }
  function onNote(text, act, joy) {
    if (/Speared a rat/.test(text)) { skill('hunt', 0.12); satisfy('hunting', 0.5, 3); learn('track', 'hunting', 0.8); log('Caught a rat: his hunting is improving.'); }
    else if (/Landed a/.test(text)) { learn('fishing', 'play', 0.6); }
    if (act && joy !== undefined) { S.prefs[act] = clamp((S.prefs[act] ?? 0.5) + 0.05 * (joy * 6 - 0.2), 0.2, 1); }
    if (recent.length === 0 || recent[recent.length - 1].text !== text) log(text);
  }

  function update(dt, dh) {
    if (dh > 0) tick(dh);
    propT -= dt; if (propT < 0) { propT = 4; const ctx = api.ctxNow(); if (ctx) { proposal = propose(ctx); life.proposal = proposal; } }
    saveT += dt; if (dirty && saveT > 12) { saveT = 0; save(); }
  }
  const debug = () => ({
    drives: Object.fromEntries(DRIVES.map((d) => [d, { appetite: +S.drives[d].a.toFixed(2), taste: +S.drives[d].taste.toFixed(2), restUntil: +Math.max(0, S.drives[d].cool - mind.clock).toFixed(1), done: S.drives[d].done }])),
    opportunities: life.opp || null, candidates: lastCands, content: +Math.max(0, content - mind.clock).toFixed(2),
    proposal: proposal && { kind: proposal.kind, drive: proposal.drive, why: proposal.why, value: +proposal.value.toFixed(2), expected: proposal.expected, resume: !!proposal.resume },
    quest: quest && { kind: quest.kind, why: quest.why, step: quest.i + '/' + quest.steps.length, label: quest.steps[quest.i] && quest.steps[quest.i].label, ageHours: +(mind.clock - quest.started).toFixed(2) },
    stored: { ...S.stored }, carried: { ...S.carried }, collectionTotal: S.collection.total, creations: S.creations.map((c) => c.design), built: S.built.map((c) => c.design), designs: S.designs.slice(),
    skills: Object.fromEntries(Object.entries(S.skills).map(([k, v]) => [k, +v.toFixed(2)])), prefs: Object.fromEntries(Object.entries(S.prefs).map(([k, v]) => [k, +v.toFixed(2)])),
    places: Object.fromEntries(Object.entries(S.places).map(([k, v]) => [k, v.visits])), discoveries: S.discoveries.map((d) => d.text + (d.used ? ' (resolved)' : '')), fears: S.fears.length,
    stats: JSON.parse(JSON.stringify(S.stats)), recent: recent.slice(-8), keepsakesLeft: items.filter((i) => i.alive).length, instances: Object.fromEntries(Object.keys(KINDS).map((k) => [k, placedN[k]])),
  });
  // development only: set up a situation so a quest kind can be watched (its animations are then counted as forced, never as autonomous play)
  const dev = {
    give(o) { for (const k of Object.keys(o)) if (k in S.stored) S.stored[k] += o[k]; touch(); },
    force(kind) {
      const pos = api.pos(), pois = api.pois();
      const far = pois.slice().sort((a, b) => Math.hypot(b.x - camp.x, b.z - camp.z) - Math.hypot(a.x - camp.x, a.z - camp.z))[0];
      const B = {
        collect: () => { const it = nearestKeepsake(pos.x, pos.z, 200); return it && candidate('collect', 'collecting', 'forced test', 1, 'test', () => planCollect(it)); },
        investigate: () => candidate('investigate', 'curiosity', 'forced test', 1, 'test', () => planInvestigate(null, unvisited()[0] || pois[0])),
        adventure: () => candidate('adventure', 'adventure', 'forced test', 1, 'test', () => planAdventure(far)),
        create: () => candidate('create', 'creating', 'forced test', 1, 'test', () => planCreate(creatableDesigns()[0] || 'spiral')),
        experiment: () => candidate('experiment', 'creativity', 'forced test', 1, 'test', () => planExperiment()),
        build: () => candidate('build', 'building', 'forced test', 1, 'test', () => planBuild(buildableDesigns()[0] || 'bench')),
        beachplay: () => { const b = findBeach(pos); return b && candidate('beachplay', 'play', 'forced test', 1, 'test', () => planBeachPlay(b)); },
        track: () => { const b = nearestBurrow(pos); return b && candidate('track', 'hunting', 'forced test', 1, 'test', () => planTrack(b)); },
      };
      const c = B[kind] && B[kind](); if (!c) return false;
      if (quest) quest = null;
      c.forced = true; forced = c; proposal = c; life.proposal = c; return true;
    },
  };
  const carriedTotalNow = () => Object.values(S.carried).reduce((a, b) => a + b, 0);
  const life = {
    S, items, dev, update, blockedPlace, propose: () => proposal, start, resume, pause, finish, runEvent, stageProgress, discover, experimentResult, scare, onNote, debug, save, pickupNear, collection,
    get quest() { return quest; }, get content() { return content; }, opp: null, proposal: null, KINDS, DESIGNS,
    heldColor: (kind) => COLOR_OF[kind], carriedTotal: () => Object.values(S.carried).reduce((a, b) => a + b, 0),
    drivesNow: () => Object.fromEntries(DRIVES.map((d) => [d, S.drives[d].a])), skillOf: (k) => S.skills[k] || 0.1,
  };
  window.addEventListener('pagehide', save);
  return life;
}
