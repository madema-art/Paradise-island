# On-screen display, menu and controls

The interface is one focus card, one hint bar and one menu. The game's controls are the same for everyone; what changes is which
device's names are shown. The hint bar, the focus card and the View pane's reference show the controls of the input family used most
recently (`src/input_device.js`): the keyboard and mouse, or the gamepad. A key press or a click switches to the keyboard; a stick or a
button on a connected pad switches to the pad. A pad that lies idle changes nothing.

## Layout

- **Focus card** (`#follow`, top left): the followed creature, its category and place in its species, the first sentence of its
  description, the release bar and the release button. The button says "Let go (Esc)" on the keyboard and "Let go (hold B)" on the pad.
- **Hint bar** (`#hints`, bottom centre): one line for the current mode and the input family in use. Rewritten only when its text changes.
- **Menu** (`#menu`, top right, open only): five sections, View, World, Sound, Guide and Journal. The panes are the game's own.
  View (places, camera, the controls reference), World (weather, volcano, graphics), Sound (music, effects, master volume and the
  music library), Guide (the Field Guide, with the specimen viewer and live data) and Journal (Notes, Secrets, Collection, Inspect).
- Solid backgrounds throughout. No `backdrop-filter` on the HUD; the boot screen keeps its own effect.
- No permanent needs bars and no inventory on normal play. The Collection lives in the menu.

## Modes

- **Play**: the sticks and keys drive the camera, follow and cycle creatures, and open the menu. The castaway is autonomous.
- **Castaway** (under direct control): the same castaway, driven by the player. The camera follows him, in third or first person. See below.
- **Menu**: opened by Start or Tab. The pad and the keys drive the menu. The camera and the castaway hold still while it is open.

## Keyboard and mouse

| Play | Action |
|---|---|
| WASD, Q E, arrows, R F | move and turn the camera, rise and sink (free camera) |
| Mouse drag, wheel | look, zoom (free camera) |
| `[` `]` | previous / next creature |
| 1–0 | camera places |
| Esc | let go of a followed creature |
| V | take control of the castaway |
| Tab | open the menu |
| H | hide the interface |

| Castaway (under control) | Action |
|---|---|
| W S, A D | walk forward and back, sidestep (relative to the view) |
| Q E, Left Right | turn the view |
| Up Down | tilt the view |
| Mouse drag | turn and tilt the view |
| Mouse wheel | move the camera in and out (third person) |
| Shift | run |
| Ctrl | walk slowly |
| Space | jump |
| F | pick up a keepsake in reach |
| T | switch third and first person |
| V or Esc | let go of the castaway |
| Tab | open the menu |

| Menu | Action |
|---|---|
| Up Down Left Right | move to the control in that direction; left and right also change a slider, checkbox, select or choice |
| Q E | previous / next section |
| Enter | press the focused control |
| Esc, Tab or Backspace | close |

## Controller

| Play | Action |
|---|---|
| Left stick | move the camera |
| Right stick | look |
| D-pad ◀ ▶ | previous / next creature |
| LB RB | previous / next camera place |
| Y | lock on to the nearest creature in view |
| Hold B | let go of a followed creature |
| Back | take control of the castaway |
| Start | open the menu |

| Castaway (under control) | Action |
|---|---|
| Left stick | walk, relative to the view |
| Right stick | look |
| RT (held) | run |
| LT (held) | walk slowly |
| A | jump |
| X | pick up a keepsake in reach |
| R3 | switch third and first person |
| Back, or hold B | let go of the castaway |
| Start | open the menu |

| Menu | Action |
|---|---|
| D-pad, or the left stick | move to the control in that direction (held directions repeat) |
| ◀ ▶ | change a slider, checkbox, select or choice; otherwise move sideways |
| LB RB | previous / next section |
| A | press the focused control; a Guide entry follows that species and closes the menu |
| B | close the menu |
| Start | close the menu |

The tabs across the top of the menu are reached by moving up from the top row of the section.

## Taking control of the castaway (`src/control.js`)

Taking control stops what he was doing where he stands; releasing it leaves him there, and his own choices resume from that spot.
Nothing is teleported or restarted. While he is under control the autonomous logic does not run, and his comfort projects and fishing
outings wait.

- **Third person**: the camera sits behind and a little above him, and turns to his back when he walks straight ahead. A wall or the
  ground between pulls it in.
- **First person**: the view is his eyes, his own body is not drawn, and the view turns with the mouse, the stick or the keys. Movement is
  the same as in third person.
- **Switching view** keeps his position, his heading and the control exactly as they were.
- **Jump** is a short arc from the ground (not from the water). There is no jump animation in his clip set yet, so the run carries it.
- **Not yet**: climbing under control, and boarding the canoe under control (you step out of it where it floats).

## Butterflies

Butterflies (`makeButterflies` in `src/fauna_land.js`) are out by day. The castaway can watch the nearest one within 24 m when no animal is
closer; `fauna_land.js` publishes their positions each frame (`butterflyState`). They have no Field Guide entry yet.

## Creature cycling and the Field Guide

Creature cycling (`src/creature_cycle.js`) and following are unchanged: following one of several of the same species moves to the next
individual, and otherwise to the next creature in the fixed order. Following a creature lets the castaway go first.

## What was retired

- The seven translucent boxes are now three (focus card, hint bar, menu).
- Survival Mode, its meters and its HUD, and the first-person walk camera (the castaway's own body replaces it).
- The old single left/right menu cycle: navigation is spatial now.

## Tests

The live game was driven with real key events and a fake gamepad (`navigator.getGamepads`), in the test browser:

- The hint bar and the reference switch with the family in use; a key press returns them to the keyboard.
- Menu: the D-pad moves to the control in each direction, the tabs are reached from the top row, LB and RB change section, A presses,
  B closes, and a slider moves with the D-pad.
- Under control: the stick walks, RT runs, A jumps, R3 switches view, Back and held B let go; the menu blocks movement.
- Observation: the free camera, creature following and cycling, and the Field Guide still work.
