/* ====================================================================== CRAB */
// four kinds in different sizes: the common red beach crab, pale quick ghost crabs, slow hermit crabs in borrowed shells, and big inland coconut crabs
const CRAB_KINDS = {
  red: { name: 'Red beach crab', scale: 0.78, jit: [0.8, 1.3], speed: 2.4, flee: 4.2, desc: 'Scuttles sideways across the sand, claws raised at anything larger than itself.', h: [0.7, 1.9] },
  ghost: { name: 'Ghost crab', scale: 0.4, jit: [0.8, 1.2], speed: 3.8, flee: 6.0, desc: 'Sand-coloured and fast, it bolts the moment you come near and is nearly invisible when it stops.', h: [0.5, 1.3] },
  hermit: { name: 'Hermit crab', scale: 0.36, jit: [0.75, 1.3], speed: 1.1, flee: 1.8, desc: 'Lugs a borrowed spiral shell on its back, and pulls its claws in and freezes if disturbed.', h: [0.8, 2.4] },
  coconut: { name: 'Coconut crab', scale: 1.05, jit: [0.9, 1.15], speed: 1.5, flee: 2.4, desc: 'The heavyweight of the island: a purple land crab with claws that can crack a coconut, usually found near the palms.', h: [2.0, 5.5] },
};
class Crab {
  constructor(i, spot, kind = 'red') {
    const K = CRAB_KINDS[kind];
    this.kind = kind; this.K = K;
    Object.assign(this, makeCrabModel(kind) || makeCrab());
    const root = this.root;
    if (this.pincers) root.scale.setScalar(K.scale * rr(K.jit[0], K.jit[1]));
    else root.scale.setScalar(1.3);
    this.group = new THREE.Group(); this.group.add(root); fauna.add(this.group);
    this.x = spot.x; this.z = spot.z; this.heading = rnd() * TAU; this.t = rr(0.5, 4); this.state = 'idle'; this.ph = rnd() * 6; this.speed = 0;
    this.home = spot; this.snap = 0; this.tuck = 0;
    register({ id: 'crab' + i, name: K.name, cat: 'Shore life', group: this.group, viewDist: 3 + 3 * K.scale, desc: K.desc, pickR: 0.8 + K.scale, pickY: 0.3 });
  }
  update(dt, t) {
    const K = this.K;
    this.t -= dt;
    let moving = false;
    const cdx = this.x - camera.position.x, cdz = this.z - camera.position.z, cd = Math.hypot(cdx, cdz);
    const near = cd < (this.kind === 'ghost' ? 7 : 5) && Math.abs(camera.position.y - getHeight(this.x, this.z)) < 6;
    if (near && !this.fleeing) {
      if (this.kind === 'hermit') { this.tuck = 1; this.t = Math.max(this.t, 2.5); this.state = 'idle'; }
      else {
        const tx = this.x + (cdx / cd) * 4, tz = this.z + (cdz / cd) * 4, h = getHeight(tx, tz);
        if (h > K.h[0] - 0.2 && h < K.h[1] + 0.8) { this.tx = tx; this.tz = tz; this.state = 'run'; this.fleeing = 1.2; }
      }
    }
    if (this.fleeing) this.fleeing = Math.max(0, this.fleeing - dt) || 0;
    if (this.tuck && !near) this.tuck = Math.max(0, this.tuck - dt * 0.5);
    if (this.state === 'idle') {
      this.speed = damp(this.speed, 0, 8, dt);
      if (this.t < 0) {
        const a = rnd() * TAU, r = rr(1.5, 5);
        const nx = this.x + Math.cos(a) * r, nz = this.z + Math.sin(a) * r, h = getHeight(nx, nz);
        if (h > K.h[0] - 0.2 && h < K.h[1] && Math.hypot(nx - this.home.x, nz - this.home.z) < 14) { this.tx = nx; this.tz = nz; this.state = 'run'; }
        else this.t = 1;
      }
    } else {
      const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
      this.speed = damp(this.speed, this.fleeing ? K.flee : K.speed, 10, dt);
      this.x += (dx / d) * this.speed * dt; this.z += (dz / d) * this.speed * dt;
      this.heading = steer(this.heading, Math.atan2(dx, dz) + Math.PI / 2, dt * 6);      // sideways scuttle
      moving = true;
      if (d < 0.25) { this.state = 'idle'; this.t = this.kind === 'hermit' ? rr(3, 9) : rr(1.5, 6); }
    }
    orient(this.group, this.x, this.z, this.heading, 0.3 * this.root.scale.x, 0.3 * this.root.scale.x);
    const sc = Math.min(1.6, this.speed / 2.4);
    this.ph += dt * (7 + this.speed * 2.2) * (moving ? 1 : 0);
    if (this.pincers) {
      // eight legs in alternating groups: swing fore-aft and lift each foot clear of the sand
      this.legs.forEach((l) => {
        const s = l.userData.side, k = l.userData.k;
        const phi = this.ph + (((k + (s > 0 ? 1 : 0)) % 2) ? Math.PI : 0) + k * 0.35;
        l.rotation.x = Math.sin(phi) * 0.4 * sc * (moving ? 1 : 0);
        l.rotation.z = s * (Math.max(0, Math.cos(phi)) * 0.28 * sc * (moving ? 1 : 0) - 0.06 * this.tuck);
      });
      this.body.position.y = 0.17 + (moving ? Math.abs(Math.sin(this.ph)) * 0.012 : 0);
      this.body.rotation.z = Math.sin(this.ph) * 0.03 * (moving ? 1 : 0);
      const wave = moving ? 0.35 : 0.2 + 0.2 * Math.sin(t * 1.7 + this.x);
      const raise = this.tuck ? 0.0 : (this.kind === 'coconut' ? 0.25 : 0.35) + wave * 0.6;
      this.claws[0].rotation.x = -raise; this.claws[1].rotation.x = -raise * 0.8;
      this.claws[0].rotation.y = 0.12 * Math.sin(t * 2.3 + this.x) * (1 - this.tuck);
      this.claws[1].rotation.y = -0.1 * Math.sin(t * 1.9 + this.z) * (1 - this.tuck);
      // pincers nip open and shut now and then
      this.snap -= dt;
      if (this.snap < 0) this.snap = rr(1.2, 4.5);
      const open = this.tuck ? 0 : this.snap < 0.5 ? Math.abs(Math.sin(this.snap * 12)) * 0.5 : (moving ? 0.2 : 0.06);
      this.pincers[0].rotation.y = -open; this.pincers[1].rotation.y = open;
    } else {
      this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.ph + i * 1.3) * 0.5 * (moving ? 1 : 0); });
      const raise = moving ? 0.5 : 0.35 + 0.35 * Math.sin(t * 2.2 + this.ph);
      this.claws[0].rotation.x = -raise; this.claws[1].rotation.x = -raise * 0.8;
      this.claws[0].rotation.z = 0.2 * Math.sin(t * 5 + this.x);
    }
  }
}

