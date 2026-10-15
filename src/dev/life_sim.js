// Development only (open the game with ?sim=1): a fast-forward harness for long observation tests of the castaway's life.
//   window.__sim.run(ms)   steps the simulation flat out for about ms of real time and returns a report
//   window.__sim.reset()   clears the counters
// It stops the page's own animation loop (so nothing renders while it runs) and watches for stalls: the same activity and phase for
// longer than 3 game hours is recorded in `stalls`. Nothing here forces an animation or a decision.
import { creatures } from '../core.js';

export function startLifeSim() {
  const S = { hist: {}, quests: [], stalls: [], timeline: [], steps: 0, key: '', keyAt: 0, lastQ: '', hungerMin: 1, happyMin: 1, energyMax: 0, byQuest: {} };
  const cast = () => creatures.find((c) => c.id === 'castaway');
  window.__sim = {
    reset() { Object.assign(S, { hist: {}, quests: [], stalls: [], timeline: [], steps: 0, key: '', keyAt: 0, lastQ: '', hungerMin: 1, happyMin: 1, byQuest: {} }); },
    run(ms = 25000, compact = false) {
      window.requestAnimationFrame = () => 0;
      const c = cast(), mind = c.sim, lf = window.__castaway.life; let err = null;
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < ms) {
          window.__step(0.05); S.steps++;
          const a = mind.current && mind.current.act; S.hist[a] = (S.hist[a] || 0) + 1;
          S.hungerMin = Math.min(S.hungerMin, 1 - mind.needs.hunger); S.happyMin = Math.min(S.happyMin, mind.needs.happy);
          if (S.steps % 100 === 0) {
            const st = window.__castaway.state(), key = st.act + '/' + st.phase;
            if (key !== S.key) { S.key = key; S.keyAt = S.steps; S.timeline.push([+mind.clock.toFixed(1), key]); if (S.timeline.length > 80) S.timeline.shift(); }
            else if (S.steps - S.keyAt === 1500) S.stalls.push({ clock: +mind.clock.toFixed(1), st, desc: c.desc.slice(0, 70) });
          }
          if (S.steps % 20 === 0) {
            const q = lf.quest, k = q ? q.kind + '#' + q.id : '';
            if (k !== S.lastQ) { S.lastQ = k; if (q) { S.quests.push([+mind.clock.toFixed(1), q.kind, q.why]); S.byQuest[q.kind] = (S.byQuest[q.kind] || 0) + 1; } }
          }
        }
      } catch (e) { err = String(e.stack).slice(0, 600); }
      const d = lf.debug(), sm = mind.summary();
      if (compact) return { err, day: +(mind.clock / 24).toFixed(2), steps: S.steps, share: Object.fromEntries(Object.entries(S.hist).map(([k, v]) => [k, +(v / Math.max(1, S.steps) * 100).toFixed(1)])), stalls: S.stalls.length, bars: sm.bars, survived: sm.survived, quests: d.stats, last: S.quests.slice(-3), stored: d.stored, creations: d.creations.length, built: d.built, designs: d.designs.length };
      return {
        err, day: +(mind.clock / 24).toFixed(2), steps: S.steps, share: Object.fromEntries(Object.entries(S.hist).map(([k, v]) => [k, +(v / Math.max(1, S.steps) * 100).toFixed(1) + '%'])),
        stalls: S.stalls, bars: sm.bars, survived: sm.survived, lowestEver: sm.lowest, quests: d.stats, questLog: S.quests.slice(-12), stored: d.stored, creations: d.creations, built: d.built, designs: d.designs,
        skills: d.skills, places: d.places, discoveries: d.discoveries.length, keepsakesLeft: d.keepsakesLeft, instances: d.instances, recent: d.recent.slice(-5),
      };
    },
    state: () => window.__castaway.state(),
  };
}
