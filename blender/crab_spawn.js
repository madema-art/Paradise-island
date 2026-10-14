  // crabs: red beach crabs and tiny ghost crabs on the sand, hermits wandering the upper beach, big coconut crabs under the palms
  const crabs = [];
  const placeCrabs = (kind, count, rmin, rmax) => {
    const K = CRAB_KINDS[kind];
    for (let n = 0, t = 0; n < count && t < 4000; t++) {
      const a = rnd() * TAU, r = rr(rmin, rmax), x = Math.cos(a) * r * 1.0, z = Math.sin(a) * r * 0.8 + 5, h = getHeight(x, z);
      if (h > K.h[0] && h < K.h[1] && (kind !== 'coconut' || getSlope(x, z) < 0.35)) { crabs.push(new Crab(crabs.length, { x, z }, kind)); n++; }
    }
  };
  placeCrabs('red', 8, 60, 170); placeCrabs('ghost', 6, 60, 175); placeCrabs('hermit', 5, 60, 170); placeCrabs('coconut', 3, 40, 150);
