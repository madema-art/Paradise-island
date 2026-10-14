import { RECIPES } from './survival/items.js';
import { gatherResource, constructRecipe, fuelFire } from './survival/mechanics.js';

export const LIFE_SAVE_KEY = 'paradise.observation.life.v1';
const recipe = RECIPES.find(r => r.id === 'campfire');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// One resumable project attached to the existing mind. No new activity planner or wildlife state.
export class ComfortProject {
  constructor(actor, options) {
    this.actor = actor; this.options = options; this.job = null; this.blockedNodes = new Map();
    this.state = { stage: 'gather', completed: false, cooldown: 0, interruptions: 0, attempts: 0, reason: '', site: null, enjoyment: 0 };
  }
  available(now) { return !this.state.completed && now >= this.state.cooldown; }
  pause(reason = 'Taking care of something more urgent') {
    if (this.job) { this.job = null; this.state.interruptions++; this.state.reason = reason; this.save(); }
  }
  block(reason, now) {
    this.job = null; this.state.reason = reason; this.state.cooldown = now + 2; this.save(); return null;
  }
  save() { this.options.save?.(); }
  requirements() { return this.actor.structs.length ? { stick: this.actor.structs[0].lit || this.actor.structs[0].fuel > 0 ? 0 : 1 } : { ...recipe.cost, stick: recipe.cost.stick + 1 }; }
  next(pos, now) {
    if (!this.available(now)) return null;
    if (this.job) return this.job;
    const s = this.state, a = this.actor;
    if (!s.site) s.site = this.options.findSite();
    if (!s.site) return this.block('No safe, clear place for a personal fire', now);
    const missing = Object.entries(this.requirements()).filter(([id, n]) => a.count(id) < n);
    if (missing.length) {
      const nodes = a.res.nodes.filter(n => n.alive && missing.some(([id]) => id === n.kind) && distance(n, s.site) < 65 && (this.blockedNodes.get(n) || 0) <= now && this.options.safe(n));
      for (const [id, need] of missing) {
        // Conservative yield estimate: never start a project that visibly lacks enough resources.
        if (nodes.filter(n => n.kind === id).length + a.count(id) < need) return this.block('Not enough reachable ' + id + ' nearby', now);
      }
      nodes.sort((x, y) => distance(x, pos) - distance(y, pos));
      let node, path;
      for (const candidate of nodes.slice(0, 8)) {
        path = this.options.planRoute ? this.options.planRoute(pos, candidate) : [];
        if (path) { node = candidate; break; }
        this.blockedNodes.set(candidate, now + 4);
      }
      if (!node) return this.block('No safe ground route to nearby materials', now);
      s.stage = 'gather';
      this.job = { kind: 'gather', node, path, target: { x: node.x, z: node.z }, duration: .8, elapsed: 0, travel: 0 };
    } else {
      const fire = a.structs[0];
      const kind = !fire ? 'build' : fire.fuel <= 0 ? 'fuel' : 'enjoy'; s.stage = kind;
      if (!fire) {
        const reason = this.options.canPlace('campfire', s.site.x, s.site.z, a.structs);
        if (reason) { s.site = null; return this.block('The building site changed: ' + reason, now); }
      }
      const target = { x: s.site.x + 1.8, z: s.site.z };
      const path = this.options.planRoute ? this.options.planRoute(pos, target) : [];
      if (!path) return this.block('No safe ground route to the building site', now);
      this.job = { kind, path, target, duration: kind === 'build' ? 4 : kind === 'fuel' ? .9 : 6, elapsed: 0, travel: 0 };
    }
    s.reason = 'A warm place of his own to relax and feel accomplished'; this.save(); return this.job;
  }
  update(dt, pos, now, stuck = 0) {
    const j = this.job; if (!j) return null;
    j.lastPosition = { ...pos }; j.stuck = stuck;
    if (!this.options.safe(j.target)) { this.pause('The work area is unsafe'); return this.block('Waiting for the work area to be safe', now); }
    if (j.kind === 'gather' && !j.node.alive) { this.job = null; return null; }
    if (distance(pos, j.target) > .85) {
      j.travel += dt;
      if (j.travel > 60 || stuck > 5) {
        if (j.node) this.blockedNodes.set(j.node, now + 4);
        this.state.attempts++; return this.block('Could not reach the work target; trying again later', now);
      }
      return null;
    }
    j.elapsed += dt;
    if (j.elapsed < j.duration) return null;
    const a = this.actor; let result;
    if (j.kind === 'gather') result = gatherResource(a, j.node, this.options.random);
    else if (j.kind === 'build') {
      result = constructRecipe(a, recipe, this.state.site, this.options.canPlace, this.options.create);
      if (result.structure) a.structs.push(result.structure);
    } else if (j.kind === 'fuel') result = fuelFire(a, a.structs[0]);
    else if (a.structs[0]?.fuel > 0) {
      this.state.completed = true; this.state.stage = 'complete'; this.state.enjoyment++;
      this.options.reward(); result = { completed: true };
    }
    this.job = null;
    if (!result || result.error) return this.block(result?.error || 'The prerequisites changed before the action finished', now);
    this.state.reason = this.state.completed ? 'Built and enjoyed his own evening fire' : 'Finished ' + j.kind;
    this.options.note?.(j.kind); this.save(); return { kind: j.kind, ...result };
  }
  snapshot() { return { ...this.state }; }
  restore(s) {
    if (!s || typeof s !== 'object') return;
    this.state.completed = s.completed === true;
    this.state.stage = this.state.completed ? 'complete' : 'gather';
    this.state.cooldown = Number.isFinite(s.cooldown) ? Math.max(0, s.cooldown) : 0;
    this.state.interruptions = Number.isFinite(s.interruptions) ? Math.max(0, s.interruptions) : 0;
    this.state.attempts = Number.isFinite(s.attempts) ? Math.max(0, s.attempts) : 0;
    this.state.enjoyment = this.state.completed ? 1 : 0;
    this.state.reason = typeof s.reason === 'string' ? s.reason.slice(0, 180) : '';
    if (s.site && [s.site.x, s.site.z].every(Number.isFinite) && Math.abs(s.site.x) < 230 && Math.abs(s.site.z) < 230) this.state.site = { x: s.site.x, z: s.site.z };
    this.job = null; // An interrupted animation is retried, never credited as a finished action.
  }
  summary() { return { title: 'A personal evening fire', motivation: 'Comfort and accomplishment', ...this.state, action: this.job?.kind || null, target: this.job?.target || null, nextWaypoint: this.job?.path?.[0] || null, stuck: this.job?.stuck || 0, workSeconds: this.job?.elapsed || 0, travelSeconds: this.job?.travel || 0 }; }
}
