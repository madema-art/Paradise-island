// Natural-history notes for the field guide, keyed by the creature's registry name. Facts are general species accounts
// (not measured in the game). Entries marked 'analogue' or 'fictional' are game names: their notes say which real animal
// they are modelled on, or that they are invented. Live simulation data is read separately, in liveFacts(), from the
// simulation object each creature registers as `sim`.
import { makeDolphinModel } from './dolphin_model.js';
import { makeGullModel } from './gull_model.js';
import { makeSharkModel } from './shark_model.js';
import { makeFrigatebirdModel } from './frigatebird_model.js';
import { makeSeaEagleModel } from './sea_eagle_model.js';
import { makeWhaleModel } from './whale_model.js';
import { makeTurtleModel } from './turtle_model.js';

export const STATUS = {
  real: 'Real species',
  assumed: 'Real species (assumed match)',
  analogue: 'Game name, modelled on a real relative',
  fictional: 'Fictional species',
  character: 'Fictional character',
};

export const SPECIES = {
  'Capuchin monkey': {
    status: 'real', sci: 'Sapajus spp. (tufted capuchins)',
    note: 'A real Neotropical genus. It does not live on Pacific islands; this troop is part of the game world.',
    physical: 'Slender, dark-furred monkey with a crest of longer hair on the crown and a long, grasping tail that works as a fifth hand.',
    size: 'Body 30–55 cm, tail about as long, 1.5–4 kg.',
    diet: 'Fruit, seeds, nuts, insects, eggs and small animals. Hard nuts are cracked open on stones or roots. On this island the troop also bursts out of the undergrowth to snatch coconuts that fall or roll, carries them off and eats them, and will beat the castaway to one if it can.',
    habitat: 'Forest and forest edge, foraging in the canopy and on the ground.',
    social: 'Troops of about 6–30 with several adults of each sex. Females usually stay in their birth group; males move between troops. Grooming builds bonds.',
    activity: 'Diurnal: long foraging bouts in the morning and late afternoon, with rests through the heat of the day.',
    reproduction: 'One infant after about five to six months of pregnancy. Other troop members often help carry it. Births are about two years apart.',
    ecology: 'Seed disperser and insect predator in forest. Their stone tool use is one of the best-documented in non-human primates.',
    facts: ['Tufted capuchins crack hard nuts with stone hammers and anvils.', 'Troops patrol their home range and give alarm calls when a predator approaches.'],
  },
  'Wild boar': {
    status: 'real', sci: 'Sus scrofa',
    note: 'Native to Eurasia and North Africa; introduced to many Pacific islands, where it damages forest.',
    physical: 'Heavy body with a bristly coat, a long mobile snout with a flat rooting disc, and tusks (larger in males).',
    size: 'Adults 0.9–1.8 m long, 50–150 kg. Males are larger than females.',
    diet: 'Omnivore: roots, tubers, fallen fruit, fungi, invertebrates, carrion and small animals. On the island it snaps up any rat that wanders within reach.',
    habitat: 'Forest, scrub, grassland and wetland edges. Common near people.',
    social: 'Females and young form matriarchal groups called sounders. Adult males are solitary or in loose bachelor groups.',
    activity: 'Mostly nocturnal where people or dogs are present; more active by day in quiet areas.',
    reproduction: 'Gestation about 115 days. Litters of four to six, sometimes more. Sows build nests and defend their young.',
    ecology: 'Rooting turns over the soil and spreads seeds and fungi. On islands it can change forest regeneration.',
    facts: ['Adults can run at about 45 km/h over short distances.', 'Boars rub against trees and wallow in mud to keep cool and clear parasites.'],
  },
  'Boar piglet': {
    status: 'real', sci: 'Sus scrofa (young)',
    note: 'The young of the wild boar.',
    physical: 'Dark brown with cream-yellow stripes along the body, which fade as the piglet grows.',
    size: 'Newborns weigh about 1 kg.',
    diet: 'Milk first, then soft roots and invertebrates dug up beside the sow.',
    habitat: 'Stays with its sow and sounder.',
    social: 'Kept close by the sow and the sounder; play-fights with littermates.',
    activity: 'Active with the sounder, mostly around dawn and dusk.',
    reproduction: 'Piglets stay with the sow for months. Females become sexually mature within about a year.',
    ecology: 'Prey for dogs and large predators where they live.',
    facts: ['Piglets keep in a tight group and follow the sow closely from birth.', 'The stripes are camouflage in dappled light.'],
  },
  'Silver tusker': {
    status: 'real', sci: 'Sus scrofa (old male)',
    note: 'A very old solitary boar. Males grey with age and their tusks keep growing for life.',
    physical: 'The biggest animal on the island: a heavy, grizzled grey body, a shaggy dark mane and curved tusks that can grow longer than a hand.',
    size: 'Up to 1.8 m long and well over 100 kg; old males can be half as heavy again as sows.',
    diet: 'Omnivore: roots, tubers, fallen coconuts, eggs and carrion.',
    habitat: 'Forest and scrub; keeps a large territory of its own.',
    social: 'Old males live alone and only join a sounder to mate. He stands his ground, grunting and champing his jaws, and bluff-charges anyone who comes too close.',
    activity: 'Forages at dawn and dusk, wallows through the heat of the day.',
    reproduction: 'Males compete for sows with shoulder-to-shoulder shoving; thick gristle over the shoulder (the shield) protects against tusks.',
    ecology: 'The tusks are lower canines that sharpen against the upper ones as the jaw closes.',
    facts: ['The upper canines whet the lower ones to a razor edge every time the boar grinds its jaws.', 'A boar that stands very still with its head up is usually deciding whether to run or charge.'],
  },
  'Ginger boar': {
    status: 'real', sci: 'Sus scrofa domesticus (feral)',
    note: 'Feral pigs descended from escaped farm animals. On Pacific islands they are common and come in many colours.',
    physical: 'A rusty-red coat, a short mane and small tusks, with ears that flop outward.',
    size: 'About 1.0-1.5 m long, 60-120 kg.',
    diet: 'Omnivore: roots, windfall fruit, eggs, crabs and scraps.',
    habitat: 'Forest edges and clearings near water.',
    social: 'Sows and young form small groups. Feral pigs are less afraid of people than true wild boar and may walk up to look.',
    activity: 'Rests in the midday heat, most active early and late in the day.',
    reproduction: 'Feral sows can have two litters a year of six to ten piglets.',
    ecology: 'Feral pigs dig up large areas and eat the eggs of ground-nesting birds, a serious problem on islands.',
    facts: ['Feral pigs lose their domestic colours slowly, but the piglets of ginger pigs may still show stripes.', 'Pigs have no sweat glands, which is why they wallow.'],
  },
  'Spotted pig': {
    status: 'real', sci: 'Sus scrofa domesticus (feral)',
    note: 'Black-and-pink pigs like those carried on old sailing ships, left behind and gone half wild.',
    physical: 'Cream-pink skin with big black patches, lop ears and only a short, thin mane.',
    size: 'About 1.0-1.4 m long, 60-110 kg.',
    diet: 'Omnivore: roots, fruit, coconuts, insects and anything dropped by people.',
    habitat: 'Open forest, scrub and the edge of the temple clearing.',
    social: 'Sociable and curious: they come to see anyone standing quietly, then lose interest.',
    activity: 'Dozes in the shade at noon and wallows to stay cool and keep the sun off pink skin.',
    reproduction: 'Litters of six to ten piglets, born in a nest of grass and leaves.',
    ecology: 'Pale pigs sunburn easily, so they use mud as sunscreen.',
    facts: ['No two spotted pigs share the same pattern.', 'Mud acts as a sunscreen and keeps flies off.'],
  },
  'Fruit bat': {
    status: 'real', sci: 'Pteropus (flying fox)',
    note: 'The flying foxes of the South Pacific are the largest bats in the world, and the only native mammals of many Pacific islands.',
    physical: 'A fox-like face with big dark eyes and sharp ears, a golden mantle over a dark brown coat, and leathery wings spanning about a metre and a half when open.',
    size: 'Body about 25 cm; wingspan 1.2 to 1.5 m; 400 to 900 g.',
    diet: 'Fruit, nectar and blossom. They squeeze fruit and swallow only the juice, spitting out the pulp.',
    habitat: 'Roosts in caves and big trees by day, feeds over the whole island at night.',
    social: 'Colonial: hundreds roost shoulder to shoulder in clusters, squabbling, grooming and calling. When one is alarmed the whole colony takes off together.',
    activity: 'Nocturnal. They leave the roost in a long stream at dusk and come back at dawn, circling before each bat hooks on to its own spot.',
    reproduction: 'One pup a year, carried clinging to the mother for her first weeks, then left in a crèche in the roost.',
    ecology: 'Pollinators and seed dispersers: forests across the Pacific depend on them. They fly 50 km or more in a night.',
    facts: ['They roost upside down because their legs are too weak to take off from the ground: they simply drop and open their wings.', 'Flying foxes fan their wings and lick them to cool down on hot days.', 'The wing is a hand: four stretched fingers hold up the membrane.'],
  },
  'Island rat': {
    status: 'real', sci: 'Rattus exulans (Polynesian rat)',
    note: 'A real species. Polynesian voyagers carried it in their canoes across the Pacific, so it is found on almost every island of the region, often long before Europeans came.',
    physical: 'A small, slim rat with a pointed snout, large thin ears, long whiskers and a scaly tail as long as the body. The fur is brown above and pale grey-cream below.',
    size: 'Body about 11–15 cm, tail about the same, 40–80 g.',
    diet: 'Omnivore: seeds, fallen fruit and coconut, nuts, insects, snails, and the eggs and chicks of ground-nesting birds.',
    habitat: 'Burrows and cover at the foot of palms and in scrub and forest edge, from the beach to the hills.',
    social: 'Mostly solitary or in loose family groups, each with a small home range round its burrow.',
    activity: 'Nocturnal and crepuscular. By day it stays down; it comes out at dusk, freezes at a sound overhead and bolts for the burrow when something big moves.',
    reproduction: 'Several litters a year of about four young, which can breed within a few months.',
    ecology: 'The base of the island food chain: owls, snakes, boars and people all eat it. It also eats the seeds of island plants and has driven many native birds to extinction by taking eggs and chicks.',
    facts: ['Its whiskers read the ground in the dark; it can squeeze through a gap the width of its skull.', 'Rats were carried on purpose by Polynesian voyagers as a food source as well as by accident.'],
  },
  'Barn owl': {
    status: 'real', sci: 'Tyto alba',
    note: 'A real species found on every continent but Antarctica, including many Pacific islands.',
    physical: 'A pale, long-legged owl with a heart-shaped white facial disc, golden-buff back finely speckled with grey, white underparts, and broad rounded wings.',
    size: 'Length 32–40 cm, wingspan 80–95 cm, 300–700 g.',
    diet: 'Small mammals, above all rodents; also birds, bats and large insects. A barn owl eats several rats a night and swallows them whole.',
    habitat: 'Open country and forest edge with trees or ruins to roost in; by day in a hollow tree, a cave mouth or a dense crown.',
    social: 'Pairs, defending a hunting range. Roosts alone by day.',
    activity: 'Nocturnal. It hunts from dusk, flying low and slowly in sweeps over open ground, and is home by dawn.',
    reproduction: 'Clutches of 4–7 eggs in a hollow or ledge, laid at intervals; the oldest chick hatches first and is fed first.',
    ecology: 'A main predator of rats and mice, and a farmer\'s ally. Its pellets of fur and bone tell biologists exactly what lives in a place.',
    facts: ['Its feathers have soft fringes that make its flight almost silent, so it can hear prey without the noise of its own wings.', 'It can locate a mouse under leaves or snow by sound alone, and its ears are set at different heights to judge up and down.', 'An owl cannot turn its eyes, so it turns its whole head, up to about 270 degrees.'],
  },
  'Pacific boa': {
    status: 'real', sci: 'Candoia bibroni',
    note: 'A real species of the western Pacific (Solomon Islands, Vanuatu, Fiji, Samoa, Tonga); a boa rather than a python, and one of the few boas outside the Americas.',
    physical: 'A stout, heavy-bodied snake with a flattened, wedge-shaped head, keeled scales and a short tail. Tan to brown with darker blotches along the back and a cream belly.',
    size: 'Typically 1–1.5 m, occasionally to 2.2 m; heavy for its length.',
    diet: 'Rats and other small mammals, lizards, frogs and birds, killed by constriction and swallowed whole.',
    habitat: 'Forest floor and low branches, under logs and leaf litter, in coconut plantations and gardens.',
    social: 'Solitary. Gives birth to live young.',
    activity: 'Nocturnal and slow. It spends the day coiled under cover and hunts at night by scent, tasting the air with its forked tongue, and by ambush.',
    reproduction: 'Live-bearing: litters of about 6–30 young, born fully formed.',
    ecology: 'Keeps rodents down, including the introduced rats of island coconut groves. Harmless to people unless handled.',
    facts: ['It smells with its tongue: the forked tips carry scent to a pair of organs in the roof of the mouth, one for each fork.', 'After a large meal a boa may not eat again for weeks, lying up while the meal is digested.', 'Constriction does not crush its prey: the coils stop the heart and the breathing.'],
  },
  'Red beach crab': {
    status: 'analogue', sci: 'Game species (no formal name)',
    note: 'A game species. It is modelled on rocky-shore crabs of the Pacific; its closest real relative is the sally lightfoot crab (Grapsus grapsus).',
    physical: 'Flattened red-shelled crab with long legs and a squared carapace, built for scrambling over rock.',
    size: 'Carapace about 5 cm across.',
    diet: 'Algae and scraps from rock pools.',
    habitat: 'Rocky shores and rock pools.',
    social: 'Solitary, but dense on good rock.',
    activity: 'Daytime; retreats into crevices during the midday heat.',
    reproduction: 'Not simulated in the game.',
    ecology: 'Scavenges along the shore; eaten by herons and gulls.',
    facts: ['Its flattened body lets it slip into narrow cracks.'],
  },
  'Ghost crab': {
    status: 'real', sci: 'Ocypode ceratophthalmus (Indo-Pacific ghost crab)',
    note: 'A real genus of sand crabs found across the Indo-Pacific.',
    physical: 'Pale, sand-coloured crab with large eyes on stalks and long legs. It runs sideways or straight at speed.',
    size: 'Carapace up to about 5 cm; legs spread wide.',
    diet: 'Scavenges, eats small animals and hatchlings, and some plant matter.',
    habitat: 'Open sandy beaches and dunes. It digs burrows above the high-tide line.',
    social: 'Solitary. Burrows are defended.',
    activity: 'Strictly nocturnal; it stays in its burrow by day.',
    reproduction: 'Females carry eggs under the abdomen and release larvae into the sea.',
    ecology: 'Clears carrion from beaches and preys on turtle hatchlings.',
    facts: ['Ghost crabs are among the fastest runners of any crab.', 'Their eyes swivel on stalks to watch for predators.'],
  },
  'Hermit crab': {
    status: 'real', sci: 'Coenobita spp. (land hermit crabs)',
    note: 'Real land hermit crabs of tropical shores.',
    physical: 'Soft abdomen hidden in a borrowed snail shell, with one large claw that plugs the shell opening.',
    size: 'Up to about 15 cm including the shell.',
    diet: 'Fallen fruit, coconut, leaves, seeds and scavenged matter.',
    habitat: 'Tropical beaches, coastal forest and palm groves. Needs humid shelter by day.',
    social: 'Gathers in loose groups at food and water.',
    activity: 'Mainly night and dusk.',
    reproduction: 'Females release larvae into the sea, where they develop before returning to land.',
    ecology: 'Clears fallen fruit and litter, and disperses seeds.',
    facts: ['Hermit crabs trade up to a larger shell as they grow.', 'Land hermit crabs can live for decades.'],
  },
  'Coconut crab': {
    status: 'real', sci: 'Birgus latro',
    note: 'A real species of Indo-Pacific islands.',
    physical: 'The largest land-living arthropod: a massive crab with thick dark armour, strong front claws and a soft, curled abdomen.',
    size: 'Leg span up to about 1 m; weight up to about 4 kg.',
    diet: 'Coconuts, fallen fruit, seeds and carrion. It opens coconuts with its claws.',
    habitat: 'Tropical islands of the Indo-Pacific: forest, beach and burrows.',
    social: 'Mostly solitary.',
    activity: 'Nocturnal.',
    reproduction: 'Eggs are carried under the female. Larvae live at sea before settling on land.',
    ecology: 'Major seed predator and litter breaker on islands.',
    facts: ['Coconut crabs climb palms to reach coconuts.', 'Juveniles live in empty snail shells until their armour hardens.'],
  },
  'Greater flamingo': {
    status: 'real', sci: 'Phoenicopterus roseus',
    note: 'Native to Africa, Asia and Europe, not the Pacific. This one is a fictional visitor.',
    physical: 'Tall pink wader with a long neck and legs, and a black-tipped bill that bends sharply down. The pink comes from pigments in its food.',
    size: 'About 110–150 cm tall; wingspan about 140–160 cm; 2–4 kg.',
    diet: 'Filter-feeds on brine shrimp, algae, diatoms and small invertebrates, sweeping its bill with its head upside down.',
    habitat: 'Shallow saline and brackish lagoons, lakes and tidal flats.',
    social: 'Very social. Colonies of hundreds to thousands; they feed and display in step.',
    activity: 'Mainly daytime, with feeding continuing into the evening.',
    reproduction: 'Breeds in large colonies on mud mounds. Usually one egg a season; both parents feed the chick a milky secretion from the crop.',
    ecology: 'Its feeding helps shape the shallow-water food web. Gulls and other predators take eggs and chicks.',
    facts: ['Flamingos rest on one leg to conserve heat.', 'Chicks are born grey and turn pink as they eat pigmented food.'],
  },
  'Silver gull': {
    status: 'real', sci: 'Chroicocephalus novaehollandiae',
    note: 'A real gull of Australia, New Zealand and New Caledonia.',
    physical: 'Compact gull. Adults have a white head and underparts, a pale grey back, black primary tips with small white spots, and a red bill, legs and eye ring. Juveniles are mottled brown-grey.',
    size: 'About 40–45 cm long; wingspan about 0.9–1.0 m.',
    diet: 'Omnivore: fish, invertebrates, insects, carrion and scraps. Follows fishing boats.',
    habitat: 'Coasts, estuaries, harbours, lagoons and some inland lakes.',
    social: 'Gregarious all year. Loose flocks feed and roost together; breeds in colonies.',
    activity: 'Diurnal. Roosts on water or sand at night.',
    reproduction: 'Breeds in colonies on islands and beaches. Usually 2–3 eggs; both parents incubate for about three to four weeks. Chicks fledge at around five to six weeks.',
    ecology: 'Scavenger that clears beaches. Takes eggs and chicks of other shore birds.',
    facts: ['Silver gulls steal food from people and other birds, sometimes in mid-air.', 'Gulls soar on sea breezes and thermals and flap only part of the time.'],
  },
  'Rainbow lorikeet': {
    status: 'real', sci: 'Trichoglossus moluccanus',
    note: 'A real parrot of Australia, New Guinea, Indonesia and Pacific islands.',
    physical: 'Bright green body, blue head and belly, orange-red chest, and a brush-tipped tongue for nectar.',
    size: 'About 25–30 cm long; about 100–150 g.',
    diet: 'Nectar, pollen, soft fruit and insects. The brush tongue collects pollen.',
    habitat: 'Woodland, forest edge, coastal scrub, gardens and palms.',
    social: 'Noisy flocks outside the breeding season; pairs when nesting.',
    activity: 'Diurnal. Flies between feeding trees in the morning and afternoon.',
    reproduction: 'Nests in tree hollows. About two white eggs; incubation about 25 days; chicks fledge at roughly seven to eight weeks.',
    ecology: 'Pollinates flowering trees and shrubs as it feeds.',
    facts: ['The brush-tipped tongue is adapted for nectar and pollen.', 'Flocks call constantly in flight.'],
  },
  'Sea eagle': {
    status: 'assumed', sci: 'Haliaeetus leucogaster (white-bellied sea eagle, assumed)',
    note: 'Assumed to be the white-bellied sea eagle, the common sea eagle of this region.',
    physical: 'Large raptor. Adults are dark brown above with a white head, underparts and tail base; a large hooked bill and powerful talons.',
    size: 'About 70–85 cm long; wingspan 1.6–2.2 m; 2–4 kg.',
    diet: 'Fish, seabirds, turtles, carrion and small mammals. Steals food from other birds.',
    habitat: 'Coasts, islands, rivers and lakes, with tall trees for nesting.',
    social: 'Usually in pairs that hold a territory year-round.',
    activity: 'Diurnal. Soars on thermals rising over headlands and volcanoes.',
    reproduction: 'Builds large stick nests in tall trees and reuses them. One to two eggs; both parents incubate. Young fledge after around two to three months.',
    ecology: 'Top predator of shallow coastal waters.',
    facts: ['Pairs often reuse the same nest for many years.', 'It takes fish from the surface with its talons.'],
  },
  'Great frigatebird': {
    status: 'real', sci: 'Fregata minor',
    note: 'A real seabird of tropical oceans.',
    physical: 'Long-winged seabird with a deeply forked tail. Males are black with a red throat pouch they inflate in display; females have a white breast.',
    size: 'About 90–105 cm long; wingspan about 2–2.3 m; about 1–1.6 kg.',
    diet: 'Flying fish, squid and small fish taken at the surface. Steals food from other seabirds.',
    habitat: 'Tropical and subtropical oceans. Roosts and nests on tropical islands.',
    social: 'Colonial breeders. Males display together in trees.',
    activity: 'Diurnal. Can stay in the air for days.',
    reproduction: 'Males inflate the red pouch and shake their wings to attract females. A single chick, raised for many months.',
    ecology: 'Surface predator and kleptoparasite.',
    facts: ['Frigatebirds cannot walk well or take off from water, so they roost in trees and on cliffs.', 'Young birds can stay airborne for many months before they land.'],
  },
  'White tern': {
    status: 'real', sci: 'Gygis alba (white tern)',
    note: 'A real tern of tropical islands and oceans.',
    physical: 'Small, pure-white tern with a dark bill and large dark eyes.',
    size: 'About 30 cm long; wingspan about 70 cm; about 100 g.',
    diet: 'Small fish and squid taken at the surface, often by hovering and dipping.',
    habitat: 'Tropical islands and open ocean. Nests on trees, ledges and bare branches.',
    social: 'Colonial, with loose flocks over lagoons.',
    activity: 'Diurnal. Flies over lagoons by day and roosts at night.',
    reproduction: 'Lays a single egg on a bare branch or ledge without a nest. Both parents take turns incubating; the chick grips the branch with its feet.',
    ecology: 'Surface feeder linking lagoon and open water.',
    facts: ['The chick has strong claws to grip a bare branch.', 'Flocks fly over lagoons in loose groups.'],
  },
  'Bottlenose dolphin': {
    status: 'real', sci: 'Tursiops truncatus',
    note: 'A real, widespread dolphin of warm coastal and offshore waters.',
    physical: 'Streamlined grey dolphin with a short beak, a rounded melon, a falcate dorsal fin and countershading: darker back, paler belly.',
    size: 'Adults 2–3.8 m long, 150–650 kg. Males are larger than females.',
    diet: 'Fish, squid and crustaceans. Hunts cooperatively, sometimes in shallow water.',
    habitat: 'Warm coastal and offshore waters, including lagoon mouths and open ocean.',
    social: 'Fission–fusion societies: pods change membership. Close family groups of 2–15 cooperate.',
    activity: 'Active day and night. Sleeps with one half of the brain resting at a time.',
    reproduction: 'Gestation about 12 months, one calf. Calves nurse for one to two years and stay with their mothers for years. Females breed every few years.',
    ecology: 'Top predator in coastal food webs. Large sharks and killer whales take them in some places.',
    facts: ['Dolphins sleep with one half of the brain at a time, keeping one eye open.', 'In Shark Bay, Australia, some dolphins use sponges as foraging tools.'],
  },
  'Green sea turtle': {
    status: 'real', sci: 'Chelonia mydas',
    note: 'A real sea turtle of tropical and subtropical seas.',
    physical: 'Large turtle with a smooth, heart-shaped shell in olive or brown, and flippers that fly through the water.',
    size: 'Shell up to about 1.2 m; adults 70–200 kg.',
    diet: 'Adults are herbivores that graze seagrass and algae. Juveniles eat more animal food.',
    habitat: 'Seagrass meadows, reefs and lagoons. Nests on tropical beaches.',
    social: 'Solitary at sea; gathers at feeding grounds and nesting beaches.',
    activity: 'Feeds by day and rests at night under ledges.',
    reproduction: 'Females return to their birth beach to lay around 100 eggs per clutch, several clutches a season. Incubation about two months.',
    ecology: 'Grazing keeps seagrass healthy. Hatchlings are prey for crabs, birds and fish.',
    facts: ['Nest temperature sets the sex of the hatchlings: warmer nests produce females.', 'Hatchlings head for the sea at night, guided by the bright horizon.'],
  },
  'Humpback whale': {
    status: 'real', sci: 'Megaptera novaeangliae',
    note: 'A real whale that breeds in tropical waters, including those around Pacific islands.',
    physical: 'Large rorqual with dark upperparts, a white belly and very long pectoral fins studded with bumps.',
    size: 'Adults 12–16 m long, 25–40 tonnes.',
    diet: 'Krill and small fish, taken by lunge feeding or bubble-net feeding.',
    habitat: 'Feeds in polar and temperate seas; breeds in warm shallow tropical waters.',
    social: 'Mostly small, loose groups. Males sing long songs in breeding areas.',
    activity: 'Feeds by day and night. Seasonal migrations.',
    reproduction: 'Gestation about 11–12 months. A calf of 4–5 m nurses for about a year; mothers rest in warm shallow water.',
    ecology: 'Moves nutrients from deep water back to the surface. Killer whales sometimes hunt calves.',
    facts: ['Males sing songs that can last for more than 20 minutes and change slowly over time.', 'Humpbacks breach and slap the water, possibly to communicate.'],
  },
  'Giant manta ray': {
    status: 'real', sci: 'Mobula birostris',
    note: 'A real manta ray of tropical and subtropical seas.',
    physical: 'Huge plankton-feeding ray with a broad triangular disc and cephalic lobes that funnel food into its mouth. Dark back, pale belly.',
    size: 'Disc width up to about 7 m; most adults are smaller.',
    diet: 'Filter-feeds on plankton, krill and small fish.',
    habitat: 'Open ocean and reef edges; often found at cleaning stations.',
    social: 'Usually solitary; gathers in groups at feeding and cleaning sites.',
    activity: 'Mostly daytime feeding; spends long periods gliding.',
    reproduction: 'Long gestation, probably around a year. A single pup is born live.',
    ecology: 'Keeps plankton in check. Cleaner fish and wrasses clean its body at cleaning stations.',
    facts: ['Individuals can be told apart by the spot patterns on their bellies.', 'Mantas fly through the water by flapping their pectoral fins like wings.'],
  },
  'Blackfin reef shark': {
    status: 'real', sci: 'Carcharhinus melanopterus',
    note: 'A real reef shark of the Indo-Pacific.',
    physical: 'Slender grey-brown reef shark with a short, rounded snout, black tips on the first dorsal, pectoral and lower tail fins, and a white underside.',
    size: 'Typically 1.5–1.6 m; adults up to about 2 m.',
    diet: 'Small reef fish, cephalopods and crustaceans taken on reef flats and in channels.',
    habitat: 'Shallow reef flats, lagoons and channels.',
    social: 'Often seen in small groups, which gather in channels between reef flats. Also hunts alone.',
    activity: 'Less active by day in deeper, cooler water. More active over a wider area at night and in the early evening.',
    reproduction: 'Live-bearing, with a few pups per litter. Slow to mature.',
    ecology: 'Mid-level predator on reef fish. Larger sharks may prey on it.',
    facts: ['The black fin tips are its main identification mark.', 'Dusk is one of the most active times for reef sharks.'],
  },
  'Yellow tang school': {
    status: 'real', sci: 'Zebrasoma flavescens',
    note: 'A real surgeonfish of the Pacific reefs.',
    physical: 'Bright yellow surgeonfish with a small sharp spine on each side of the tail base.',
    size: 'About 15–20 cm.',
    diet: 'Grazes algae from coral rock and dead coral.',
    habitat: 'Shallow reef flats and seaward reef slopes.',
    social: 'Loose schools by day.',
    activity: 'Diurnal. Shelters in crevices or under ledges at night.',
    reproduction: 'Spawns in open water; the larvae drift before settling on the reef.',
    ecology: 'Keeps algae in check, which helps coral grow.',
    facts: ['Retractable tail spines are used for defence.', 'Tangs often school with other surgeonfish.'],
  },
  'Blue chromis school': {
    status: 'analogue', sci: 'Chromis spp. (damselfish)',
    note: 'A game name for a school of damselfish. Chromis species from the Indo-Pacific fill this role.',
    physical: 'Small blue-green damselfish with a forked tail.',
    size: 'About 8–12 cm.',
    diet: 'Plankton picked from the water above the reef.',
    habitat: 'Reef tops and slopes.',
    social: 'Schooling, often in large groups above coral heads.',
    activity: 'Diurnal. Shelters in coral at night.',
    reproduction: 'Males guard eggs laid on hard surfaces on the reef.',
    ecology: 'Plankton feeder linking reef and open water.',
    facts: ['Schooling makes the group hard for predators to pick out.', 'Males fan and guard their nests.'],
  },
  'Orange anthias school': {
    status: 'real', sci: 'Pseudanthias squamipinnis',
    note: 'A real anthias of Pacific and Indian Ocean reefs.',
    physical: 'Slender orange-pink fish. Males have an extended dorsal fin and a purplish stripe.',
    size: 'About 10–15 cm.',
    diet: 'Zooplankton picked from the current above the reef.',
    habitat: 'Reef slopes and drop-offs.',
    social: 'Large groups, each female group led by one dominant male.',
    activity: 'Diurnal. Retreats into crevices at night.',
    reproduction: 'Sequential hermaphrodites: all young are female, and some change to male when the dominant male is lost.',
    ecology: 'Plankton-feeding link on reef slopes.',
    facts: ['Anthias can change sex from female to male.', 'Groups stay close to a reef ledge and dart out to feed.'],
  },
  'Silver mullet school': {
    status: 'assumed', sci: 'Mugil cephalus (striped mullet, assumed)',
    note: 'Assumed to be the striped mullet, a widespread lagoon and coastal fish.',
    physical: 'Silvery, torpedo-shaped fish with a flattened head and a small mouth.',
    size: 'Up to about 60 cm; often 20–40 cm.',
    diet: 'Detritus, algae and small invertebrates scraped from the bottom.',
    habitat: 'Lagoons, estuaries and coastal waters. Tolerates fresh water.',
    social: 'Large schools in lagoons and near the surface.',
    activity: 'Diurnal, feeding in the shallows. Leaps from the water.',
    reproduction: 'Spawns offshore in large groups; eggs and larvae drift inshore.',
    ecology: 'Links bottom detritus to sharks and birds that eat it.',
    facts: ['Mullet often jump clear of the water in large numbers.', 'They are an important food fish across tropical coasts.'],
  },
  'Pink fusilier school': {
    status: 'real', sci: 'Pterocaesio spp. (fusiliers)',
    note: 'A real genus of reef-edge planktivores.',
    physical: 'Slender pinkish-yellow fish with a deeply forked tail.',
    size: 'About 15–25 cm.',
    diet: 'Zooplankton picked from the water column in dense schools.',
    habitat: 'Outer reef slopes over deep water.',
    social: 'Large, tight schools that move as one body over the reef slope.',
    activity: 'Diurnal. Schools move back to the reef at night.',
    reproduction: 'Spawns in open water; eggs and larvae drift.',
    ecology: 'Plankton feeder, and prey for reef-slope predators.',
    facts: ['Fusiliers wheel together in tight schools when a predator comes near.', 'They often feed directly above the reef edge.'],
  },
  'Parrotfish school': {
    status: 'real', sci: 'Scarus and Chlorurus spp. (parrotfish)',
    note: 'Real reef fish of the Indo-Pacific.',
    physical: 'Blue, green or pink fish with a beak-like mouth made of fused teeth.',
    size: 'From about 30 cm to more than 1 m, depending on species.',
    diet: 'Scrapes algae and coral skeleton from the reef and excretes fine sand.',
    habitat: 'Coral reefs and reef flats.',
    social: 'Feeds in small groups. Some species form harems led by a dominant male.',
    activity: 'Diurnal. Sleeps at night, wrapped in a mucus cocoon.',
    reproduction: 'Many species change sex, with females becoming males.',
    ecology: 'Major bioeroders that turn coral rock into sand.',
    facts: ['Parrotfish make much of the white sand on tropical beaches.', 'Many sleep inside a cocoon of mucus.'],
  },
  'Yellowfin tuna school': {
    status: 'real', sci: 'Thunnus albacares',
    note: 'A real open-ocean tuna of tropical seas.',
    physical: 'Streamlined, metallic blue back and silver flanks, with bright yellow finlets and long yellow fins.',
    size: 'Up to about 2 m; commonly 1–1.5 m.',
    diet: 'Fish, squid and crustaceans in open water.',
    habitat: 'Warm open ocean, often near reefs and seamounts.',
    social: 'Schools by size, and sometimes mixes with dolphins and other tuna.',
    activity: 'Diurnal. Dives deep at night to feed.',
    reproduction: 'Spawns in warm surface waters for much of the year; the eggs drift.',
    ecology: 'Top pelagic predator.',
    facts: ['Yellowfin tuna keep their core muscles warmer than the surrounding water, which lets them swim fast.', 'Tuna often school under dolphins over deep water.'],
  },
  'Reef fish school': {
    status: 'fictional', sci: 'Mixed reef fish (no single species)',
    note: 'A mixed group of reef fish. Each school colour is a stand-in for many real species.',
    physical: 'Mixed colours and shapes, one school per patch of reef.',
    size: 'Varies by species.',
    diet: 'Plankton, algae and small invertebrates.',
    habitat: 'Reef tops and slopes.',
    social: 'Mixed-species schools form for safety in numbers.',
    activity: 'Diurnal. Shelters in the reef at night.',
    reproduction: 'Varies widely among species.',
    ecology: 'Part of a mixed reef-fish community.',
    facts: ['Mixed-species schools reduce each fish’s chance of being picked off.'],
  },
  'The Castaway': {
    status: 'character', sci: 'Not a species',
    note: 'A fictional character who lives on the island. Biology does not apply to a person in the story.',
    physical: 'A stranded person living off the island: fishing, gathering, building shelter.',
    facts: ['The Castaway’s behaviour follows the time of day and the weather.'],
  },
};

const get = (name) => SPECIES[name] || null;

// the registry name -> a function that builds a rigged specimen with its animation clips (the game's own model factory)
export const SPECIMEN_FACTORIES = {
  'Bottlenose dolphin': (entry) => makeDolphinModel(entry.sim?.variant || 'adultMale'),
  'Silver gull': (entry) => makeGullModel(entry.sim?.variant || 'adult'),
  'Blackfin reef shark': () => makeSharkModel(),
  'Humpback whale': () => makeWhaleModel(),
  'Green sea turtle': () => makeTurtleModel(),
  'Sea eagle': (entry) => makeSeaEagleModel(entry.sim?.age || 'adult'),
  'Great frigatebird': (entry) => makeFrigatebirdModel(entry.sim?.variant || 'male'),
};

// ---- live simulation data --------------------------------------------------------------------------------------
const GULL_STATE = {
  perch: 'Resting', takeoff: 'Taking off', patrol: 'Patrolling the shore', approach: 'Coming in to land', dive: 'Plunging to feed at the surface',
};
const SHARK_MODE = { patrol: 'Patrolling the reef mouth', hover: 'Hovering over the reef', turn: 'Turning', burst: 'Bursting forward' };
const TURTLE_MODE = { travel: 'Swimming to a new feeding patch', graze: 'Grazing on the lagoon floor', rest: 'Resting on the lagoon floor', breathe: 'Surfacing to breathe', flee: 'Startled, swimming away fast' };
const WHALE_MODE = {
  travel: 'Travelling submerged', rise: 'Rising toward the surface', surface: 'Blowing at the surface', rest: 'Resting at the surface',
  slap: 'Slapping the water with its flippers', dive: 'Diving, fluke raised', breach: 'Breaching clear of the water',
};
const DOLPHIN_MODE = {
  cruise: 'Travelling with the pod', rest: 'Resting near the surface', play: 'Playing and leaping', surface: 'Breathing at the surface',
  dive: 'Diving', curious: 'Investigating something',
};
const MONKEY_STATE = { idle: 'Resting or looking around', walk: 'Foraging on the ground', toTree: 'Heading for a tree', climb: 'Climbing', perch: 'Sitting in a tree', descend: 'Coming down from a tree', toRock: 'Heading for a boulder', rock: 'Sitting up on a boulder', unrock: 'Hopping down from a boulder', toNut: 'Sprinting out of the foliage after a coconut', carry: 'Running off with a stolen coconut', eatNut: 'Sitting down to crack open a coconut' };
const BOAR_STATE = { idle: 'Standing and looking about', walk: 'Walking', root: 'Rooting in the leaf litter', alert: 'Alert: head up, watching you', bluff: 'Bluff-charging', flee: 'Running away', zoom: 'Racing about with its siblings', sleep: 'Asleep', rest: 'Dozing in the shade', wallow: 'Wallowing in the mud', drink: 'Drinking at the river', scratch: 'Rubbing against a palm trunk', approach: 'Coming over to look at you', tosleep: 'Looking for a place to lie down', towallow: 'Heading for the mud', todrink: 'Heading for the river', toscratch: 'Heading for a scratching post' };
const RAT_STATE = { hidden: 'Down in its burrow', emerge: 'Coming out of its burrow', forage: 'Foraging for seeds and fallen fruit', run: 'Dashing between cover', sniff: 'Stopped to sniff the air', eat: 'Sitting up to nibble', groom: 'Grooming', freeze: 'Frozen still, something overhead', flee: 'Bolting for a burrow', caught: 'Caught' };
const OWL_MODE = { roost: 'Asleep on its roost', preen: 'Waking and preening', takeoff: 'Taking off for the night', hunt: 'Quartering low over the ground', hover: 'Hovering over a rat', strike: 'Dropping on its prey', carry: 'Carrying prey to a perch', land: 'Landing', eat: 'Swallowing prey whole', return: 'Flying home to roost' };
const BOA_STATE = { rest: 'Coiled up, resting', wake: 'Uncoiling at dusk', search: 'Slithering out, tasting the air', stalk: 'Stalking a rat', strike: 'Striking', constrict: 'Coiling round its prey', swallow: 'Swallowing a rat whole', digest: 'Digesting, coiled up', home: 'Heading home before dawn' };
const CRAB_STATE = { idle: 'Resting', run: 'Scuttling across the sand' };
const LORIKEET_STATE = { perch: 'Resting and scanning', feed: 'Harvesting nectar', takeoff: 'Leaving with its flock', fly: 'Travelling over the canopy', approach: 'Braking toward a perch', landing: 'Gripping its landing perch' };

// the school mind's states (school_mind.js) and how a school holds its shape, as the Field Guide describes them
const SCHOOL_STATE = { cruise: 'Travelling as one shoal', hover: 'Feeding over the reef', flee: 'Scattered, startled by something close' };
const SCHOOL_SHAPE = { ribbon: 'Strung out in a long ribbon', cloud: 'A loose, rounded cloud', loose: 'A wide, loose shoal' };
/** the live facts this creature's simulation exposes, as [label, value] pairs. Only what the game tracks is reported. */
export function liveFacts(c, speed, pos) {
  const s = c.sim || {}, out = [];
  const sub = (lab, val) => { if (val !== undefined && val !== null && val !== '') out.push([lab, val]); };
  if (c.name === 'Bottlenose dolphin') {
    const pod = s.pod;
    sub('Pod', pod ? (pod.podId === 'north-ocean-pod' ? 'North ocean pod' : 'Offshore pod ' + (pod.podId.split('-').pop())) : '');
    sub('Role', s.role === 'leader' ? 'Pod leader' : s.role === 'mother' ? 'Mother' : s.role === 'calf' ? 'Calf' : s.role === 'juvenile' ? 'Juvenile' : 'Adult');
    sub('Sex', s.sex);
    sub('Age class', s.age);
    if (s.role === 'mother' && pod && pod.calf) sub('Offspring', 'The calf in this pod');
    if (s.role === 'calf' && pod && pod.mother) sub('Mother', 'The mother in this pod');
    const act = s.jumpTime >= 0 ? 'Breaching clear of the water' : (DOLPHIN_MODE[pod ? pod.mode : s.currentMode] || 'Swimming');
    sub('Doing', act);
  } else if (c.name === 'Silver gull') {
    sub('Plumage', s.variant === 'juvenile' ? 'Juvenile' : 'Adult');
    const st = GULL_STATE[s.state] || 'Flying';
    sub('Doing', s.state === 'perch' && s.perch && s.perch.water ? 'Floating on the lagoon' : st);
  } else if (c.name === 'Blackfin reef shark') {
    sub('Doing', SHARK_MODE[s.mode] || 'Swimming');
  } else if (c.name === 'Humpback whale') {
    sub('Doing', WHALE_MODE[s.mode] || 'Swimming');
  } else if (c.name === 'The Castaway') {
    const m = s.summary ? s.summary() : null;
    if (m) {
      sub('Doing', m.doing); sub('Intention', m.intention); sub('Happiness', m.happiness + ' (' + m.bars.happy + '%)'); sub('Hunger', m.hunger + ' (food ' + m.bars.food + '%)');
      sub('Drinking', m.drinking); sub('Energy', m.energy + ' (' + m.bars.energy + '%)');
      sub('Curiosity', m.curiosity); sub('Survival record', m.survived); sub('Closest to empty', m.lowest); sub('Current interests', m.interests);
      sub('Recent experiences', m.recent); sub('Notable memories', m.memories); sub('Developing preferences', m.preferences);
    }
  } else if (c.name === 'Capuchin monkey') {
    sub('Doing', MONKEY_STATE[s.state] || 'Active');
    if (s.stolen) sub('Coconuts snatched', String(s.stolen));
    sub('Age class', s.age);
    sub('Sex', s.sex);
  } else if (s.isBoar) {
    sub('Doing', BOAR_STATE[s.state] || 'Active');
    sub('Age class', s.age);
    sub('Sex', s.sex);
    if (s.ratsEaten) sub('Rats eaten', String(s.ratsEaten));
    sub('Temper', s.K && ({ wary: 'Wary: keeps its distance', bold: 'Bold: stands its ground', curious: 'Curious: comes to look' }[s.K.fear]));
  } else if (c.name === 'Island rat') {
    sub('Doing', RAT_STATE[s.state] || 'Active');
    sub('Seen as a meal', s.eaten ? s.eaten + (s.eaten > 1 ? ' times' : ' time') : '');
  } else if (c.name === 'Barn owl') {
    sub('Doing', OWL_MODE[s.mode] || 'Flying');
    sub('Rats taken tonight', String(s.fed || 0));
    sub('Rats caught in all', String(s.catches || 0));
  } else if (c.name === 'Pacific boa') {
    sub('Doing', BOA_STATE[s.state] || 'Resting');
    sub('Meals eaten', String(s.fed || 0));
  } else if (c.name === 'Fruit bat') {
    sub('Doing', s.state_text);
    sub('Age class', s.age);
    sub('Sex', s.sex);
  } else if (['Red beach crab', 'Ghost crab', 'Hermit crab', 'Coconut crab'].includes(c.name)) {
    sub('Doing', s.tuck > 0 ? 'Tucked into its shell' : s.fleeing > 0 ? 'Scuttling away' : CRAB_STATE[s.state] || 'Active');
  } else if (c.name === 'Rainbow lorikeet') {
    sub('Age class', s.age);
    sub('Flock', String((s.flock?.id ?? 0) + 1));
    sub('Doing', LORIKEET_STATE[s.state] || 'Active');
  } else if (Array.isArray(s.fish) && s.spec) {
    // a school (the shared school mind, school_mind.js): what it is doing, its size and the shape it holds
    sub('Doing', SCHOOL_STATE[s.state] || 'Travelling as one shoal');
    sub('Shoal size', String(s.fish.length));
    sub('Formation', SCHOOL_SHAPE[s.spec.shape] || '');
    sub('Shoal radius', s.spread.toFixed(1) + ' m');
  } else if (c.name === 'Green sea turtle') {
    sub('Doing', TURTLE_MODE[s.mode] || 'Swimming');
    sub('Breaths taken', String(s.breaths || 0));
  } else if (c.name === 'Sea eagle') {
    sub('Plumage', s.age === 'juvenile' ? 'Juvenile, mottled brown' : 'Adult, white head and chest');
    sub('Doing', s.hunt ? 'Stooping toward the water' : s.turning > 0 ? 'Banking through a turn' : s.mode === 'flap' ? 'Flapping across the sky' : 'Soaring on the air');
  } else if (c.name === 'Great frigatebird') {
    sub('Plumage', s.variant === 'juvenile' ? 'Juvenile, cinnamon head' : s.variant === 'female' ? 'Adult female, white breast' : 'Adult male, dark plumage');
    sub('Doing', ({ thermal: 'Circling in rising air', glide: 'Gliding over the ocean', descent: 'Descending to surface prey', skim: 'Snatching surface prey', recover: 'Climbing away from the sea', chase: 'Briefly pursuing a seabird', approach: 'Returning to the colony', landing: 'Landing on a tree perch', perch: 'Resting and tending feathers', inflate: 'Inflating throat pouch', display: 'Courtship display', takeoff: 'Taking off into the wind' })[s.mode] || 'Flying');
    sub('Surface catches', String(s.feeds || 0));
  }
  // generic, measured from the creature's position: where it is and how fast it is moving
  if (pos) {
    sub('Speed', speed > 0.25 ? speed.toFixed(1) + ' m/s' : 'almost still');
    sub('Where', pos.where || '');
    if (pos.height !== undefined) sub(pos.flying ? 'Height' : 'Depth', pos.height);
  }
  return out;
}

export function speciesInfo(name) { return get(name); }
