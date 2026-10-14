# Autonomous island life — milestone 1

Implemented and exercised in the isolated worktree `D:\ParadiseIsland-Life-Workshop`, branch `codex/autonomous-comfort`, based on commit `d9088a6`. The main `D:\Paradise Island` checkout, creature/model files, resizing work and active server were not edited. No merge or push was performed.

## Working behavior

When fed, rested and safe during daylight, the existing castaway mind can choose **A personal evening fire** for comfort and accomplishment. He finds a valid site near his camp, gathers the actual wood/stone resource instances, walks to the site, visibly works for four seconds, constructs the existing Survival Mode campfire mesh, spends a further stick on fuel, and sits to enjoy the result. Completion raises happiness by 0.16, comfort by 0.30 and fulfillment by 0.25, once.

Prerequisites are the existing level-1 campfire recipe (5 sticks and 4 stones) plus 1 fuel stick. The project does not grant itself materials, fake a completed building, spawn a second castaway, or use a prerecorded scene. Pickups disappear through `Resources.take`, construction consumes inventory through a shared transaction, and the fire burns down through `Structure.update`.

The observation save `paradise.observation.life.v1` stores inventory, resource depletion/regrowth offsets, the fire's location/fuel, project completion, needs and its own clock. The classic save key `paradise.survival.v1` is unchanged. Reload restores the structure and prevents repeating the completed project. Gathering, construction and enjoyment can be interrupted; unfinished animation time is discarded, while already gathered materials and completed construction remain. Urgent mind decisions and entering Survival Mode pause the project. A blocked target triggers a cooldown instead of a tight retry loop. Local routes avoid terrain/circular colliders; both routing and travel have finite budgets.

Observation hunger drain is reduced from 0.042 to 0.022 per game hour. Eating, drinking, fishing, hunting, cooking and sleep still use the existing decision/action sequences. Classic Survival Mode hunger/thirst/energy rates and progression remain unchanged. Comfort and fulfillment are initial persistent signals for this one project; this milestone does not yet implement a general preference or construction-project system.

## Trace of the existing systems

| System | Actual implementation and dependencies | Use in this milestone |
|---|---|---|
| Observation decisions | `castaway_mind.js`: utility scores; activity budgets; food/fatigue/boredom/happiness; session practice; immediate boar, rain and critical-need interruptions | Add one activity to this mind; retain the scheduler and existing activities |
| Observation execution | `human.js`: per-activity phase machines, `step`/`settleY`, rig poses, held props and ecology callbacks | Use the same castaway, locomotion and pose interfaces for walking, gathering, work and sitting |
| Fishing and meals | Observation fishing stores a session-local `caught` array; camp phases animate cooking/eating and call `mind.ate`. Rat hunting also uses real ecology callbacks | Preserved. Existing observation fish are **not yet** converted into survival `rawFish` inventory |
| Gathering | Survival `gatherNode`, timed action completion, `Resources.take`, yields, XP and pickup sound. Resource meshes are instantiated by `Resources.build` | Both modes now call the same `gatherResource` transaction. Observation has a separately saved instance of the existing resource system |
| Tools/crafting | `RECIPES`, levels, ingredient checks, timed craft work, item/tool grants and durability. Classic actions depend on `Avatar`, HUD, input and player state | Shared affordability/spend/reward helpers; classic axe crafting and durability checked in browser. Autonomous rope/tool crafting is a next step |
| Construction | `canPlace`, `BUILD`, `Structure`, ghost placement and player-facing input. Classic placement spends costs and awards XP | Shared construction transaction, actual placement predicate, mesh, fuel, serialization and updates. Autonomous execution supplies the work timer instead of the player ghost/input |
| Cooking/drying | `cook` converts inventory raw fish/crab/clams into cooked items at action completion; racks hold timed slots. Target availability comes from `collectActions` | Reusable next, with an autonomous inventory and lit-fire/rack target adapter. Not wired to observation meals in this milestone |
| Other survival actions | Chop timber, shake palms, drink/refill, spear/catch crabs, fish, rack work and sleep depend on tools, avatar animations, target collection, HUD and/or key input | Preserved. These methods cannot safely be called wholesale on the AI as if it were a player |
| Persistence | Classic `serialize`/`applySave`, resource snapshots, serialized structures, localStorage version 1 | Classic schema retained; a separate observation store avoids altering player saves |
| Observation controls | `main.js` frame/update pipeline; camera follow, free/orbit/walk modes; H shows UI, castaway heading follows; P pauses; Survival suspends the AI | Preserved; project pauses with the observation clock. Follow, pause and survival return exercised in browser |

`src/survival/mechanics.js` is the shared seam. It has no renderer, HUD, input or new AI scheduler. Classic timing/presentation stays in `survival/game.js`; the observation adapter lives in `comfort_life.js`. `comfort_project.js` is one small resumable project; `project_path.js` supplies bounded local ground routes for its walks only.

## Verification

- Eight Node tests cover complete planning/execution, exact material costs, one-time rewards, interrupted gathering/construction/enjoyment, restoration, stale targets, missing resources, changed placement, unsafe work, travel timeout, bounded route failure, recipe skill gates, classic rewards, and mind danger preemption.
- Separate headless Chromium runs load the real bundled island and all normal wildlife. The activity completes with actual resource depletion, a lit fire and spent inventory. Browser tests check completion after reload, one restored structure, interruption by switching modes, and classic axe crafting with 28 durability.
- Observation camera-follow and P pause are checked using the existing controls. The creature registry retains 229 non-castaway entries in this snapshot. Wildlife source and asset files are unchanged; this is a smoke check, not an exhaustive ecological soak test.
- The bundled develop-web-game Playwright client was also run. The dedicated browser scenario handles the island's asynchronous model boot, then advances its actual update pipeline and captures gathering/completion screenshots and JSON state.
- A repeated run exposed unreachable pickups and a shallow-water initial position. Work targets now check colliders, the project has bounded local routing, and an initial project starts at valid dry ground. No teleport is used to complete an ongoing project.
- The build retains a pre-existing duplicate `owl` property warning in `src/audio.js`; that unrelated file was not changed.

Run pure tests with `node --test tests/comfort_project.test.js`. Build the isolated checkout with the normal `npm run build` or the supplied preview builder. The isolated static preview is on port 8767; its notebook endpoint reads the worktree snapshot and rejects writes. It does not use the main server or main notebook.

## What remains

This is one complete project, not a general autonomous crafting/construction planner. There is no new bath/hygiene system, resource economy across both modes, general task graph, evolving preference learner, or long-term project selection. Existing observation meal/fish inventory remains separate from this new supply inventory. The resource instances and saves are isolated between modes; sharing a canonical resource/structure ledger is later work. Fires expire naturally and the finished project is not automatically rebuilt or repeatedly rewarded. Ongoing maintenance/stoking is also later work.

The local route helper deliberately rejects some otherwise traversable or distant routes, and bounds search to 2,400 expansions plus a small margin. It is not a whole-island navmesh. Failed routes wait and let ordinary life continue. Construction does not yet clear vegetation or account for every non-colliding decorative plant. No resizing or art changes were made.

Suggested next sequence:

1. Feed actual observation catches into the shared inventory, then reuse cooking transactions at a real lit fire. Preserve the existing fishing and meal animations.
2. Add rope/rod/rack prerequisites through the same transactional interface, including tool wear and unavailable-resource handling. Use earned XP rather than granting levels.
3. Add a few chosen projects with comfort/curiosity/entertainment rewards and remembered preferences. Extend the existing utility selection and resumable project interface before considering another AI framework.
4. Introduce shared ownership/site accounting if player and autonomous construction should coexist in one persistent world. Reconcile the two save domains explicitly rather than silently overwriting classic progress.

## Integration handoff

Review/cherry-pick the `codex/autonomous-comfort` commit when Claude's current work is safe to combine. It changes four existing source files and adds the shared mechanics, observation adapter/project, local route helper, tests and this report. No model/creature/asset files or classic save schema are changed. `human.js` and `main.js` may need a normal textual merge if Claude has edited those files since `d9088a6`; do not replace Claude's whole files with the worktree snapshot. Rebuild the bundle after applying source changes.

The isolated preview is a working integration of the game, but has not been merged into the active `D:\Paradise Island` checkout. To observe it in real time, open `http://127.0.0.1:8767/`, press H and click **The Castaway** heading. The normal dawn/sleep schedule still applies. `?lifeReview&noauto` is an opt-in deterministic test hook, not the normal play URL.
