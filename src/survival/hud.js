// Survival mode interface: needs, objective, map, prompts, the bag/craft panel, menus and overlays. DOM only.
import { env } from '../core.js';
import { wx } from '../weather.js';
import { getHeight, getSlope, falls, LAKE, SPRING, FAIRY, TEMPLE, VOL, COVE, SIZE } from '../world.js';
import { ITEMS, ITEM_ORDER, RECIPES, LEVELS, QUESTS } from './items.js';

const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const clock = (tod) => { const h = Math.floor(tod) % 24, m = Math.floor((tod % 1) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const MAPR = 92;                       // metres from the player to the edge of the map

export class Hud {
  constructor(game) {
    this.g = game;
    this.root = $(`<div id="sv"></div>`);
    document.body.appendChild(this.root);
    const R = this.root;
    R.innerHTML = `
      <div id="sv-vig"></div><div class="sv-hurtflash" id="sv-hurt"></div>
      <div id="sv-needs" class="sv-card">
        <div class="when"><b id="svDay">Day 1</b><span id="svClock">07:00</span></div>
        <div class="sv-need hp"><span class="ic">❤️</span><div class="track"><div class="fill"></div></div><span class="num"></span></div>
        <div class="sv-need food"><span class="ic">🍖</span><div class="track"><div class="fill"></div></div><span class="num"></span></div>
        <div class="sv-need water"><span class="ic">💧</span><div class="track"><div class="fill"></div></div><span class="num"></span></div>
        <div class="sv-need energy"><span class="ic">⚡</span><div class="track"><div class="fill"></div></div><span class="num"></span></div>
        <div id="sv-status"></div>
      </div>
      <div id="sv-quest" class="sv-card"><div class="k">Objective</div><div class="t"></div><div class="d"></div><div class="dots"></div></div>
      <div id="sv-map" class="sv-card"><canvas width="154" height="154"></canvas><div class="lvl"><span id="svLvl">Level 1</span><span id="svXp">0 xp</span></div><div class="xp"><i></i></div></div>
      <div id="sv-center"></div>
      <div id="sv-bite">!</div>
      <div id="sv-prompt"><div id="sv-prog"><i></i></div><div id="svE"></div><div id="svF"></div></div>
      <div id="sv-hint"></div>
      <div id="sv-bag" class="sv-card"></div>
      <div id="sv-feed"></div>
      <div class="sv-modal" id="sv-craft"><div class="sv-panel sv-card">
        <header><h2>Bag &amp; crafting</h2><span id="svCraftSub"></span><button class="sv-btn" id="svCraftX">Close (Tab)</button></header>
        <div class="sv-cols"><div class="sv-col bag sv-scroll"><h3>Your bag</h3><div class="sv-grid" id="svGrid"></div><div class="sv-tip" id="svTip">Click food to eat it. Keys 1-9 do the same.</div></div>
          <div class="sv-col rec sv-scroll"><div class="sv-tabs" id="svTabs"></div><div id="svRecipes"></div></div></div>
      </div></div>
      <div class="sv-modal" id="sv-menu"></div>
      <div class="sv-white" id="sv-black"></div>`;
    this.q = (s) => R.querySelector(s);
    this.needEls = { hp: R.querySelector('.sv-need.hp'), food: R.querySelector('.sv-need.food'), water: R.querySelector('.sv-need.water'), energy: R.querySelector('.sv-need.energy') };
    this.tab = 'All';
    this.bagVer = -1; this.craftVer = -1;
    this.mapT = 0;
    this.buildMapBase();
    this.q('#svCraftX').addEventListener('click', () => this.g.togglePanel(false));
    this.q('#sv-craft').addEventListener('pointerdown', (e) => { if (e.target.id === 'sv-craft') this.g.togglePanel(false); });
    this.lastBite = false;
  }

  /* ------------------------------------------------------------ the island, painted once for the map */
  buildMapBase() {
    const S = 250, cv = document.createElement('canvas'); cv.width = cv.height = S;       // 2 m per pixel
    const c = cv.getContext('2d'), img = c.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i / S - 0.5) * SIZE, z = (j / S - 0.5) * SIZE, h = getHeight(x, z);
      const sl = getSlope(x, z);
      let r, g, b;
      if (h < -6) { r = 8; g = 52; b = 88; } else if (h < -1.5) { r = 14; g = 98; b = 140; } else if (h < -0.15) { r = 40; g = 170; b = 190; }
      else if (h < 1.1) { r = 236; g = 222; b = 168; } else if (h < 4) { r = 120; g = 176; b = 80; } else if (h < 22) { r = 58 + h; g = 126; b = 62; }
      else if (h < 46) { r = 112; g = 110; b = 96; } else { r = 88; g = 74; b = 68; }
      const sh = 1 - sl * 1.4;
      if (h > 0) { r *= sh; g *= sh; b *= sh; }
      const k = (j * S + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    this.mapBase = cv;
    this.mapCtx = this.q('#sv-map canvas').getContext('2d');
  }
  drawMap(player, heading) {
    const ctx = this.mapCtx, W = 154, scale = (W / 2) / MAPR;                       // pixels per metre
    ctx.save(); ctx.clearRect(0, 0, W, W);
    ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.clip();
    const px = player.x, pz = player.z, S = this.mapBase.width, mpp = SIZE / S;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapBase, (px / SIZE + 0.5) * S - MAPR / mpp, (pz / SIZE + 0.5) * S - MAPR / mpp, (2 * MAPR) / mpp, (2 * MAPR) / mpp, 0, 0, W, W);
    const to = (x, z) => [W / 2 + (x - px) * scale, W / 2 + (z - pz) * scale];
    const dot = (x, z, col, r = 3.2, ring = false) => {
      const [mx, my] = to(x, z);
      if (mx < -6 || my < -6 || mx > W + 6 || my > W + 6) {          // pin at the edge so you know which way
        const a = Math.atan2(my - W / 2, mx - W / 2), ex = W / 2 + Math.cos(a) * (W / 2 - 5), ey = W / 2 + Math.sin(a) * (W / 2 - 5);
        if (ring) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, 7); ctx.fill(); }
        return;
      }
      ctx.fillStyle = col; ctx.strokeStyle = '#0a1820'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fill(); ctx.stroke();
    };
    // fresh water you can drink
    for (const w of this.g.waterSpots) dot(w.x, w.z, '#bff3ff', 3.4, true);
    for (const s of this.g.s.structs) dot(s.x, s.z, s.type === 'campfire' ? '#ff9a3c' : s.type === 'raft' ? '#ffffff' : '#c9a066', 3.6, true);
    for (const c of this.g.res.crates) { const pulse = 3 + 1.6 * Math.sin(performance.now() * 0.006); dot(c.x, c.z, '#ffe066', pulse, true); }
    // the player, an arrow pointing the way he faces
    ctx.translate(W / 2, W / 2); ctx.rotate(-heading + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#102028'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------ per frame */
  update(dt, g) {
    const s = g.s;
    const set = (el, v) => { el.querySelector('.fill').style.width = `${Math.max(0, Math.min(100, v))}%`; el.querySelector('.num').textContent = Math.round(v); el.classList.toggle('low', v < 22); };
    set(this.needEls.hp, s.hp); set(this.needEls.food, s.food); set(this.needEls.water, s.water); set(this.needEls.energy, s.energy);
    this.q('#svDay').textContent = `Day ${g.day}`;
    const w = wx.rain > 0.45 ? '⛈️' : wx.rain > 0.12 ? '🌦️' : env.night > 0.5 ? '🌙' : env.dusk > 0.5 ? '🌅' : '☀️';
    this.q('#svClock').textContent = `${w} ${clock(env.tod)}`;
    // status line: what is wrong
    const bits = [];
    if (s.sick > 0) bits.push('🤢 Stomach ache');
    if (s.food <= 0) bits.push('Starving!'); else if (s.food < 22) bits.push('Hungry');
    if (s.water <= 0) bits.push('Dehydrated!'); else if (s.water < 22) bits.push('Thirsty');
    if (s.energy < 18) bits.push('Exhausted');
    if (g.stormy && !g.sheltered) bits.push('Soaked: find shelter');
    this.q('#sv-status').textContent = bits.join(' · ') || (g.sheltered ? 'Cosy' : '');
    // vignette: tired or hurt
    const hurt = Math.max(0, (35 - s.hp) / 35), tired = Math.max(0, (20 - s.energy) / 20);
    this.q('#sv-vig').style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${55 - 25 * Math.max(hurt, tired)}%, rgba(${hurt > tired ? '130,0,12' : '0,0,0'},${0.5 * Math.max(hurt, tired)}) 100%)`;
    // level and xp
    const lv = s.level, lo = LEVELS[lv - 1], hi = LEVELS[lv] ?? lo;
    this.q('#svLvl').textContent = `Level ${lv}`;
    this.q('#svXp').textContent = hi > lo ? `${s.xp - lo}/${hi - lo} xp` : 'max level';
    this.q('#sv-map .xp i').style.width = `${hi > lo ? Math.min(100, ((s.xp - lo) / (hi - lo)) * 100) : 100}%`;
    // objective
    const qd = QUESTS[s.qIdx];
    const qe = this.q('#sv-quest');
    qe.style.display = qd ? '' : 'none';
    if (qd) {
      if (qe.dataset.id !== qd.id) {
        qe.dataset.id = qd.id;
        qe.querySelector('.t').textContent = qd.title; qe.querySelector('.d').textContent = qd.text;
        qe.querySelector('.dots').innerHTML = QUESTS.map((q, i) => `<i class="${i < s.qIdx ? 'on' : i === s.qIdx ? 'cur' : ''}"></i>`).join('');
      }
    }
    // map (a few times a second)
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.08; this.drawMap(g.player.pos, g.player.heading); }
    // bag strip + panel refresh when the contents change
    if (this.bagVer !== g.bagVer) { this.bagVer = g.bagVer; this.renderBag(); if (this.panelOpen) { this.renderGrid(); this.renderRecipes(); } }
    // bite alert
    const bite = !!g.fishBite;
    if (bite !== this.lastBite) { this.lastBite = bite; this.q('#sv-bite').style.display = bite ? 'block' : 'none'; }
  }

  /* ------------------------------------------------------------ bag strip */
  renderBag() {
    const g = this.g, bag = this.q('#sv-bag');
    const have = ITEM_ORDER.filter((id) => g.count(id) > 0);
    const foods = have.filter((id) => ITEMS[id].food);
    bag.innerHTML = '';
    if (!have.length) { bag.innerHTML = '<span style="font-size:12px;color:#9fc3c4;padding:3px 8px">Your bag is empty: pick things up with E</span>'; return; }
    for (const id of have) {
      const it = ITEMS[id], n = g.count(id), ki = foods.indexOf(id);
      const chip = $(`<div class="sv-chip ${it.food ? 'food' : ''}" title="${it.name}: ${it.desc}"><span class="ic">${it.icon}</span><b>${it.tool ? '' : n}</b>${ki >= 0 && ki < 9 ? `<span class="kk">${ki + 1}</span>` : ''}${it.tool ? `<span class="dur"><i style="width:${Math.round((g.s.dur[id] / it.uses) * 100)}%"></i></span>` : ''}</div>`);
      if (it.food) chip.addEventListener('click', () => g.eat(id));
      bag.appendChild(chip);
    }
  }

  /* ------------------------------------------------------------ prompts and messages */
  prompt(e, f, progress) {
    const mk = (a, cls = '') => a ? `<div class="sv-act ${cls} ${a.off ? 'off' : ''}"><span class="sv-key">${a.key}</span><span>${a.label}${a.note ? ` <small>${a.note}</small>` : ''}</span></div>` : '';
    const eh = mk(e), fh = mk(f, 'sec');
    const E = this.q('#svE'), F = this.q('#svF');
    if (E.dataset.k !== eh) { E.dataset.k = eh; E.innerHTML = eh; }
    if (F.dataset.k !== fh) { F.dataset.k = fh; F.innerHTML = fh; }
    const p = this.q('#sv-prog');
    if (progress == null) p.style.display = 'none'; else { p.style.display = 'block'; p.firstChild.style.width = `${Math.round(progress * 100)}%`; }
  }
  hint(t) { const h = this.q('#sv-hint'); if (h.textContent !== t) h.textContent = t; }
  gain(text, cls = '') {
    const feed = this.q('#sv-feed');
    const e = $(`<div class="sv-gain ${cls}">${text}</div>`);
    feed.appendChild(e); setTimeout(() => e.remove(), 3500);
    while (feed.children.length > 7) feed.firstChild.remove();
  }
  banner(k, n, d = '') {
    const c = this.q('#sv-center');
    const b = $(`<div class="sv-banner"><div class="k">${k}</div><div class="n">${n}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`);
    c.innerHTML = ''; c.appendChild(b); setTimeout(() => b.remove(), 4300);
  }
  hurt() { const h = this.q('#sv-hurt'); h.style.transition = 'none'; h.style.opacity = '1'; void h.offsetWidth; h.style.transition = 'opacity .7s'; h.style.opacity = '0'; }
  fade(to, ms = 1000) { const b = this.q('#sv-black'); b.style.transition = `opacity ${ms}ms ease`; b.style.opacity = String(to); }

  /* ------------------------------------------------------------ the bag & craft panel */
  get panelOpen() { return this.q('#sv-craft').classList.contains('open'); }
  openPanel(v) {
    this.q('#sv-craft').classList.toggle('open', v);
    if (v) { this.renderGrid(); this.renderRecipes(); }
  }
  renderGrid() {
    const g = this.g, grid = this.q('#svGrid'), foods = ITEM_ORDER.filter((id) => g.count(id) > 0 && ITEMS[id].food);
    grid.innerHTML = '';
    const have = ITEM_ORDER.filter((id) => g.count(id) > 0);
    if (!have.length) grid.innerHTML = '<div class="sv-tip">Nothing yet.</div>';
    for (const id of have) {
      const it = ITEMS[id], n = g.count(id);
      const s = $(`<div class="sv-slot ${it.food ? 'food' : ''}" title="${it.desc}"><span class="ic">${it.icon}</span>${it.tool ? '' : `<b>${n}</b>`}<div>${it.name}</div>${it.tool ? `<div class="dur"><i style="width:${Math.round((g.s.dur[id] / it.uses) * 100)}%"></i></div>` : ''}</div>`);
      s.addEventListener('mouseenter', () => { this.q('#svTip').textContent = `${it.name}: ${it.desc}${it.food ? ` (${[it.food.hunger && '+' + it.food.hunger + ' food', it.food.thirst && '+' + it.food.thirst + ' water', it.food.health && '+' + it.food.health + ' health'].filter(Boolean).join(', ')})` : ''}`; });
      if (it.food) s.addEventListener('click', () => g.eat(id));
      grid.appendChild(s);
    }
    this.q('#svCraftSub').textContent = `Level ${g.s.level}`;
  }
  renderRecipes() {
    const g = this.g, wrap = this.q('#svRecipes'), tabs = this.q('#svTabs');
    const cats = ['All', 'Tools', 'Build'];
    tabs.innerHTML = '';
    for (const c of cats) { const b = $(`<button class="${c === this.tab ? 'on' : ''}">${c}</button>`); b.addEventListener('click', () => { this.tab = c; this.renderRecipes(); }); tabs.appendChild(b); }
    wrap.innerHTML = '';
    const list = RECIPES.filter((r) => this.tab === 'All' || r.cat === this.tab).sort((a, b) => (a.level > g.s.level) - (b.level > g.s.level) || a.level - b.level);
    for (const r of list) {
      const locked = r.level > g.s.level;
      const can = !locked && Object.entries(r.cost).every(([id, n]) => g.count(id) >= n);
      const out = r.gives ? ITEMS[r.gives] : null;
      const icon = out ? out.icon : { campfire: '🔥', shelter: '🛖', rack: '🐟', raft: '⛵' }[r.place];
      const costs = Object.entries(r.cost).map(([id, n]) => `<span class="sv-cost ${g.count(id) >= n ? 'ok' : 'no'}">${ITEMS[id].icon} ${g.count(id)}/${n}</span>`).join('');
      const row = $(`<div class="sv-rec ${can ? 'can' : ''} ${locked ? 'locked' : ''}"><span class="ic">${icon}</span><div class="mid"><div class="nm">${r.name}${locked ? ` · unlocks at level ${r.level}` : ''}</div><div class="bl">${r.blurb}</div><div>${costs}</div></div><button class="sv-btn" ${can ? '' : 'disabled'}>${r.place ? 'Build' : 'Craft'}</button></div>`);
      row.querySelector('button').addEventListener('click', () => g.craft(r.id));
      wrap.appendChild(row);
    }
  }

  /* ------------------------------------------------------------ menus */
  menu(html, handlers = {}) {
    const m = this.q('#sv-menu');
    m.innerHTML = `<div class="sv-menu sv-card">${html}</div>`;
    m.classList.add('open');
    for (const [sel, fn] of Object.entries(handlers)) { const el = m.querySelector(sel); if (el) el.addEventListener('click', fn); }
  }
  closeMenu() { this.q('#sv-menu').classList.remove('open'); this.q('#sv-menu').innerHTML = ''; }
  get menuOpen() { return this.q('#sv-menu').classList.contains('open'); }
}

export const CONTROLS_HTML = `<div class="keys"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</div><div><kbd>Shift</kbd> run</div><div><kbd>Space</kbd> jump</div><div><kbd>drag</kbd> look around</div>
<div><kbd>wheel</kbd> zoom</div><div><kbd>E</kbd> use / pick up</div><div><kbd>F</kbd> second action</div><div><kbd>Tab</kbd> bag &amp; crafting</div><div><kbd>1</kbd>-<kbd>9</kbd> eat food</div><div><kbd>Q</kbd> drink canteen</div><div><kbd>R</kbd> turn a building</div><div><kbd>Esc</kbd> pause</div></div>`;
