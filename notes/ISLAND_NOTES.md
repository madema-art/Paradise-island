# Island Notes — Paradise Island development notebook

This file is generated from `notes/island-notes.json` every time the notebook is saved. Edit notes in the game (Notebook tab), not here.

Revision 48 · updated 2026-10-14T15:47:18.870Z · 2 open, 21 done.

**Only notes marked Ready for Claude are implemented automatically.** An open note is waiting for the owner's approval: do not implement it, and do not change its status. Claude implements a ready note, checks it in the game, then marks it done. If a ready note cannot be finished, leave it ready and write why in its blocker.

## Open (2)

- **Pacific boa** — scope species `species:Pacific boa`
  - movement doesnt look right. size seems small unless its a juvenille. i want giant snakes because they've been feeding on a huge rat popluation
  - id `nmv8a7bswe192f1`, created 2026-10-14T15:45:29.984Z, updated 2026-10-14T15:45:29.984Z
- **Pacific boa (boa1)** — scope creature `creature:boa1`
  - should spend more time in the trees curled around branches
  - id `nmv8a9nti201b39`, created 2026-10-14T15:47:18.870Z, updated 2026-10-14T15:47:18.870Z

## Done (21)

- **Coconut palm** — scope object `obj:palm:15.1,66.5`
  - Palm fronds look too uniform and the trunk rings are too regular; vary the frond length and add a lean.
  - Resolution: makePalm (src/flora.js): each frond now has its own length (some short, some long), droop, leaflet width and azimuth jitter; the trunk leans harder (per-palm lean strength) with an S-bend, uneven ring spacing, random ring colours and radius jitter. All new variation uses a local seeded generator so world placement and object ids are unchanged. Built and checked in the game.
  - id `nmv6qtgrx97686c`, created 2026-10-13T13:55:04.365Z, updated 2026-10-13T18:27:08.268Z
- **Stream** — scope object `obj:stream`
  - This water is flowing in the wrong direction: it should run downhill from the cliff lip to the pool.
  - Resolution: Root cause: the stream shader scrolled its pattern by flow*time, which shears without limit wherever a stream speeds up or slows, so after a few minutes the water crawled upstream. Replaced with a two-phase flow map plus bright streaks that slide downstream. Verified by measuring pattern motion: it now moves along the flow in the streams and downward on the falls.
  - id `nmv6qy0ay8d239e`, created 2026-10-13T13:58:36.298Z, updated 2026-10-13T20:38:56.503Z
- **Bottlenose dolphin (offshore-pod-2-dolphin5)** — scope creature `creature:offshore-pod-2-dolphin5`
  - make more porpoising and arcing breaches, with smooth parabolic flight trajectories, realistic body rotation, and seamless nose-first water reentry.
  - Resolution: Dolphin leaps rewritten (Dolphin.launch/update in src/fauna_sea.js). Full breaches are now clean ballistic arcs (take-off climb 7.4-9.6 m/s) and the body follows its velocity, so it leaves the water nose-up, levels at the top and re-enters nose-first (the old pitch sign tipped the nose down while rising). About a third add a full twist about the long axis. New porpoising: every 40-80 s the leader starts a run of 3-6 fast, low arcs that the pod takes up one beat apart. Checked over a simulated day: about 470 low arcs and 46 breaches, no errors; checked the take-off pose in a rendered frame.
  - id `nmv6r08s7cbbac4`, created 2026-10-13T14:00:20.599Z, updated 2026-10-14T13:41:24.449Z
- **Area around Lagoon** — scope location `loc:-75,-140`
  - Still water near the reef: a good place for a canoe or a fishing spot.
  - Resolution: Added the still shallows by the reef (around -75,-140) as a place for the castaway: a spear-fishing spot called "the reef lagoon" (wades in and stalks fish) and a hiking destination of the same name (src/human.js). He fishes the nearest few spots, so he uses it when he is on that side of the island. Canoe fishing stays in Pearl Cove, whose route code is tied to the canoe beach.
  - id `nmv6r5jo2bc2388`, created 2026-10-13T14:04:27.986Z, updated 2026-10-14T13:41:24.464Z
- **Jetty** — scope object `obj:dock`
  - remove this structure
  - Resolution: Jetty removed (src/props.js): no planks, posts or walkable surface. The castaway no longer fishes from it and the canoe route no longer avoids it (src/human.js); the terns now rest on the beach where the posts were (falls.perches, src/fauna_sea.js); catalogue entry and wood-step tag removed. The jetty still draws its old random numbers, so every other object keeps its place and id. Built and checked in the game.
  - id `nmv6yi4u3abc269`, created 2026-10-13T17:30:12.603Z, updated 2026-10-14T13:41:24.469Z
- **Sea eagle (eagle0)** — scope creature `creature:eagle0`
  - i watched him fly for a full 24 hrs and it never dove
  - Resolution: Sea eagle now makes real stoops (Eagle.startStoop/stoop in src/fauna_sea.js). Every 70-130 s (first one within 30-60 s) it picks open water within reach, falls steeply from altitude with the wings folded, skims the surface with a splash, then climbs and rejoins its patrol circle. Previously it only dipped about 48 m from 150 m up and never reached the water. Checked over a simulated day: 6 stoops, lowest point at the sea surface, no errors.
  - id `nmv75t0fe56579b`, created 2026-10-13T20:54:37.418Z, updated 2026-10-14T13:41:24.475Z
- **Mirror Lake** — scope object `obj:lake`
  - the edge of mirror lake shouldnt overhang the plateut also make it look more like a lake, less like a perfect circle
  - Resolution: Mirror Lake now has an irregular shoreline (src/world.js: LAKE.shape, lakeRho): a lumpy outline with bays and points, pulled back from any place where the plateau falls away, so the water always sits inside a bank. The water mesh (src/water.js), swimming and wading checks (walk.js, ripples.js) and the shore colouring (terrain.js) all follow the new shoreline instead of a circle. Checked that no water is drawn outside the shoreline.
  - id `nmv84ktcsf143cc`, created 2026-10-14T13:08:01.564Z, updated 2026-10-14T14:06:51.552Z
- **Area around Volcano slopes** — scope location `loc:40,-55`
  - i dont want to see any active magma/lava on the side of the mountian. also, the climb to the top should be all natural rock climb. no rope or man-made grips and footholds
  - Resolution: Volcano: no active lava on the mountainside. The glowing flow ribbons, the flow light, the steam where flows met the sea and the molten-crack shader on the upper cone are gone (src/volcano.js, terrain.js); the old channels remain only as cold dark basalt, and only the crater lake is molten. The climb is bare rock: the painted holds, red markers, pitons, fixed rope and rope coil are gone (src/ascent.js), replaced by the mountain's own basalt knobs, flakes, ledges and footholds along the line. Prompts and text updated (survival actions, climb messages, README).
  - id `nmv84mcvt2e1356`, created 2026-10-14T13:09:13.529Z, updated 2026-10-14T14:06:51.556Z
- **Naupaka** — scope object `obj:naupaka:-130.5,-47.8`
  - the naupaka design needs a major upgrade. its too low poly right now
  - Resolution: Naupaka redesigned (new src/naupaka.js): pale woody stems that branch, a rosette of thick, glossy, spoon-shaped leaves folded along the midrib at every twig tip and along the stems, white half-flowers in the axils, clusters of white berries, and a dense core so the mound has mass. About 6k triangles a shrub against about 1k before. The shrubs' nectar flowers still work for the lorikeets. It uses its own seeded generator and spends the same random draws as before, so every placement and object id is unchanged.
  - id `nmv8523eif5023b`, created 2026-10-14T13:21:27.738Z, updated 2026-10-14T14:06:51.560Z
- **Naupaka** — scope class `class:naupaka`
  - same not applies to all naupaka. currently too low poly. needs redesign/upgrade
  - Resolution: Same change as the single naupaka: every naupaka on the island (beach shrubs and the motu islets) uses the new design.
  - id `nmv852s1md2b6ee`, created 2026-10-14T13:21:59.674Z, updated 2026-10-14T14:06:51.564Z
- **Galleon wreck** — scope object `obj:wreck`
  - this is the original boat design. needs a redesign to look much more realistic. i want it to look like a 400 year old pirate shipwreck. sails would not still be intact
  - Resolution: Galleon wreck redesigned as a four-hundred-year-old treasure galleon (new src/wreck.js): the planking has rotted off in patches leaving the ribs standing, gun ports gape along the hull, a breach opens the port side, the stern castle has collapsed with empty windows and a broken stern gallery, three masts are snapped to splintered stumps, the bowsprit is a stub, and there are no sails at all (only a few black strands of rigging). Barnacles and coral crust the submerged planks, algae trails from the waterline, and cannon, an anchor, barrels, a spilled chest, loose timbers and a fallen yard lie around it. She is heeled over and hung up on a sandbank so the port side stands clear of the water. Same random draws spent as before; no ids moved.
  - id `nmv8577nnae9eea`, created 2026-10-14T13:25:26.531Z, updated 2026-10-14T14:06:51.568Z
- **Boulder** — scope class `class:rock`
  - boulders need an update. they are currently too low poly. add more size and shape variety. and allow for the castaway, monkeys and birds to be on top of them
  - Resolution: Boulders rebuilt (new src/rocks.js): nine shapes (rounded, flat, cobble, two fractured blocky types, slab, pillar, jagged, pile), each 320-720 faces instead of 80, with strata-banded colour and a flat buried base, in a wider size range (0.35 to 3.0). Each setting draws its own mix (rounded stones at the river, fractured blocks on cliffs and the volcano). Crowns that are high and wide enough are now perches (src/world.js perches): the castaway climbs onto a boulder to sit and take in the view, monkeys hop up to sit, look about and eat, and gulls and terns rest on them. Placement and ids unchanged.
  - id `nmv85r831d72aec`, created 2026-10-14T13:41:00.205Z, updated 2026-10-14T14:06:51.572Z
- **Great frigatebird** — scope species `species:Great frigatebird`
  - apply the new great frigatebird design from codex
  - Resolution: Applied the new great frigatebird from Codex (Documents/Codex/2026-10-13/6/outputs/frigatebird): three rigged Blender models (male with inflatable throat pouch, female, juvenile; 39 bones, 15 clips) in assets/, with the Blender source and build script in blender/frigatebird/. New src/frigatebird.js and frigatebird_model.js replace the old procedural frigatebird: a colony of four roosts in palm crowns that perch (idle, alert, preen), display (the male inflates his pouch), take off into the wind, soar on thermals, glide out over the ocean, stoop and snatch fish from the surface without touching the water, recover, sometimes chase a gull, then return and land. Field Guide shows plumage, behaviour and surface catches. Verified over a simulated day: all eleven behaviours occur, birds feed and land repeatedly, no errors. It uses its own random generator, so the island is unchanged.
  - id `nmv85x213508879`, created 2026-10-14T13:45:32.295Z, updated 2026-10-14T14:17:37.608Z
- **Waterfall** — scope object `obj:falls#1`
  - the grotto entrance doesnt look right. can see cracks in the ceiling showing whats above. camera jumps out of the cave when going further in.
  - Resolution: Two causes. (1) The ceiling cracks: the cliff terrain is single-sided, so from inside the cave it was invisible and any gap in the cave shell showed the waterfall and trees overhead. The terrain is now double-sided (src/terrain.js, with shadows unchanged), so the underside of the cliff shows as solid dark rock; checked with the shell hidden: no world visible overhead. (2) The camera jumping out: the free camera only counted a 9.5 m sphere at the door as "inside the grotto" and pushed itself above the cliff surface everywhere deeper in. It now uses the cave's real footprint (inCave in src/world.js), also used for the rain: tested 80 positions spread through the halls and none is pushed out. This was entered twice; both notes are resolved by this change.
  - id `nmv85ztbm9725e4`, created 2026-10-14T13:47:40.978Z, updated 2026-10-14T14:17:37.612Z
- **Waterfall** — scope object `obj:falls#1`
  - the grotto entrance doesnt look right. can see cracks in the ceiling showing whats above. camera jumps out of the cave when going further in.
  - Resolution: Two causes. (1) The ceiling cracks: the cliff terrain is single-sided, so from inside the cave it was invisible and any gap in the cave shell showed the waterfall and trees overhead. The terrain is now double-sided (src/terrain.js, with shadows unchanged), so the underside of the cliff shows as solid dark rock; checked with the shell hidden: no world visible overhead. (2) The camera jumping out: the free camera only counted a 9.5 m sphere at the door as "inside the grotto" and pushed itself above the cliff surface everywhere deeper in. It now uses the cave's real footprint (inCave in src/world.js), also used for the rain: tested 80 positions spread through the halls and none is pushed out. This was entered twice; both notes are resolved by this change.
  - id `nmv8605de3b14ca`, created 2026-10-14T13:47:56.594Z, updated 2026-10-14T14:17:37.616Z
- **Area around Open sea** — scope location `loc:-190,-25`
  - i love the way the water from the waterfull is distinguishable from the ocean water at the outlet. however it looks like a chemical spill. this one and the one by the cove
  - Resolution: River plume at sea outlets recoloured and softened (src/water.js): pale jade fading to turquoise and the sea blue, graded edge, no hard foam line or olive tint. Checked in a render of the Tide Cascade outlet (the cove uses the same shader, not separately rendered).
  - id `nmv87p1am385956`, created 2026-10-14T14:35:17.326Z, updated 2026-10-14T15:07:16.511Z
- **Banyan** — scope class `class:banyan`
  - the tops of the banyan trees are too low poly
  - Resolution: Banyan crowns rebuilt (src/flora2.js): smoother lobes plus thousands of glossy fig leaves grown from the lobe surface, own seeded generator so placement is unchanged. Checked in a render of a crown from above; leaf density tuned once more after that render and not re-rendered.
  - id `nmv87qe924d1676`, created 2026-10-14T14:36:20.774Z, updated 2026-10-14T15:07:16.520Z
- **Area around Volcano slopes** — scope location `loc:75,-70`
  - remove the red flag from the top of the volcano
  - Resolution: Summit flag and pole removed (src/ascent.js); the cairn stays. Built; not re-rendered at the summit.
  - id `nmv87rakt618b21`, created 2026-10-14T14:37:02.669Z, updated 2026-10-14T15:07:16.525Z
- **Area around Lagoon** — scope location `loc:25,115`
  - the jellyfish are too large. i love the idea of biolumineschent jellyfish though. lots of them especially at night. off the coast a little ways. actually the dolphins and other aquatic creatures can travel farther from the shoreline
  - Resolution: Old 10 big jellyfish replaced by small ones (bells 20-35 cm) in glowing schools offshore (src/fauna_sea.js). Dolphins now roam to ~330 m and the manta ranges wider. Night render checked for the jellyfish.
  - id `nmv87tuzc9a308e`, created 2026-10-14T14:39:02.424Z, updated 2026-10-14T15:07:16.530Z
- **Area around Lagoon** — scope location `loc:25,115`
  - schools of bioluminescent jellyfish
  - Resolution: 8 schools of ~20-30 bioluminescent jellyfish (191 total), pale by day, rising and glowing blue/cyan/violet at night, one instanced mesh. Checked in a night render.
  - id `nmv87w2ps765ea5`, created 2026-10-14T14:40:45.760Z, updated 2026-10-14T15:07:16.535Z
- **Bottlenose dolphin** — scope species `species:Bottlenose dolphin`
  - dolphin breaching should have more of an arch. by that i mean more arch in the dolphin body.
  - Resolution: Breach arch added: spine bones bend the body into an arch over each leap (deeper for full breaches, shallow for porpoising), src/fauna_sea.js. Measured in game (arch 1.14 rad at apex, four spine joints driven); I could not get a clean screenshot of the mid-air pose, so the look is not visually confirmed.
  - id `nmv8831xdf03af8`, created 2026-10-14T14:46:11.329Z, updated 2026-10-14T15:07:16.540Z
