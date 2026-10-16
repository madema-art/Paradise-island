import * as THREE from 'three';
import { camera, env, creatures, bloom, renderer, sun, updaters, setQuality, tideLabel, moonLabel } from './core.js';
import { isTyping } from './typing.js';
import { cam, goPreset, setTour, setSpin, setFov, followCreature, release, flyTo } from './camera.js';
import * as control from './control.js';
import { initCollection } from './collection_ui.js';
import { clamp } from './util.js';
import { wx, setWeather } from './weather.js';
import { SpecimenViewer } from './specimen.js';
import { speciesInfo, STATUS, liveFacts } from './species.js';
import { getHeight } from './world.js';
import { initNotebook, onFollowed } from './notebook.js';
import * as menu from './menu.js';
import { onDevice } from './input_device.js';
import { focusMeta } from './creature_cycle.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export function initUI({ presets, secrets, volcano, audio, labels }) {
  $$('#wxSeg button').forEach((b) => b.addEventListener('click', () => {
    setWeather(b.dataset.w === 'auto' ? null : b.dataset.w);
    $$('#wxSeg button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  let wxT = 0, wxLast = '';
  updaters.push((dt) => {
    wxT -= dt;
    if (wxT > 0) return;
    wxT = 0.5;
    const text = `${wx.label}<br>${wx.windLabel}<br>${tideLabel()} · ${moonLabel()}`;
    if (text !== wxLast) { wxLast = text; $('#wxline').innerHTML = text; }
  });

  /* ---------- dock ---------- */
  const dock = $('#dock');
  presets.forEach((p, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<b>${i < 9 ? i + 1 : i === 9 ? 0 : ''}</b><span>${p.name}</span>`;   // keys 1-9 and 0 for the first ten presets; the rest are clicked or cycled
    b.addEventListener('click', () => goPreset(i));
    dock.appendChild(b);
  });

  /* ---------- menu sections and the journal's subtabs ---------- */
  $$('#menuTabs button').forEach((b) => b.addEventListener('click', () => menu.openMenu(b.dataset.s)));
  const showJournal = (t) => {
    $$('#p-journal .subtabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === t));
    $$('#p-journal .subpane').forEach((p) => p.classList.toggle('on', p.id === 'p-' + t));
  };
  $$('#p-journal .subtabs button').forEach((b) => b.addEventListener('click', () => showJournal(b.dataset.t)));
  showJournal('notebook');
  initCollection();

  /* ---------- toggles ---------- */

  $$('#qualSeg button').forEach((b) => b.addEventListener('click', () => { setQuality(b.dataset.q); $$('#qualSeg button').forEach((x) => x.classList.toggle('on', x === b)); }));
  window.addEventListener('quality', (e) => $$('#qualSeg button').forEach((x) => x.classList.toggle('on', x.dataset.q === e.detail)));
  $('#tour').addEventListener('change', (e) => setTour(e.target.checked));
  $('#spin').addEventListener('change', (e) => setSpin(e.target.checked));
  $('#fov').addEventListener('input', (e) => setFov(parseFloat(e.target.value)));
  $('#erupt').addEventListener('click', () => volcano.erupt && volcano.erupt());
  $('#labels-t').checked = false; $('#labels').style.display = 'none';
  $('#labels-t').addEventListener('change', (e) => { $('#labels').style.display = e.target.checked ? '' : 'none'; });
  $('#bloom-t').addEventListener('change', (e) => { bloom.enabled = e.target.checked; });
  $('#shadow-t').addEventListener('change', (e) => { sun.castShadow = e.target.checked; renderer.shadowMap.enabled = e.target.checked; renderer.shadowMap.needsUpdate = true; });
  // ----- sound
  const st = audio.st;
  $('#music-t').checked = st.musicOn; $('#sfx-t').checked = st.sfxOn;
  $('#music-v').value = st.music; $('#sfx-v').value = st.sfx; $('#master-v').value = st.master;
  $('#music-t').addEventListener('change', (e) => audio.set('musicOn', e.target.checked));
  $('#sfx-t').addEventListener('change', (e) => audio.set('sfxOn', e.target.checked));
  $('#music-v').addEventListener('input', (e) => audio.set('music', parseFloat(e.target.value)));
  $('#sfx-v').addEventListener('input', (e) => audio.set('sfx', parseFloat(e.target.value)));
  $('#master-v').addEventListener('input', (e) => audio.set('master', parseFloat(e.target.value)));
  $('#nextT').addEventListener('click', () => audio.next());
  $('#prevT').addEventListener('click', () => audio.prev());
  audio.onTrack((t) => { $('#trackname').textContent = '♪ ' + t; });
  if (!audio.hasMusic) { $('#trackname').textContent = '♪ add songs to /music'; }
  const musicLibrary = $('#music-library');
  audio.onPlaylist((tracks) => {
    musicLibrary.replaceChildren();
    const active = tracks.filter((track) => !track.removed).length;
    $('#music-count').textContent = `Music library · ${active}/${tracks.length}`;
    $('#music-restore').disabled = !tracks.some((track) => track.removed);
    if (!tracks.length) {
      const empty = document.createElement('div'); empty.className = 'music-note'; empty.textContent = 'No songs found in the music folder.'; musicLibrary.append(empty); return;
    }
    for (const track of tracks) {
      const row = document.createElement('div');
      row.className = `music-row${track.current ? ' current' : ''}${track.removed ? ' removed' : ''}`;
      const title = document.createElement('span'); title.className = 'music-title';
      title.textContent = `${track.current ? '♪ ' : ''}${track.title}${track.first ? ' · opening' : ''}`;
      title.title = track.title;
      const first = document.createElement('button');
      first.type = 'button'; first.textContent = track.first ? 'Opening song' : 'Set opening'; first.title = 'Play this first when the game starts';
      first.setAttribute('aria-label', track.first ? `${track.title} is the opening song` : `Set ${track.title} as the opening song`);
      first.disabled = track.removed || track.first;
      first.addEventListener('click', () => audio.setFirst(track.id));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = track.removed ? '↶' : '🗑';
      remove.setAttribute('aria-label', track.removed ? `Restore ${track.title}` : `Remove ${track.title} from the game`);
      remove.title = track.removed ? 'Add this song back to the game library' : 'Remove from game library (keeps the audio file)';
      remove.addEventListener('click', () => track.removed ? audio.restoreTrack(track.id) : audio.removeTrack(track.id));
      row.append(title, first, remove); musicLibrary.append(row);
    }
  });
  $('#music-restore').addEventListener('click', () => audio.restoreTracks());
  // little tick on every button press
  document.addEventListener('click', (e) => { if (e.target.closest('button')) audio.click(); });
  let muted = false, prevMaster = st.master;
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || e.code !== 'KeyM') return;
    muted = !muted;
    if (muted) { prevMaster = st.master || 0.9; audio.set('master', 0); $('#master-v').value = 0; } else { audio.set('master', prevMaster); $('#master-v').value = prevMaster; }
  });
  const hide = () => document.body.classList.toggle('hidden-ui');
  // the game opens with the interface hidden; H or the button brings it back
  document.body.classList.add('hidden-ui');
  $('#hideui').addEventListener('click', hide);
  window.addEventListener('keydown', (e) => {
    if (menu.keyMenu(e, isTyping(e))) return;
    if (isTyping(e)) return;
    if (e.code.startsWith('Digit')) { const dg = parseInt(e.code.slice(5)), i = dg === 0 ? 9 : dg - 1; if (presets[i]) goPreset(i); }
    else if (e.code === 'Escape') { if (document.fullscreenElement) return; if (!control.ctrl.on) release(); }
    else if (e.code === 'KeyH') hide();
    else if (e.code === 'KeyP') { env.paused = !env.paused; }
  });

  /* ---------- specimen viewer, species notes and live individual data ---------- */
  // the viewer is created the first time a creature is opened; it draws only while the guide tab is showing
  const specHost = $('#specView');
  let viewer = null, specEntry = null, specSpecies = null, liveText = '';
  const FIELDS = [
    ['physical', 'Physical description'], ['size', 'Typical adult size'], ['diet', 'Diet and feeding'], ['habitat', 'Natural habitat'],
    ['social', 'Social behaviour and groups'], ['activity', 'Activity pattern'], ['reproduction', 'Reproduction and parenting'],
    ['ecology', 'Predators and ecological role'],
  ];
  const clipLabel = (n) => n.replace(/^(Flight|Ground|Surface|Swim|Patrol|Dash|Turn|Hover|Jump|Playful|Social|Group|Calf|Mother|Dive)_?/, (m) => m.replace('_', ' ')).replace(/_/g, ' ');
  const renderSpecies = (c) => {
    const info = speciesInfo(c.name);
    $('#specName').textContent = c.name;
    $('#specSci').textContent = info ? info.sci : '';
    $('#specTags').innerHTML = info ? `<span class="tag${info.status === 'real' || info.status === 'assumed' ? '' : ' fict'}">${STATUS[info.status]}</span>` : '';
    const facts = $('#specFacts');
    if (!info) { facts.innerHTML = '<p class="note">No notes for this creature yet.</p>'; return; }
    facts.innerHTML = (info.note ? `<p class="note">${info.note}</p>` : '')
      + FIELDS.filter(([k]) => info[k]).map(([k, label]) => `<div class="sect"><b>${label}</b><p>${info[k]}</p></div>`).join('')
      + (info.facts ? `<div class="sect"><b>Interesting facts</b>${info.facts.map((f) => `<p>• ${f}</p>`).join('')}</div>` : '');
  };
  const guideOpen = () => menu.isOpen() && menu.currentSection() === 'guide';
  const playBtn = $('#specPlay'), spinBtn = $('#specSpin'), clipSel = $('#specClip');
  const ensureViewer = () => {
    if (!viewer) {
      viewer = new SpecimenViewer(specHost);
      viewer.onClip = (n) => { clipSel.value = n; };
    }
    return viewer;
  };
  const openSpecimen = (c) => {
    if (!c) return;
    specEntry = c;
    if (c.name !== specSpecies) { specSpecies = c.name; renderSpecies(c); }
    const v = ensureViewer();
    specHost.querySelector('.spec-empty').style.display = 'none';
    let item = null;
    try { item = v.show(c); } catch (err) { console.warn('specimen for ' + c.name + ' could not be shown', err); }
    clipSel.innerHTML = '';
    if (item && item.clips.length) {
      for (const n of item.clips) clipSel.add(new Option(clipLabel(n), n));
      clipSel.value = item.activeClip; clipSel.disabled = false; playBtn.disabled = false;
    } else {
      clipSel.add(new Option(item ? 'Static pose' : 'No model', '')); clipSel.disabled = true; playBtn.disabled = true;
    }
  };
  clipSel.addEventListener('change', (e) => { if (viewer) viewer.setClip(e.target.value); });
  playBtn.addEventListener('click', () => {
    if (!viewer) return;
    viewer.paused = !viewer.paused; playBtn.textContent = viewer.paused ? 'Play' : 'Pause'; playBtn.classList.toggle('on', viewer.paused);
  });
  spinBtn.addEventListener('click', () => { if (!viewer) return; viewer.spin = !viewer.spin; spinBtn.classList.toggle('on', viewer.spin); });
  $('#specReset').addEventListener('click', () => { if (viewer) viewer.resetView(); });
  $('#specFull').addEventListener('click', () => { if (ensureViewer()) viewer.toggleFullscreen(); });

  // live data: only for the creature the camera is following, and only what the simulation tracks
  const lastPos = new WeakMap();
  const zoneOf = (c, p, speed) => {
    const ground = getHeight(p.x, p.z), water = env.tide;
    const flying = c.cat === 'Birds' && p.y > Math.max(ground, water) + 1.5;
    if (flying) return { flying, where: ground > water + 0.5 ? 'Flying over the island' : 'Flying over the sea', height: (p.y - Math.max(ground, water)).toFixed(1) + ' m above the surface' };
    if (p.y < water - 0.1 || ground < water - 0.2) {
      return { flying: false, where: ground < -6 ? 'Open water' : 'Lagoon and shallows', height: Math.max(0, water - p.y).toFixed(1) + ' m deep' };
    }
    return { flying: false, where: ground < 2.5 ? 'On the beach or shore' : 'Inland on the island' };
  };
  const updateLive = () => {
    const open = viewer && guideOpen();
    if (viewer) viewer.setVisible(!!open);
    if (!open) return;
    const panel = $('#specLive');
    const c = cam.follow;
    if (!c) {
      if (liveText !== 'none') { panel.innerHTML = '<h4>Live in the simulation</h4><p class="note">Follow a creature (click it in the world or in the list) to see its live data here.</p>'; liveText = 'none'; }
      return;
    }
    const p = c.focus(new THREE.Vector3());
    const now = performance.now();
    const prev = lastPos.get(c);
    const speed = prev ? p.distanceTo(prev.p) / Math.max(0.001, (now - prev.t) / 1000) : 0;
    if (!prev || now - prev.t > 200) lastPos.set(c, { p: p.clone(), t: now });
    const facts = liveFacts(c, speed, zoneOf(c, p, speed));
    const html = `<h4>Live in the simulation</h4><p class="note">This individual, right now.</p>${facts.map(([k, v]) => `<div class="row2"><label>${k}</label><span>${v}</span></div>`).join('')}`;
    if (html !== liveText) { panel.innerHTML = html; liveText = html; }
  };
  setInterval(updateLive, 250);
  window.addEventListener('menu:change', updateLive);
  initNotebook();

  /* ---------- follow card ---------- */
  const card = $('#follow');
  cam.onFollow = (c) => {
    menu.setFollowing(!!c);
    if (!c) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    card.querySelector('.n').textContent = c.name;
    card.querySelector('.meta').textContent = focusMeta(c);
    card.querySelector('.d').textContent = (c.desc || '').split('. ')[0].replace(/\.?$/, '.');
    openSpecimen(c);
    onFollowed(c);
  };
  $('#unfollow').addEventListener('click', release);
  onDevice((d) => { $('#unfollow').textContent = d === 'pad' ? 'Let go (hold B)' : 'Let go (Esc)'; });

  /* ---------- field guide ---------- */
  const species = new Map();
  for (const c of creatures) {
    if (!species.has(c.name)) species.set(c.name, { cat: c.cat, list: [], desc: c.desc });
    species.get(c.name).list.push(c);
  }
  const cats = {};
  for (const [name, s] of species) (cats[s.cat] = cats[s.cat] || []).push([name, s]);
  const guide = $('#guide');
  const order = ['People', 'Mammals', 'Birds', 'Reptiles', 'Sea life', 'Shore life'];
  const colors = { People: '#f7d774', Mammals: '#ffb454', Birds: '#7dd3fc', Reptiles: '#a3e635', 'Sea life': '#4fd1c5', 'Shore life': '#ff8a65' };
  for (const cat of order) {
    if (!cats[cat]) continue;
    const h = document.createElement('div'); h.className = 'grp'; h.textContent = cat; guide.appendChild(h);
    for (const [name, s] of cats[cat]) {
      const it = document.createElement('div'); it.className = 'item';
      it.innerHTML = `<span class="dot" style="background:${colors[cat]};color:${colors[cat]}"></span><div>${name}<small>${s.list.length > 1 ? '×' + s.list.length + ' · ' : ''}${s.desc.split('.')[0]}</small></div>`;
      it.addEventListener('click', () => {
        let best = null, bd = 1e9;
        const p = new THREE.Vector3();
        for (const c of s.list) { c.focus(p); const d = p.distanceTo(camera.position) + Math.random() * 30; if (d < bd) { bd = d; best = c; } }
        if (best) { followCreature(best); menu.closeMenu(); }
      });
      it.setAttribute('data-nav', ''); it.tabIndex = 0;
      guide.appendChild(it);
    }
  }

  /* ---------- secrets ---------- */
  const list = $('#secretList');
  const counter = $('#sc');
  const items = new Map();
  secrets.forEach((s) => {
    const it = document.createElement('div'); it.className = 'item locked';
    it.innerHTML = `<span class="dot"></span><div>???<small>${s.hint}</small></div>`;
    it.addEventListener('click', () => {
      if (!s.found) return;
      const d = s.viewDist || 22;
      const p = s.pos;
      menu.closeMenu();
      flyTo([p.x + (s.viewOff ? s.viewOff[0] : d), p.y + (s.viewOff ? s.viewOff[1] : d * 0.5), p.z + (s.viewOff ? s.viewOff[2] : d)], [p.x, p.y, p.z], 3);
    });
    it.setAttribute('data-nav', ''); it.tabIndex = 0;
    list.appendChild(it); items.set(s.id, it);
  });
  const toast = $('#toast');
  let tt = null;
  function found(s) {
    s.found = true;
    const it = items.get(s.id);
    it.className = 'item found';
    it.innerHTML = `<span class="dot"></span><div>${s.name}<small>${s.desc}</small></div>`;
    counter.textContent = `${secrets.filter((x) => x.found).length}/${secrets.length}`;
    toast.querySelector('.n').textContent = s.name;
    toast.querySelector('.d').textContent = s.desc;
    toast.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('show'), 5200);
    audio.chime();
  }
  counter.textContent = `0/${secrets.length}`;
  updaters.push(() => {
    for (const s of secrets) if (!s.found && camera.position.distanceTo(s.pos) < s.r) found(s);
  });

  /* ---------- labels ---------- */
  const host = $('#labels');
  const els = labels.map((l) => { const e = document.createElement('div'); e.className = 'lbl'; e.textContent = l.name; host.appendChild(e); return e; });
  const v = new THREE.Vector3();
  updaters.push(() => {
    labels.forEach((l, i) => {
      const e = els[i];
      v.copy(l.pos);
      const d = v.distanceTo(camera.position);
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && d > (l.min || 25) && d < (l.max || 700) && (!l.needs || l.needs());
      e.style.opacity = vis ? '1' : '0';
      if (vis) { e.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; e.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px'; }
    });
  });
}
