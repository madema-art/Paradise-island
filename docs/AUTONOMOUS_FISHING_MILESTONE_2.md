# Paradise Island: autonomous fishing integration handoff

Prepared October 14, 2026. Isolated worktree: `D:\ParadiseIsland-Life-Workshop`, branch `codex/autonomous-comfort`. Milestone 1 prerequisite: `43f4208`. Milestone 2 commit is the commit containing this document; obtain it with `git log -1 --format=%H` in that worktree.

## Delivery status — read first

The complete autonomous fishing-to-dinner sequence works in the actual bundled game **against an explicitly enabled, independent review population**. Fish detect the lure spatially, investigate, bite probabilistically, can escape, fight against rod control, and transfer identity into persistent food inventory only after landing and keeping. This is functioning code with a real-game browser demonstration, not a design-only deliverable.

**Claude's production schools are not connected yet.** Their current work is active and was not modified. The inspected baseline keeps generic instanced members private; anthias exposes simulation state but not a safe ownership/rendering transfer contract. Reaching into arrays or intercepting instance matrices would let the school and fishing controller both update the same fish. The requested safe-interface exception is therefore used. A production provider must explicitly implement the contract below. Normal play creates no replacement school and cannot award fish through the new activity without a provider.

Do not describe this as verified fishing of Claude's current school members. Production integration, current-school population accounting, and visual quality of those promoted models remain to be verified after the bridge is implemented.

## What was inspected and reused

| Existing system | Finding / integration |
|---|---|
| `src/castaway_mind.js` | Existing utility scoring, activity budgets, need updates and urgent interruptions remain the planner. Added one `angling` activity, rather than a second AI framework. |
| `src/human.js` | Existing movement, terrain/collider handling, `setPose/apply`, rod, float, line, held fish, grilled-fish stick and camera registration are reused. New bounded outing calls the same walking interface. |
| `src/fauna_sea.js` | Generic instanced schools keep member arrays private and update every member each frame. Existing anthias/yellow tang implementations have differing interfaces. No schooling or wildlife source was changed. |
| `src/survival/game.js` | Classic fishing is a timed wait/bite/reel sequence that awards random names/quantity. It is deliberately retained, with its input/HUD/avatar/durability/save dependencies, for later migration. Classic cooking now calls the shared validated cooking transaction. |
| `src/survival/items.js` | Existing rope and rod recipes, level gate, XP, rawFish/cookedFish identities, cooking mapping and rod's 40 uses are reused. No item definition was rewritten. |
| Milestone 1 | Reuses the resource pool, pickup depletion, persistent inventory, recipe spending, campfire Structure, fuel, safe routes, clock, save and fulfillment needs. |
| Existing observer UI | Castaway needs panel and Field Guide intention/recent events receive understandable narrative through the existing description/summary interfaces. The opt-in review population has its own clearly identified Field Guide entry. |

Old autonomous shoreline/spear fishing is no longer selected by the mind; the new `angling` activity requires the registered population. The retained old canoe/rod/spear animation routines cannot credit virtual catches: `landed()` no longer adds a species string to the basket. Existing rat hunting/cooking behavior and wildlife simulation were not developed or replaced. Classic player fishing and spearing still have their old virtual reward behavior; they are explicitly outside the verified ownership integration and must be migrated later.

## The implemented story

1. A safe castaway with a personal campfire chooses an outing for recreation, fulfillment or a pleasant dinner. Pending retained food gets priority. Night, rain, fatigue and urgent needs can interrupt him.
2. He gathers reachable sticks and fibre from real nodes, twists rope and crafts the existing rod recipe. A lucky Milestone 1 gather can leave XP just below level 2; legitimate rope practice supplies that gap. Materials are spent only on completion.
3. He chooses a reachable provider-supplied bank. Persistent spot success/failure history affects preference; distance also matters. The current review provider supplies one bank; competing-location preference is implemented but not visually demonstrated with several banks.
4. Casting places a fibre-line lure in water. Elapsed time alone never grants a fish. A supported individual must be nearby, unremoved and unowned, and be successfully claimed before investigating.
5. The fish swims to the lure, then has a probabilistic bite opportunity at contact. The strike has a window and a small failure probability. The struggle models resistance, stamina, surges, tension, slack and line length. Excess tension or slack loses the fish. The skilled controller watches tension/surges and yields during strong runs.
6. After landing, he visibly holds and examines the fish for four seconds. Its persistent identity, gameplay length/mass and personal length record are recorded. These are gameplay estimates for the supported mullet profile, not researched biological measurements.
7. For dinner, retaining must succeed before exactly one `rawFish` item is added. For recreation, release returns the same identity and adds no food. Retained food takes priority over another outing.
8. He walks home holding the catch, feeds his actual Milestone 1 fire if necessary, prepares it, grills it over the fire, and consumes exactly one `cookedFish`. Preparation is a ledger state on the same raw fish; it does not mint another item.
9. The meal reduces hunger through the existing `mind.ate('fish')`, adds comfort and fulfillment, and rewards happiness. A 14-game-hour cooldown prevents immediate repeat dinners; release uses eight hours and failures use three. These are opportunities, not fixed daily chores.

The engine is a lightweight gameplay model, not a calibrated fishing physics simulation. One profile is supported. Its profile controls attraction, bite rate, resistance and stamina; additional species still need researched tuning and models.

## Code map

- `src/fishing.js`: actor-neutral `FishingSession`, population registration, one species profile, ownership checks and intelligent control inputs. A human controller can supply `{ strike, reel, drag, lift }` to the same `update()` method later.
- `src/fishing_outing.js`: small resumable activity executor for equipment, route selection, fishing, inspection, identity transfer, preparation, cooking and eating. Persistent catch ledger, records, spot memory, event history, cooldown and rod uses.
- `src/comfort_life.js`: saves/restores outing and population checkpoint together with Milestone 1 state; restores fish counts from the catch ledger, rather than trusting an arbitrary saved inventory count.
- `src/survival/mechanics.js`: shared `cookItems(actor, fire, id, n)` checks a lit fire and remaining inventory at completion, then transforms inventory and awards existing XP/statistics. Both classic cooking and the autonomous outing use it.
- `src/fishing_reference_population.js`: independent simulated review members with stable IDs and explicit ownership/removal. Also used in tests. Never copies live school members.
- `src/fishing_review.js`: opt-in reference rendering/Field Guide entry. Never installed in normal play.
- `src/human.js`: executes the activity with existing movement and poses; holds fish while walking, shows an actual fish instance over the personal fire, and displays narrative state.
- `src/main.js`: the explicit fishing review starts in daylight with existing castaway follow. Existing `lifeReview` remains deterministic for automated stepping.

## Production schooling bridge contract for Claude

Import `registerFishingPopulation` from `src/fishing.js`, then register one canonical provider during wildlife boot, before `buildCastaway()`. The provider needs a nonempty stable `key` and these synchronous methods:

```js
registerFishingPopulation({
  key: 'your-canonical-fish-population-v1',
  sites() { /* [{id, name, stand:{x,z}, target:{x,y,z}}] */ },
  near(position, radius) { /* available actual member records in detection range */ },
  get(id) { /* live canonical record, or null */ },
  claim(id, owner) { /* atomic ownership acquisition; boolean */ },
  move(id, owner, position) { /* move owned member; boolean */ },
  release(id, owner) { /* return same identity to live population; boolean */ },
  retain(id, owner) { /* remove same identity exactly once; boolean */ },
  snapshot() { /* serializable canonical removal / identity checkpoint */ },
  restore(snapshot) { /* idempotent checkpoint restore, clear transient owners */ },
  summary() { /* optional counts for observer verification */ },
});
```

Member record: `{ id, species:'mullet', x, y, z, length, weight, owner:null|string, removed:boolean }`. Position and length are metres, mass kilograms, Y is up. `sites().target.y` is the submerged lure height in that particular water body. IDs must survive reload and cannot depend on transient instance compaction. Return canonical records from `get`, including updated owner and removal state; do not return unrelated snapshots.

Required behavior:

- `near` only exposes actual supported fish in water and detection range; no spawning an inventory reward at request time. Schools without the mullet profile must not be mislabeled as mullet.
- `claim` validates alive/unowned and acquires exactly one identity atomically. Reservation begins during investigation. Suppress its normal flock steering while owned. Either move the original instance under fishing control or promote it and hide the original instance; never display/update two copies.
- `move` must enforce habitat/position validity and update that same identity. Returning false aborts the line without crediting a catch. The provider must support retrieval toward a suitable bank and promotion/landing presentation without silently pulling the fish through dry terrain.
- `release` restores one unowned living member and its rendering/velocity at a valid water location. It must fail for a different owner or already retained member. No population increment from creating a second fish.
- `retain` permanently removes the living member once. Leave a stable identity tombstone in persistence; do not just hide its mesh while it continues swimming or reappears after reload.
- `snapshot/restore` must preserve tombstones and canonical population identities, clear transient line ownership, and be idempotent. No free fish on reload. The reference provider demonstrates these invariants for its own members.
- Integrate the provider's own normal swimming update into the ordinary wildlife updater. The session only controls borrowed fish. Respect game pause; classic mode switches release the observation line.
- If registration happens after castaway construction, call `castawayAI.life.restorePopulation()` after registration and before updates. Prefer registration before construction. A provider key mismatch is not a safe migration: explicitly migrate prior ledger IDs/tombstones before connecting a different population.
- For future classic mode integration, share this canonical provider and the session rules. Do not independently restore two incompatible snapshots of one world population; choose one world persistence owner first.

The reference provider is an executable contract example, not a replacement for Claude's school architecture. No claim is made about preservation of Claude's new school member arrays until he implements and tests this bridge.

## Persistence and interruption

Normal observation keeps `paradise.observation.life.v1` and its existing v1 envelope, with additive fishing fields. Old Milestone 1 saves load without fishing. The review uses **`paradise.observation.life.v1.fishing-review`**, preventing test/demo catches from entering normal play. Classic survival retains its independent save key.

Each checkpoint contains inventory, structures, resource depletion, needs/clock, outing ledger, records, events, rod uses, and population snapshot with its provider key. Raw/cooked fish counts restore from valid unique retained ledger entries. A fish transitions raw → prepared → cooked → eaten once. Local storage errors remain visible as `storageError`; unavailable storage cannot provide durable results.

Fishing line simulation and partial animation work are transient. Threats, mode switch and pagehide release an investigating/hooked/landed-but-unretained identity. Retained fish and completed recipe work survive. Interrupted construction/cooking does not spend/convert twice. Explicit P pause freezes the line in place rather than releasing it. A retained meal whose route/resources become unavailable obeys retry cooldown instead of attempting the impossible each frame.

Full position continuity after browser reload is not implemented: the existing initial activity placement puts him back near camp. Retained ownership and meal progress persist, but a reload may skip the remaining return walk. Ordinary uninterrupted play walks the route.

## Reproduce and verify

Use the isolated worktree, with the existing read-only node_modules junction. Do not run npm install through that junction.

```powershell
Set-Location 'D:\ParadiseIsland-Life-Workshop'
node tools/build-life-preview.mjs
node tools/serve-life-preview.mjs
```

The static preview server uses port 8767. If the existing isolated server is already running, reuse it; never stop Claude's port 5173 server. It rejects notebook writes.

- **Watch in real time:** `http://127.0.0.1:8767/?fishingReview&noauto`. The review starts at 10 a.m. and follows the castaway. Press H to show the interface and click the castaway heading to follow again if needed. Let the comfort project and then fishing afternoon play naturally. P pauses/resumes.
- **Deterministic browser scenario:** `node tests/fishing_browser.mjs`. It boots `?lifeReview&fishingReview&noauto`, advances the real game updater, observes all story phases, screenshots settled poses, interrupts during the fight via classic mode, verifies the entire return walk and reloads at camp while the retained fish is still raw, and verifies one eaten catch, one population removal and no page/HTTP errors. It also checks that the normal observation save receives no demo catches. No inventory or completed project fixture is injected.
- **Milestone 1 regression:** `node tests/comfort_browser.mjs`. Covers the original comfort project, reload, mode interruption, follow/P pause, classic axe crafting/durability, and unchanged normal wildlife registry count.
- **20 unit tests:** `node --test tests/comfort_project.test.js tests/fishing.test.js`. Includes success, release, competition for one fish, unearned catches, missed hook, line break, interruptions, all food reload states, route backoff, final rod wear, low-skill rope practice and mind choice/danger.

Browser evidence is in `work/fishing-test/`: `result.json`, `history.json`, and fight/inspect/transport/prepare/cook/eat PNGs. Normal snapshot has 229 wildlife registry entries; review deliberately adds one labeled population entry (230). Neither count is an individual fish count; use the provider's population counts for ownership accounting.

The develop-web-game skill client was also run as a smoke test. Its generic capture ran before model boot and was black; it is not visual evidence. The dedicated scenario waits for boot and captures the actual new activity. Build has the pre-existing duplicate `owl` key warning in `audio.js`; that unrelated source was not changed.

## Remaining work / assets

1. Claude: implement and verify the canonical schooling bridge above. Validate instancing/promotion, release, tombstones, habitat bounds and reload against his latest school simulation. This is the main production integration requirement.
2. Existing procedural arm/body poses provide visible casting, rod handling, held-fish examination, carrying, preparation, seated cooking and eating props. There are **no newly authored rig clips** for filleting, measuring, a fish basket, reeling hand cycles, a release toss or eating bites. Preparation is a real four-second state transition with a held-fish pose, not a detailed knife animation. Cooking uses a reused fish prop on a simple procedural skewer and supports over the coals; the skewer and hand contact need art polish. Eating needs contact/hand polish. Line is a polyline without a bendable rod/rope solver. Do not call these finished animations.
3. Replace the review's procedural fish/held proxy with the correctly scaled species model on promotion; keep length/weight as identity data. Research biological size/mass/bait behavior before presenting precise species facts. Current one-species numbers are gameplay estimates.
4. Add a real fish inspection card/measurement UI and Island Journal subscriber. The existing needs panel/Field Guide castaway intention shows catch details; a dedicated catch-record/specimen screen is not implemented. Catch records/events persist; general mind's unrelated session memories do not.
5. Migrate classic player fishing to `FishingSession` with real strike/reel/drag/lift controls after choosing common world persistence ownership. Its current timed mechanism is intentionally still present and is not evidence of genuine catches.
6. Expand validated reachable banks and profiles, tune variation and navigation over long distances, and validate preferences with multiple live sites. The bounded ground router still fails safely on routes beyond its local search budget.

## Merge safely after Claude's checkpoint

Do not replace `D:\Paradise Island` with this worktree, copy whole source folders, reset Claude's branch, or cherry-pick into his dirty working directory. At the final read-only status check, main had active changes in `src/fauna_sea.js`, `src/main.js`, `src/school_mind.js` and an untracked `src/dev/school_inspect.js`, plus user music. All were left untouched.

Once Claude has committed his current work, create a fresh integration worktree from that checkpoint:

```powershell
git -C 'D:\Paradise Island' worktree add -b integrate/autonomous-fishing 'D:\ParadiseIsland-Fishing-Integration' HEAD
git -C 'D:\ParadiseIsland-Fishing-Integration' cherry-pick 43f4208 <MILESTONE_2_COMMIT>
```

Replace the final placeholder with this milestone's actual commit from the delivered cover handoff or `git log -1` in the life worktree. If Milestone 1 is already in Claude's history, cherry-pick only Milestone 2. Resolve shared human/main/mind integration carefully; preserve his latest fauna and school implementation. This milestone does not change `fauna_sea.js`, `school_mind.js`, models or animations. `src/main.js` has one small review-start condition change, but his active main changes still need manual review.

Implement the bridge in that integration worktree, rebuild, rerun both browser suites and unit tests, and add production-provider ownership/population tests before merging the integration branch. Existing test imports use this machine's installed Playwright path; make that dependency configurable for other machines. No production merge, deployment or changes to Claude's working checkout were performed.

Notebook at read: revision 49, zero ready and three open. Open notes concern boa movement/size, boa arboreal resting, and a future barn-owl proportion correction. They remain untouched and outside this fishing milestone.
