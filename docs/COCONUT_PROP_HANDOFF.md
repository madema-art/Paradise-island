# Paradise Island coconut prop polish

Isolated worktree: `D:\ParadiseIsland-Coconut-Workshop` · branch `codex/coconut-props` · baseline `826fedf`. Main checkout, fish systems, GLBs, Blender files and animation clips were not edited. This branch is independent of the autonomous-life/fishing branch.

## Before and after

Before, the flora system drew a lumpy brown ball about 0.52 m wide; survival used another 0.40 m ball with an additional 1.2 drop scale; the monkey loaded a separate coconut GLB, and the castaway held a brown sphere with a small pale blob on top. Open and eaten states were not clearly represented.

After, these immediate coconut surfaces use one shared prop vocabulary: an asymmetric, tapered oval approximately **0.20 × 0.232 × 0.184 m** at unit scale, with restrained fibre grain, warm surface variation and three dark eyes. These are authored gameplay dimensions, not a botanical size claim. Ground fruit is substantially smaller; the old monkey prop was already near this scale, so its size change is modest. The monkey's 1.5 rig multiplier is compensated locally, preserving its existing attachment bone and grip centre. Its normal individual body-size variation still affects the fruit slightly.

Open cups show a cut rim, shell thickness, recessed ivory interior and a small water surface. Split halves have an obvious thick white edible lining. Used shells have a bare tan interior instead. Flesh has a small readability lift in shade, avoiding a black cavity while retaining form and lighting. Whole fruit and falling fruit retain their existing pickup ownership and visibility behavior. Resting coconuts are nudged clear of existing rocks/trunks without consuming any new world placement RNG draws.

## Supported states

| State | Presentation | Current use |
|---|---|---|
| `whole` | Oval husk with fibre grain and three eyes | Environment, crown clusters, falling fruit, inventory pickups, monkey carrying, castaway gathering/cracking |
| `opened` | Smaller drinking opening, shell/flesh lip, recessed cavity and water | Castaway sip phase; first part of classic coconut consumption |
| `half` | One split half with a thick white flesh rim and interior | Monkey eating, castaway breakfast flesh stage, later classic consumption |
| `split` | Two separately named halves, slightly apart | Ready for placement/splitting animation; shown in the review |
| `spent` | Empty shell half with bare tan interior | Ready for future used-shell placement; shown in the review |

Three restrained variants change husk tone and shape slightly. Ground instances also use small size/tone variation without additional RNG draws. Existing green/brown crown colours remain. A separate young green drinking-coconut state was not added.

## Files changed

| File | Purpose |
|---|---|
| `src/coconut.js` | Shared cached geometry/materials, five states, three variants, pivot/anchor contract |
| `src/flora.js` | Smaller crown/ground/falling fruit, matching resting/rolling radius, slight instance variation, collision nudge, inspection tag |
| `src/survival/nodes.js` | Same visual for instanced coconut pickups; restrained existing size variation/drop scale |
| `src/monkey_model.js` | Replace only the attached coconut; preserve `coconut_attach`, near/far rigs, retiering and animation metadata |
| `src/fauna_land.js` | Coconut-only fallback prop and state selection: whole on pickup, half when eating, retain opened state when carrying again |
| `src/monkey_contest.js` | One coconut-specific state copy at contest start so the challenger renders the same whole/opened prize |
| `src/human.js` | Replace the coconut hand prop; whole while cracking, opened while sipping, half during the final breakfast portion |
| `src/survival/avatar.js` | Replace only its coconut hand prop; whole → opened → half over the existing eat action |
| `src/catalog.js` | Ground coconut inspection description |
| `src/main.js`, `src/dev/coconut_review.js` | Explicit opt-in in-world review and deterministic test hook; normal play never loads the review module |
| `tests/coconut.test.js`, `tests/coconut_browser.mjs` | Geometry/state contract and running-game interaction checks |
| `tools/*coconut*.mjs`, `progress.md` | Isolated preview/build, exact baseline comparison and reproducibility notes |

No hunger/thirst values, gathering yields, pickup ownership API, stealing odds, contest decisions, wildlife movement rules, inventory identifiers or saves were redesigned. The legacy `assets/monkey/coconut.glb` is retained on disk; the new monkey prop no longer needs to fetch it. Fallback procedural monkeys are supported by the same factory.

## Animation / object contract for Claude

```js
import { createCoconut, setCoconutState } from './coconut.js';

const coconut = createCoconut({ state: 'whole', variant: 1 });
handBone.add(coconut);
coconut.position.set(0, -.1, .05); // Existing castaway grip offset; tune only to a new rig if needed.
setCoconutState(coconut, 'opened');
```

- Units are metres. Root is `Coconut_prop`, at the whole fruit's centre. Local +Y points toward the opening and +Z is the eye-facing side.
- Named child anchors: `Coconut_grip` at the root, `Coconut_opening` at the current rim, `Coconut_base` at the resting offset. Geometry lives under `Coconut_visual`.
- `setCoconutState` preserves root identity, parent, position, quaternion and scale. Repeating the same state does nothing. It does not add food, remove a world item, play a clip, create debris or persist state.
- `split` contains `Half_left` and `Half_right`. For two animated hands, use two `half` props or reparent those halves with world transforms preserved; do not force the pair into one hand attachment.
- The monkey attaches at the existing `coconut_attach` bone. Its local `1 / MONKEY_SCALE` compensation is intentional. Near/far skeletons keep the current state and visibility contract. Retiering builds a prop in the current state.
- A pickup explicitly resets the new fruit to whole. Eating changes it to a half. Carrying a disturbed half does not reconstruct the husk; contests copy the held appearance to the challenger.
- Resources are shared across all props. Do not dispose shared geometry/materials when discarding one coconut object. Remove the prop/group instead. Mesh and anchor names are stable for future animation binding.
- The shared factory is presentation only. Existing gameplay continues to own depletion, inventory, rewards and consume timing. Split/spent props are available for animation, but there is no new shell-remains inventory or persistent debris system.

Geometry remains small: whole fruit is under 600 triangles, the distant crown version is 100 triangles, split pairs are under 2,000. Stationary ground fruit and classic pickups remain instanced. The 128² fibre texture, geometries and materials are cached; there are no extra asset requests or per-frame textures. Close opened props use several small meshes for distinct shell/flesh surfaces.

## Running and checking

The isolated preview is port **8768**, separate from the main game and life workshop. It serves static files and read-only notebook data; notebook mutations are rejected.

```powershell
Set-Location 'D:\ParadiseIsland-Coconut-Workshop'
node tools/build-coconut-preview.mjs
node tools/serve-coconut-preview.mjs
```

Open `http://127.0.0.1:8768/?coconutReview&noauto`. The review puts the old ground ball and all new states into the actual island scene, with human and monkey grip examples. Buttons choose gallery, human, monkey or an actual ground pickup. Lighting, models and the world are the running game. `&coconutStep` is the deterministic automation variant; use the URL without it to watch the world normally.

For a normal game without the art fixtures, use `http://127.0.0.1:8768/`. The new coconut visuals are active there. Ground fruit can be selected with the existing object inspection system.

Verification commands:

```powershell
node tools/build-coconut-preview.mjs --unit
node --test work/coconut-unit.mjs
node tools/build-coconut-before.mjs
node tests/coconut_browser.mjs
```

With ordinary intact project dependencies, the unit source can also run as `node --test tests/coconut.test.js`, and normal `npm run build` remains unchanged. The preview build helper supports a private dependency install under `work/deps/node_modules`; it currently uses that private install because the main dependency folder changed during the task. No npm install was performed through the junction into the main checkout. Recreate the private install by copying package.json/package-lock.json to `work/deps` and running `npm ci` in that directory if necessary.

The browser comparison builds baseline coconut callers from exact commit `826fedf`, retaining only the opt-in review harness. It compares palm placement and wildlife count, captures old/new world props and held states, checks near/far monkey visibility/state, exercises exclusive ecosystem pickup ownership, runs a real monkey pickup/carry/eat path and coconut contest state transfer, runs castaway coconut gathering/cracking/sipping through the existing mind, and runs classic gather/eat inventory and food/water rewards. Review actors are explicitly posed examples; the separate behavior checks execute the existing gameplay controllers. The browser test uses this machine's installed Playwright location, which must be configured on another machine.

Evidence lives in `work/coconut-test/`; delivery copies include the state gallery, before/after ground, human/monkey grips and JSON results. The existing duplicate `owl` key warning in audio.js is unrelated and remains unchanged. The generic develop-web-game client was run in addition to the dedicated scenario; screenshots were inspected, including rejected captures where foliage or water hid the subject. Final evidence must show the actual props and characters clearly.

## Remaining limits

- No new eating, cutting, pouring or splitting clips were authored. Existing poses/clips now show the appropriate prop states. Detailed hand contact and opening-to-mouth alignment should be polished against Claude's forthcoming castaway rig.
- Breakfast still uses the existing sip/eat pose and combined reward timing. Its last portion now shows a flesh half; this does not claim a new spoon/scraping or chewing animation.
- Split pairs and spent shells are ready assets, not a new player splitting command or persistent litter system. No new food quantities or shell inventory were invented.
- The states are visual and are not serialized as an independent item ledger. Future canonical item-state persistence should be introduced by the gameplay owner, without duplicating existing coconut ownership.
- The ground system now avoids existing collider overlap when placing resting fruit. Falling physics remains the existing lightweight bounce/roll implementation; it is not a new rigid-body solver.
- The review uses procedural static supports and examples, not changes to normal environment structures. Do not merge the review fixtures into normal boot.

## Integrate safely

Do not copy this checkout over `D:\Paradise Island` or reset Claude's branch. Review/cherry-pick this task's commit after Claude checkpoints his current work, preferably in another integration worktree. Resolve only the coconut attachment/state hunks in `human.js`, `fauna_land.js`, `monkey_model.js` and `survival/avatar.js`; keep his new rig and animation work. The `main.js` change only installs the opt-in review. No fishing milestone commit is required.

If a future rig supplies its own coconut meshes, bind the shared state contract at that rig's hand/prop socket or adapt the anchors. Avoid restoring the old 0.26 radius to make it fit an old clip. Test all states at unit scale beside both castaway and capuchin, then tune the socket offset rather than the asset's world size.

Notebook read: revision 49, zero ready notes. Three open notes concern boa motion/size, boa tree resting and barn-owl proportions; none were changed as part of this coconut task.
