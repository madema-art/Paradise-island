// Renderer-only offset for the higher-quality canopy. No AI, animation, population
// or asset changes. Stage registration after the existing skin/part merge passes.
import { creatures, updaters } from './core.js';
import { createBoneRenderPruner } from './bone_render_prune.js';

export const rigRenderPruner = createBoneRenderPruner();
export const rigRenderStats = { roots: 0, maxBuildStepMs: 0, buildMs: 0 };
rigRenderPruner.set(true);
let elapsed = 0, cursor = 0;
updaters.push(dt => {
  elapsed += dt;
  if (elapsed < 8 || cursor >= creatures.length) return;
  const start = performance.now();
  while (cursor < creatures.length) {
    const root = creatures[cursor++].group;
    if (root) { rigRenderPruner.add(root); rigRenderStats.roots++; }
    if (performance.now() - start >= .5) break;
  }
  const ms = performance.now() - start;
  rigRenderStats.buildMs += ms;
  rigRenderStats.maxBuildStepMs = Math.max(rigRenderStats.maxBuildStepMs, ms);
});
