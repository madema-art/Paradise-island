// What each inspectable kind of object in the world is. Keys are used where the objects are built (tagInstanced / tagObject).
// Plant descriptions name real species where the game model is one; anything else is described as a game model.
export const CATALOG = {
  // ---- trees and palms
  palm: { name: 'Coconut palm', category: 'Trees', status: 'real', desc: 'Tall palm with a crown of long pinnate fronds. Its buoyant coconuts can drift between islands and seed new beaches.' },
  treeA: { name: 'Jungle tree', category: 'Trees', status: 'model', desc: 'Broadleaf canopy tree of the island jungle. A game model, not a particular species.' },
  treeB: { name: 'Tall jungle tree', category: 'Trees', status: 'model', desc: 'Taller broadleaf tree of the forest. A game model, not a particular species.' },
  banyan: { name: 'Banyan', category: 'Trees', status: 'real', desc: 'Strangler fig (Ficus). Aerial roots drop from the branches and thicken into new trunks, so one tree can spread over a wide area.' },
  breadfruit: { name: 'Breadfruit', category: 'Trees', status: 'real', desc: 'Artocarpus altilis. A large tree with deeply lobed leaves and starchy fruit, a staple on Pacific islands.' },
  banana: { name: 'Banana plant', category: 'Trees', status: 'real', desc: 'Musa. A giant herb, not a tree: overlapping leaf sheaths form a false trunk that bears a single bunch of fruit.' },
  bamboo: { name: 'Bamboo', category: 'Trees', status: 'real', desc: 'A woody grass that forms dense clumps along damp ground and grows quickly.' },
  // ---- foliage and shrubs
  fern: { name: 'Fern', category: 'Foliage', status: 'real', desc: 'Fronds unfurl from tight coils in the damp understorey.' },
  bush: { name: 'Jungle shrub', category: 'Foliage', status: 'model', desc: 'Low leafy shrub of the jungle edge. A game model, not a particular species.' },
  pandanus: { name: 'Pandanus (screw pine)', category: 'Foliage', status: 'real', desc: 'Palm-like plant with spiral leaves and prop roots. Its fruit segments are edible.' },
  naupaka: { name: 'Naupaka', category: 'Foliage', status: 'real', desc: 'Coastal shrub of every Pacific beach: pale woody stems, rosettes of thick, glossy, spoon-shaped leaves, white flowers that look split in half, and clusters of white berries. It grows in the sand above the tideline.' },
  hibiscus: { name: 'Hibiscus', category: 'Foliage', status: 'real', desc: 'Shrub with large showy flowers that last a single day.' },
  bougainvillea: { name: 'Bougainvillea', category: 'Foliage', status: 'real', desc: 'Thorny climber whose papery bracts in magenta, orange and red are the showy part.' },
  clump: { name: 'Flowering clump', category: 'Foliage', status: 'model', desc: 'Clumping tropical herb with tall flowering stems. A game model, not a particular species.' },
  taro: { name: 'Taro', category: 'Foliage', status: 'real', desc: 'Colocasia. Broad heart-shaped leaves on tall stalks; the starchy corm is a staple food.' },
  ti: { name: 'Ti plant', category: 'Foliage', status: 'real', desc: 'Cordyline fruticosa. A shrub with long glossy leaves, used for wrapping food and as a good-luck plant.' },
  // ---- flowers
  glory: { name: 'Glory lily', category: 'Flowers', status: 'real', desc: 'Gloriosa. A climbing lily with striking red and yellow flowers.' },
  orchid: { name: 'Orchid', category: 'Flowers', status: 'real', desc: 'Epiphytic orchid on tall flower spikes in purple, white and yellow.' },
  wildflower: { name: 'Wildflowers', category: 'Flowers', status: 'model', desc: 'Small mixed flowers of the forest edge. A game model, not a particular species.' },
  blossom: { name: 'Fallen blossoms', category: 'Flowers', status: 'model', desc: 'Petals and flowers that drop from the trees onto the sand.' },
  // ---- rocks
  rock: { name: 'Boulder', category: 'Rocks', status: 'model', desc: 'Weathered boulders in nine shapes: rounded river stones, flat beach cobbles, fractured blocks, slabs, pillars, shards and piles. The ones with a broad crown are lookouts for the castaway, monkeys and gulls. A game model.' },
  // ---- reef and shore
  coral: { name: 'Reef coral', category: 'Reef', status: 'model', desc: 'Coral colony of the lagoon reef. Table, branching, brain and cauliflower forms grow slowly and build the reef.' },
  anemone: { name: 'Sea anemone', category: 'Reef', status: 'model', desc: 'Stinging anemone that anchors on the reef. A game model.' },
  starfish: { name: 'Starfish', category: 'Reef', status: 'model', desc: 'Sea star resting on the reef. A game model.' },
  urchin: { name: 'Sea urchin', category: 'Reef', status: 'model', desc: 'Spiny urchin grazing on the reef. A game model.' },
  seagrass: { name: 'Seagrass', category: 'Reef', status: 'model', desc: 'Flowering marine plant that forms meadows, a nursery for fish and food for turtles.' },
  // ---- structures and props (game structures, not real buildings)
  temple: { name: 'Sunken temple', category: 'Structures', status: 'game', unique: true, desc: 'Stone shrine half-sunk into the island. A game structure.' },
  grotto: { name: 'Grotto', category: 'Structures', status: 'game', unique: true, desc: 'Sea cave lit by crystals. A game structure.' },
  wreck: { name: 'Galleon wreck', category: 'Structures', status: 'game', unique: true, desc: 'The bones of a four-hundred-year-old treasure galleon: ribs bared, gun ports gaping, masts snapped to stumps, the sails long rotted away, all of it turning into reef. A game structure.' },
  hut: { name: 'Castaway hut', category: 'Structures', status: 'game', desc: 'Simple shelter of palm and timber. A game structure.' },
  campfire: { name: 'Campfire', category: 'Props', status: 'game', desc: 'Stones around a fire. A game prop.' },
  canoe: { name: 'Outrigger canoe', category: 'Props', status: 'game', desc: 'Traditional outrigger canoe drawn up on the shore. A game prop.' },
  clam: { name: 'Giant clam', category: 'Reef', status: 'game', unique: true, desc: 'Fluted shell with a blue mantle; a pearl glints inside. Giant clams are real reef animals; this one is a game model.' },
  shrine: { name: 'Pirate shrine', category: 'Structures', status: 'game', unique: true, desc: 'Remains of a shrine on the headland. A game structure.' },
  fairyring: { name: 'Glimmer ring', category: 'Structures', status: 'game', unique: true, desc: 'Ring of stones in the glade where lights gather at night. A game structure.' },
  spring: { name: 'Warm spring', category: 'Structures', status: 'game', unique: true, desc: 'Warm spring with stone edging. A game structure.' },
  // ---- water
  falls: { name: 'Waterfall', category: 'Water', status: 'game', unique: true, desc: 'Water falling over the cliff lip into the plunge pool. A game feature.' },
  cascade: { name: 'Tide cascade', category: 'Water', status: 'game', unique: true, desc: 'Cascade running down the rock face to the sea. A game feature.' },
  stream: { name: 'Stream', category: 'Water', status: 'game', desc: 'Freshwater channel running from the highland to the sea. A game feature.' },
  lake: { name: 'Mirror Lake', category: 'Water', status: 'game', unique: true, desc: 'Still freshwater lake. A game feature.' },
  pool: { name: 'Plunge pool', category: 'Water', status: 'game', unique: true, desc: 'Pool at the foot of the falls. A game feature.' },
  lagoon: { name: 'Lagoon', category: 'Water', status: 'feature', desc: 'Shallow water enclosed by the reef, between the beach and the open sea.' },
  sea: { name: 'Open sea', category: 'Water', status: 'feature', desc: 'Deep open ocean beyond the reef.' },
  // ---- volcano
  volcano: { name: 'Mount Ignis', category: 'Terrain', status: 'game', unique: true, desc: 'The island volcano. A game feature; it can erupt.' },
};

export const CATEGORY_ORDER = ['Trees', 'Foliage', 'Flowers', 'Rocks', 'Reef', 'Structures', 'Props', 'Water', 'Terrain', 'Creatures'];
