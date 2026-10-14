// The castaway's mind: what he needs, how he feels, what he has learned, and what he decides to do next.
// He plays the island like survival mode on its hardest setting, and plays it well: hunger and energy drain fast,
// so he keeps ahead of them (fishes and hunts rats before he is hungry, cooks what he catches, eats before bed) and is
// careful of the boars and the boas. Water is not a need here: the island has plenty, but he is seen drinking regularly,
// by habit, from the streams and pools and from coconuts he has beaten the monkeys to. Within that, his goal is happiness: once the basics are safe he goes looking for what lifts his
// spirits (new places, wildlife, a swim, a chase after a monkey), and when he is happy he dances, whistles and sings.
// Activities are chosen from how much each one appeals to him now (a utility score), not from the clock. Time of day
// shifts the scores but does not decide them. Once he commits to something he keeps at it for its time budget, unless
// something urgent interrupts him (a charging boar, rain, hunger, exhaustion). The activities are run by human.js.
// Memory lives for the session only: the game has no save system for him yet.
import { rnd, rr, clamp } from './util.js';

export const ACTIVITY_LABEL = {
  sleep: 'Sleeping in his lean-to', camp: 'At the campfire', hike: 'Exploring on foot', swim: 'Swimming in the lagoon',
  fish: 'Fishing from the shore', canoe: 'Fishing from his canoe', shelter: 'Sheltering from the rain',
  watch: 'Watching wildlife', linger: 'Resting and taking in the view', dance: 'Dancing',
  drink: 'Taking a drink', hunt: 'Hunting rats', chase: 'Chasing a monkey', flee: 'Running from a boar',
};
// how long an activity may run, in game hours (about 25 real seconds per game hour at normal speed)
const BUDGET = {
  sleep: [4, 8], camp: [2.2, 2.8], hike: [2, 3.5], swim: [0.6, 1.2], fish: [1.2, 2.2], canoe: [1.8, 2.8],
  shelter: [0.6, 1.5], watch: [0.5, 1.6], linger: [1.0, 2.2], dance: [0.5, 0.8],
  drink: [0.6, 1.0], hunt: [0.5, 1.0], chase: [0.4, 0.7], flee: [0.5, 0.9],
};
// what each activity does to his body per game hour: fatigue and boredom (negative values recover)
const BODY = {
  sleep: { fatigue: -0.45, boredom: -0.2 }, camp: { fatigue: -0.05, boredom: -0.1 }, hike: { fatigue: 0.07, boredom: -0.25 },
  swim: { fatigue: 0.12, boredom: -0.3 }, fish: { fatigue: 0.04, boredom: -0.15 }, canoe: { fatigue: 0.06, boredom: -0.2 },
  shelter: { fatigue: -0.04, boredom: 0.05 }, watch: { fatigue: 0.01, boredom: -0.35 }, linger: { fatigue: -0.08, boredom: -0.1 },
  dance: { fatigue: 0.35, boredom: -0.5 }, drink: { fatigue: -0.02, boredom: -0.05 }, hunt: { fatigue: 0.1, boredom: -0.3 }, chase: { fatigue: 0.3, boredom: -0.6 },
  flee: { fatigue: 0.3, boredom: 0.0 },
};
// how much each activity lifts his spirits, per game hour
const JOY = {
  sleep: 0.0, camp: 0.05, hike: 0.05, swim: 0.1, fish: 0.03, canoe: 0.07, shelter: -0.03, watch: 0.08, linger: 0.04,
  dance: 0.3, drink: 0.05, hunt: 0.06, chase: 0.28, flee: -0.3,
};
// the survival rates (per game hour, as a fraction of a full bar): about the same as survival mode itself
const RATE = { hunger: 0.042 };
// how many game hours he goes between drinks (water is a habit, not a need)
const DRINK_EVERY = 3.4;
const ACTS = Object.keys(ACTIVITY_LABEL);

const word = (v, names) => { for (const [limit, label] of names) if (v < limit) return label; return names[names.length - 1][1]; };

/** the castaway's personality: fixed traits, set once for this man */
export const TRAITS = { curiosity: 0.78, laziness: 0.34, boldness: 0.55, contemplation: 0.58 };

export function makeMind(traits = TRAITS) {
  // hunger and fatigue are 0 (fine) to 1 (dire); happy is 0 (miserable) to 1 (joyful)
  const needs = { hunger: 0.3, fatigue: 0.25, boredom: 0.3, happy: 0.5 };
  // what he has learned this session: how often he tried each activity, how often it went well, when it last ended
  const memory = { tries: {}, good: {}, lastEnd: {}, places: {}, watched: {}, danceUntil: -1, lastDrink: -1.5, lastKind: 'coconut' };
  const log = [];
  const stats = { fish: 0, drinks: 0, nutDrinks: 0, rats: 0, meals: 0, scares: 0, chases: 0, lowest: 1 };
  const mind = { traits, needs, memory, stats, current: null, clock: 0, lastAct: '', exertion: 0, ctx: null };

  // how a moment went; this changes his happiness and what he remembers
  mind.note = (text, act, joyDelta, good) => {
    log.push({ at: mind.clock, text });
    if (log.length > 12) log.shift();
    needs.happy = clamp(needs.happy + (joyDelta || 0), 0, 1);
    if (act) {
      if (good !== undefined) memory.good[act] = (memory.good[act] || 0) + (good ? 1 : 0);
    }
  };
  // a place he spent time at, and what it was like; somewhere new lifts his spirits
  mind.visit = (place, act) => {
    const key = place || 'the shore';
    if (!memory.places[key] && act && ['hike', 'swim', 'canoe', 'fish'].includes(act) && mind.clock > 0.5) needs.happy = clamp(needs.happy + 0.06, 0, 1);
    memory.places[key] = (memory.places[key] || 0) + 1;
    if (act) memory.lastPlace = key;
  };
  mind.watching = (species, hours) => { memory.watched[species] = (memory.watched[species] || 0) + hours; };
  // the real things that satisfy a need happen when he does them, not while the clock runs
  mind.ate = (kind, n = 1) => {
    stats.meals++;
    if (kind === 'fish') { needs.hunger = clamp(needs.hunger - (0.3 + 0.17 * Math.min(3, n)), 0, 1); needs.happy = clamp(needs.happy + 0.07, 0, 1); }
    else if (kind === 'rat') { needs.hunger = clamp(needs.hunger - (0.16 + 0.12 * Math.min(3, n)), 0, 1); needs.happy = clamp(needs.happy + 0.05, 0, 1); }
    else needs.hunger = clamp(needs.hunger - 0.14, 0, 1);
  };
  // a drink, of 'fresh' water or the water of a 'coconut'; the next one will be the other kind when both are to hand
  mind.drank = (kind) => {
    stats.drinks++; if (kind === 'coconut') { stats.nutDrinks++; needs.hunger = clamp(needs.hunger - 0.04, 0, 1); }
    memory.lastDrink = mind.clock; memory.lastKind = kind;
  };
  mind.drinkKind = (ctx) => (ctx.coconutOK && ctx.freshOK ? (memory.lastKind === 'coconut' ? 'fresh' : 'coconut') : ctx.coconutOK ? 'coconut' : ctx.freshOK ? 'fresh' : 'none');
  mind.finish = () => { if (mind.current) { memory.lastEnd[mind.current.act] = mind.clock; mind.current.until = mind.clock; } };

  // advance his body and mind by game hours spent in the current activity
  mind.tick = (dh) => {
    mind.clock += dh;
    const act = mind.current ? mind.current.act : null;
    const b = act ? BODY[act] : { fatigue: 0.02, boredom: 0.12 };
    const ex = mind.exertion;
    needs.fatigue = clamp(needs.fatigue + (b.fatigue + ex * 0.1 + (act === 'sleep' ? 0 : 0.02)) * dh, 0, 1);
    needs.boredom = clamp(needs.boredom + b.boredom * dh, 0, 1);
    needs.hunger = clamp(needs.hunger + (act === 'sleep' ? RATE.hunger * 0.5 : RATE.hunger * (1 + ex * 0.6)) * dh, 0, 1);
    const ctx = mind.ctx;
    // happiness: lifted by what he is doing, worn down by unmet needs and boredom, and it settles back toward a steady level
    const N = needs;
    const unmet = Math.max(0, N.hunger - 0.5) * 0.7 + Math.max(0, N.fatigue - 0.6) * 0.6;
    const comfort = N.hunger < 0.5 && N.fatigue < 0.65 ? 0.07 : 0;
    const view = ctx && act === 'linger' && ((ctx.hour >= 5.5 && ctx.hour < 7.5) || (ctx.hour >= 17 && ctx.hour < 19.5)) ? 0.08 : 0;
    const wet = ctx && ctx.rain > 0.25 ? 0.12 : 0;
    const joy = (act ? JOY[act] || 0 : 0) + comfort + view - unmet - wet - N.boredom * 0.07;
    N.happy = clamp(N.happy + joy * dh + (0.35 - N.happy) * 0.22 * dh, 0, 1);
    stats.lowest = Math.min(stats.lowest, 1 - N.hunger, 1 - N.fatigue);
  };

  const practice = (a) => {
    const t = memory.tries[a] || 0, g = memory.good[a] || 0;
    return t ? (g + 1) / (t + 2) - 0.5 : 0;     // -0.5 .. 0.5: how well he has done at this before
  };
  const justDone = (a) => (a in memory.lastEnd ? mind.clock - memory.lastEnd[a] : 99) < 0.8 ? 0.3 : 0;

  // how much each activity appeals to him right now
  function score(a, ctx) {
    const N = needs, T = traits, h = ctx.hour;
    const night = h >= 20.5 || h < 6;
    const morning = h >= 5 && h < 9, lateAfternoon = h >= 15 && h < 18;
    const sunrise = h >= 5.5 && h < 7.5, sunset = h >= 17 && h < 19.5;
    const dusk = h >= 17.5 && h < 21;
    const fine = N.hunger < 0.55 && N.fatigue < 0.65;       // the basics are covered, so he can go looking for joy
    const seek = fine ? 1 - N.happy : 0;
    switch (a) {
      case 'sleep': return 0.04 + N.fatigue * 0.7 + Math.max(0, N.fatigue - 0.55) * 2.0 + (night ? 0.55 : -0.1) - justDone(a) - (night && N.hunger > 0.6 ? 0.45 : 0);
      case 'drink': {                    // a habit: every few hours, more readily in the cool of the morning and evening
        if (!ctx.freshOK && !ctx.coconutOK) return -1;
        const since = mind.clock - memory.lastDrink;
        if (since < DRINK_EVERY * 0.6) return -1;
        return clamp((since - DRINK_EVERY * 0.6) / DRINK_EVERY, 0, 1.3) * 1.1 + (morning || dusk ? 0.12 : 0) + (since > DRINK_EVERY * 1.8 ? 0.6 : 0) - N.fatigue * 0.2 - justDone(a);
      }
      case 'hunt': {                     // rats come out at dusk and night; they are another meal, and a hard one to catch
        if (!ctx.ratC || ctx.rain > 0.3) return -1;
        return 0.12 + N.hunger * 0.9 + (ctx.caught === 0 && N.hunger > 0.3 ? 0.15 : 0) + N.boredom * 0.15 + T.boldness * 0.15 + (dusk || night ? 0.12 : 0) + practice(a) * 0.3 - N.fatigue * 0.4 - (ctx.caught >= 3 ? 0.7 : 0) - (N.hunger < 0.3 ? 0.3 : 0) - justDone(a) * 0.6;
      }
      case 'camp': {
        if (ctx.caught > 0) return 0.2 + Math.max(0, N.hunger - 0.15) * 3.0 - (ctx.caught < 2 && N.hunger < 0.65 ? 0.7 : 0) + (dusk && N.hunger > 0.3 ? 0.25 : 0) + (N.fatigue > 0.5 ? 0.1 : 0) - justDone(a);
        return N.hunger > 0.5 ? 0.03 + (N.hunger - 0.5) * 1.1 - justDone(a) : 0.02 + T.contemplation * 0.04 + ((h >= 17 && h < 19.5) ? 0.12 : 0) - justDone(a);
      }
      case 'fish': return ctx.fishOK ? 0.25 + N.hunger * 0.7 + (ctx.caught === 0 && N.hunger > 0.35 ? 0.3 : 0) + N.boredom * 0.15 + practice(a) * 0.4 + ((morning || lateAfternoon) ? 0.2 : 0) - N.fatigue * 0.4 - (night ? 0.2 : 0) - (ctx.caught > 0 ? 0.3 : 0) - (ctx.caught >= 3 ? 0.4 : 0) - justDone(a) * 0.3 : -1;
      case 'canoe': return ctx.canoeOK ? 0.15 + N.boredom * 0.3 + T.boldness * 0.15 + ((h >= 12 && h < 17) ? 0.2 : 0) + N.hunger * 0.3 + seek * 0.25 - N.fatigue * 0.45 + practice(a) * 0.3 - justDone(a) * 0.3 : -1;
      case 'hike': return 0.1 + T.curiosity * 0.4 + N.boredom * 0.55 + seek * 0.6 + (ctx.calm ? 0.08 : 0) + (ctx.novel ? 0.15 : 0) - N.fatigue * 0.6 - Math.max(0, N.hunger - 0.5) * 2 - justDone(a) * 0.25 + (morning ? 0.05 : 0) - (night ? 0.25 : 0);
      case 'swim': return ctx.rain > 0.2 || night ? -1 : 0.05 + ((h >= 10 && h < 16) ? 0.3 : 0) + N.boredom * 0.25 + seek * 0.4 - N.fatigue * 0.2 + practice(a) * 0.2 - justDone(a) * 0.3;
      case 'shelter': return ctx.rain > 0.25 ? 0.6 + ctx.rain : -1;
      case 'watch': {
        if (!ctx.watchable) return -1;
        const habit = Math.min(0.3, (memory.watched[ctx.watchable] || 0) * 0.03);   // a species he has watched a lot holds his attention a little less
        return 0.22 + T.curiosity * 0.3 + N.boredom * 0.2 + seek * 0.22 + (ctx.wildlife > 2 ? 0.05 : 0) + T.contemplation * 0.1 - N.fatigue * 0.3 - habit - justDone(a) * 0.3 - (night ? 0.25 : 0);
      }
      case 'linger': return 0.03 + (ctx.rockNear ? 0.2 + seek * 0.35 : 0) + N.fatigue * 0.45 + T.laziness * 0.2 + T.contemplation * 0.2 + ((sunrise || sunset) ? 0.25 : 0) - N.boredom * 0.2 - justDone(a) * 0.2;
      case 'chase': {
        if (!ctx.monkeyC || !fine || night || ctx.rain > 0.2) return -1;
        return 0.3 + N.happy * 0.5 + seek * 0.5 + N.boredom * 0.4 + T.boldness * 0.1 - N.fatigue * 0.5 - justDone(a) * 0.9;
      }
      case 'dance': {
        if (ctx.rain > 0.2 || N.hunger > 0.6 || N.fatigue > 0.7 || mind.clock < memory.danceUntil) return -1;
        return Math.max(0, N.happy - 0.55) * 2.2 + N.boredom * 0.1 + T.boldness * 0.05 - 0.05;
      }
    }
    return -1;                       // flee is never "wanted": it is only ever forced by danger
  }

  // what he is allowed to do right now (the hard limits: a canoe he does not have, rain, no fishing water)
  const available = (a, ctx) => {
    if (a === 'flee') return false;
    if (a === 'camp') return !ctx.unsafeCamp;           // a boar is loitering there: wait it out
    if (a === 'sleep') return !ctx.unsafeHut;
    if (a === 'watch') return !!ctx.watchable;
    if (a === 'fish') return !!ctx.fishOK;
    if (a === 'canoe') return !!ctx.canoeOK;
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
    return a;
  }

  /** the activity to be doing now. Keeps the current one while its budget lasts. */
  mind.choose = (ctx) => {
    mind.ctx = ctx;
    const cur = mind.current, N = needs, ca = cur ? cur.act : null;
    // danger comes first, and the boar does not wait: he is on his feet and running before it reaches him
    if (ctx.threat && ca !== 'flee') return start('flee');
    // urgent needs interrupt whatever he is doing (but never a run for his life)
    // a critical need outranks the rain: he will get wet rather than go without
    const starving = N.hunger > 0.85;
    // a real need (well before it is critical) is reason enough to go out in the rain
    const needy = N.hunger > 0.55;
    // he is never pulled off an activity that is already serving a critical need
    const eating = ca === 'camp' || ca === 'fish' || ca === 'canoe' || ca === 'hunt', serving = starving && eating;
    const crit = serving ? null : starving ? 'hunger' : null;
    if (ca !== 'flee') {
      if (crit === 'hunger') return start((ctx.caught > 0 || !ctx.fishOK) && !ctx.unsafeCamp ? 'camp' : 'fish');
      if (ctx.rain > 0.45 && ca !== 'shelter' && ca !== 'drink' && ca !== 'camp' && ca !== 'sleep' && !needy) return start('shelter');
      if (N.fatigue > 0.85 && ca !== 'sleep' && !starving && !ctx.unsafeHut) return start('sleep');
    }
    const nightNow = ctx.hour >= 20.5 || ctx.hour < 6;
    // sleep carries on through the night; a daytime nap ends once he is rested. Shelter ends when the rain does.
    const sleepDone = ca === 'sleep' && !nightNow && N.fatigue < 0.08;
    const sheltered = ca === 'shelter' && (ctx.rain < 0.15 || needy);
    if (cur && mind.clock < cur.until && !sleepDone && !sheltered) {
      if (!available(ca, ctx) && ca !== 'flee') return start(ACTS.find((a) => a !== ca && score(a, ctx) > -0.5 && available(a, ctx)) || 'linger');
      return ca;
    }
    // time is up, or he has rested enough: weigh everything he could do now (in a downpour he heads for cover first)
    if (ctx.rain > 0.45 && !needy && ca !== 'flee' && ca !== 'sleep') return start('shelter');
    let best = null, bestScore = -Infinity;
    for (const a of ACTS) {
      if (!available(a, ctx) || (cur && a === ca && mind.clock < cur.until)) continue;
      const s = score(a, ctx) + rnd() * 0.06;      // a little randomness keeps him from repeating the same thing
      if (s > bestScore) { bestScore = s; best = a; }
    }
    return start(best || 'linger');
  };

  // a dance sets a cooldown, so he does not dance again straight away
  mind.danced = () => { memory.danceUntil = mind.clock + 1.2; };

  /** the live facts for the Field Guide: only what the simulation actually tracks */
  mind.summary = (ctx) => {
    const N = needs, T = traits;
    const tried = ACTS.filter((a) => (memory.tries[a] || 0) > 0).map((a) => ({ a, p: practice(a) + (memory.tries[a] || 0) * 0.01 })).sort((x, y) => y.p - x.p);
    const places = Object.entries(memory.places).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    const watched = Object.entries(memory.watched).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k);
    const prefs = tried.slice(0, 3).map(({ a }) => `${ACTIVITY_LABEL[a].toLowerCase()} (${memory.tries[a]} times${memory.good[a] ? `, ${memory.good[a]} successes` : ''})`);
    const pct = (v) => Math.round(clamp(v, 0, 1) * 100);
    return {
      doing: mind.current ? ACTIVITY_LABEL[mind.current.act] : 'Deciding what to do',
      act: mind.current ? mind.current.act : '',
      intention: mind.current ? `${ACTIVITY_LABEL[mind.current.act]}, for about ${Math.max(0, (mind.current.until - mind.clock) * 60).toFixed(0)} more game minutes` : 'Not yet decided',
      // the three meters, as the share of each bar that is full
      bars: { food: pct(1 - N.hunger), energy: pct(1 - N.fatigue), happy: pct(N.happy) },
      happiness: word(N.happy, [[0.2, 'Miserable'], [0.4, 'Low'], [0.6, 'Content'], [0.8, 'Happy'], [2, 'Joyful']]),
      energy: word(N.fatigue, [[0.25, 'Fresh'], [0.5, 'Steady'], [0.75, 'Tiring'], [2, 'Exhausted']]),
      curiosity: word(T.curiosity * (0.6 + 0.4 * N.boredom), [[0.45, 'Settled'], [0.7, 'Curious'], [2, 'Very curious']]),
      hunger: word(N.hunger, [[0.3, 'Full'], [0.6, 'Peckish'], [0.85, 'Hungry'], [2, 'Starving']]),
      drinking: `${stats.drinks} drinks so far (${stats.nutDrinks} from coconuts), the last ${Math.max(0, mind.clock - memory.lastDrink).toFixed(1)} game hours ago`,
      survived: `${Math.floor(mind.clock / 24) + 1} day${mind.clock >= 24 ? 's' : ''} so far, ${stats.meals} meals (${stats.rats} rats among them), ${stats.drinks} drinks, ${stats.scares} close calls with boars`,
      lowest: `${Math.round(stats.lowest * 100)}% (the emptiest either food or energy has been)`,
      interests: prefs.join('; ') || 'Nothing yet',
      recent: log.slice(-4).reverse().map((e) => e.text).join(' · ') || 'Nothing yet',
      memories: [places.length ? `Favourite places: ${places.join(', ')}` : '', watched.length ? `Has watched: ${watched.join(', ')}` : ''].filter(Boolean).join('. ') || 'None yet',
      preferences: prefs.length ? 'Practised: ' + prefs.join('; ') : 'Still finding out what suits him',
    };
  };
  return mind;
}
