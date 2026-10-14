  /* ================================================================ CANOE: paddle the outrigger out, fish from it, paddle home */
  const sea = cn ? cn.sea : { x: 0, z: 1 };
  const boardSpot = cn ? { x: cn.x - sea.x * 1.9, z: cn.z - sea.z * 1.9 } : { x: 0, z: 0 };
  const boat = { x: cn ? cn.x : 0, z: cn ? cn.z : 0, yaw: cn ? cn.yaw : 0, y: 0, v: 0, bob: 0, stroke: 0, roll: 0, pitch: 0, x0: 0, z0: 0, y0: 0, yaw0: 0, dipped: false };
  const SEAT_Y = 0.2;
  let canoeSpot = null, wps = [], wpk = 0;
  function updateBoat(dt, t) {
    if (!cn) return;
    boat.bob += dt;
    const g = getHeight(boat.x, boat.z);
    const away = Math.hypot(boat.x - cn.x, boat.z - cn.z) > 1.5;
    const target = Math.max(-0.32, g - 0.18) + (away ? Math.sin(boat.bob * 1.25) * 0.03 : 0);
    boat.y = damp(boat.y, target, 8, dt);
    boat.roll = damp(boat.roll, away ? Math.sin(boat.bob * 0.9) * 0.025 + Math.sin(boat.stroke * TAU) * 0.01 * boat.v : 0, 4, dt);
    boat.pitch = damp(boat.pitch, away ? Math.sin(boat.bob * 1.1 + 1) * 0.015 : 0, 4, dt);
    cn.mesh.position.set(boat.x, boat.y, boat.z);
    cn.mesh.rotation.set(boat.pitch, boat.yaw, boat.roll, 'YXZ');
  }
  const bowH = () => boat.yaw + Math.PI;                                  // the way the bow points (his heading when aboard)
  function seatTo() {
    x = boat.x + Math.sin(boat.yaw) * 0.25; z = boat.z + Math.cos(boat.yaw) * 0.25;
    y = boat.y + SEAT_Y; heading = bowH();
  }
  function setCanoeAway(away) {
    cn.cols.forEach((c) => { c.off = away; });
    cn.stowed.forEach((p) => { p.visible = !away; });
    paddle.visible = away;
  }
  function resetBoat() {
    boat.x = cn.x; boat.z = cn.z; boat.yaw = cn.yaw; boat.v = 0; boat.stroke = 0;
    setCanoeAway(false); paddle.visible = false; updateBoat(0.5, 0);
  }
  function leaveCanoe() {
    if (!cn) return;
    const aboard = ['board', 'launch', 'settle', 'work', 'back', 'dock', 'exit'].includes(phase);
    resetBoat();
    if (aboard) { x = boardSpot.x; z = boardSpot.z; y = getHeight(x, z); }
    bobber.visible = line.visible = false;
  }
  function clearPath(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    const dk = falls.dock, tmp = { x: 0, z: 0 };
    for (let i = 0; i <= n; i++) {
      const px = ax + (bx - ax) * (i / n), pz = az + (bz - az) * (i / n);
      if (getHeight(px, pz) > -0.75) return false;
      const u = clamp(((px - dk.x) * dk.dx + (pz - dk.z) * dk.dz), 0, dk.len);
      if (Math.hypot(px - (dk.x + dk.dx * u), pz - (dk.z + dk.dz * u)) < 3.5) return false;
      if (Math.hypot(px - (COVE.x + 16), pz - (COVE.z + 18)) < 10) return false;       // the wreck
      tmp.x = px; tmp.z = pz; if (resolveColliders(tmp, 1.6)) return false;
    }
    return true;
  }
  function pickCanoeSpot() {
    const base = Math.atan2(sea.x, sea.z), ox = cn.x + sea.x * 9, oz = cn.z + sea.z * 9;
    for (let k = 0; k < 120; k++) {
      const a = base + rr(-1.0, 1.0), r = rr(16, 42), tx = cn.x + Math.sin(a) * r, tz = cn.z + Math.cos(a) * r;
      if (getHeight(tx, tz) < -2.0 && clearPath(ox, oz, tx, tz)) return { x: tx, z: tz };
    }
    return { x: cn.x + sea.x * 22, z: cn.z + sea.z * 22 };
  }
  function sail(dt, tx, tz, vmax, turn = 0.7) {
    const dx = tx - boat.x, dz = tz - boat.z, d = Math.hypot(dx, dz);
    const aim = Math.atan2(dx, dz);
    const h = turnTo(bowH(), aim, turn * dt);
    boat.yaw = h - Math.PI;
    const want = Math.min(vmax, 0.4 + d * 0.5) * (Math.abs(wrap(aim - h)) > 0.9 ? 0.35 : 1);
    boat.v = damp(boat.v, want, 1.6, dt);
    boat.x += Math.sin(h) * boat.v * dt; boat.z += Math.cos(h) * boat.v * dt;
    return d;
  }
  function paddlePose(dt, spd, calm = false) {
    boat.stroke += dt * (0.34 + spd * 0.2);
    const s = boat.stroke % 1;
    // reach (0) -> pull back (0.5) -> lift & recover (1)
    const pull = s < 0.5 ? smooth(s / 0.5) : 1 - smooth((s - 0.5) / 0.5);
    const lift = s > 0.46 && s < 0.9 ? 1 : 0;
    const k = calm ? 0.25 : 1;
    setPose({
      py: 0.12, spX: 0.2 - 0.14 * pull * k, lPh: -1.5, lPk: 1.4, lNh: -1.45, lNk: 1.45, lPz: 0.12, lNz: -0.12,
      aPs: -1.35 + 0.8 * pull * k, aPe: -0.55 - 0.15 * lift, aPz: 0.5 + 0.08 * lift,
      aNs: -1.7 + 0.45 * pull * k, aNe: -1.25 + 0.1 * pull, aNz: -0.25, hdX: 0.08, hdY: 0, nkX: 0,
    });
    paddle.visible = true;
    paddle.rotation.set(-(me.armR.rotation.x + me.armR.elbow.rotation.x) - 0.5 + 0.7 * pull * k, 0, 0.05);
    if (spd > 0.5 && s < 0.08 && !boat.dipped) { boat.dipped = true; paddleTip.getWorldPosition(_tip); fx.splash(_tip.x, 0, _tip.z, 0.18); }
    if (s > 0.2) boat.dipped = false;
  }
  function canoeUpdate(dt, t) {
    if (phase === 'init') {
      phase = 'goto'; clearProps(); canoeSpot = pickCanoeSpot(); resetBoat(); stuck = 0;
    }
    if (phase === 'goto') {
      settleY(dt);
      const d = step(boardSpot.x, boardSpot.z, hurry ? 3.8 : 2.7, dt, inWater);
      if (inWater) swimGait(dt); else gait(dt, speedNow);
      apply(dt);
      if (d < 0.5 || stuck > 8) { phase = 'board'; pt = 0; hurry = false; x = boardSpot.x; z = boardSpot.z; }
      return;
    }
    if (phase === 'board') {
      pt += dt;
      const k = smooth(clamp(pt / 1.6, 0, 1));
      const sx = boat.x + Math.sin(boat.yaw) * 0.25, sz = boat.z + Math.cos(boat.yaw) * 0.25;
      x = lerp(boardSpot.x, sx, k); z = lerp(boardSpot.z, sz, k);
      y = lerp(getHeight(boardSpot.x, boardSpot.z), boat.y + SEAT_Y, k) + 0.28 * Math.sin(k * Math.PI);
      heading = turnTo(heading, bowH(), 4 * dt);
      setPose({ py: lerp(0.9, 0.15, k), spX: 0.2 * k, lPh: lerp(-0.5, -1.5, k), lPk: lerp(0.9, 1.4, k), lNh: lerp(0.3, -1.45, k), lNk: lerp(0.4, 1.45, k), aPs: -0.6 * k, aNs: -0.6 * k });
      updateBoat(dt, t);
      apply(dt);
      if (pt > 1.6) { phase = 'launch'; wps = [{ x: cn.x + sea.x * 9, z: cn.z + sea.z * 9 }, canoeSpot]; wpk = 0; setCanoeAway(true); }
      return;
    }
    if (phase === 'launch' || phase === 'back') {
      const w = wps[wpk];
      const d = sail(dt, w.x, w.z, phase === 'launch' ? 2.0 : 2.1);
      paddlePose(dt, boat.v);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (d < 1.6) {
        if (wpk < wps.length - 1) wpk++;
        else if (phase === 'launch') { phase = 'settle'; pt = 0; }
        else { phase = 'dock'; pt = 0; boat.x0 = boat.x; boat.z0 = boat.z; boat.yaw0 = boat.yaw; }
      }
      return;
    }
    if (phase === 'settle') {
      pt += dt;
      boat.v = damp(boat.v, 0, 1.4, dt); boat.x += Math.sin(bowH()) * boat.v * dt; boat.z += Math.cos(bowH()) * boat.v * dt;
      paddlePose(dt, boat.v, true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (pt > 2.4) {
        phase = 'work'; pt = 0; sub = 'cast'; sessionT = rr(26, 36); bob.flying = 0; bob.biteT = 0; waitT = rr(2, 5);
        const h = bowH(), len = rr(7, 10);
        spot = { method: 'canoe', name: 'the lagoon', stand: { x: boat.x, z: boat.z }, face: h, target: { x: boat.x + Math.sin(h) * len, z: boat.z + Math.cos(h) * len } };
        clearProps(); rod.visible = true; newCastTarget();
      }
      return;
    }
    if (phase === 'work') {
      sessionT -= dt; pt += dt;
      boat.v = 0;
      boat.yaw += Math.sin(t * 0.3) * 0.0004;                // drifting a hair on the swell
      rodRoutine(dt, t, true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (sessionT < 0 && sub === 'wait') {
        clearProps(); phase = 'back'; wps = [{ x: cn.x + sea.x * 9, z: cn.z + sea.z * 9 }, { x: cn.x + sea.x * 4, z: cn.z + sea.z * 4 }]; wpk = 0; sub = '';
      }
      return;
    }
    if (phase === 'dock') {
      pt += dt;
      const k = smooth(clamp(pt / 3.6, 0, 1));
      boat.x = lerp(boat.x0, cn.x, k); boat.z = lerp(boat.z0, cn.z, k);
      boat.yaw = boat.yaw0 + wrap(cn.yaw - boat.yaw0) * k; boat.v = damp(boat.v, 0, 3, dt);
      paddlePose(dt, 0.6 * (1 - k), true);
      updateBoat(dt, t); seatTo(); apply(dt);
      if (pt > 3.6) { phase = 'exit'; pt = 0; paddle.visible = false; }
      return;
    }
    if (phase === 'exit') {
      pt += dt;
      const k = smooth(clamp(pt / 1.6, 0, 1));
      const sx = boat.x + Math.sin(boat.yaw) * 0.25, sz = boat.z + Math.cos(boat.yaw) * 0.25;
      x = lerp(sx, boardSpot.x, k); z = lerp(sz, boardSpot.z, k);
      y = lerp(boat.y + SEAT_Y, getHeight(boardSpot.x, boardSpot.z), k) + 0.28 * Math.sin(k * Math.PI);
      setPose({ py: lerp(0.15, 0.9, k), spX: 0.2 * (1 - k), lPh: lerp(-1.5, -0.2, k), lPk: lerp(1.4, 0.2, k), lNh: lerp(-1.45, 0.1, k), lNk: lerp(1.45, 0.2, k) });
      updateBoat(dt, t); apply(dt);
      if (pt > 1.6) { setCanoeAway(false); phase = 'rest'; pt = 0; x = boardSpot.x; z = boardSpot.z; }
      return;
    }
    // resting on the sand, gazing at the lagoon
    settleY(dt); pt += dt;
    heading = turnTo(heading, Math.atan2(sea.x, sea.z) + 0.4 * Math.sin(t * 0.2), 2 * dt);
    speedNow = damp(speedNow, 0, 6, dt);
    setPose({ aPs: 0.1, aPz: 0.1, aNs: -1.0, aNe: -1.9, aNz: -0.3, hdX: -0.05, hdY: 0.4 * Math.sin(t * 0.25), spY: 0.05 * Math.sin(t * 0.25) });
    updateBoat(dt, t); apply(dt);
  }

