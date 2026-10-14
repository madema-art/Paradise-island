# Paradise Island Silver Gull Package

This isolated Blender package replaces the generic gull concept with a regionally plausible Silver Gull (*Chroicocephalus novaehollandiae*), matching the game's South Pacific setting. No live Paradise Island game files or behavior code were changed.

## Deliverables

- `blender/Paradise_Island_Silver_Gulls.blend` — source scene with adult and immature variants, rigs, actions, and review cameras.
- `blender/build_silver_gull.py` — repeatable Blender 5.2 build/export script.
- `assets/Paradise_Island_Silver_Gull_Adult.glb` — adult plumage.
- `assets/Paradise_Island_Silver_Gull_Juvenile.glb` — juvenile plumage.
- `renders/` — adult and juvenile side, front, and three-quarter renders, plus flap, dive, and perch pose checks.
- `BEHAVIOR_NOTES.md` — research findings and recommended in-engine behavior states.

## Visual work

The adult has the Silver Gull's compact, full-bodied coastal-gull form, white head and underparts, light gray mantle and wings, black primary tips with small pale mirrors, and orange-red bill, legs, and eye rings. The juvenile is smaller, with muted brown-gray upper plumage and a dark bill and eyes. The shapes remain readable at game distance and use restrained feather grouping rather than fine feather textures.

The two GLBs each contain one 10-joint skin and nine named animation clips. Feather details are merged by deform joint, yielding nine mesh objects per model. GLB sizes are about 228 KiB for the adult and 209 KiB for the juvenile.

## Animation clips

- `Flight_Flap_Cycle` — approximately 2 wingbeat cycles per second at 24 fps.
- `Flight_Soar_Glide` — extended wings with restrained correction.
- `Flight_Banked_Turn` — asymmetric bank pose.
- `Flight_Shallow_Dive` — body pitch with flight posture.
- `Flight_Takeoff` — opens folded wings into flapping flight.
- `Flight_Landing_Flare` — flares, trails feet, and folds wings.
- `Ground_Perch_Idle` — folded wings, subtle head turns, and tail adjustment.
- `Surface_Rest_Float` — folded wings and gentle body/head corrections.
- `Ground_Preening` — folded wings and a short head-to-wing preen gesture.

The exported clips animate the bird pose. In-engine translation, wind response, water contact, route choice, and state selection belong to the game's movement controller.

## Reference comparison

I compared side-on, frontal/open-wing, and oblique flight photographs with the rendered views. The revised silhouette has a compact gull body, proportionally long broad wings, a modest head and bill, trailing legs, and separate black-tipped primaries. Adult and juvenile plumage patterns are distinct without changing the underlying species shape. The photo reference list and behavior notes are in `BEHAVIOR_NOTES.md`.

