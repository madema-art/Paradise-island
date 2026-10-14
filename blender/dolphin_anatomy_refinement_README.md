# Paradise Island Bottlenose Dolphin Anatomy Refinement

This is an isolated Blender-only anatomy refinement for the existing Paradise Island dolphin family. It does not include game source changes, pod logic, or live project files.

## Deliverables

- `blender/Paradise_Island_Dolphin_Species.blend` — editable Blender family scene, rigs, and NLA animation library.
- `assets/Paradise_Island_Dolphin_Family.glb` — five-variant game family with skinning and reusable animations.
- `assets/Paradise_Island_Dolphin_Animation_Rig.glb` — compact single-adult rig and the same clip set.
- `blender/build_dolphins_refined.py` — reproducible Blender source for this refinement.
- `blender/dolphin_reference_side.png`, `dolphin_reference_front.png`, and `dolphin_reference_three_quarter.png` — clean neutral-pose model views.
- `blender/dolphin_jump_deformation_check.png` — side render at the authored breach apex to review fin and body-part seating.
- `blender/dolphin_family_preview.png` — five-variant family lineup.

## Anatomy pass

The earlier model's long pointed rostrum, thin head profile, narrow trunk, angular fins, and raised eye pieces gave it a shark-like read. The revised shared profile has a rounded melon with a visible transition into a shorter, thicker blunt beak; a gently rising mouth crease; smaller eyes seated on the lateral head surface; and a broader chest/shoulder mass. The dorsal fin has a softer backward sweep, pectoral fins use fuller rounded paddle profiles, and the paired horizontal flukes have broader rounded lobes and a clear center notch. Smooth gray-blue dorsal tones and pale underside materials remain across the same five variant colorways.

The five existing variants remain: adult male lagoon, adult female warm gray, silver-mist juvenile, slate-blue calf, and adult slate. Their scales and modest body roundness differences are preserved; the calf keeps the softer, fuller profile and proportionally larger eyes.

## Reference comparison

Photographic checks were made from side/profile, front, and oblique views. The profile pass followed the NOAA Fisheries bottlenose photo and the CMS photo for the rounded forehead-to-beak transition, short heavy rostrum, robust torso, and backward-curving mid-back dorsal fin. The front pass compared forehead breadth, lateral eye placement, and bilateral fin spread against the WWF image and the Kyoto Aquarium photo set. The three-quarter pass checked body volume, beak/forehead separation, and fin attachment against the Kyoto Aquarium and Navy Marine Species Monitoring photographs.

Reference pages and images:

- [NOAA Fisheries: Common Bottlenose Dolphin](https://www.fisheries.noaa.gov/species/common-bottlenose-dolphin) — species photo and short, thick rostrum / gray countershading description.
- [National Park Service: Bottlenose Dolphins](https://www.nps.gov/guis/learn/nature/bottlenose-dolphin.htm) — identifying features, curved mouth, swept dorsal, pointed pectorals, notched flukes.
- [WWF: Responsible whale and dolphin watching](https://www.wwf.de/aktiv-werden/tipps-fuer-den-alltag/umweltfreundlich-reisen/tauchen-schnorcheln-und-bootstouren-wale-und-haie-verantwortungsvoll-beobachten) — frontal swimming photograph used for head-on proportions.
- [Kyoto Aquarium: Bottlenose dolphin photo column](https://www.kyoto-aquarium.com/column/fb-i-alhxt/) — front and oblique views plus melon/rostrum terminology.
- [U.S. Navy Marine Species Monitoring: Panama City Dolphin Survey](https://www.navymarinespeciesmonitoring.us/blog/panama-city-dolphin-survey-complete/) — field photographs including a mother/calf pair.
- [Convention on Migratory Species: Bottlenose dolphin photo](https://www.cms.int/sites/default/files/species/bottlenose-dolphin.jpg) — side profile used to check torso, snout, and dorsal shape.

## Rig, clips, and validation

The existing nine-bone skeleton was preserved on all five variants: `Root`, `Spine_Front`, `Spine_Mid`, `Spine_Rear`, `Peduncle`, `Tail_Flukes`, `Dorsal`, `Flipper_L`, and `Flipper_R`. The family GLB exports five skins and all 13 prior animation clips: `Swim_Idle`, `Swim_Cruise`, `Swim_Fast`, `Swim_TurnBank`, `Surface_Breath`, `Jump_Breach`, `Dive_Return`, `Playful_Leap`, `Surface_Bob`, `Group_Follow`, `Calf_Swim`, `Mother_Calf_Paired`, and `Social_Circle`.

Blender 5.2.1 successfully regenerated the `.blend`, both GLBs, and the renders. GLB structure validation confirmed version 2, five 9-joint family skins, one 9-joint standalone skin, and all 13 named clips in both exports. The breach-apex render was inspected for detached or visibly separated parts; the dorsal fin, flippers, peduncle, and flukes remain visually seated through that pose. Pod behavior and game files were not changed.
