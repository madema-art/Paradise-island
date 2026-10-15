// Visibility only prunes renderer traversal; Object3D matrix updates and Skeleton
// evaluation do not depend on Bone.visible. Never prune branches with drawables.
import { createBoneRenderPruner } from '../../src/bone_render_prune.js';
export function boneRenderTrial(root) { const trial = createBoneRenderPruner(); trial.add(root); return trial; }
