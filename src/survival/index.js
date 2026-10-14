// Entry point for survival mode: the button on the observation screen, and the per-frame update.
import { updaters } from '../core.js';
import { Survival } from './game.js';

export let survival = null;

export function initSurvival() {
  survival = new Survival();
  updaters.push((dt) => { if (survival.active) survival.update(dt); });
  const btn = document.getElementById('svbtn');
  if (btn) btn.addEventListener('click', () => { btn.blur(); survival.open(); });
  window.__sv = survival;
}
