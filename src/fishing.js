// Shared fishing rules. The population owns identities; sessions only borrow one fish.
export const fishingEcosystem = { provider: null };
export function registerFishingPopulation(provider) {
  if (typeof provider?.key !== 'string' || !provider.key) throw new Error('Fishing population needs a stable persistence key');
  for (const k of ['sites', 'near', 'get', 'claim', 'move', 'release', 'retain', 'snapshot', 'restore']) {
    if (typeof provider?.[k] !== 'function') throw new Error('Fishing population missing ' + k);
  }
  if (fishingEcosystem.provider && fishingEcosystem.provider !== provider) throw new Error('Fishing population already registered');
  fishingEcosystem.provider = provider;
}
export const FISH_PROFILES = {
  mullet: { name: 'Silver mullet', detect: 6, approach: 1.3, bite: .9, resistance: .52, stamina: 9, length: .4 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let serial = 0;
export class FishingSession {
  constructor(population, site, random = Math.random) {
    this.pop = population; this.site = site; this.random = random;
    this.owner = 'line-' + (++serial); this.stage = 'cast'; this.elapsed = 0; this.total = 0;
    this.fishId = null; this.tension = .35; this.damage = 0; this.slack = 0;
    this.lineLength = dist(site.stand, site.target); this.stamina = 0; this.result = null;
    this.bait = { ...site.target, y: site.target.y ?? -.5 }; this.lure = { ...this.bait };
    this.surge = 0; this.phase = random() * Math.PI * 2;
  }
  fish() { return this.fishId ? this.pop.get(this.fishId) : null; }
  lose(reason) {
    if (this.fishId) this.pop.release(this.fishId, this.owner);
    this.stage = 'lost'; this.result = { lost: reason }; return this.result;
  }
  interrupt() { if (!['kept', 'released', 'lost'].includes(this.stage)) this.lose('The line was put away'); }
  controls() {
    // Watch the current surge and measured tension; yield line instead of forcing a strong run.
    return { strike: this.stage === 'bite' && this.elapsed > .18,
      reel: this.tension > .72 || this.surge > .84 ? 0 : .82,
      drag: this.tension > .78 ? .24 : .58, lift: this.tension < .6 ? .65 : .25 };
  }
  update(dt, control = this.controls()) {
    if (['lost', 'landed', 'kept', 'released'].includes(this.stage)) return this.result;
    dt = clamp(dt, 0, .1); this.elapsed += dt; this.total += dt;
    if (this.total > 75) return this.lose('No worthwhile bite; try another afternoon');
    if (this.stage === 'cast') {
      if (this.elapsed >= 1.5) { this.stage = 'wait'; this.elapsed = 0; }
      return;
    }
    if (this.stage === 'wait') {
      const candidates = this.pop.near(this.bait, 6).filter(f => FISH_PROFILES[f.species] && !f.owner && !f.removed);
      candidates.sort((a, b) => dist(a, this.bait) - dist(b, this.bait));
      const f = candidates[0];
      // A real, nearby individual must enter detection range before it can investigate.
      if (f && this.pop.claim(f.id, this.owner)) {
        this.fishId = f.id; this.stage = 'investigate'; this.elapsed = 0;
      }
      return;
    }
    const f = this.fish(); if (!f || f.owner !== this.owner || f.removed) return this.lose('The fish is no longer available');
    const p = FISH_PROFILES[f.species];
    if (this.stage === 'investigate') {
      const d = dist(f, this.bait), k = Math.min(1, p.approach * dt / Math.max(.01, d));
      if (!this.pop.move(f.id, this.owner, { x: f.x + (this.bait.x - f.x) * k, y: this.bait.y, z: f.z + (this.bait.z - f.z) * k })) return this.lose('The fish could not reach the lure');
      if (d < .2 && this.random() < p.bite * dt) { this.stage = 'bite'; this.elapsed = 0; }
    } else if (this.stage === 'bite') {
      if (control.strike && this.elapsed < 1.15) {
        if (this.random() < .06) return this.lose('The hook slipped on the strike');
        this.stage = 'fight'; this.elapsed = 0; this.stamina = p.stamina * (f.length / p.length);
      } else if (this.elapsed > 1.15) return this.lose('The bait was rejected before the strike');
    } else if (this.stage === 'fight') {
      this.surge = .5 + .5 * Math.sin(this.elapsed * 1.7 + this.phase);
      const resistance = p.resistance * (.6 + this.surge) * (f.length / p.length) * (.25 + .75 * Math.min(1, this.stamina / p.stamina));
      const reel = clamp(control.reel || 0, 0, 1), drag = clamp(control.drag ?? .5, 0, 1), lift = clamp(control.lift || 0, 0, 1);
      const force = resistance + reel * .55 + lift * .12 - (1 - drag) * .48;
      this.tension += (force - this.tension) * Math.min(1, dt * 5);
      this.damage = Math.max(0, this.damage + (this.tension > .95 ? dt : -dt * .15));
      this.slack = this.tension < .13 ? this.slack + dt : Math.max(0, this.slack - dt);
      if (this.damage > .65) return this.lose('The line snapped under too much tension');
      if (this.slack > 1.2) return this.lose('A slack line let the fish shake the hook');
      this.stamina = Math.max(0, this.stamina - dt * Math.max(.1, this.tension) * 1.4);
      this.lineLength = Math.max(.65, this.lineLength + dt * (resistance * (1 - drag) * .6 - reel * (1.1 + (this.stamina < 2 ? .6 : 0))));
      const a = Math.atan2(this.bait.x - this.site.stand.x, this.bait.z - this.site.stand.z) + Math.sin(this.elapsed * 2) * .13;
      this.lure = { x: this.site.stand.x + Math.sin(a) * this.lineLength, y: this.bait.y + .15, z: this.site.stand.z + Math.cos(a) * this.lineLength };
      if (!this.pop.move(f.id, this.owner, this.lure)) return this.lose('The fish escaped beyond reachable water');
      if (this.lineLength < .9 && this.stamina < 1.2) {
        this.stage = 'landed'; this.result = { fish: { id: f.id, species: f.species, length: f.length, weight: f.weight } };
        return this.result;
      }
    }
  }
  decide(keep) {
    if (this.stage !== 'landed') return false;
    const ok = keep ? this.pop.retain(this.fishId, this.owner) : this.pop.release(this.fishId, this.owner);
    if (!ok) return false;
    this.stage = keep ? 'kept' : 'released'; return this.result.fish;
  }
  summary() { return { stage: this.stage, fishId: this.fishId, tension: this.tension, stamina: this.stamina, lineLength: this.lineLength, surge: this.surge, lure: this.lure, elapsed: this.elapsed, result: this.result }; }
}
