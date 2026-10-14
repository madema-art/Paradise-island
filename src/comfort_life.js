import { Resources } from './survival/nodes.js';
import { Structure, canPlace } from './survival/structures.js';
import { LEVELS } from './survival/items.js';
import { getHeight, getSlope, lavaDist, resolveColliders } from './world.js';
import { ComfortProject, LIFE_SAVE_KEY } from './comfort_project.js';
import { findProjectPath } from './project_path.js';
import { FishingOuting } from './fishing_outing.js';
import { fishingEcosystem } from './fishing.js';

export function createComfortLife(camp, hut, mind) {
  const saveKey = LIFE_SAVE_KEY + (new URLSearchParams(location.search).has('fishingReview') ? '.fishing-review' : '');
  const actor = {
    s: { inv: {}, stats: {}, level: 1, xp: 0 }, structs: [], res: new Resources(),
    get hoursAbs() { return mind.clock; },
    count(id) { return this.s.inv[id] || 0; },
    add(id, n = 1) { this.s.inv[id] = this.count(id) + n; },
    take(id, n = 1) { this.s.inv[id] = Math.max(0, this.count(id) - n); },
    bump(k, n = 1) { this.s.stats[k] = (this.s.stats[k] || 0) + n; },
    addXp(n) { this.s.xp += n; while (this.s.level < LEVELS.length && this.s.xp >= LEVELS[this.s.level]) this.s.level++; },
  };
  actor.res.build(camp); actor.res.setVisible(true);
  let storageError = false, saveT = 0, populationSave = null;
  const safe = p => {
    if (getHeight(p.x, p.z) <= .8 || getSlope(p.x, p.z) >= .35 || lavaDist(p.x, p.z) <= 8) return false;
    const test = { x: p.x, z: p.z }; resolveColliders(test, .42);
    return Math.hypot(test.x - p.x, test.z - p.z) < .05;
  };
  function findSite() {
    for (let ring = 8; ring <= 16; ring += 4) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, x = camp.x + Math.cos(angle) * ring, z = camp.z + Math.sin(angle) * ring;
      if (Math.hypot(x - hut.mat.x, z - hut.mat.z) < 6 || !safe({ x, z }) || canPlace('campfire', x, z, actor.structs)) continue;
      const test = { x, z }; resolveColliders(test, 1.5);
      if (Math.hypot(test.x - x, test.z - z) < .05 && safe({ x: x + 1.8, z })) return { x, z };
    }
    return null;
  }
  function save() {
    try {
      const p = fishingEcosystem.provider;
      localStorage.setItem(saveKey, JSON.stringify({ fishing: fishing.snapshot(), fishingPopulation: p ? { key: p.key, data: p.snapshot() } : populationSave, v: 1, inventory: actor.s, clock: mind.clock, needs: mind.needs, project: project.snapshot(), structures: actor.structs.map(s => s.serialize()), resources: actor.res.snapshot(mind.clock) }));
      storageError = false;
    } catch { storageError = true; }
  }
  const project = new ComfortProject(actor, {
    planRoute: (from, to) => findProjectPath(from, to, safe, getHeight),
    findSite, canPlace, safe, create: (...args) => new Structure(...args), save,
    reward: () => {
      mind.needs.comfort = Math.min(1, mind.needs.comfort + .3);
      mind.needs.fulfillment = Math.min(1, mind.needs.fulfillment + .25);
      mind.note('Gathered materials, built and enjoyed his own evening fire.', 'project', .16, true);
    },
    note: kind => { if (kind !== 'enjoy') mind.note(kind === 'gather' ? 'Collected materials for his evening fire.' : kind === 'build' ? 'Finished building his personal campfire.' : 'Fed a stick to his new fire.', null, .005); },
  });
  const fishing = new FishingOuting(actor, {
    population: () => fishingEcosystem.provider, safe,
    planRoute: (from, to) => findProjectPath(from, to, safe, getHeight), save, now: () => mind.clock,
    wantsDinner: () => mind.needs.hunger > .2,
    note: text => mind.note(text, null, .005),
    reward: kind => {
      mind.needs.fulfillment = Math.min(1, mind.needs.fulfillment + .12);
      if (kind === 'meal') { mind.ate('fish'); mind.needs.comfort = Math.min(1, mind.needs.comfort + .08); }
      mind.note(kind === 'meal' ? 'A rewarding fishing afternoon and a dinner of his own.' : 'Returned a fine fish to the water.', 'angling', .08, true);
    },
  });
  const restorePopulation = () => {
    const p = fishingEcosystem.provider;
    if (p && populationSave?.key === p.key) p.restore(populationSave.data);
  };
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey) || 'null');
    if (saved?.v === 1 && saved.inventory?.inv && saved.project) {
      for (const [id, n] of Object.entries(saved.inventory.inv)) if (['stick', 'stone', 'fiber', 'coconut', 'clam', 'pearl', 'rope', 'rod'].includes(id) && Number.isInteger(n) && n >= 0 && n <= 1000) actor.s.inv[id] = n;
      actor.s.stats = Object.fromEntries(Object.entries(saved.inventory.stats || {}).filter(([k, v]) => /^(gathered\.|built\.|lit|crafted\.|fish|cooked|ate\.)/.test(k) && Number.isFinite(v) && v >= 0));
      actor.s.xp = Math.max(0, Math.min(10000, Number(saved.inventory.xp) || 0)); actor.addXp(0);
      mind.clock = Math.max(0, Math.min(1e6, Number(saved.clock) || 0));
      for (const k of Object.keys(mind.needs)) if (Number.isFinite(saved.needs?.[k])) mind.needs[k] = Math.max(0, Math.min(1, saved.needs[k]));
      for (const q of (Array.isArray(saved.structures) ? saved.structures : []).slice(0, 1)) {
        if (q.type !== 'campfire' || ![q.x, q.z].every(Number.isFinite) || Math.hypot(q.x - camp.x, q.z - camp.z) > 25 || canPlace(q.type, q.x, q.z, actor.structs)) continue;
        const st = new Structure(q.type, q.x, q.z, Number(q.yaw) || 0); st.fuel = Math.max(0, Math.min(6, Number(q.fuel) || 0)); actor.structs.push(st);
      }
      project.restore(saved.project); actor.res.restore(saved.resources, mind.clock);
      fishing.restore(saved.fishing); populationSave = saved.fishingPopulation || null; restorePopulation();
    }
  } catch { /* An unavailable or damaged observation save does not affect classic survival. */ }
  const summary = () => ({ ...project.summary(), inventory: { ...actor.s.inv }, structures: actor.structs.map(s => s.serialize()), fishing: fishing.summary(), storageError });
  mind.fishingText = () => fishing.describe();
  mind.projectText = () => {
    const j = project.job;
    return project.state.completed ? 'His personal evening fire is finished.' : `${j ? ({ gather: 'Gathering ' + (j.node?.kind || 'materials'), build: 'Building his fire', fuel: 'Lighting his fire', enjoy: 'Enjoying his accomplishment' })[j.kind] : 'Planning a personal evening fire'}. ${actor.count('stick')}/6 sticks, ${actor.count('stone')}/4 stones. ${project.state.reason}`;
  };
  const onPageHide = () => { project.pause('Resuming after a reload'); fishing.pause('Resuming after a reload'); save(); };
  window.addEventListener('pagehide', onPageHide);
  return {
    actor, project, fishing, summary, save, safe, restorePopulation,
    update(dt, dh, t, pos, paused) {
      actor.res.setVisible(!paused);
      if (paused) { project.pause('Classic survival is active'); fishing.pause('Classic survival is active'); return; }
      actor.res.update(dt, mind.clock, pos);
      for (const st of actor.structs) st.update(dt, dh, t);
      saveT += dt; if (saveT >= 10) { saveT = 0; save(); }
    },
  };
}
