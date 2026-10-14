import { RECIPES } from './survival/items.js';
import { canAfford, spend, awardRecipe, gatherResource, fuelFire, cookItems } from './survival/mechanics.js';
import { FishingSession, FISH_PROFILES } from './fishing.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const recipe = id => RECIPES.find(r => r.id === id);
export class FishingOuting {
  constructor(actor, options) {
    this.actor = actor; this.o = options; this.job = null; this.session = null;
    this.state = { cooldown: 0, stage: 'idle', reason: 'An enjoyable afternoon and a fresh grilled dinner',
      catches: [], records: {}, spots: {}, events: [], meals: 0, released: 0, failures: 0, interruptions: 0, rodUses: 0, motive: 'dinner' };
    this.blocked = new Map();
  }
  pop() { return this.o.population(); }
  pending() { return this.state.catches.find(f => ['raw', 'prepared', 'cooked'].includes(f.status)); }
  available(now) { return !!this.actor.structs[0] && now >= this.state.cooldown && (!!this.pending() || !!this.pop()?.sites().length); }
  event(text) { this.state.reason = text; this.state.events.push({ at: this.o.now(), text }); this.state.events = this.state.events.slice(-16); this.o.note?.(text); }
  save() { this.o.save?.(); }
  pause(reason = 'Taking a break') {
    if (this.job || this.session) {
      this.session?.interrupt(); this.session = null; this.job = null; this.state.interruptions++;
      this.event(reason + '; supplies and retained fish are safe'); this.save();
    }
  }
  block(reason, now) { this.session?.interrupt(); this.session = null; this.job = null; this.state.cooldown = now + 3; this.state.stage = 'rest'; this.event(reason); this.save(); return null; }
  jobAt(kind, target, duration, pos, extra = {}) {
    const path = this.o.planRoute(pos, target); if (!path) return null;
    this.state.stage = kind; return this.job = { kind, target: { ...target }, path, duration, elapsed: 0, travel: 0, ...extra };
  }
  next(pos, now) {
    if (this.job) return this.job;
    if (!this.available(now)) return null;
    const a = this.actor, pending = this.pending(), fire = a.structs[0];
    const home = { x: fire.x + 1.8, z: fire.z };
    const build = (kind, target, duration, extra) => this.jobAt(kind, target, duration, pos, extra) || this.block('No safe route for ' + kind, now);
    // Food already retained takes priority over acquiring another fish.
    if (pending?.status === 'cooked') return build('eat', home, 6, { fish: pending });
    const needs = {};
    if (!pending && (!a.count('rod') || this.state.rodUses <= 0)) {
      needs.stick = 2; needs.fiber = a.count('rope') ? 1 : 4;
      if (a.s.level < recipe('rod').level) needs.fiber = Math.max(3, needs.fiber);
    }
    needs.stick = (needs.stick || 0) + (pending ? fire.lit && fire.fuel > .6 ? 0 : 1 : 2);
    const missing = Object.entries(needs).filter(([id, n]) => a.count(id) < n);
    if (missing.length) {
      const nodes = a.res.nodes.filter(n => n.alive && missing.some(([id]) => n.kind === id) && distance(n, fire) < 65 && this.o.safe(n) && (this.blocked.get(n) || 0) <= now);
      for (const [id, n] of missing) if (nodes.filter(q => q.kind === id).length + a.count(id) < n) return this.block('Waiting for reachable ' + id, now);
      nodes.sort((a, b) => distance(a, pos) - distance(b, pos));
      for (const node of nodes.slice(0, 12)) { const j = this.jobAt('gather', node, .8, pos, { node }); if (j) return j; this.blocked.set(node, now + 4); }
      return this.block('Materials are beyond a safe walking route', now);
    }
    if (pending) {
      if (!fire.lit || fire.fuel < .6) return build('fuel', home, .9);
      return build(pending.status === 'raw' ? 'prepare' : 'cook', home, pending.status === 'raw' ? 4 : 7, { fish: pending });
    }
    if (!a.count('rod') || this.state.rodUses <= 0) {
      // Rope practice legitimately supplies both cord and the small skill gap left by a lucky M1 gather.
      const r = a.count('rope') && a.s.level >= recipe('rod').level ? recipe('rod') : recipe('rope');
      if (!canAfford(a, r.cost)) return this.block('Equipment prerequisites changed', now);
      return build('craft', home, 2, { recipe: r });
    }
    const sites = this.pop().sites().filter(s => this.o.safe(s.stand));
    sites.sort((a, b) => {
      const value = s => (this.state.spots[s.id]?.success || 0) * 8 - (this.state.spots[s.id]?.failure || 0) * 12 - distance(pos, s.stand);
      return value(b) - value(a);
    });
    for (const site of sites) {
      const j = this.jobAt('fish', site.stand, Infinity, pos, { site });
      if (j) {
        this.state.motive = this.o.wantsDinner() && !this.pending() ? 'dinner' : 'recreation';
        this.event(this.state.motive === 'dinner' ? 'Heading out for the pleasure of a fresh grilled dinner' : 'Fishing for relaxation and a possible personal best');
        this.save(); return j;
      }
    }
    return this.block('No reachable fishing bank supplied by the ecosystem', now);
  }
  update(dt, pos, now, stuck = 0) {
    const j = this.job; if (!j) return;
    if (!this.o.safe(j.target)) return this.block('The activity area is unsafe', now);
    if (distance(pos, j.target) > .85) {
      if (this.pending()) this.state.stage = 'transport';
      j.travel += dt;
      if (j.travel > 120 || stuck > 6) { if (j.node) this.blocked.set(j.node, now + 4); return this.block('Could not reach ' + j.kind, now); }
      return;
    }
    if (j.kind !== 'fish') this.state.stage = j.kind;
    j.elapsed += dt;
    if (j.kind === 'fish') {
      if (!this.session) {
        if (!this.pop() || !this.actor.count('rod') || this.state.rodUses < 1) return this.block('The rod or fish population is no longer available', now);
        this.session = new FishingSession(this.pop(), j.site, this.o.random); this.state.rodUses--;
        if (!this.state.rodUses) this.actor.take('rod');
      }
      const s = this.session, previous = s.stage;
      s.update(dt);
      this.state.stage = s.stage;
      if (s.stage !== previous && ['investigate', 'bite', 'fight'].includes(s.stage)) this.event(({ investigate: 'A nearby mullet is investigating the bait', bite: 'A bite! Watching the float and striking', fight: 'A hooked mullet is running; yielding line and controlling tension' })[s.stage]);
      if (s.stage === 'lost') {
        const m = this.state.spots[j.site.id] ||= { success: 0, failure: 0 }; m.failure++; this.state.failures++;
        return this.block(s.result.lost + '; another activity will be more rewarding for now', now);
      }
      if (s.stage === 'landed') {
        j.kind = 'inspect'; j.elapsed = 0; j.duration = 4; this.state.stage = 'inspect';
        const f = s.result.fish, old = this.state.records[f.species];
        const record = !old || f.length > old.length;
        if (record) this.state.records[f.species] = { ...f, at: now };
        this.event(`Examining ${FISH_PROFILES[f.species].name}: ${Math.round(f.length * 100)} cm, ${f.weight.toFixed(2)} kg${record ? ' — a personal best' : ''}`);
        this.save();
      }
      return;
    }
    if (j.elapsed < j.duration) return;
    const a = this.actor; let ok = true;
    if (j.kind === 'gather') ok = gatherResource(a, j.node, this.o.random);
    if (j.kind === 'craft') {
      ok = a.s.level >= j.recipe.level && spend(a, j.recipe.cost);
      if (ok) { awardRecipe(a, j.recipe); if (j.recipe.id === 'rod') this.state.rodUses = 40; this.event('Finished making ' + j.recipe.name.toLowerCase()); }
    }
    if (j.kind === 'inspect') {
      const keep = this.state.motive === 'dinner' && !this.pending();
      const f = this.session?.decide(keep); ok = !!f;
      if (ok) {
        const m = this.state.spots[j.site.id] ||= { success: 0, failure: 0 }; m.success++;
        if (keep) {
          // Only the successfully transferred identity can mint one inventory item.
          if (this.state.catches.some(c => c.id === f.id)) throw new Error('Duplicate retained fish identity');
          this.state.catches.push({ ...f, status: 'raw', at: now }); a.add('rawFish'); a.bump('fish'); a.addXp(6);
          this.event('Kept one mullet for dinner; carrying it back to his own fire');
        } else { this.state.released++; this.state.cooldown = now + 8; this.event('Released the mullet alive; the afternoon was its own reward'); this.o.reward?.('release'); }
      }
      this.session = null;
    }
    if (j.kind === 'fuel') ok = fuelFire(a, a.structs[0]);
    if (j.kind === 'prepare') {
      ok = j.fish.status === 'raw' && a.count('rawFish') > 0;
      if (ok) { j.fish.status = 'prepared'; this.event('Prepared his retained mullet for the coals'); }
    }
    if (j.kind === 'cook') {
      ok = j.fish.status === 'prepared' && cookItems(a, a.structs[0], 'rawFish');
      if (ok) { j.fish.status = 'cooked'; this.event('Dinner is grilled and ready to enjoy'); }
    }
    if (j.kind === 'eat') {
      ok = j.fish.status === 'cooked' && a.count('cookedFish') > 0;
      if (ok) { a.take('cookedFish'); j.fish.status = 'eaten'; a.bump('ate.cookedFish'); this.state.meals++; this.state.cooldown = now + 14; this.event('Enjoyed the smoky mullet he caught, prepared and grilled himself'); this.o.reward?.('meal'); }
    }
    this.job = null;
    if (!ok) return this.block('The prerequisites changed; no result was credited', now);
    this.save(); return { kind: j.kind };
  }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  restore(s) {
    if (!s || !Array.isArray(s.catches)) return;
    const ids = new Set();
    this.state.catches = s.catches.filter(f => typeof f.id === 'string' && !ids.has(f.id) && ids.add(f.id) && FISH_PROFILES[f.species] && ['raw', 'prepared', 'cooked', 'eaten'].includes(f.status) && Number.isFinite(f.length) && Number.isFinite(f.weight)).map(f => ({ ...f }));
    for (const k of ['cooldown', 'meals', 'released', 'failures', 'interruptions', 'rodUses']) if (Number.isFinite(s[k])) this.state[k] = Math.max(0, s[k]);
    this.state.records = s.records && typeof s.records === 'object' ? s.records : {};
    this.state.spots = s.spots && typeof s.spots === 'object' ? s.spots : {};
    this.state.events = Array.isArray(s.events) ? s.events.slice(-16) : [];
    this.actor.s.inv.rawFish = this.state.catches.filter(f => ['raw', 'prepared'].includes(f.status)).length;
    this.actor.s.inv.cookedFish = this.state.catches.filter(f => f.status === 'cooked').length;
    this.job = null; this.session = null;
  }
  describe() {
    const labels = { transport: 'Carrying his retained fish back to his own fire', gather: 'Collecting supplies for a fishing afternoon', craft: 'Making his fishing equipment', fish: 'Walking to his chosen fishing bank', cast: 'Casting the bait', wait: 'Relaxing and watching the float', investigate: 'A mullet is investigating the bait', bite: 'A bite — striking the hook', fight: 'Controlling the rod and yielding to the fish', inspect: 'Admiring and measuring his catch', fuel: 'Feeding his own campfire for dinner', prepare: 'Preparing his retained mullet', cook: 'Grilling his mullet over the coals', eat: 'Enjoying the dinner he caught himself' };
    return `${labels[this.state.stage] || 'Considering another fishing afternoon'}. ${this.state.reason}`;
  }
  summary() { return { ...this.state, connected: !!this.pop(), pending: this.pending() || null, job: this.job && { kind: this.job.kind, target: this.job.target, travel: this.job.travel, elapsed: this.job.elapsed }, session: this.session?.summary() || null, population: this.pop()?.summary?.() || null }; }
}
