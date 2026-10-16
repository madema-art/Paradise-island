# Paradise Island — project guidance for Claude Code

Paradise Island is a Three.js tropical island wildlife simulation. Source is in `src/` (ES modules, bundled by esbuild).
`index.html` holds the interface markup and styles. `dist/island.js` is the built bundle the page loads.

## Running and building

- Build: `npm run build` (writes `dist/island.js`). The page loads the bundle, so rebuild after editing `src/`.
- Run: `node serve.mjs 5173` from this folder, or use the `Open Paradise Island.bat` launcher. The server also
  provides the Island Notes API (below). Use only one server per project; a second copy of the project would split the notes.
- Preview: the `island` launch configuration in `.claude/launch.json` serves this folder on port 5173.
- Line endings: keep each file's existing line endings (many source files are CRLF).

## Island Notes (read this first, every session)

The owner keeps a development notebook in `notes/`: observations, bugs and wishes, written in the game. Each note has one of three statuses:

- **open**: waiting for the owner's approval. Do not implement it, and do not change its status. Summarise it, that is all.
- **ready** ("Ready for Claude"): approved. Only these are implemented automatically.
- **done**: implemented and verified.

The summary is `notes/ISLAND_NOTES.md` (regenerated on every save); the full store is `notes/island-notes.json`; the format and API are in `notes/README.md`.

**At the start of every development session:**

1. Read `notes/ISLAND_NOTES.md`. Notes arrive while you work, so read the store again before you finish.
2. List the ready notes (implement these) and the open notes (summarise these; do not implement them).

**On every development task:**

- Do the owner's main request, **and implement every ready note**. When there is no main request, the ready notes are the task.
- The owner can authorise specific open notes in chat; only then implement them, and say so in your summary.
- A note may be vague or may duplicate another (the owner can enter one twice): do the sensible reading, resolve every copy, and say what you chose.
- A note is **done** only after its change is implemented **and verified**: built, and checked in the game where it is visible (render it, or measure it). Write what was done, and how it was checked, in `resolution`.
- If a ready note truly cannot be finished (it needs a file you do not have, or a decision that is the owner's alone), leave it **ready**, write why in `blocker`, and say so in your final summary. Do not guess at a design that was supposed to come from elsewhere (a Codex asset, a reference image): look for it first (`Documents/Codex/...`), and if it is not there, ask.
- Never delete a note. Never silently overwrite one. Never change a note's status from open to ready: that is the owner's approval.
- Do not break existing behaviour to satisfy a note, and do not use the notebook as a reason for unrelated rewrites.
- Finish by summarising which ready notes you completed, which are blocked, and which open notes remain (not implemented).

**Changing a note:** when the game server is running, use the API (it checks for conflicting edits; example in `notes/README.md`).
If the server is not running, edit `notes/island-notes.json` carefully: read the latest file, change only the note in question, keep every
other field, keep the file valid JSON, and set the status as the rule above allows (`done` when verified; `ready` is only ever set by the owner).

## Architecture notes

- World generation is seeded (`src/util.js`, mulberry32). Placement is deterministic, so object ids (`obj:<kind>:<x>,<z>`)
  are stable across reloads. Keep it that way: do not add unseeded randomness to placement.
- Inspectable objects are tagged where they are built: `tagInstanced` / `tagObject` (`src/inspect.js`), with
  catalogue entries in `src/catalog.js`. A new kind of object needs a catalogue entry.
- Creatures register themselves with `register()` (`src/fauna_common.js`). Their `sim` field is the live simulation object
  the Field Guide reads.
- The Field Guide and inspection specimen viewer (`src/specimen.js`) use their own WebGL context; they do not change the main camera.
- Notes are read and written through `src/notes.js`; the server side is in `serve.mjs`.
- The world's random stream is shared and seeded (`rnd`, `rr`, `pick` in `src/util.js`), and **placement depends on how many numbers each builder
  draws from it**. When you replace a builder (a wreck, a shrub, a rock shape), give the new one its own generator (`mulberry32`) and call
  `burn(n)` for the draws the old one used, so nothing built after it moves. Measure `n` by counting draws around the old code first.
- Boulder crowns that can be climbed are registered as perches (`addPerch` / `perchesNear` in `src/world.js`, filled by `src/flora.js` from the shapes in `src/rocks.js`).
  The castaway (linger), monkeys and gulls use them.
- The castaway's mind (`src/castaway_mind.js`) has no needs and no meters. It chooses each activity from the moment (time of day, weather, place, wildlife, recency, weighted randomness); a boar or heavy rain are the only interrupts. `src/human.js` runs the activities. Boars and monkeys react to him through `nearestPerson` in `src/fauna_common.js`.
- Direct control (`src/control.js`): the player takes over that same castaway (V or Back), in third or first person (T or R3); jump is Space or A, pick up is F or X. `human.js` owns his body (`takeControl`, `controlStep`, `attachCastaway`); `control.js` owns the input and the camera. While he is controlled the autonomy does not run; release leaves him where he stands. `src/input_device.js` tracks whether the keyboard or the pad was used last, and the hint bar, the focus card and the View reference show that family only. The bindings are in `docs/OSD.md`.
- The castaway's body is the Blender character in `assets/castaway/` (`src/castaway_new.js`: one mixer, 142 clips, face controls, upper-body layers; `?castaway=old` keeps the procedural body). His inner life is `src/castaway_life.js` (drives, goals, keepsakes, what he makes, memory; saved as `paradise.castaway.life.v2`) run by the `quest` activity in `src/human.js`; see `docs/CASTAWAY_LIFE.md` and `docs/CASTAWAY_ANIMATION_COVERAGE.md`. Codex's comfort project (`comfort_life.js`) is merged. Dev tools: `window.__castaway.*` always, `?sim=1` for the fast-forward harness (`src/dev/life_sim.js`), `?diag=1` or F2 for the display readout.
- Wildlife observation (`docs/WILDLIFE_ACTIVITY.md`): `src/camera_occlusion.js` fades scenery that blocks the followed animal (instance-level ghosts, never a shared material); `src/ai_sched.js` runs far creatures' updates less often (the land fauna loop in `fauna_land.js`); `actors.camScale` makes the free and follow cameras an unseen observer for animals; a creature's `observed()` method (if it has one) is called once when the Field Guide picks it (birds take off, a hidden rat looks out, a boa heads for a palm); boas climb palms with the body following the head's trail (`boa.js`). Performance work is judged with `window.__perfManualAll()` (`?perf=1`, see `docs/performance/wildlife-overhaul-results.md`: update ms, run the baseline in a second worktree) and `?shots=1` (`src/dev/shots.js`, hand-rendered review frames).
- Models made outside the project (Codex) live in `assets/` as GLB with a loader in `src/<name>_model.js`; their Blender sources are in `blender/`.
- The monkey (capuchin) is the Blender model in `assets/monkey/`, loaded by `src/monkey_model.js` (near and far skeletons, one mixer each, the coconut on `coconut_attach`). `src/fauna_land.js` maps its state machine onto the clips; `src/monkey_contest.js` runs coconut contests between monkeys. `?monkey=old` keeps the procedural monkey. Test only: `?monkeys=N` adds N monkeys, and `window.__cam.follow(creature)` is the game camera on any creature.

## Playable GitHub workflow

GitHub is the source of truth for playable Paradise Island code. Claude Code, Codex, Cloud Claude, and other coding agents must commit and push completed changes to the playable branch before the owner tests them. The owner normally tests by manually launching `Open Paradise Island.bat`; do not assume uncommitted local edits are being tested.

The launcher fetches the explicit remote/branch in `startup.config.json` (currently `origin` / `integrate/new-castaway`), fast-forwards only a clean checkout of that branch, installs changed dependencies, rebuilds changed build inputs, and starts the existing notebook server/browser. It stops on local changes (including untracked files), wrong branch, unpushed commits, divergence, network failure, or failed install/build. It never commits, stashes, discards, merges divergent work, or pushes automatically. See `docs/STARTUP_WORKFLOW.md` for setup, recovery, and test coverage.

User-added supported audio directly under `music/` and timestamped `notes/backups/island-notes.r...json` snapshots are local content ignored by Git. Do not add these recurring files to commits. Existing tracked songs/backups remain tracked; live notebook files, source edits and other untracked files still block launch. The fast-forward uses `--no-overwrite-ignore` to protect ignored files from incoming filename collisions.
