// Survival mode: items, recipes, levels and quests. Pure data, no rendering.

/** icon: shown in the inventory; food: what eating it does ({hunger, thirst, health, sick: chance of a stomach ache}) */
export const ITEMS = {
  stick: { name: 'Stick', icon: '🪵', desc: 'Dry driftwood. The first thing you need for everything.' },
  timber: { name: 'Timber', icon: '🪵', desc: 'Heavy cut lengths of driftwood, for building big things.' },
  stone: { name: 'Stone', icon: '🪨', desc: 'A hard, handy stone.' },
  fiber: { name: 'Plant fibre', icon: '🌿', desc: 'Tough stems that twist into cord.' },
  rope: { name: 'Rope', icon: '🧵', desc: 'Twisted fibre cord: lashes anything together.' },
  frond: { name: 'Palm frond', icon: '🍃', desc: 'A big green palm leaf, for thatch.' },
  coconut: { name: 'Coconut', icon: '🥥', desc: 'Sweet water inside and a little to eat.', food: { hunger: 9, thirst: 24 } },
  clam: { name: 'Clam', icon: '🐚', desc: 'Raw it is chewy. Cooked it is lovely.', food: { hunger: 6, thirst: 0, sick: 0.25 }, cooks: 'cookedClam' },
  rawFish: { name: 'Raw fish', icon: '🐟', desc: 'Fresh from the water. Better cooked.', food: { hunger: 8, thirst: 0, sick: 0.3 }, cooks: 'cookedFish', dries: 'driedFish' },
  rawCrab: { name: 'Raw crab', icon: '🦀', desc: 'Pinchy and not safe to eat raw.', food: { hunger: 7, thirst: 0, sick: 0.3 }, cooks: 'cookedCrab', dries: 'driedFish' },
  cookedFish: { name: 'Grilled fish', icon: '🍖', desc: 'Hot, smoky and filling.', food: { hunger: 34, thirst: 0, health: 4 } },
  cookedCrab: { name: 'Grilled crab', icon: '🍤', desc: 'Sweet crab meat from the coals.', food: { hunger: 28, thirst: 0, health: 3 } },
  cookedClam: { name: 'Steamed clams', icon: '🍲', desc: 'Salty and tender.', food: { hunger: 18, thirst: 0, health: 2 } },
  driedFish: { name: 'Dried fish', icon: '🐠', desc: 'Leathery but it keeps and fills you up.', food: { hunger: 26, thirst: 0, health: 1 } },
  can: { name: 'Tinned beans', icon: '🥫', desc: 'Salvage from the wreck. A real meal.', food: { hunger: 42, thirst: 0, health: 2 } },
  bottle: { name: 'Fresh water', icon: '🧴', desc: 'A sealed bottle of clean water.', food: { hunger: 0, thirst: 60 } },
  bandage: { name: 'Bandage', icon: '🩹', desc: 'Heals about a third of your health.', food: { hunger: 0, thirst: 0, health: 32 } },
  pearl: { name: 'Pearl', icon: '🫧', desc: 'A rare, lustrous pearl. Worth showing off.' },
  // tools: they wear out as you use them
  axe: { name: 'Stone axe', icon: '🪓', desc: 'Chops driftwood logs into timber. Wears out.', tool: 'axe', uses: 28 },
  rod: { name: 'Fishing rod', icon: '🎣', desc: 'Cast from the shore and wait for the bite.', tool: 'rod', uses: 40 },
  spear: { name: 'Stone spear', icon: '🔱', desc: 'Spear fish in the shallows and catch crabs safely.', tool: 'spear', uses: 24 },
  canteen: { name: 'Canteen', icon: '🫗', desc: 'A coconut-shell canteen. Fill it at fresh water; drink with Q.', tool: 'canteen', uses: 4 },
  torch: { name: 'Torch', icon: '🔦', desc: 'Lights the night around you for a few hours.', tool: 'torch', uses: 1 },
};

/** the order items are listed in the bag */
export const ITEM_ORDER = ['stick', 'timber', 'stone', 'fiber', 'rope', 'frond', 'coconut', 'clam', 'rawFish', 'rawCrab', 'cookedFish', 'cookedCrab', 'cookedClam', 'driedFish', 'can', 'bottle', 'bandage', 'pearl', 'axe', 'rod', 'spear', 'canteen', 'torch'];

/** XP needed to reach level n+1: LEVELS[n] */
export const LEVELS = [0, 25, 70, 130, 210, 320];

/**
 * cost: {item: n}; gives: item id (tools and goods) or place: structure id; level: unlock level; cat: tab
 */
export const RECIPES = [
  { id: 'rope', name: 'Twist rope', cat: 'Tools', level: 1, cost: { fiber: 3 }, gives: 'rope', n: 1, xp: 4, blurb: 'Three fibres twisted into a length of cord.' },
  { id: 'axe', name: 'Stone axe', cat: 'Tools', level: 1, cost: { stick: 1, stone: 2, fiber: 1 }, gives: 'axe', n: 1, xp: 12, blurb: 'Chops big logs into timber.' },
  { id: 'campfire', name: 'Campfire', cat: 'Build', level: 1, cost: { stick: 5, stone: 4 }, place: 'campfire', xp: 12, blurb: 'Light, warmth and a place to cook. Keep it fed with sticks.' },
  { id: 'rod', name: 'Fishing rod', cat: 'Tools', level: 2, cost: { stick: 2, rope: 1, fiber: 1 }, gives: 'rod', n: 1, xp: 14, blurb: 'Cast a line from any shore.' },
  { id: 'canteen', name: 'Canteen', cat: 'Tools', level: 2, cost: { coconut: 1, rope: 1 }, gives: 'canteen', n: 1, xp: 10, blurb: 'Carry four drinks of fresh water.' },
  { id: 'torch', name: 'Torch', cat: 'Tools', level: 2, cost: { stick: 2, fiber: 1 }, gives: 'torch', n: 1, xp: 6, blurb: 'Burns for a few hours of night.' },
  { id: 'shelter', name: 'Lean-to shelter', cat: 'Build', level: 3, cost: { stick: 8, frond: 8, rope: 2 }, place: 'shelter', xp: 30, blurb: 'Sleep through the night and sit out the storms.' },
  { id: 'rack', name: 'Drying rack', cat: 'Build', level: 3, cost: { stick: 6, rope: 1 }, place: 'rack', xp: 16, blurb: 'Dries fish into food that keeps.' },
  { id: 'spear', name: 'Stone spear', cat: 'Tools', level: 4, cost: { stick: 2, stone: 1, rope: 1 }, gives: 'spear', n: 1, xp: 16, blurb: 'Spear fish in the shallows; crabs cannot pinch back.' },
  { id: 'raft', name: 'Escape raft', cat: 'Build', level: 6, cost: { timber: 6, rope: 6, frond: 4 }, place: 'raft', xp: 100, blurb: 'Build it at the water’s edge and sail away. Your way home.' },
];

/** the hints that guide a new player; each is checked every second */
export const QUESTS = [
  { id: 'gather', title: 'Gather the basics', text: 'Pick up 3 sticks, 2 stones and 2 plant fibre. Look for sparkles on the ground.', xp: 10, done: (g) => g.count('stick') >= 3 && g.count('stone') >= 2 && g.count('fiber') >= 2 || g.stat('crafted.axe') > 0 },
  { id: 'axe', title: 'Make a stone axe', text: 'Press Tab to open the craft menu and make a Stone axe.', xp: 12, done: (g) => g.stat('crafted.axe') > 0 },
  { id: 'drink', title: 'Find fresh water', text: 'Follow a stream to a pool and press E to drink. The sea is salt.', xp: 12, done: (g) => g.stat('drinks') > 0 },
  { id: 'coconut', title: 'Shake a palm', text: 'Stand by a coconut palm and press E to shake it. Eat a coconut.', xp: 12, done: (g) => g.stat('ate.coconut') > 0 },
  { id: 'fire', title: 'Build a campfire', text: 'Craft a Campfire, place it, then feed it sticks.', xp: 20, done: (g) => g.stat('built.campfire') > 0 },
  { id: 'rod', title: 'Catch a fish', text: 'Make a rope, then a Fishing rod. Fish from the shore with E and strike when you see the bite.', xp: 25, done: (g) => g.stat('fish') > 0 },
  { id: 'cook', title: 'Cook your catch', text: 'Stand at a lit campfire and press E to cook your food.', xp: 20, done: (g) => g.stat('cooked') > 0 },
  { id: 'shelter', title: 'Build a shelter', text: 'Gather palm fronds and rope, then build a Lean-to. Sleep in it with E.', xp: 40, done: (g) => g.stat('built.shelter') > 0 },
  { id: 'night', title: 'Sleep through a night', text: 'When it is dark and you are tired, lie down in your shelter.', xp: 30, done: (g) => g.stat('slept') > 0 },
  { id: 'survive', title: 'Survive three days', text: 'Keep fed, watered and rested. Day 4 dawns when you do.', xp: 60, done: (g) => g.day >= 4 },
  { id: 'raft', title: 'Build the escape raft', text: 'Chop driftwood into timber, gather rope and fronds, and build a Raft at the shore. Then sail home.', xp: 150, done: (g) => g.stat('built.raft') > 0 },
];

/** places that are worth a trip: the first visit gives XP */
export const DISCOVERIES = [
  { id: 'falls', name: 'Veil Falls', xp: 12 }, { id: 'temple', name: 'the sunken temple', xp: 14 }, { id: 'spring', name: 'the warm spring', xp: 12 },
  { id: 'fairy', name: 'the glimmer ring', xp: 12 }, { id: 'lake', name: 'Mirror Lake', xp: 10 }, { id: 'oldcamp', name: 'an old castaway camp', xp: 14 },
  { id: 'wreck', name: 'the galleon wreck', xp: 10 }, { id: 'lava', name: 'the black basalt coast', xp: 12 },
  { id: 'basecamp', name: 'the Ascent basecamp', xp: 14 }, { id: 'summit', name: 'the summit of Mount Ignis', xp: 45 },
];

/** what each need loses per game hour (about 25 real seconds) and how the body copes */
export const RATES = { hunger: 4.4, thirst: 6.2, energy: 3.4, sleepEnergy: 14, regen: 3.2, starve: 6, parch: 8, exhaust: 4 };
