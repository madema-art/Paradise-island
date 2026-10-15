# On-screen display and menu

The interface is one focus card, one hint bar and one menu. The workshop prototype (Paradise-Island-3d-assets, commit 94068aa,
`viewer/osd/`) set the design; this is the game's port. The game's own controls, panes and data are re-hosted, not replaced.

## Layout

- **Focus card** (`#follow`, top left): the followed creature, its category and place in its species, the first sentence of its
  description, the release bar and "Let go (Esc)". Written only when the followed creature changes.
- **Hint bar** (`#hints`, bottom centre): one line for the current mode and input (controller or keyboard). Rewritten only when its
  text changes.
- **Menu** (`#menu`, top right, open only): five sections, View, World, Sound, Guide and Journal. The panes are the game's own:
  View (places, camera, controls reference), World (weather, volcano, graphics, survival), Sound (music, effects, master volume and
  the music library), Guide (the Field Guide with the specimen viewer and live data) and Journal (notes, secrets, inspection).
- Solid backgrounds throughout. No `backdrop-filter` on the HUD; the boot screen keeps its own effect.

## Modes

- **Play**: the sticks and keys drive the camera. The menu is closed and the interface is visible unless hidden.
- **Menu**: opened by Start or Tab. The pad and the keys drive the menu. The camera holds still (`camera.js` reads an idle pad and
  ignores the movement keys while the menu is open). The interface is shown even if it was hidden.

`src/menu.js` owns the mode, the section, the focus and the hint text. `camera.js` asks it whether the menu is open.

## Controller

| Play | Action |
|---|---|
| D-pad ◀ ▶ | previous / next creature (below) |
| LB / RB | previous / next camera place |
| Y | lock on to the nearest creature in view (as before) |
| Hold B | let go (as before) |
| Start | open the menu |
| Back | walk / fly (as before) |

| Menu | Action |
|---|---|
| D-pad ▲ ▼ | move between the controls of the section |
| D-pad ◀ ▶ | change a slider (one step; a tenth of the range for volumes), a choice or a select |
| LB / RB | previous / next section |
| A | press the highlighted control (a Guide entry follows that species and closes the menu) |
| B or Start | close the menu |

Pad buttons count once each (the pad reports edges), and a closed menu gives the pad back to play.

## Keyboard

| Play | Action |
|---|---|
| `[` / `]` | previous / next creature |
| Tab | open the menu |
| Esc | release the followed creature (as before) |
| H | hide the interface (as before) |
| Q / E, WASD, arrows, R / F, 1–0, M, N, V, P | as before |

| Menu | Action |
|---|---|
| ↑ ↓ | move |
| ← → | change |
| Q / E | previous / next section |
| Enter | press |
| Tab, Esc or Backspace | close |

Arrow keys still turn the view in play, as before. Keyboard menu keys are ignored while the search box is typing.

## Creature cycling (`src/creature_cycle.js`)

- Focused on a creature whose species has more than one live individual: left and right go to the previous and next individual of
  that species, in registration order, and wrap round (Capuchin monkey 1, 2 ... 48, 1).
- Otherwise: left and right go through every live creature in one fixed order (category, species name, individual number). From
  nothing, the first press starts at the creature nearest the camera.
- "Live" means its group is visible, its simulation is not marked not alive, and it has not been removed. It uses the game's own
  `creatures` registry; no second registry is built. The individual number is the order of registration within the species.

## What was retired

- The seven translucent boxes are now three (focus card, hint bar, menu). The title card, the help card and the separate side
  tabs were removed; their content is in the menu (the title and weather line in World, the controls reference in View).
- `backdrop-filter` removed from `.glass` and from the survival card.
- `cycleTarget` and its nearby-only search are replaced by `creature_cycle.js`. The bumpers now cycle places, not creatures.
- The weather line and the focus card's description were rewritten on a timer. They are now rewritten only when their text changes.

## Measurements

In-page, one page per row, three rounds of three seconds (`window.__perfInterleave`, `?perf=1&noauto=1`, RTX 2070 SUPER, 1920×1080).
The GPU was shared with other desktop apps during these runs, so compare within a row.

| Scene | Interface visible | Interface hidden | Menu open |
|---|---|---|---|
| Wide island | 55.3 fps | 58.0 fps | 56.5 fps |
| Jungle (48 monkeys) | 57.9 fps | 60.0 fps | 60.0 fps |
| Lagoon | 55.3 fps | 58.0 fps | 57.7 fps |

Blur, in the previous interface (before this change), measured the same way with `.glass` blur on and off: wide 53.3 and 51.3 fps,
jungle 58.8 and 60.0, lagoon 54.4 and 56.1. The difference is inside the run-to-run noise, so the blur removal cannot be credited with a
measured frame-rate gain. What the measurement does show: a visible interface costs about 1 to 2.5 fps in these scenes, and the menu
costs no more than the visible play interface.

Seven-scene harness comparison against the previous interface (`ed50e5f`, one round, `tests/canopy_benchmark.mjs compare 1`):

| Scene | FPS (before → after) | Median frame ms | Draw calls | Triangles (M) |
|---|---|---|---|---|
| wideIsland | 49.5 → 49.0 | 19.8 → 20.0 | 1795 → 1810 | 9.57 → 9.56 |
| jungle48 | 62.4 → 62.4 | 15.6 → 15.6 | 830 → 819 | 9.52 → 9.41 |
| banyan | 51.9 → 60.6 | 16.7 → 16.3 | 1225 → 1155 | 9.78 → 9.64 |
| followPig | 42.8 → 65.4 | 18.9 → 15.2 | 625 → 542 | 8.52 → 8.42 |
| castawayEye | 51.2 → 46.3 | 18.5 → 21.3 | 669 → 1147 | 8.64 → 9.89 |
| nightRats | 47.8 → 47.2 | 20.6 → 20.8 | 1178 → 1279 | 9.53 → 9.67 |
| moving | 37.8 → 39.0 | 26.4 → 25.6 | 1800 → 1794 | 10.67 → 10.46 |

These single-round numbers are not a result. The changes in followPig, banyan and castawayEye are larger than the UI can account for, and
castawayEye follows the live castaway, so its workload varies between runs. The honest reading is: no reliable frame-rate change from the
interface, and no regression in the matched scenes.

## Tests

`window`-level scripts drove the real game with a fake controller (the game's own `pollPad` reads it through
`navigator.getGamepads`), and with keyboard events:

- Start opens the menu and unhides the interface; Start and B close it. Tab opens and closes it from play.
- LB and RB change section; the d-pad moves focus; A presses the focused control; menu presses do not reach play (the camera does not move).
- A slider moves on its own grid (FOV 55, 60, 55, 50).
- Journal subtabs show notes, secrets and inspection.
- A Guide entry follows that species, closes the menu, and fills the focus card ("Capuchin monkey, Mammals · 6 of 48").
- Left and right cycle creatures from play: from nothing, the nearest; within a species of 48 monkeys, it stays within the species and wraps.
- `[` and `]` cycle the same way.
- No console errors during the tests; no `backdrop-filter` on any box.

## Not done

- Survival mode keeps its own pad map; the menu is not reachable from the survival screen.
- The keyboard arrows still turn the view in play. Creature cycling uses `[` and `]` on the keyboard.
- The notes list and the secrets list are focusable, but a long notes list is scrolled with the pad only through the menu's own scrolling.
