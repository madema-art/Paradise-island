# The castaway's life: drives, goals, memory and what he leaves behind

Survival (food, energy, shelter, a drink now and then) is the foundation. On top of it the castaway has psychological drives that decide what he does with the rest of his
day, and what he does changes the island. The code is `src/castaway_life.js` (drives, goals, plans, keepsakes, creations, memory), the `quest` activity in
`src/castaway_mind.js`, and the quest runner, clip picker, gestures and face in `src/human.js` and `src/castaway_new.js`.

```
NEEDS (food, energy, happiness; Codex's comfort project)  ->  DRIVES  ->  GOALS  ->  PLANS  ->  ACTIONS  ->  ANIMATIONS  ->  OUTCOMES  ->  MEMORIES
```

## What was reused from Codex

Reviewed: `codex/autonomous-comfort` (worktree `D:\ParadiseIsland-Life-Workshop`), `docs/AUTONOMOUS_LIFE_MILESTONE_1.md`, `docs/AUTONOMOUS_FISHING_MILESTONE_2.md` and `progress.md`.

| Question | Answer from Codex's work (commit 43f4208, merged here) |
|---|---|
| Needs | food, fatigue, boredom, happiness (existing), plus `comfort` and `fulfillment` raised by the evening fire |
| Motivation priority | the existing utility scores in `castaway_mind.js` (urgent needs and danger interrupt; budgets keep him at a task) |
| Goal selection | utility choice among activities; Codex added one, `project` (a personal evening fire) |
| Multistep plans | `ComfortProject`: gather, build, fuel, enjoy; each a timed job with a bounded route |
| Interruptions | `project.pause()`; unfinished animation time is discarded, materials and structures stay |
| Memory and preferences | session practice in the mind; the project and inventory have their own save (`paradise.observation.life.v1`) |
| Resuming | the project state is restored and the job is retried, never credited as finished |
| Complete but not integrated | fishing-to-dinner (14d0c62) needs the production school-ownership bridge, so it is **not** merged; coconut props (b45fe5b) are on their own branch |

The comfort project is kept as is (it plays `kneel_down`/`kneel_idle`/`tend_fire`/`rest_by_fire` now). Its route planner (`project_path.js`) is also used for the quest walks, one 24 m segment at a time.
There was no general preference learner or goal system in Codex's work, so the drives below are new and sit alongside the comfort project instead of replacing it.

## Drives

Eight appetites, each with a level (0 to 1), a temperament (`taste`, which drifts a little with experience), a rest period and a count of times satisfied.

| Drive | What it wants | What the world offers it (raises the target) |
|---|---|---|
| adventure | a good walk to a place he knows least | a named place 60 to 190 m away he has visited least |
| curiosity | to understand what he noticed, or see somewhere new | finds he has noticed but not looked into, places never visited |
| collecting | keepsakes: shells, smooth stones, driftwood, feathers, unusual stones | something to pick up within reach |
| creating | to arrange what he has for its own sake | enough stored materials for a design, room in his gallery |
| creativity | to work out a new design | at least two kinds of material in store, fewer than all designs known |
| building | to improve the camp | materials for a bench or a ring of stones |
| play | to be silly on the beach | contentment and boredom |
| hunting | to read tracks and stalk rats | dusk and night, rats about |

Dynamics: `level += (target - level) * (1 - exp(-0.3 * hours))` where `target = taste * (0.3 + 0.7 * opportunity)`. Acting eases the level and starts a rest period (2.5 to 10 game hours). A level never gets him distressed: it only
raises the appeal of its goal. After any goal he is **content** for 0.6 to 1.8 hours and proposes nothing. Proposals are made every few real seconds (not every frame) and cached.

## Goals, plans and what they change

A goal is a drive, a target and a reason (`why`). The goals with the highest value win: appetite, learned preference for that kind of goal, a variety weight (what he has not done for a while is more attractive) and a little chance.
Urgent things (a boar, rain, hunger, exhaustion, a drink he is overdue for) override a goal; the goal is paused and, if it is under 16 game hours old, offered again, so he can decide to carry on.

| Goal | Steps | Lasting result |
|---|---|---|
| collect | notice, approach, kneel, pick up (the keepsake leaves the world), examine it in his hand, maybe pick up more nearby, carry them to camp, add them to his collection | the collection (stored counts and firsts); the keepsake comes back only after about three game days |
| investigate | think, walk (stopping to watch wildlife on the way), look, study the ground, pick up a specimen if there is one, record the visit, sometimes walk home and store it | a visit to a place, a resolved discovery, a specimen |
| adventure | take up the staff, a long walk (watching wildlife), the view from the summit (a lookout, looking down, a shout if high), explore around, a gesture, the walk home | visits, discoveries, a better sense of the map |
| create | choose a spot in the gallery, kneel and arrange the pieces one by one, stand back, look it over | a **spiral of shells**, a **cairn**, an **arch** or a **wind chime** appears in the world (the last two once he has worked out the idea) |
| experiment | tinker with what he has gathered | sometimes a new design (leaning, hanging); sometimes only a little skill |
| build | carry driftwood to the fire, kneel, build in stages, look it over, try it | a **driftwood bench** or a **ring of stones** round the fire, which stay; he sits on his bench |
| beachplay | go to a stretch of sand, kick it about, strike silly poses or skip along, laugh | joy |
| track | creep up on a rat burrow, read the tracks; then the rat hunt is more appealing for a while | hunting skill when he catches one |

Nothing is spawned: keepsakes are a fixed set placed once with a seeded generator (about 100 across the island, 10 unusual stones near the falls, the spring, the temple and the glimmer ring); instanced meshes draw them and the things he makes (capped: 8 to 10 creations, 4 builds). They are
excluded from the static culling pass (`userData.lodBatch`).

## Memory and personality

Saved under `paradise.castaway.life.v2` (about 2 KB, written every 12 s when something changed and on page hide; the classic survival save and Codex's observation save are untouched, and an unreadable save just starts a fresh life):
appetites and temperaments, stored materials, the collection, creations and builds with positions, designs he knows, which keepsakes are taken (and when they return), places (visits, finds, places he failed to reach), discoveries, fears of places he was frightened at (a boar scare leaves him wary of that ground for about ten game hours),
learned preference for each kind of goal (a good trip makes that kind more attractive), skills (hunting, creating, building, exploring, collecting) and statistics. Memory is bounded: 30 discoveries, 10 creations, 4 builds, 6 fears, 14 recent events.

Not saved: a goal in progress (he decides afresh after a reload), the session practice in the mind.

## Animation

Quest steps name their clips (see `CASTAWAY_ANIMATION_COVERAGE.md`). Starts and stops of walking, turns toward a target (`turn_left_90`, `turn_right_90`, `turn_180`), the sleep sequence (`lie_down`, `fall_asleep`, `sleep_loop`, `wake_up`, `stretch_after_sleep`), the hike pause (`idle_staff_lean`),
the project's kneeling and fire clips and the quest clips are all played through `clipFor`. Upper-body layers ride on standing bases only; gestures come from context (whistling, a wild animal nearby, tiredness, contentment, restlessness) and events (a find, a failure, a boar scare, finishing something).
Faces follow his mood and the moment. The old procedural rig still runs invisibly as the driver for the existing activity code; the quest runner does not use it.

## Diagnostics

- `window.__castaway.life.debug()`: drives (appetite, taste, rest), opportunities, the proposal and the candidates it beat, the current quest and step, stores, creations, designs, skills, preferences, places, discoveries, recent events.
- `window.__castaway.coverage.report()`: clips loaded, connected, played autonomously, only forced, never played, blocked by unfinished assets or unbuilt gameplay, upper-body variants used, failures, recent transitions.
- `window.__castaway.scores()`: what each activity is worth to him right now; `window.__castaway.state()`: activity, phase, step, position; `window.__castaway.cost`: running average milliseconds.
- `?sim=1`: `window.__sim.run(ms, compact)` fast-forwards the real game and reports activity shares, stalls (the same activity and place for three game hours), quests and what he made. `window.__castaway.life.dev.force(kind)` and `dev.give({...})` set up a situation for a visual check; the clips it plays count as **forced**, never as autonomous.

## What a long run showed (fast-forwarded real game, clear and automatic weather)

- Over 2.7 to 4.3 game days he did 5 to 8 goals a run: collect, investigate (including the stones near the falls he had noticed), adventure; he is content between them; sleep 20 to 25 %, fishing and cooking 10 to 25 %, drinking 6 to 15 %, goals 15 to 35 % of the time.
- A goal can take many game hours (the island is large and a day lasts ten minutes): 100 m is about four game hours on foot.
- Seen in autonomous play: 66 of 142 base clips and 13 of 31 upper-body variants (see the coverage document). Verified with forced goals: create (a spiral of shells appeared), build (a bench appeared and he sat on it), experiment, track, collect, investigate.
- Not seen yet in a natural run: create, build, beach play and experiment, because they need materials that his collecting produces slowly; they were verified with `dev.give`.
- Fixes this found: unbounded walking legs and drink chases (now timed out, with a retry later); the drink timer after a saved clock restore; a goal that kept him on one activity after it ended; keepsake meshes hidden by the static culling pass.

## Cost

The whole castaway update (decisions, quest runner, mixer, face, gestures) averages 0.13 ms a frame in the real game; the clip picker and mixer 0.045 ms; a route segment costs 2 to 6 ms and happens a few times a minute. The invisible old rig is part of that figure and is not a measurable cost; removing it still waits for the activity code to stop reading its hand and head positions.
Not measured: frame rate in play (the test browser renders in software).

## Still to do

Creating and building seldom happen unaided because the collection fills slowly (more finds per trip, or other sources of materials such as Codex's gathering, would help); only eight kinds of goal exist (no fishing-for-pleasure, swimming, climbing, camp maintenance or visiting a favourite place on purpose);
no goal knows about the canoe; collections are not shown anywhere in the UI; resuming a goal after a reload; a Field Guide page for his collection and memories; base-clip versions of the gesture clips; the unfinished swim clips; the fishing and coconut branches.
