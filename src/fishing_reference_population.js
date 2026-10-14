// Contract implementation for the isolated fishingReview demonstration and tests ONLY.
// These are independent simulated fish, never copies of Claude's school members.
export class ReferencePopulation {
  constructor(site, n = 8) {
    this.key = 'fishing-review-mullet-v1';
    this.site = site; this.time = 0;
    this.members = Array.from({ length: n }, (_, i) => ({ id: 'review-mullet-' + i, species: 'mullet',
      length: .34 + i * .018, weight: .38 + i * .065, x: site.target.x + Math.cos(i) * 2,
      z: site.target.z + Math.sin(i) * 2, y: site.target.y ?? -.6, owner: null, removed: false, phase: i }));
  }
  sites() { return [this.site]; }
  get(id) { return this.members.find(f => f.id === id); }
  near(p, r) { return this.members.filter(f => !f.removed && Math.hypot(f.x - p.x, f.z - p.z) < r); }
  claim(id, owner) { const f = this.get(id); if (!f || f.removed || f.owner) return false; f.owner = owner; return true; }
  move(id, owner, p) { const f = this.get(id); if (!f || f.removed || f.owner !== owner) return false; Object.assign(f, p); return true; }
  release(id, owner) {
    const f = this.get(id); if (!f || f.removed || f.owner !== owner) return false;
    f.owner = null; f.x = this.site.target.x; f.z = this.site.target.z; f.y = this.site.target.y ?? -.6; return true;
  }
  retain(id, owner) { const f = this.get(id); if (!f || f.removed || f.owner !== owner) return false; f.removed = true; f.owner = null; return true; }
  update(dt) {
    this.time += dt;
    for (const f of this.members) if (!f.removed && !f.owner) {
      f.x = this.site.target.x + Math.cos(this.time * .3 + f.phase) * 2;
      f.z = this.site.target.z + Math.sin(this.time * .3 + f.phase) * 2; f.y = this.site.target.y ?? -.6;
    }
  }
  snapshot() { return { removed: this.members.filter(f => f.removed).map(f => f.id) }; }
  restore(s) { for (const f of this.members) { f.removed = Array.isArray(s?.removed) && s.removed.includes(f.id); f.owner = null; } }
  summary() { return { initial: this.members.length, swimming: this.members.filter(f => !f.removed && !f.owner).length, borrowed: this.members.filter(f => !!f.owner).length, retained: this.members.filter(f => f.removed).length }; }
}
