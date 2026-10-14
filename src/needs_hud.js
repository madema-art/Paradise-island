// The castaway's three meters on the observation screen: food, energy and happiness, plus what he is doing.
// It reads the live simulation (his mind in castaway_mind.js); click the heading to follow him with the camera.
import { creatures } from './core.js';
import { followCreature } from './camera.js';

const ROWS = [
  ['food', '🍖', 'Food', 'food'],
  ['energy', '⚡', 'Energy', 'energy'],
  ['happy', '😊', 'Happiness', 'joy'],
];

export function initNeedsHud() {
  const host = document.getElementById('title');
  if (!host) return;
  const box = document.createElement('div');
  box.id = 'cwneeds';
  box.innerHTML = '<div class="cw-head" title="Follow the castaway"><b>The Castaway</b><span class="cw-state"></span></div>' +
    ROWS.map(([k, ic, label, cls]) => `<div class="sv-need ${cls}" data-k="${k}" title="${label}"><span class="ic">${ic}</span><span class="track"><span class="fill" style="width:50%"></span></span><span class="num">50</span></div>`).join('') +
    '<div class="cw-doing"></div>';
  host.appendChild(box);
  const rows = Object.fromEntries(ROWS.map(([k]) => [k, box.querySelector(`[data-k="${k}"]`)]));
  const state = box.querySelector('.cw-state'), doing = box.querySelector('.cw-doing');
  let me = null;
  box.querySelector('.cw-head').addEventListener('click', () => { me = me || creatures.find((c) => c.id === 'castaway'); if (me) followCreature(me); });
  const refresh = () => {
    me = me || creatures.find((c) => c.id === 'castaway');
    const m = me && me.sim && me.sim.summary ? me.sim.summary() : null;
    if (!m) return;
    for (const [k] of ROWS) {
      const v = m.bars[k], row = rows[k];
      row.querySelector('.fill').style.width = v + '%';
      row.querySelector('.num').textContent = v;
      row.classList.toggle('low', k !== 'happy' && v < 20);
    }
    state.textContent = m.happiness;
    doing.textContent = me.desc || m.doing;
  };
  setInterval(refresh, 300);
  refresh();
}
