# Silver Gull flight and behavior notes

## Species choice and visual references

The existing generic island gull used a northern herring-gull color pattern. I used the Silver Gull as the anatomy/plumage target because it occurs in Australia, New Zealand, and New Caledonia and is a plausible regional gull for a South Pacific island. Adults are compact (roughly 40–45 cm), white below, light gray above, black-tipped, with orange-red bill, legs, and eye ring. The juvenile is mottled brown-gray with dark bill/eye details.

Photo references reviewed from multiple viewpoints:

- [Australian Museum Silver Gull profile and colony photos](https://australian.museum/learn/animals/birds/silver-gull/) — adult coloration, size, range, and habitat.
- [Museums Victoria Silver Gull photo collection](https://collections.museumsvictoria.com.au/species/8214) — side, rear, flight, feeding, and standing photographs.
- [Silver Gull in flight, Wollongong](https://dl.id.au/1/g.php?c=1&i=496) — oblique flight silhouette over water.
- [Silver Gull flight gallery](https://aladdin.st/bird-watching/australia/silver_gull.html) — several adult flight views.
- [Immature Silver Gull in flight, Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Silver_Gull_in_flight.jpg) — juvenile color and open-wing pattern.
- [Silver Gull at rest, lirralirra](https://www.lirralirra.com/kwee-aarr-kwee-aarr/) — standing adult, head profile, bill, legs, and folded-wing color.

The photographs support a compact body, broad swept wing planform, white underside, gray upperwing, dark outer primaries, and red adult bill/legs. The model keeps feather and face details simple enough to remain readable in Paradise Island's classic 3D game style.

## Observed behavior translated for the game

Silver Gulls stay close to land more often than pelagic seabirds, gather around fishing boats and food sources, and forage opportunistically on fish and coastal invertebrates. They also spend substantial time loafing, preening, and resting. These are the useful behavioral anchors for a beach-and-lagoon species.

Gulls use both powered flapping and gliding. A tracking study of Lesser Black-backed Gulls found more flapping than soaring, with soaring around 27% of flight time in that sample. That percentage is from a related gull species, not a direct Silver Gull measurement, so treat it as a starting point for game pacing rather than a Silver Gull constant. The controller should select glide phases more often when a coastal breeze or lift is available.

Recommended in-engine state loop:

1. **Perch or float:** choose beach, rock, dock, or calm water; idle with head scans and occasional preening.
2. **Alert and launch:** notice a feeding opportunity, nearby disturbance, or route target; take off with a short wing acceleration.
3. **Coastal patrol:** follow loose shoreline waypoints and cove edges, using flap cycles for powered movement and longer glides in favorable wind.
4. **Bank and redirect:** bank into turns; vary radius and altitude with speed and wind rather than drawing a perfect repeated circle.
5. **Forage:** inspect a surface patch, make an occasional shallow plunge or surface pickup, then climb away. Keep dramatic steep dives rare.
6. **Loaf or return:** settle onto a nearby shore, rock, dock, or the water. Let most birds rest between brief feeding trips.
7. **Flush response:** when the player approaches closely, launch a short distance and land again. Avoid making every bird flee at long range.

Use loose spacing and independent timing. A few gulls can converge briefly on a visible food source, but the background birds should patrol, drift, perch, and rest independently. Keep them near shore and lagoon food sources instead of copying the high offshore routes of frigatebirds or terns.

## Research sources

- [Australian Museum — Silver Gull](https://australian.museum/learn/animals/birds/silver-gull/)
- [Museums Victoria — Silver Gull](https://collections.museumsvictoria.com.au/species/8214)
- [Flap or soar? How a flight generalist responds to its aerial environment](https://pmc.ncbi.nlm.nih.gov/articles/PMC4992719/) — tracked Lesser Black-backed Gulls; used cautiously for broad gull flight rhythm.
- [Wing morphing allows gulls to modulate static pitch stability during gliding](https://pmc.ncbi.nlm.nih.gov/articles/PMC6364660/) — gull wing shape changes during gliding.

