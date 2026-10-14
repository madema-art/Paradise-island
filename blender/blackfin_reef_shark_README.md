# Blackfin reef shark (Carcharhinus melanopterus) — model, rig and behaviour

Replaces the old procedural "Blacktip reef shark" in `src/fauna_sea.js`. The old name was wrong: the blacktip is
*C. limbatus*. The blackfin is *C. melanopterus*, the species this model follows.

## Files
- `blender/build_blackfin_reef_shark.py` — the headless build (mesh, skin, rig, clips, preview, GLB export).
- `blender/Paradise_Island_Blackfin_Reef_Shark.blend` — the Blender source.
- `blender/blackfin_reef_shark_preview.png` — studio preview render.
- `assets/Paradise_Island_Blackfin_Reef_Shark.glb` — the game asset (1 rig, 8 joints, 6 clips).
- `src/shark_model.js` — loader and per-animal mixer, modelled on `src/dolphin_model.js`.
- `src/fauna_sea.js` — `Shark` class: patrol, hover, burst and turn behaviour.

Rebuild: `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python-exit-code 1 --python build_blackfin_reef_shark.py` (run from `blender/`).

## Research (what the model is based on)
Looks (identification and proportions):
- Black tips on the first dorsal, second dorsal, pectorals and the lower caudal lobe; a black dorsal trailing edge on the upper lobe. First dorsal large and falcate; short free tip on the second dorsal; large narrow falcate pectorals. Short, rounded snout; no interdorsal ridge. Back light brown to brown-grey, underside white with a white flank band.
  — Australian Museum, https://australianmuseum.net.au/Blacktip-Reef-Shark-Carcharhinus-melanopterus-Quoy-Gaimard-1824
  — Seatizens, https://seatizens.sc/species/carcharhinus-melanopterus-quoy-gaimard-1824
- Size: most adults under 1.6 m total length, common to 160 cm; maximum about 2 m. Model is 1.8 m.
  — Naturalis field guide, https://sharks.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=62707
  — Reef Life Survey, https://reeflifesurvey.com/species/carcharhinus-melanopterus/
  — Florida Museum, https://www.floridamuseum.ufl.edu/fish/discover/species-profiles/carcharhinus-melanopterus

Behaviour:
- Fast, energetic, often in groups in channels between reef flats. Sharks of this group are less active in daytime in deeper, cooler water and more active over a wider area at night, peaking in the early evening.
  — Sharks & Rays, https://sharksandrays.com/blacktip-reef-shark/ (blacktip)
  — St Andrews activity-seascape study on blacktip and grey reef sharks, https://research-repository.st-andrews.ac.uk/handle/10023/14381
- Rest is low-energy but never full stillness.

Locomotion:
- Blacktip drone study (80 wild individuals): tailbeat frequency and amplitude both rise with speed; posterior bending trades tailbeat frequency against amplitude. DOI https://doi.org/10.3390/drones4040078
- Caribbean reef shark wild kinematics (Kajiura et al.): head yaw about 15% faster than the tailbeat; tail amplitude roughly 80% greater than head yaw. Record on NSF PAR, https://par.nsf.gov/servlets/purl/10328655 (not confirmed as the exact record).
- Carcharhinids show a "double oscillating" body wave: head at higher frequency, smaller amplitude; tail at lower frequency, larger amplitude.

Caveats on the research: the sources above were read as search summaries. I did not read the full papers. Blackfin-specific numbers for pectoral use, cave resting and absolute tail amplitude were not found; those parts of the behaviour come from blacktip and grey reef shark studies and are design choices.

## Model
- Body: loft of 25 cross-sections over 56 segments, nose at −X (same convention as the dolphins), 1.8 m overall. Flatter head, slim peduncle, flatter belly than back.
- Materials: back `#776E62`, belly `#EDEFEA`, fins `#6A6358`, black tips `#101112`, eye `#070809`, gill slits `#2C2723`.
- Fins: first dorsal (falcate, with black apex), second dorsal (short free tip), anal fin, heterocercal caudal (broad upper blade, black trailing edge; lower lobe with black tip), pectorals (sickle, black tip).
- Eyes, nostrils, five gill slits, mouth line.

## Rig and clips
Joints: `Root` (head), `Spine_Front`, `Spine_Mid`, `Spine_Rear`, `Peduncle`, `Caudal`, `Flipper_L`, `Flipper_R`. Skin weights blend along the spine. Fins and eyes are rigid-bound to bones.

The lateral and vertical axis of each joint is measured from the rig at build time (rotate, measure the tail displacement), not assumed.

| Clip | Length | Loop | Use |
|---|---|---|---|
| Patrol_Cruise | 6.0 s | yes | cruising, 8 tail beats and 9 head yaws per clip |
| Patrol_Fast | 3.0 s | yes | faster swimming |
| Hover_Rest | 8.0 s | yes | slow hovering, small tail movement |
| Turn_Left | 2.2 s | no | body bend to the shark's left (−Y) |
| Turn_Right | 2.2 s | no | body bend to the shark's right (+Y) |
| Dash_Strike | 1.6 s | no | burst start |

Head yaw uses a higher frequency (9:8 head to tail in Patrol_Cruise, matching the measured ~1.15 ratio), smaller amplitude than the tail, and the wave runs head to tail.

## Behaviour (`src/fauna_sea.js`, `Shark`)
- Patrols the same reef-mouth orbit as before, now at real speeds: cruise about 1.6 m/s, burst up to 4.6 m/s, hover about 0.35 m/s, turn at about 0.9 m/s.
- Modes, chosen on each new mode: burst about 17% by day and up to 28% at night; turn 12%; hover 25%; patrol the rest (about 46% by day). Burst begins with Dash_Strike, then Patrol_Fast.
- Activity follows the time of day: slower and more hovering in the day, more active at dusk and at night.
- Depth: unchanged from before (between −0.35 m and −0.75 m).

## Verification (in the game, via the preview server)
- Build: `npm run build` passes; Blender build runs with no errors; GLB contains the 6 clips and the 8-joint skin.
- Field guide: the shark's entry shows the new description; following the shark keeps it in frame.
- Speed (60 simulated seconds, stepped with `window.__step`): midday mean 1.5 m/s (peak 4.2 m/s); night mean 2.0 m/s (peak 4.6 m/s, 17% of time above 2.5 m/s).
- Animation: bone rotations change over time with the clips; peak-to-peak body swing: head (Root) 0.07 rad, mid-body 0.21 rad, caudal 0.50 rad.
- Preview render checked for silhouette and markings.

## Limitations
- Realism is limited to what procedural Blender modelling gives: no denticle or photographic skin texture, and no reference photo matching.
- Head-to-tail amplitude is about 7:1 in joint angles, not the ~1.8:1 measured for the Caribbean reef shark. Closing this needs calibration against measured displacement data. I did not do that.
- Pectoral fins are flat sheets with black tips; they are not angled down as in life.
- Cave resting and pectoral use are not modelled; the sources do not describe them for blackfins.
- Turns are body bends on the orbit, not steering manoeuvres.
