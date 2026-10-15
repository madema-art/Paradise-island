// Living soundscape: positional ambience, animal voices, effects (all synthesised) + the music playlist.
import { camera, env, U, updaters, creatures, events } from './core.js';
import { getHeight, falls, VOL, river, TEMPLE, SPRING, FAIRY, COVE, riverDist } from './world.js';
import { clamp, lerp, rnd, rr, pick, smoothstep } from './util.js';
import { wx } from './weather.js';
import { MusicPlaylist } from './music_playlist.js';

const KEY = 'paradise.audio.v1';
const defaults = { master: 0.9, music: 0.5, sfx: 0.85, musicOn: false, sfxOn: true, musicFirst: null, musicExcluded: [] };   // the soundscape first; music is one click away in the View tab

export function createAudio(volcano) {
  const st = { ...defaults };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };

  st.musicExcluded = Array.isArray(st.musicExcluded) ? st.musicExcluded : [];
  let ac = null, out, sfx, uw, verbIn, started = false;
  const noiseBufs = {};
  const N = {}; // named nodes
  const V3 = (x, y, z) => ({ x, y, z });

  /* ------------------------------------------------------------ music */
  let mEl = null, mIdx = -1, mVol = 0, trackCb = null, playlistCb = null;
  const rotation = new MusicPlaylist(Math.random, { first: st.musicFirst, removed: st.musicExcluded });
  rotation.setTracks((typeof window !== 'undefined' && window.MUSIC_PLAYLIST) || []);
  const saveMusic = () => { st.musicFirst = rotation.first; st.musicExcluded = [...rotation.removed]; save(); };
  function playTrack(track) {
    if (!track) {
      if (mEl) { mEl.pause(); mEl.removeAttribute('src'); mEl.load(); }
      mIdx = -1; if (trackCb) trackCb('No music in library'); if (playlistCb) playlistCb(rotation.library()); return;
    }
    mIdx = rotation.tracks.findIndex((item) => item.id === track.id);
    if (!mEl) {
      mEl = new Audio(); mEl.preload = 'auto';
      mEl.addEventListener('ended', () => playTrack(rotation.next()));
      mEl.addEventListener('error', () => { if (rotation.available().length > 1) setTimeout(() => playTrack(rotation.next()), 500); });
    }
    mEl.loop = rotation.available().length === 1;
    mEl.src = track.src; mEl.volume = 0; mVol = 0;
    const p = mEl.play(); if (p && p.catch) p.catch(() => {});
    if (trackCb) trackCb(track.title);
    if (playlistCb) playlistCb(rotation.library());
  }
  function refreshPlaylist(items) {
    const oldCurrent = rotation.current()?.id;
    const before = rotation.tracks.map((t) => t.id + '|' + t.src).join('\n');
    rotation.setTracks(items);
    const after = rotation.tracks.map((t) => t.id + '|' + t.src).join('\n');
    if (rotation.first !== st.musicFirst) saveMusic();
    if (before !== after) {
      if (playlistCb) playlistCb(rotation.library());
      if (oldCurrent && !rotation.byId.has(oldCurrent)) playTrack(rotation.next());
    }
  }
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location?.protocol || '')) {
    let polling = false;
    window.setInterval(async () => {
      if (polling || document.hidden) return;
      polling = true;
      try { const res = await fetch('/api/music/playlist', { cache: 'no-store' }); if (res.ok) { const data = await res.json(); refreshPlaylist(data.items); } } catch (_) { /* static hosting keeps the build-time playlist */ }
      finally { polling = false; }
    }, 8000);
  }

  /* ------------------------------------------------------------ graph */
  function noiseBuffer(type) {
    if (noiseBufs[type]) return noiseBufs[type];
    const len = ac.sampleRate * 5;
    const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let a = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { a = (a + 0.02 * w) / 1.02; d[i] = a * 3.5; }
      else if (type === 'pink') { b1 = 0.97 * b1 + 0.03 * w; b2 = 0.9 * b2 + 0.1 * w; d[i] = (b1 + b2 * 0.5) * 1.5; }
      else d[i] = w * 0.5;
    }
    // crossfade the loop seam
    const f = Math.floor(ac.sampleRate * 0.1);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k); }
    return (noiseBufs[type] = b);
  }
  function loopNoise(type) {
    const s = ac.createBufferSource(); s.buffer = noiseBuffer(type); s.loop = true; s.loopEnd = ac.sampleRate * 4.9 / ac.sampleRate * 1;
    s.loopStart = 0; s.start(0, Math.random() * 3);
    return s;
  }
  function chain(src, ...nodes) { let l = src; for (const n of nodes) { l.connect(n); l = n; } return l; }
  const filt = (type, f, q = 1) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
  function setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }
  function panner(pos, ref = 10, roll = 1.3, max = 900) {
    const p = ac.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
    setPos(p, pos.x, pos.y, pos.z);
    p.connect(sfx);
    return p;
  }
  function makeVerb() {
    const len = ac.sampleRate * 3.2, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const cv = ac.createConvolver(); cv.buffer = b;
    verbIn = gain(0.8);
    const vg = gain(0.55);
    chain(verbIn, filt('lowpass', 4200), cv, vg, out);
  }

  /* ------------------------------------------------------------ one-shot synthesis helpers */
  function osc(type, f0, f1, t0, dur, vol, dest, o = {}) {
    const os = ac.createOscillator(), g = ac.createGain();
    os.type = type;
    os.frequency.setValueAtTime(f0, t0);
    if (f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    if (o.vib) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.frequency); l.start(t0); l.stop(t0 + dur + 0.1);
    }
    const a = o.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    os.connect(g); g.connect(dest);
    os.start(t0); os.stop(t0 + dur + 0.05);
    return os;
  }
  function nz(t0, dur, vol, dest, o = {}) {
    const s = ac.createBufferSource(); s.buffer = noiseBuffer(o.type || 'white');
    const f = filt(o.ft || 'bandpass', o.f || 1000, o.q || 1);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chain(s, f, g); g.connect(dest);
    s.start(t0, Math.random() * 3, dur + 0.1);
  }
  /** play fn(dest, t0) from a position; the temporary panner is released afterwards */
  function at(pos, ref, life, fn, o = {}) {
    if (!ac || !st.sfxOn) return;
    const p = panner(pos, ref, o.roll ?? 1.3, o.max ?? 900);
    if (o.verb) { const s = gain(o.verb); p.connect(s); s.connect(verbIn); }
    fn(p, ac.currentTime + 0.02);
    setTimeout(() => { try { p.disconnect(); } catch (e) { /* */ } }, (life + 0.5) * 1000);
  }
  const flat = (life, fn, verb = 0) => {
    if (!ac) return;
    const g = gain(1); g.connect(sfx);
    if (verb) { const s = gain(verb); g.connect(s); s.connect(verbIn); }
    fn(g, ac.currentTime + 0.02);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, (life + 0.5) * 1000);
  };

  /* ------------------------------------------------------------ voices */
  const bp = (dest, f, q) => { const b = filt('bandpass', f, q); b.connect(dest); return b; };
  const lp = (dest, f, q = 0.7) => { const b = filt('lowpass', f, q); b.connect(dest); return b; };
  const voices = {
    monkey(d, t) {
      const f = bp(d, 1250, 2.2);
      if (rnd() < 0.3) { osc('sine', 520, 760, t, 0.55, 0.35, d, { vib: [6, 40], attack: 0.08 }); osc('sine', 740, 380, t + 0.5, 0.5, 0.3, d, { vib: [5, 30] }); return; }
      const n = 4 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) osc('sawtooth', rr(650, 900), rr(380, 520), t + i * 0.105, 0.085, 0.5, f);
    },
    boar(d, t, dist, p = 1) {
      const f = lp(d, 480 * p);
      for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
        const tt = t + i * 0.34;
        osc('sawtooth', 120 * p, 66 * p, tt, 0.26, 0.7, f);
        nz(tt, 0.2, 0.25, d, { f: 700 * p, q: 0.8 });
      }
    },
    tusker(d, t, dist) { voices.boar(d, t, dist, 0.72); },
    piglet(d, t) {
      const f = bp(d, 2200, 1.4);
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.2; osc('sawtooth', rr(1500, 2000), rr(900, 1200), tt, 0.14, 0.4, f, { vib: [30, 60] }); }
    },
    fruitbat(d, t, k = 0.5) {
      const f = bp(d, 4200, 1.6), n = 3 + Math.floor(rnd() * 5 * (0.5 + k));
      for (let i = 0; i < n; i++) { const tt = t + i * rr(0.05, 0.11); osc('sine', rr(4600, 6200), rr(2600, 3600), tt, 0.05, 0.18 * (0.4 + k), f); }
      if (k > 0.6) { const f2 = bp(d, 1900, 1.3); for (let i = 0; i < 2; i++) osc('sawtooth', rr(1700, 2200), rr(900, 1200), t + i * 0.16, 0.14, 0.25, f2); }
    },
    rat(d, t) { const f = bp(d, 3400, 3); const n = 2 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) osc('sine', rr(3000, 3900), rr(2600, 3300), t + i * 0.09, 0.05, 0.16, f); },
    owl(d, t) {                                                        // the barn owl's long, harsh screech
      const f = bp(d, 2300, 1.1), g = bp(d, 3300, 1.4);
      nz(t, 1.15, 0.45, d, { f: 2600, f1: 1900, q: 0.8, attack: 0.06 });
      osc('sawtooth', 1900, 1250, t, 1.1, 0.34, f, { vib: [38, 60], attack: 0.08 }); osc('sawtooth', 3200, 2300, t + 0.02, 1.0, 0.16, g, { vib: [44, 90], attack: 0.1 });
    },
    boa(d, t) { nz(t, 1.5, 0.4, d, { ft: 'highpass', f: 2600, attack: 0.15 }); nz(t + 0.1, 1.2, 0.2, d, { f: 5200, q: 0.8, attack: 0.2 }); },
    flamingo(d, t) {
      const f = bp(d, 900, 1.6);
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) { osc('sawtooth', 400, 340, t + i * 0.2, 0.17, 0.55, f); osc('square', 205, 170, t + i * 0.2, 0.17, 0.15, f); }
    },
    gull(d, t) {
      const f = bp(d, 2300, 1.4);
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.62; osc('sawtooth', 1900, 1500, tt, 0.17, 0.35, f, { vib: [30, 40] }); osc('sawtooth', 1450, 880, tt + 0.18, 0.34, 0.35, f, { vib: [26, 60] }); }
    },
    macaw(d, t) {
      const f = bp(d, 1750, 1.0);
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.45;
        osc('sawtooth', 1050, 1750, tt, 0.12, 0.55, f); osc('sawtooth', 1800, 900, tt + 0.12, 0.26, 0.55, f);
        nz(tt, 0.3, 0.2, d, { f: 2200, q: 1.5 });
      }
    },
    lorikeet(d, t) {
      const f = bp(d, 3300, 1.6), n = 4 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.085; osc('sawtooth', rr(3200, 3800), rr(2300, 2800), tt, 0.06, 0.4, f); }
    },
    tern(d, t) {
      const f = bp(d, 4300, 2.2), n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) { const tt = t + i * 0.2; osc('sine', 4600, 3500, tt, 0.13, 0.32, f, { vib: [40, 80] }); }
    },
    eagle(d, t) { const f = bp(d, 3000, 3); osc('sine', 2700, 3500, t, 0.3, 0.45, f, { vib: [14, 60] }); osc('sine', 3500, 2300, t + 0.3, 0.55, 0.45, f, { vib: [12, 70] }); },
    dolphin(d, t, under) {
      osc('sine', 4600, 9000, t, 0.32, 0.4, d); osc('sine', 9000, 6000, t + 0.32, 0.25, 0.35, d);
      for (let i = 0; i < 9; i++) nz(t + 0.7 + i * 0.045, 0.02, 0.5, d, { ft: 'highpass', f: 4500 });
    },
    whale(d, t) {
      const notes = [[95, 190, 3.2], [190, 130, 2.6], [150, 260, 3.0], [260, 110, 3.6]];
      let tt = t;
      for (const [a, b, dur] of notes) {
        osc('sine', a, b, tt, dur, 0.5, d, { vib: [3.5, 4], attack: 0.9 });
        osc('sine', a * 2, b * 2, tt, dur, 0.18, d, { vib: [4, 6], attack: 0.9 });
        tt += dur * 0.85;
      }
    },
    crab(d, t) { nz(t, 0.018, 0.5, d, { ft: 'highpass', f: 3500 }); nz(t + 0.07, 0.018, 0.5, d, { ft: 'highpass', f: 3000 }); },
    owl(d, t) { const f = lp(d, 900); osc('sine', 450, 400, t, 0.36, 0.5, f, { attack: 0.06 }); osc('sine', 340, 300, t + 0.55, 0.65, 0.5, f, { attack: 0.06 }); },
    frog(d, t) { const f = bp(d, 520, 3); const n = 3 + Math.floor(rnd() * 4); for (let i = 0; i < n; i++) { osc('sawtooth', 240, 180, t + i * 0.13, 0.1, 0.5, f); } },
    bat(d, t) { osc('sine', 7600, 3800, t, 0.05, 0.12, d); osc('sine', 7000, 3600, t + 0.12, 0.05, 0.1, d); },
    blub(d, t) { osc('sine', rr(180, 320), rr(420, 700), t, 0.12, 0.4, d); },
    bell(d, t) { const f = pick([880, 987.8, 1174.7, 1318.5, 1568, 1760]); osc('sine', f, null, t, 2.4, 0.22, d, { attack: 0.005 }); osc('sine', f * 2.01, null, t, 1.2, 0.07, d, { attack: 0.005 }); },
    splash(d, t, s) {
      if (s < 0.3) { osc('sine', rr(800, 1300), rr(380, 560), t, 0.08, 0.14, d); nz(t, 0.05, 0.12, d, { ft: 'highpass', f: 3200 }); return; }       // a float, a drip: a small plip
      nz(t, 0.3 + 0.35 * s, 0.4 * Math.min(1.3, 0.5 + s * 0.5), d, { f: 2400, f1: 500, q: 0.7 }); osc('sine', 320, 110, t, 0.16, 0.25 * Math.min(1, s), d);
      if (s > 1.4) { osc('sine', 95, 38, t, 0.55, 0.3 * Math.min(1.4, s * 0.5), d); nz(t + 0.05, 0.9, 0.3, d, { ft: 'lowpass', f: 700 }); }        // a body falling in: a deep thump and a wash
    },
    thud(d, t, v) { osc('sine', 150, 45, t, 0.22, 0.9 * (0.4 + v), d); nz(t, 0.12, 0.35 * (0.4 + v), d, { ft: 'lowpass', f: 500 }); },
    bomb(d, t, s) { osc('sine', 110, 32, t, 0.5, 0.9, d); nz(t, 0.5, 0.5, d, { ft: 'lowpass', f: 700, f1: 120 }); for (let i = 0; i < 5; i++) nz(t + 0.05 + i * rr(0.05, 0.12), 0.05, 0.3, d, { ft: 'highpass', f: 2500 }); },
    hiss(d, t) { nz(t, 1.1, 0.45, d, { ft: 'highpass', f: 3500, attack: 0.04 }); },
    spout(d, t) { nz(t, 1.0, 0.7, d, { f: 1300, q: 0.7, attack: 0.05 }); nz(t, 0.6, 0.35, d, { ft: 'highpass', f: 3500, attack: 0.03 }); },
    crackle(d, t) { nz(t, rr(0.008, 0.03), rr(0.25, 0.7), d, { ft: 'highpass', f: rr(1500, 4500) }); },
  };


  /* species schedule: voice, interval, audible range, reverb */
  const SPECIES = {
    'Capuchin monkey': { v: 'monkey', iv: [5, 13], range: 75, ref: 6 },
    'Wild boar': { v: 'boar', iv: [8, 20], range: 55, ref: 6 },
    'Silver tusker': { v: 'tusker', iv: [12, 28], range: 65, ref: 7 },
    'Ginger boar': { v: 'boar', iv: [9, 22], range: 50, ref: 6 },
    'Spotted pig': { v: 'boar', iv: [8, 20], range: 50, ref: 6 },
    'Boar piglet': { v: 'piglet', iv: [6, 16], range: 30, ref: 4 },
    'Island rat': { v: 'rat', iv: [10, 24], range: 18, ref: 2, night: true },
    'Barn owl': { v: 'owl', iv: [14, 34], range: 150, ref: 14, night: true },
    'Pacific boa': { v: 'boa', iv: [30, 70], range: 12, ref: 2 },
    'Greater flamingo': { v: 'flamingo', iv: [5, 14], range: 100, ref: 8 },
    'Silver gull': { v: 'gull', iv: [3, 9], range: 170, ref: 12 },
    'Rainbow lorikeet': { v: 'lorikeet', iv: [3, 9], range: 150, ref: 8 },
    'White tern': { v: 'tern', iv: [4, 10], range: 130, ref: 8 },
    'Sea eagle': { v: 'eagle', iv: [14, 30], range: 260, ref: 20 },
    'Bottlenose dolphin': { v: 'dolphin', iv: [7, 18], range: 260, ref: 14, marine: true },
    'Humpback whale': { v: 'whale', iv: [26, 50], range: 750, ref: 60, marine: true, verb: 0.9 },
    'Red beach crab': { v: 'crab', iv: [3, 9], range: 20, ref: 3 },
  };
  const bySpecies = {};
  const nextAt = {};
  function indexCreatures() {
    for (const c of creatures) if (SPECIES[c.name]) (bySpecies[c.name] = bySpecies[c.name] || []).push(c);
  }
  let tmpVec = null;
  function creatureTick(now, under) {
    if (!tmpVec) tmpVec = new (camera.position.constructor)();
    for (const name in SPECIES) {
      const sp = SPECIES[name];
      if (!nextAt[name]) nextAt[name] = now + rr(1, sp.iv[1]);
      if (now < nextAt[name]) continue;
      const arr = bySpecies[name];
      if (!arr) continue;
      // candidates in range
      let cand = null, n = 0;
      for (const c of arr) {
        c.group.getWorldPosition(tmpVec);
        const d = camera.position.distanceTo(tmpVec);
        if (d < sp.range && ++n && rnd() < 1 / n) cand = { x: tmpVec.x, y: tmpVec.y, z: tmpVec.z, d };
      }
      nextAt[name] = now + rr(sp.iv[0], sp.iv[1]) * (cand ? 1 : 0.5);
      if (!cand) continue;
      if (under > 0.5 && !sp.marine) continue;
      if (sp.night && env.night < 0.45) continue;                 // the nocturnal ones are silent by day
      at(cand, sp.ref, 6, (dst, t) => voices[sp.v](dst, t, cand.d), { verb: sp.verb || 0, max: sp.range * 1.6 });
    }
  }

  /* ------------------------------------------------------------ continuous layers */
  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    out = gain(0); sfx = gain(st.sfxOn ? st.sfx : 0);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    uw = filt('lowpass', 20000, 0.5);
    sfx.connect(out); out.connect(comp); comp.connect(uw); uw.connect(ac.destination);
    makeVerb();

    // surf + wind + cicadas + crickets + underwater hum (non-positional)
    N.surf = gain(0.2); chain(loopNoise('brown'), filt('lowpass', 700), N.surf); N.surf.connect(sfx);
    N.rain = gain(0); chain(loopNoise('white'), filt('bandpass', 4300, 0.55), N.rain); N.rain.connect(sfx);
    N.rain2 = gain(0); chain(loopNoise('pink'), filt('lowpass', 1100), N.rain2); N.rain2.connect(sfx);
    N.rust = gain(0); chain(loopNoise('white'), filt('bandpass', 2100, 0.8), N.rust); N.rust.connect(sfx);
    N.wind = gain(0.05); N.windF = filt('bandpass', 420, 0.7); chain(loopNoise('pink'), N.windF, N.wind); N.wind.connect(sfx);
    N.cic = gain(0); const cicAM = gain(0.5); const cicO = ac.createOscillator(); cicO.frequency.value = 26; const cicG = gain(0.5); cicO.connect(cicG); cicG.connect(cicAM.gain);
    chain(loopNoise('white'), filt('bandpass', 5600, 5), cicAM, N.cic); N.cic.connect(sfx); cicO.start();
    N.cr = gain(0); const co = ac.createOscillator(); co.frequency.value = 4400; const to = ac.createOscillator(); to.frequency.value = 38; const tg = gain(0.5); to.connect(tg);
    const am = gain(0.5); tg.connect(am.gain); co.connect(am); am.connect(N.cr); N.cr.connect(sfx); co.start(); to.start();
    N.uw = gain(0); chain(loopNoise('brown'), filt('lowpass', 260), N.uw); N.uw.connect(sfx);

    // positional beds
    const bed = (type, f, q, pos, ref, g, roll = 1.3) => { const v = gain(g); chain(loopNoise(type), filt('bandpass', f, q), v); v.connect(panner(pos, ref, roll)); return v; };
    N.fall = bed('white', 1700, 0.35, { x: falls.landing.x, y: falls.pool.y + 2, z: falls.landing.z }, 11, 1.2);
    chain(loopNoise('brown'), filt('lowpass', 260), gain(1.4)).connect(panner({ x: falls.landing.x, y: falls.pool.y + 2, z: falls.landing.z }, 12, 1.2));
    N.casc = bed('white', 1500, 0.4, { x: falls.cascade.x, y: falls.cascade.y, z: falls.cascade.z }, 14, 0.7);
    bed('white', 2400, 0.5, { x: falls.cascade.end.x, y: 1, z: falls.cascade.end.z }, 10, 0.6);
    const rb = river.B.pts;
    [0.12, 0.4, 0.7, 0.95].forEach((q) => { const p = rb[Math.floor(rb.length * q)]; bed('pink', 900, 0.7, { x: p.x, y: getHeight(p.x, p.z) + 1, z: p.z }, 5, 0.35, 1.6); });
    N.rum = gain(0.2); chain(loopNoise('brown'), filt('lowpass', 130), N.rum); N.rum.connect(panner({ x: VOL.x, y: VOL.lavaY + 10, z: VOL.z }, 70, 0.9));
    N.lava = gain(0.15); chain(loopNoise('white'), filt('bandpass', 3200, 0.7), N.lava); N.lava.connect(panner({ x: VOL.x + 80, y: 4, z: VOL.z + 28 }, 22, 1.4));
    // grotto hum + temple drone
    const hum = (f, type, g, pos, ref, lpF, verb) => {
      const v = gain(g), pn = panner(pos, ref, 1.6);
      [f, f * 1.003].forEach((ff) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = ff; o.connect(lp(v, lpF)); o.start(); });
      v.connect(pn); const s = gain(verb); pn.connect(s); s.connect(verbIn);
      const lfo = ac.createOscillator(), lg = gain(g * 0.4); lfo.frequency.value = 0.19; lfo.connect(lg); lg.connect(v.gain); lfo.start();
      return v;
    };
    N.grot = hum(220, 'sine', 0.07, falls.grotto, 7, 1500, 0.6); hum(329.6, 'sine', 0.04, falls.grotto, 7, 1500, 0.6);
    N.temp = hum(55, 'sawtooth', 0.06, { x: TEMPLE.x, y: TEMPLE.y + 5, z: TEMPLE.z }, 14, 160, 0.3); hum(82.4, 'sawtooth', 0.03, { x: TEMPLE.x, y: TEMPLE.y + 5, z: TEMPLE.z }, 14, 140, 0.3);

    indexCreatures();
    applySettings();
  }

  /* ------------------------------------------------------------ event sounds */
  events.on('splash', (x, y, z, s) => { if (ac && started) at(V3(x, y, z), 6, 1, (d, t) => voices.splash(d, t, s), { max: 400 }); });
  events.on('thud', (x, y, z, v) => { if (ac && started) at(V3(x, y, z), 4, 1, (d, t) => voices.thud(d, t, v), { max: 200 }); });
  events.on('bomb', (x, y, z, s) => { if (ac && started) at(V3(x, y, z), 20, 1.5, (d, t) => voices.bomb(d, t, s), { max: 700 }); });
  events.on('hiss', (x, y, z) => { if (ac && started) at(V3(x, y, z), 14, 2, (d, t) => voices.hiss(d, t), { max: 500 }); });
  events.on('spout', (x, y, z) => { if (ac && started) at(V3(x, y, z), 40, 2, (d, t) => voices.spout(d, t), { max: 900, verb: 0.3 }); });
  events.on('eruptWarn', () => { if (ac && started) flat(4, (d, t) => { osc('sine', 38, 26, t, 3.5, 0.5, d, { attack: 1.2 }); nz(t, 3.5, 0.35, d, { ft: 'lowpass', f: 160, attack: 1.5 }); }); });
  events.on('eruptBlast', () => {
    if (!ac || !started) return;
    const pos = V3(VOL.x, VOL.lavaY + 10, VOL.z);
    at(pos, 120, 5, (d, t) => { osc('sine', 80, 20, t, 3.0, 1.0, d, { attack: 0.02 }); nz(t, 3.5, 0.9, d, { ft: 'lowpass', f: 900, f1: 90, attack: 0.02 }); nz(t + 0.1, 1.5, 0.5, d, { ft: 'highpass', f: 1800 }); }, { max: 2000, verb: 0.5 });
  });

  events.on('thunder', (dist, k) => {
    if (!ac || !started) return;
    setTimeout(() => {
      if (!ac || !st.sfxOn) return;
      flat(6, (d, t) => {
        nz(t, 4.5, 0.9 * k, d, { type: 'brown', ft: 'lowpass', f: 420, f1: 70, attack: 0.05 });
        nz(t + 0.2, 3, 0.5 * k, d, { type: 'pink', ft: 'lowpass', f: 900, f1: 110, attack: 0.3 });
        osc('sine', 60, 28, t, 3.2, 0.7 * k, d, { attack: 0.1 });
      }, 0.9);
    }, Math.min(5000, dist * 5));
  });

  /* ------------------------------------------------------------ footsteps */
  const STEP = {
    sand: (d, t, k) => { nz(t, 0.14, 0.22 * k, d, { ft: 'lowpass', f: rr(700, 1000) }); nz(t, 0.07, 0.07 * k, d, { ft: 'highpass', f: 2500 }); },
    grass: (d, t, k) => { nz(t, 0.11, 0.1 * k, d, { f: rr(2200, 3200), q: 0.6 }); nz(t, 0.07, 0.16 * k, d, { ft: 'lowpass', f: rr(300, 450) }); },
    rock: (d, t, k) => { nz(t, 0.05, 0.28 * k, d, { ft: 'highpass', f: rr(1500, 2500) }); osc('sine', rr(160, 220), 90, t, 0.05, 0.14 * k, d); },
    stone: (d, t, k) => { nz(t, 0.04, 0.22 * k, d, { ft: 'highpass', f: rr(1600, 2200) }); osc('sine', rr(130, 160), 65, t, 0.08, 0.28 * k, d); },
    wood: (d, t, k) => { osc('sine', rr(200, 260), 120, t, 0.1, 0.4 * k, d); nz(t, 0.06, 0.2 * k, d, { f: 900, q: 1.2 }); },
    water: (d, t, k) => { nz(t, 0.26, 0.22 * k, d, { f: rr(1500, 2100), f1: 600, q: 0.8 }); },
  };
  events.on('step', (surf, run) => { if (ac && started) flat(0.5, (d, t) => (STEP[surf] || STEP.grass)(d, t, run ? 1.4 : 1)); });
  events.on('jump', (surf) => { if (ac && started) flat(0.3, (d, t) => nz(t, 0.1, 0.14, d, { ft: 'lowpass', f: 700 })); });
  events.on('land', (v, surf) => { if (ac && started) flat(0.5, (d, t) => { (STEP[surf] || STEP.grass)(d, t, 1.8); voices.thud(d, t, v * 0.6); }); });
  events.on('swim', (run) => { if (ac && started) flat(0.8, (d, t) => nz(t, 0.6, run ? 0.32 : 0.22, d, { f: 1200, f1: 450, q: 0.7, attack: 0.12 })); });

  /* ------------------------------------------------------------ effects for finds, camp work and the rest */
  const SV = {
    pickup(d, t) { osc('triangle', 620, 980, t, 0.09, 0.22, d); osc('sine', 1240, 1500, t + 0.05, 0.08, 0.1, d); nz(t, 0.05, 0.12, d, { ft: 'highpass', f: 3000 }); },
    thud(d, t) { voices.thud(d, t, 0.6); },
    chop(d, t) { nz(t, 0.08, 0.5, d, { ft: 'lowpass', f: 900 }); osc('sine', 180, 70, t, 0.12, 0.5, d); nz(t + 0.01, 0.05, 0.25, d, { ft: 'highpass', f: 2500 }); },
    tap(d, t) { nz(t, 0.03, 0.4, d, { f: 1800, q: 2 }); osc('square', 320, 200, t, 0.04, 0.08, d); },
    craft(d, t) { [523, 659, 784].forEach((f, i) => osc('triangle', f, null, t + i * 0.07, 0.3, 0.18, d, { attack: 0.01 })); nz(t, 0.05, 0.3, d, { f: 2000 }); },
    eat(d, t) { for (let i = 0; i < 4; i++) nz(t + i * 0.17, 0.09, 0.32, d, { ft: 'lowpass', f: 600 + 200 * i }); },
    drink(d, t) { for (let i = 0; i < 3; i++) { osc('sine', 300 + i * 60, 160, t + i * 0.22, 0.14, 0.28, d); nz(t + i * 0.22, 0.12, 0.12, d, { f: 1200, q: 1 }); } },
    level(d, t) { [523, 659, 784, 1047, 1319].forEach((f, i) => osc('triangle', f, null, t + i * 0.09, 0.55, 0.2, d, { attack: 0.01 })); },
    quest(d, t) { [784, 988, 1175].forEach((f, i) => osc('triangle', f, null, t + i * 0.1, 0.45, 0.18, d, { attack: 0.01 })); },
    hurt(d, t) { osc('sawtooth', 220, 90, t, 0.25, 0.4, d); nz(t, 0.12, 0.3, d, { ft: 'lowpass', f: 500 }); },
    break(d, t) { nz(t, 0.22, 0.5, d, { ft: 'highpass', f: 1500 }); osc('square', 200, 60, t, 0.2, 0.25, d); },
    open(d, t) { osc('triangle', 440, 660, t, 0.08, 0.15, d); },
    nope(d, t) { osc('square', 180, 140, t, 0.12, 0.14, d); },
    bite(d, t) { osc('sine', 900, 1500, t, 0.12, 0.3, d); osc('sine', 1500, 900, t + 0.12, 0.12, 0.25, d); },
    catch(d, t) { voices.splash(d, t, 0.8); [659, 880, 1175].forEach((f, i) => osc('triangle', f, null, t + 0.1 + i * 0.09, 0.4, 0.16, d, { attack: 0.01 })); },
    fire(d, t) { nz(t, 0.5, 0.4, d, { f: 900, f1: 2500, q: 0.6, attack: 0.06 }); },
    growl(d, t) { voices.boar(d, t); osc('sawtooth', 90, 55, t, 0.5, 0.5, d); },
    sizzle(d, t) { nz(t, 1.2, 0.3, d, { ft: 'highpass', f: 3500, attack: 0.1 }); },
  };
  events.on('sfx', (name) => { if (ac && started && st.sfxOn) flat(1.4, (d, t) => (SV[name] || SV.tap)(d, t)); });
  /* ------------------------------------------------------------ the castaway's voice: a whistled tune, a sung tune, a laugh, a shout */
  const PENTA = [0, 2, 4, 7, 9, 12, 14];
  const VOWELS = [[700, 1100], [520, 1700], [330, 2300], [450, 850]];      // ah, eh, ee, oh
  const tune = (n, lo, hi) => { let k = 2 + Math.floor(rnd() * 3); const out = []; for (let i = 0; i < n; i++) { k = clamp(k + pick([-2, -1, -1, 0, 1, 1, 2]), lo, hi); out.push(PENTA[k]); } return out; };
  const VOICE = {
    whistle(d, t, dur) {                                       // a pure, breathy, gliding whistle
      const base = rr(880, 1100), notes = tune(Math.max(4, Math.round(dur * 2.4)), 0, 6);
      let tt = t, prev = base * Math.pow(2, notes[0] / 12);
      for (const n of notes) {
        const f = base * Math.pow(2, n / 12), len = rr(0.14, 0.34);
        osc('sine', prev, f, tt, len, 0.26, d, { vib: [6.5, f * 0.012], attack: 0.03 });
        osc('sine', f * 2, f * 2, tt + 0.02, len * 0.8, 0.03, d, { attack: 0.03 });
        nz(tt, len, 0.025, d, { f, q: 9, attack: 0.03 });
        prev = f; tt += len + (rnd() < 0.25 ? rr(0.12, 0.3) : 0.02);
        if (tt - t > dur) break;
      }
    },
    sing(d, t, dur) {                                          // a warm baritone line: sawtooth through vowel formants
      const base = rr(104, 132), notes = tune(Math.max(4, Math.round(dur * 1.5)), 0, 6);
      let tt = t;
      for (const n of notes) {
        const f = base * Math.pow(2, n / 12), len = rr(0.3, 0.8), [f1, f2] = pick(VOWELS);
        const a = bp(d, f1, 5), b = bp(d, f2, 7);
        osc('sawtooth', f, f * 1.004, tt, len, 0.5, a, { vib: [5.5, f * 0.018], attack: 0.07 });
        osc('sawtooth', f, f * 1.004, tt, len, 0.28, b, { vib: [5.5, f * 0.018], attack: 0.07 });
        nz(tt, len * 0.5, 0.03, d, { f: 3500, q: 1.5, attack: 0.06 });
        tt += len * rr(0.9, 1.05) + (rnd() < 0.2 ? rr(0.15, 0.4) : 0);
        if (tt - t > dur) break;
      }
    },
    laugh(d, t, dur) {                                         // ha-ha-ha, falling in pitch and fading
      const n = 4 + Math.floor(dur * 2), f0 = rr(210, 270);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.17, f = f0 * (1 - i * 0.04), k = bp(d, 850, 3);
        osc('sawtooth', f * 1.1, f * 0.9, tt, 0.12, 0.7 * (1 - i / (n + 1)), k, { attack: 0.015 });
        nz(tt, 0.08, 0.05, d, { f: 2400, q: 1.2 });
      }
    },
    shout(d, t) {                                              // a short, sharp cry of alarm
      const k = bp(d, 800, 2.5);
      osc('sawtooth', 190, 330, t, 0.45, 0.9, k, { vib: [9, 14], attack: 0.03 });
      osc('sawtooth', 190, 330, t, 0.45, 0.45, bp(d, 1500, 3), { attack: 0.03 });
    },
  };
  events.on('voice', (kind, x, y, z, dur) => { if (ac && started && VOICE[kind]) at(V3(x, y, z), 3, (dur || 2) + 1, (d, t) => VOICE[kind](d, t, dur || 2), { max: 120, verb: 0.2 }); });
  events.on('owl', (x, y, z) => { if (ac && started) at(V3(x, y, z), 14, 2, (d, t) => voices.owl(d, t), { max: 260, verb: 0.4 }); });
  events.on('batcall', (x, y, z, k) => { if (ac && started) at(V3(x, y, z), 3, 1, (d, t) => voices.fruitbat(d, t, k), { max: 70 }); });
  events.on('crackle', (x, y, z) => { if (ac && started) at(V3(x, y, z), 3, 0.3, (d, t) => voices.crackle(d, t)); });

  /* ------------------------------------------------------------ per-frame */
  let tick = 0, wave = 4, crack = 0, blubT = 0, owlT = 5, frogT = 3, batT = 8, bellT = 4, grotBell = 3;
  const L = () => ac.listener;
  const fwd = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 };
  let _q = null;
  updaters.push((dt, tm) => {
    // music always updates (it lives outside the graph)
    if (mEl) {
      const under = U.under.value;
      const target = st.musicOn && started ? st.music * st.master * (1 - under * 0.45) : 0;
      mVol += (target - mVol) * Math.min(1, dt * 1.2);
      mEl.volume = clamp(mVol, 0, 1);
    }
    if (!ac || !started) return;
    const now = ac.currentTime;
    const p = camera.position;
    const h = getHeight(p.x, p.z);
    const under = U.under.value;
    // listener
    const l = L();
    if (!_q) _q = camera.quaternion.clone();
    const e = camera.matrixWorld.elements;
    const fx_ = -e[8], fy_ = -e[9], fz_ = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = fx_; l.forwardY.value = fy_; l.forwardZ.value = fz_; l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(fx_, fy_, fz_, ux, uy, uz); }

    uw.frequency.setTargetAtTime(lerp(20000, 420, under), now, 0.08);
    const day = env.day + env.dusk * 0.4, night = env.night;
    const coast = clamp(1 - h / 45, 0.12, 1) * (p.y < 60 ? 1 : 0.5);
    N.surf.gain.setTargetAtTime((0.1 + 0.28 * coast) * (1 + 0.3 * Math.sin(tm * 0.35)) * (1 - under * 0.6), now, 0.3);
    N.wind.gain.setTargetAtTime((0.02 + 0.07 * clamp(p.y / 130, 0, 1) + 0.13 * wx.speed) * (1 - under), now, 0.3);
    const inCave = falls.grotto && Math.hypot(p.x - falls.grotto.x, p.y - falls.grotto.y, p.z - falls.grotto.z) < 9;
    const rv = wx.rain * (1 - under) * (inCave ? 0.15 : 1);
    N.rain.gain.setTargetAtTime(0.16 * rv, now, 0.4); N.rain2.gain.setTargetAtTime(0.32 * rv, now, 0.4);
    N.rust.gain.setTargetAtTime(0.05 * clamp(wx.speed - 0.35, 0, 1.5) * clamp((h - 2) / 6, 0, 1) * (1 - under), now, 0.4);
    N.windF.frequency.setTargetAtTime(260 + 260 * wx.speed + 120 * Math.sin(tm * 0.13) + p.y * 1.5, now, 0.3);
    const jungle = clamp((h - 2.5) / 6, 0, 1) * clamp(1 - Math.abs(p.y - h) / 80, 0.2, 1);
    N.cic.gain.setTargetAtTime(0.02 * env.day * jungle * (1 - under), now, 0.5);
    N.cr.gain.setTargetAtTime(0.011 * night * clamp(h / 3, 0, 1) * (1 - under), now, 0.5);
    N.uw.gain.setTargetAtTime(0.5 * under, now, 0.2);
    N.rum.gain.setTargetAtTime(0.25 + 1.1 * volcano.intensity, now, 0.4);
    N.lava.gain.setTargetAtTime(0.12 + 0.2 * volcano.intensity, now, 0.4);
    N.fall.gain.setTargetAtTime(1.2 * (1 - under * 0.4), now, 0.3);

    // surf swells
    wave -= dt;
    if (wave < 0) {
      wave = rr(5, 9);
      const v = 0.18 * coast * (1 - under);
      if (v > 0.01) flat(5, (d, t) => nz(t, 4.5, v, d, { type: 'pink', ft: 'lowpass', f: 380, f1: 1500, q: 0.6, attack: 1.8 }));
    }
    // nature scheduled bits
    tick -= dt;
    if (tick < 0 && st.sfxOn) {
      tick = 0.3;
      creatureTick(now, under);
    }
    if (st.sfxOn) {
      // campfire + torches + lava crackle
      const near = (pos, r) => Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z) < r;
      crack -= dt;
      if (crack < 0) {
        crack = rr(0.04, 0.2);
        if (falls.camp && near(falls.camp, 45)) at(falls.camp, 3, 0.3, (d, t) => voices.crackle(d, t));
        const tp = { x: TEMPLE.x, y: TEMPLE.y + 2, z: TEMPLE.z + 12 };
        if (near(tp, 40) && rnd() < 0.5) at(tp, 4, 0.3, (d, t) => voices.crackle(d, t));
        const lv = { x: VOL.x + 40, y: 30, z: VOL.z + 15 };
        if (near(lv, 120) && rnd() < 0.5 * (0.3 + volcano.intensity)) at({ x: lv.x + rr(-30, 30), y: lv.y, z: lv.z + rr(-30, 30) }, 12, 0.3, (d, t) => voices.crackle(d, t));
      }
      blubT -= dt;
      if (blubT < 0) {
        blubT = rr(0.25, 0.9);
        const sp = { x: SPRING.x + rr(-3, 3), y: SPRING.y, z: SPRING.z + rr(-3, 3) };
        if (near(sp, 45)) at(sp, 3, 0.4, (d, t) => voices.blub(d, t));
        if (under > 0.5) flat(0.4, (d, t) => voices.blub(d, t));
      }
      // night life
      owlT -= dt; frogT -= dt; batT -= dt; bellT -= dt;
      const aroundCam = (r0, r1, yy) => { const a = rnd() * 6.283, r = rr(r0, r1); return { x: p.x + Math.cos(a) * r, y: yy ?? getHeight(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) + 4, z: p.z + Math.sin(a) * r }; };
      if (owlT < 0) { owlT = rr(9, 22); if (night > 0.5 && h > 3 && under < 0.5) at(aroundCam(40, 110), 12, 2, (d, t) => voices.owl(d, t), { max: 300, verb: 0.3 }); }
      if (frogT < 0) { frogT = rr(1.2, 4); if (night > 0.4 && h > 0.5 && riverDist(p.x, p.z) < 60 && under < 0.5) at(aroundCam(8, 40, h + 0.3), 6, 1.5, (d, t) => voices.frog(d, t)); }
      if (batT < 0) { batT = rr(2, 6); if (night + env.dusk * 0.4 > 0.45 && h > 3 && under < 0.5) at(aroundCam(15, 50, h + 20), 6, 0.5, (d, t) => voices.bat(d, t)); }
      // glimmer ring chimes + grotto bells
      if (bellT < 0) {
        bellT = rr(1.4, 4);
        const fp = { x: FAIRY.x + rr(-5, 5), y: FAIRY.y + rr(1, 3), z: FAIRY.z + rr(-5, 5) };
        if (near(fp, 50) && night + env.dusk * 0.5 > 0.3) at(fp, 6, 3, (d, t) => voices.bell(d, t), { verb: 0.9 });
        const gp = { x: falls.grotto.x + rr(-3, 3), y: falls.grotto.y + 1, z: falls.grotto.z + rr(-3, 3) };
        if (near(gp, 30) && rnd() < 0.6) at(gp, 5, 3, (d, t) => voices.bell(d, t), { verb: 1.0 });
      }
    }
  });

  /* ------------------------------------------------------------ public api */
  function applySettings() {
    if (!ac) return;
    out.gain.setTargetAtTime(st.master, ac.currentTime, 0.1);
    sfx.gain.setTargetAtTime(st.sfxOn ? st.sfx : 0, ac.currentTime, 0.1);
  }
  return {
    st,
    get hasMusic() { return rotation.available().length > 0; },
    get playlist() { return rotation.library(); },
    unlock() {
      // the browser holds audio until a gesture: resume the context and the music on the first touch
      if (ac && ac.state !== 'running') ac.resume();
      if (mEl && st.musicOn) mEl.play().catch(() => {});
    },
    start() {
      if (started) return;
      if (!ac) init();
      started = true;
      ac.resume();
      applySettings();
      playTrack(rotation.next());
    },
    set(k, v) { st[k] = v; save(); applySettings(); },
    next() { playTrack(rotation.next()); },
    prev() { playTrack(rotation.previous()); },
    setFirst(id) { rotation.setFirst(id); saveMusic(); if (playlistCb) playlistCb(rotation.library()); },
    removeTrack(id) {
      const current = rotation.current()?.id;
      if (!rotation.remove(id)) return;
      saveMusic();
      if (current === String(id)) playTrack(rotation.next());
      else if (playlistCb) playlistCb(rotation.library());
    },
    restoreTrack(id) { if (rotation.restore(id)) { saveMusic(); if (playlistCb) playlistCb(rotation.library()); } },
    restoreTracks() { rotation.restoreAll(); saveMusic(); if (playlistCb) playlistCb(rotation.library()); },
    title: () => rotation.current()?.title || '',
    onTrack(cb) { trackCb = cb; if (rotation.current()) cb(rotation.current().title); },
    onPlaylist(cb) { playlistCb = cb; cb(rotation.library()); },
    chime() {
      if (!ac || !started || !st.sfxOn) return;
      flat(2.5, (d, t) => [659, 880, 1175, 1568, 2093].forEach((f, i) => osc('triangle', f, null, t + i * 0.1, 1.4, 0.16, d, { attack: 0.01 })), 0.8);
    },
    click() {
      if (!ac || !started || !st.sfxOn) return;
      flat(0.2, (d, t) => osc('triangle', 1100, 700, t, 0.06, 0.1, d));
    },
  };
}
