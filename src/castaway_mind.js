// The castaway's mind: what he has learned, what he has done lately, and what he chooses to do next.
// There are no needs here. Nothing drains, nothing becomes urgent, and no mood is kept: he is not driven by hunger, tiredness or
// happiness. Every activity is a voluntary choice, weighed from the moment: the time of day, the weather, where he is, the wildlife
// near him, what is practical right now, how recently he did it, and a weighted random draw so that no two days repeat.
// Two things are not choices. A charging boar makes him run (flee), and heavy rain sends him to cover (shelter); both are about the
// world, not about him. The activities are run by human.js, and the comfort and fishing projects by comfort_life.js.
// Activity practice is session memory. Projects, supplies and their results have a separate observation save.
import { rnd, rr, clamp } from './util.js';

export const ACTIVITY_LABEL = {
  angling: 'A fishing afternoon and dinner',
  project: 'Making a personal evening fire', quest: 'Following his own interests', sleep: 'Sleeping in his lean-to', nap: 'Napping in the shade',
  camp: 'At the campfire', hike: 'Exploring on foot', run: 'Running a stretch of the coast', swim: 'Swimming in the lagoon', wade: 'Wading in the shallows',
  fish: 'Fishing from the shore', canoe: 'Fishing from his canoe', shelter: 'Sheltering from the rain',
  watch: 'Watching wildlife', linger: 'Resting and taking in the view', stargaze: 'Stargazing', dance: 'Dancing',
  drink: 'Taking a drink', hunt: 'Hunting rats', chase: 'Chasing a monkey', flee: 'Running from a boar',
};
// how long an activity may run, in game hours (about 25 real seconds per game hour at normal speed)
const BUDGET = {
  angling: [4, 6], project: [6, 8], quest: [5, 9], sleep: [4, 8], nap: [0.8, 1.5], camp: [2.2, 2.8], hike: [2, 3.5], run: [0.5, 0.9],
  swim: [0.6, 1.2], wade: [0.6, 1.2], fish: [1.2, 2.2], canoe: [1.8, 2.8], shelter: [0.6, 1.5], watch: [0.5, 1.6], linger: [1.0, 2.2],
  stargaze: [1.2, 2.2], dance: [0.5, 0.8], drink: [0.6, 1.0], hunt: [0.5, 1.0], chase: [0.4, 0.7], flee: [0.5, 0.9],
};
// a recent activity is less likely to be chosen again: this is the window, in game hours, over which it comes back to full appeal
const RECENT_WINDOW = 2.5;
// a drink is a habit of the day, not a need: after one, the next is less appealing for a few hours
const DRINK_WINDOW = 3;
const ACTS = Object.keys(ACTIVITY_LABEL);

/** the castaway's personality: fixed traits, set once for this man */
export const TRAITS = { curiosity: 0.78, laziness: 0.34, boldness: 0.55, contemplation: 0.58 };

export function makeMind(traits = TRAITS) {
  // what he has learned this session: how often he tried each activity, how often it went well, when it last ended, where he has been
  const memory = { tries: {}, good: {}, lastEnd: {}, places: {}, watched: {}, danceUntil: -1, lastDrink: -99, lastKind: 'coconut', lastGood: -99 };
  const log = [];
  const stats = { drinks: 0, nutDrinks: 0, meals: 0, rats: 0, scares: 0, chases: 0 };
  const mind = { traits, memory, stats, current: null, clock: 0, lastAct: '', ctx: null };

  // how a moment went: it is remembered, and a success counts toward what he is good at (a mood nudge used to live here; it is gone)
  mind.note = (text, act, _unused, good) => {
    log.push({ at: mind.clock, text });
    if (log.length > 12) log.shift();
    if (act && good !== undefined) memory.good[act] = (memory.good[act] || 0) + (good ? 1 : 0);
    if (good) memory.lastGood = mind.clock;
  };
  // a place he spent time at
  mind.visit = (place, act) => {
    const key = place || 'the shore';
    memory.places[key] = (memory.places[key] || 0) + 1;
    if (act) memory.lastPlace = key;
  };
  mind.watching = (species, hours) => { memory.watched[species] = (memory.watched[species] || 0) + hours; };
  mind.ate = (kind) => { stats.meals++; if (kind === 'rat') stats.rats++; };
  // a drink, of 'fresh' water or the water of a 'coconut'; the next one will be the other kind when both are to hand
  mind.drank = (kind) => {
    stats.drinks++; if (kind === 'coconut') stats.nutDrinks++;
    memory.lastDrink = mind.clock; memory.lastKind = kind;
  };
  mind.drinkKind = (ctx) => (ctx.coconutOK && ctx.freshOK ? (memory.lastKind === 'coconut' ? 'fresh' : 'coconut') : ctx.coconutOK ? 'coconut' : ctx.freshOK ? 'fresh' : 'none');
  mind.finish = () => { if (mind.current) { memory.lastEnd[mind.current.act] = mind.clock; mind.current.until = mind.clock; } };
  mind.tick = (dh) => { mind.clock += dh; };

  // how long ago he last did this (game hours; a large number if never)
  const since = (a) => (a in memory.lastEnd ? mind.clock - memory.lastEnd[a] : 99);
  // 0.3 when he has only just finished it, rising to 1 once it has been a while
  const recency = (a) => 0.3 + 0.7 * clamp(since(a) / RECENT_WINDOW, 0, 1);

  // how much each activity appeals to him at this moment: a weight, or -1 when it does not suit the moment at all
  function weigh(a, ctx) {
    const T = traits, h = ctx.hour, dr = ctx.drives || {};
    const night = h >= 20.5 || h < 5.5;
    const morning = h >= 5.5 && h < 9.5, midday = h >= 10 && h < 16, afternoon = h >= 12 && h < 16.5;
    const sunrise = h >= 5.5 && h < 7.5, sunset = h >= 17 && h < 19.5, dusk = h >= 17 && h < 21;
    const dry = ctx.rain < 0.25;
    switch (a) {
      case 'quest': return ctx.quest && dry && !night ? 0.9 + ctx.quest.value * 0.8 + (ctx.quest.resume ? 0.6 : 0) : -1;
      case 'project': return ctx.projectOK && dry && !night ? 0.7 + (dusk ? 0.6 : 0) : -1;
      case 'angling': return ctx.anglingOK && dry && !night ? (ctx.fishingPending ? 2 : 0.8) + ((morning || afternoon) ? 0.2 : 0) : -1;
      case 'fish': return ctx.fishOK && !night ? 0.5 + ((morning || afternoon) ? 0.25 : 0) + (ctx.caught === 0 ? 0.25 : -0.15 * Math.min(3, ctx.caught)) + (dr.hunting || 0) * 0.2 : -1;
      case 'canoe': return ctx.canoeOK && !night ? 0.5 + (afternoon ? 0.35 : 0) + T.boldness * 0.15 + (dr.adventure || 0) * 0.2 : -1;
      case 'swim': return ctx.rain < 0.2 && !night ? 0.45 + (midday ? 0.45 : 0) + (dr.play || 0) * 0.3 : -1;
      case 'wade': return ctx.shallowOK && dry && !night ? 0.35 + (midday ? 0.2 : 0) + (dr.play || 0) * 0.3 : -1;
      case 'run': return dry && !night ? 0.35 + (morning ? 0.25 : 0) + (dr.adventure || 0) * 0.3 : -1;
      case 'hike': return ctx.rain < 0.4 && !night ? 0.6 + T.curiosity * 0.4 + (ctx.novel ? 0.25 : 0) + (morning ? 0.1 : 0) + (dr.adventure || 0) * 0.3 + (dr.curiosity || 0) * 0.2 : -1;
      case 'hunt': return ctx.ratC && ctx.rain <= 0.3 ? (dusk || night ? 0.9 : 0.25) + (ctx.caught === 0 ? 0.2 : 0) + (dr.hunting || 0) * 0.5 + (ctx.huntBoost ? 0.5 : 0) : -1;
      case 'chase': return ctx.monkeyC && !night && ctx.rain < 0.2 ? 0.4 + (dr.play || 0) * 0.4 + T.boldness * 0.2 : -1;
      case 'watch': {
        if (!ctx.watchable) return -1;
        const habit = Math.min(0.3, (memory.watched[ctx.watchable] || 0) * 0.03);     // a species he has watched a lot holds his attention a little less
        return 0.55 + T.curiosity * 0.35 + (ctx.wildlife > 2 ? 0.1 : 0) + T.contemplation * 0.1 - habit;
      }
      case 'linger': return 0.35 + (ctx.rockNear ? 0.35 : 0) + ((sunrise || sunset) ? 0.35 : 0) + T.laziness * 0.3 + T.contemplation * 0.2 + (midday && ctx.rain < 0.1 ? 0.1 : 0);
      case 'stargaze': return night && ctx.rain < 0.1 ? 0.9 + T.contemplation * 0.3 : -1;
      case 'nap': return afternoon && dry && ctx.napSpotOK ? 0.25 + T.laziness * 0.5 : -1;
      case 'sleep': return night && !ctx.unsafeHut ? 0.8 + (h >= 22 || h < 5 ? 0.3 : 0) : -1;
      case 'camp':
        if (ctx.caught > 0) return 0.8 + (dusk || night ? 0.6 : 0) - (ctx.caught >= 3 ? 0.3 : 0);
        return 0.15 + ((morning || dusk) ? 0.35 : 0);                         // breakfast with a coconut, or the evening meal
      case 'drink': return ctx.freshOK || ctx.coconutOK ? 0.15 + 0.6 * clamp((mind.clock - memory.lastDrink) / DRINK_WINDOW, 0, 1) + ((morning || dusk) ? 0.15 : 0) : -1;
      case 'dance': return ctx.rain < 0.2 && mind.clock >= memory.danceUntil ? (dusk || night ? 0.35 : 0.15) + (ctx.justCaught ? 0.5 : 0) + (dr.play || 0) * 0.2 + T.boldness * 0.1 : -1;
      case 'shelter': return ctx.rain > 0.25 ? 0.6 + ctx.rain : -1;
    }
    return -1;                       // flee is never chosen: it is only ever forced by danger
  }

  // what he is allowed to do right now (the hard limits: a canoe he does not have, rain, no fishing water)
  const available = (a, ctx) => {
    if (a === 'project') return !!ctx.projectOK;
    if (a === 'angling') return !!ctx.anglingOK;
    if (a === 'quest') return !!ctx.quest;
    if (a === 'flee') return false;
    if (a === 'camp') return !ctx.unsafeCamp;           // a boar is loitering there: wait it out
    if (a === 'sleep') return !ctx.unsafeHut;
    if (a === 'nap') return !!ctx.napSpotOK;
    if (a === 'watch') return !!ctx.watchable;
    if (a === 'fish') return !!ctx.fishOK;
    if (a === 'canoe') return !!ctx.canoeOK;
    if (a === 'wade') return !!ctx.shallowOK;
    if (a === 'drink') return !!(ctx.freshOK || ctx.coconutOK);
    if (a === 'hunt') return !!ctx.ratC;
    if (a === 'chase') return !!ctx.monkeyC;
    return true;
  };

  function start(a) {
    if (mind.current && mind.current.act !== a) memory.lastEnd[mind.current.act] = mind.clock;
    const [lo, hi] = BUDGET[a];
    mind.current = { act: a, since: mind.clock, until: mind.clock + rr(lo, hi) };
    memory.tries[a] = (memory.tries[a] || 0) + 1;
    mind.lastAct = a;
    if (a === 'flee') stats.scares++;
    if (a === 'chase') stats.chases++;
    if (a === 'dance') memory.danceUntil = mind.clock + 1.2;       // a dance sets a cooldown, so he does not dance again straight away
    return a;
  }

  /** the activity to be doing now. Keeps the current one while its time lasts; otherwise a weighted random draw among what suits the moment. */
  mind.choose = (ctx) => {
    mind.ctx = ctx;
    const cur = mind.current, ca = cur ? cur.act : null;
    // danger comes first, and the boar does not wait: he is on his feet and running before it reaches him
    if (ctx.threat && ca !== 'flee') return start('flee');
    // weather: heavy rain sends him under cover (a sheltering or sleeping man stays where he is)
    if (ctx.rain > 0.45 && ca !== 'flee' && ca !== 'shelter' && ca !== 'drink' && ca !== 'camp' && ca !== 'sleep') return start('shelter');
    const nightNow = ctx.hour >= 20.5 || ctx.hour < 5.5;
    // a night's sleep lasts until dawn; shelter lasts while the rain does
    const sleepDone = ca === 'sleep' && !nightNow;
    const sheltered = ca === 'shelter' && ctx.rain < 0.15;
    if (cur && mind.clock < cur.until && !sleepDone && !sheltered) {
      if (!available(ca, ctx) && ca !== 'flee') return start(ACTS.find((a) => a !== ca && weigh(a, ctx) > -0.5 && available(a, ctx)) || 'linger');
      return ca;
    }
    // time is up: weigh everything he could do now, with what he did lately counting for less, and draw one by its weight
    let total = 0;
    const options = [];
    for (const a of ACTS) {
      if (a === ca || !available(a, ctx)) continue;
      const w = weigh(a, ctx);
      if (w <= 0) continue;
      const s = w * recency(a) * (memory.tries[a] ? 1 : 1.15) * (0.8 + 0.4 * rnd());
      options.push({ a, s }); total += s;
    }
    if (!options.length) return start('linger');
    let r = rnd() * total;
    for (const o of options) { r -= o.s; if (r <= 0) return start(o.a); }
    return start(options[options.length - 1].a);
  };

  /** development: start a named activity now (window.__castaway.activity), to check that its code runs; not used by the game itself */
  mind.force = (a) => { if (!ACTS.includes(a)) return null; if (mind.current) mind.finish(); return start(a); };

  /** development: what each activity is worth to him right now (and whether it is allowed) */
  mind.scores = (ctx) => Object.fromEntries(ACTS.map((a) => [a, available(a, ctx) ? +weigh(a, ctx).toFixed(2) : null]));

  // a dance sets a cooldown, so he does not dance again straight away
  mind.danced = () => { memory.danceUntil = mind.clock + 1.2; };

  /** the live facts for the Field Guide: only what the simulation actually tracks */
  mind.summary = () => {
    const tried = ACTS.filter((a) => (memory.tries[a] || 0) > 0).sort((x, y) => (memory.tries[y] || 0) - (memory.tries[x] || 0));
    const places = Object.entries(memory.places).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    const watched = Object.entries(memory.watched).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    const prefs = tried.slice(0, 3).map((a) => `${ACTIVITY_LABEL[a].toLowerCase()} (${memory.tries[a]} times${memory.good[a] ? `, ${memory.good[a]} successes` : ''})`);
    return {
      doing: mind.current ? ACTIVITY_LABEL[mind.current.act] : 'Deciding what to do',
      act: mind.current ? mind.current.act : '',
      intention: mind.current?.act === 'angling' && mind.fishingText ? mind.fishingText() : mind.current?.act === 'project' && mind.projectText ? mind.projectText() : mind.current ? `${ACTIVITY_LABEL[mind.current.act]}, for about ${Math.max(0, (mind.current.until - mind.clock) * 60).toFixed(0)} more game minutes` : 'Not yet decided',
      drinking: stats.drinks ? `${stats.drinks} drinks so far (${stats.nutDrinks} from coconuts), the last ${Math.max(0, mind.clock - memory.lastDrink).toFixed(1)} game hours ago` : 'No drinks yet',
      survived: `${Math.floor(mind.clock / 24) + 1} day${mind.clock >= 24 ? 's' : ''} so far, ${stats.meals} meals (${stats.rats} rats among them), ${stats.drinks} drinks, ${stats.scares} close calls with boars`,
      interests: prefs.join('; ') || 'Nothing yet',
      recent: log.slice(-4).reverse().map((e) => e.text).join(' · ') || 'Nothing yet',
      memories: [places.length ? `Favourite places: ${places.join(', ')}` : '', watched.length ? `Has watched: ${watched.join(', ')}` : ''].filter(Boolean).join('. ') || 'None yet',
      preferences: prefs.length ? 'Practised: ' + prefs.join('; ') : 'Still finding out what suits him',
    };
  };
  return mind;
}
