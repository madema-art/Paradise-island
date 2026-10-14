// Who lives with whom: the island's rats, barn owls and Pacific boas find each other through this registry. Rats are prey for the owls, the boas, the
// boars and the castaway; a rat that is caught is held by its captor until it is eaten, then it is gone until a new one is born in its burrow.
export const eco = {
  rats: [], owls: [], boas: [], burrows: [],
  /** the coconut system (flora.js), for the monkeys and the castaway to race over */
  coconuts: null,
  /** true while the castaway is creeping up on a rat: rats are then wary only of a much shorter distance */
  stalking: false,
  /** the nearest live rat that is out in the open (not in its burrow, not already caught) within r of (x, z) */
  ratNear(x, z, r, pred = null) {
    let best = null, bd = r;
    for (const t of this.rats) {
      if (!t.exposed()) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd && (!pred || pred(t))) { bd = d; best = t; }
    }
    return best;
  },
};
